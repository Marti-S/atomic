import type { Static, TSchema } from "typebox";
import { InvalidDecisionOutputError } from "./invalid-output.js";
import { JEV_STRUCTURED_OUTPUT_PROVIDER as provider } from "./resolver.js";
import { compileQuestions as compileSystemOneQuestions, isRecord, probability, readResponse, sameKeys, tokenCount } from "./system-one.js";
import type { StructuredChoiceQuestion, StructuredOutputRequest, StructuredOutputResult } from "./types.js";

export { STRUCTURED_DECISION_POLICY } from "./system-one.js";

function compileQuestions(questions: Readonly<Record<string, StructuredChoiceQuestion>>, instructions: string) {
	return compileSystemOneQuestions(questions, instructions, provider.capabilities.maxChoiceOptions, "Jev");
}

function parseResponse(value: unknown, questions: Readonly<Record<string, StructuredChoiceQuestion>>) {
	// Codes are static: never interpolate response values, question IDs, or credentials.
	const malformed = (code: string) => {
		const error = new InvalidDecisionOutputError(`Malformed Jev structured decision response (${code}).`);
		if (
			isRecord(value) &&
			isRecord(value.usage) &&
			tokenCount(value.usage.input_tokens) &&
			tokenCount(value.usage.output_tokens)
		)
			error.usage = { inputTokens: value.usage.input_tokens, outputTokens: value.usage.output_tokens };
		return error;
	};
	if (!isRecord(value)) throw malformed("response_shape");
	if (typeof value.model !== "string" || !value.model.trim()) throw malformed("model");
	if (!isRecord(value.answers)) throw malformed("answers_shape");
	if (!isRecord(value.usage)) throw malformed("usage_shape");
	if (!sameKeys(value.answers, Object.keys(questions))) throw malformed("answer_keys");
	const { input_tokens, output_tokens } = value.usage;
	if (!tokenCount(input_tokens) || !tokenCount(output_tokens)) throw malformed("usage_tokens");
	const answers = value.answers;
	const ranked: Record<string, string[]> = Object.create(null);
	const choices = Object.fromEntries(
		Object.entries(questions).map(([id, question]) => {
			const answer = answers[id];
			if (!isRecord(answer) || answer.type !== "choice") throw malformed("answer_type");
			if (typeof answer.choice !== "string" || !Object.hasOwn(question.criteria, answer.choice))
				throw malformed("choice_key");
			if (!probability(answer.confidence)) throw malformed("confidence");
			if (!isRecord(answer.probabilities)) throw malformed("probabilities_shape");
			const probabilities = answer.probabilities;
			if (!sameKeys(probabilities, Object.keys(question.criteria))) throw malformed("probability_keys");
			if (!Object.values(probabilities).every(probability)) throw malformed("probability_value");
			const choice = answer.choice;
			const values = Object.values(probabilities) as number[];
			if (values.some((p) => p > (probabilities[choice] as number))) throw malformed("choice_not_highest");
			ranked[id] = Object.keys(question.criteria).sort(
				(a, b) => (probabilities[b] as number) - (probabilities[a] as number),
			);
			return [id, answer.choice];
		}),
	);
	return {
		choices,
		ranked,
		responseModel: value.model,
		usage: { inputTokens: input_tokens, outputTokens: output_tokens },
	};
}

async function askJev<T extends TSchema>(
	request: StructuredOutputRequest<T>,
	questionsToAsk: Readonly<Record<string, StructuredChoiceQuestion>>,
	signal: AbortSignal,
	assertActive: () => void,
) {
	assertActive();
	const questions = compileQuestions(questionsToAsk, request.instructions);
	let apiKey: string | undefined;
	try {
		apiKey = request.modelRegistry.getProviderAuth
			? (await request.modelRegistry.getProviderAuth(provider.id, { signal }))?.auth.apiKey?.trim()
			: process.env.TYPESAFE_API_KEY?.trim();
	} catch {
		signal.throwIfAborted();
		throw new Error("Jev credential resolution failed. Check /login typesafe-ai or TYPESAFE_API_KEY.");
	}
	if (!apiKey) throw new Error("typesafe-ai/jev requires an API key. Use /login typesafe-ai or set TYPESAFE_API_KEY.");
	assertActive();
	let response: Response;
	try {
		// Direct fetch has no SDK retries. Reject redirects so credentials/state cannot change destinations.
		response = await fetch(provider.endpoint, {
			method: "POST",
			redirect: "error",
			signal,
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: provider.wireModel, state: request.state, questions }),
		});
	} catch {
		signal.throwIfAborted();
		throw new Error("Jev request failed. Check connectivity and retry explicitly; no automatic retry was made.");
	}
	if (signal.aborted) {
		void response.body?.cancel().catch(() => {});
		signal.throwIfAborted();
	}
	if (!response.ok) {
		void response.body?.cancel().catch(() => {});
		const guidance =
			response.status === 401
				? "Check /login typesafe-ai or TYPESAFE_API_KEY."
				: response.status === 422
					? "Check the state and Choice question contract."
					: response.status === 429 || response.status === 529
						? "Wait before retrying explicitly."
						: "Check provider availability.";
		// Never include the body: upstream error text can echo state or credentials.
		throw new Error(`Jev HTTP ${response.status}. ${guidance} No automatic retry was made.`);
	}
	const parsed = parseResponse(await readResponse(response, signal), questionsToAsk);
	assertActive();
	return parsed;
}

// No matching Jev tokenizer is published. This is deterministic packing guidance,
// not validation: the provider owns actual token limits, and state is never trimmed.
const estimateTokens = (value: object): number => Math.ceil(JSON.stringify(value).length / 4);
const STATE_AND_QUESTION_TOKENS = 32_000;
const STATE_AND_ALL_TOKENS = 64_000;
const KEEP = 3;

type NamedQuestion = [string, StructuredChoiceQuestion];
type ChoiceJob = { id: string; owner: string; question: StructuredChoiceQuestion; final: boolean };
type QuestionTokens = (question: StructuredChoiceQuestion) => number;

function* partitionQuestion(question: StructuredChoiceQuestion, stateTokens: number, questionTokens: QuestionTokens) {
	const entries = Object.entries(question.criteria);
	for (let start = 0; start < entries.length; ) {
		let size = Math.min(provider.capabilities.maxChoiceOptions, entries.length - start);
		const batchOf = (length: number) => ({
			...question,
			criteria: Object.fromEntries(entries.slice(start, start + length)),
		});
		// Minimum five guarantees shrinking even with a retained key and a singleton tail.
		// If unchanged state alone exceeds the estimate, splitting cannot fix it.
		if (stateTokens < STATE_AND_QUESTION_TOKENS) {
			let low = Math.min(KEEP + 2, size);
			let high = size;
			while (low < high) {
				const mid = Math.ceil((low + high) / 2);
				if (stateTokens + questionTokens(batchOf(mid)) <= STATE_AND_QUESTION_TOKENS) low = mid;
				else high = mid - 1;
			}
			size = low;
		}
		yield batchOf(size);
		start += size;
	}
}

function planRound(
	pending: NamedQuestion[],
	overflowing: Set<string>,
	stateTokens: number,
	questionTokens: QuestionTokens,
): ChoiceJob[] {
	const jobs: ChoiceJob[] = [];
	const reserved = new Set(pending.map(([id]) => id));
	let nextId = 0;
	for (const [owner, question] of pending) {
		const size = Object.keys(question.criteria).length;
		const withinCap = size <= provider.capabilities.maxChoiceOptions;
		const indivisible = size <= KEEP + 1 || stateTokens >= STATE_AND_QUESTION_TOKENS;
		if (
			withinCap &&
			(!overflowing.has(owner) || indivisible || stateTokens + questionTokens(question) <= STATE_AND_QUESTION_TOKENS)
		) {
			// Keep the original wire ID for small choices and the final comparison.
			jobs.push({ id: owner, owner, question, final: true });
			continue;
		}
		for (const batch of partitionQuestion(question, stateTokens, questionTokens)) {
			while (reserved.has(`q${nextId}`)) nextId++;
			jobs.push({ id: `q${nextId++}`, owner, question: batch, final: false });
		}
	}
	return jobs;
}

function* packRequests(jobs: ChoiceJob[], stateTokens: number, questionTokens: QuestionTokens) {
	for (let offset = 0; offset < jobs.length; ) {
		let end = offset;
		let tokens = stateTokens;
		while (end < jobs.length) {
			const size = questionTokens(jobs[end].question);
			const oversized = stateTokens + size > STATE_AND_QUESTION_TOKENS;
			if (end > offset && (tokens + size > STATE_AND_ALL_TOKENS || oversized)) break;
			tokens += size;
			end++;
			if (oversized) break;
		}
		yield jobs.slice(offset, end);
		offset = end;
	}
}

export async function inferJev<T extends TSchema>(
	request: StructuredOutputRequest<T>,
	signal: AbortSignal,
	assertActive: () => void = () => signal.throwIfAborted(),
): Promise<StructuredOutputResult<Static<T>>> {
	let pending = Object.entries(request.jev.questions);
	const overflowing = new Set(
		pending
			.filter(([, q]) => Object.keys(q.criteria).length > provider.capabilities.maxChoiceOptions)
			.map(([id]) => id),
	);
	if (!overflowing.size) {
		const result = await askJev(request, request.jev.questions, signal, assertActive);
		return {
			value: request.jev.decode(result.choices),
			model: provider.fullId,
			responseModel: result.responseModel,
			usage: result.usage,
		};
	}
	const choices: Record<string, string> = Object.create(null);
	const usage = { inputTokens: 0, outputTokens: 0 };
	let responseModel = "";
	const stateTokens = estimateTokens(request.state);
	const questionTokens = (q: StructuredChoiceQuestion) =>
		estimateTokens(compileQuestions({ q }, request.instructions));
	while (pending.length) {
		assertActive();
		const jobs = planRound(pending, overflowing, stateTokens, questionTokens);
		const survivors = new Map<string, Set<string>>();
		for (const group of packRequests(jobs, stateTokens, questionTokens)) {
			assertActive();
			const wire = Object.fromEntries(group.map((job) => [job.id, job.question]));
			let result: Awaited<ReturnType<typeof askJev<T>>>;
			try {
				result = await askJev(request, wire, signal, assertActive);
			} catch (error) {
				if (error instanceof InvalidDecisionOutputError) {
					error.usage = {
						inputTokens: usage.inputTokens + (error.usage?.inputTokens ?? 0),
						outputTokens: usage.outputTokens + (error.usage?.outputTokens ?? 0),
					};
				}
				throw error;
			}
			responseModel = result.responseModel;
			usage.inputTokens += result.usage.inputTokens;
			usage.outputTokens += result.usage.outputTokens;
			for (const job of group) {
				if (job.final) choices[job.owner] = result.choices[job.id];
				else {
					const kept = survivors.get(job.owner) ?? new Set<string>();
					result.ranked[job.id].slice(0, KEEP).forEach((key) => {
						kept.add(key);
					});
					survivors.set(job.owner, kept);
				}
			}
		}
		pending = pending.flatMap(([id, question]) => {
			const kept = survivors.get(id);
			if (!kept) return [];
			if (question.retainForFinal !== undefined) kept.add(question.retainForFinal);
			return [
				[
					id,
					{
						...question,
						criteria: Object.fromEntries(Object.entries(question.criteria).filter(([key]) => kept.has(key))),
					},
				],
			];
		});
	}
	assertActive();
	return {
		value: request.jev.decode(Object.fromEntries(Object.keys(request.jev.questions).map((id) => [id, choices[id]]))),
		model: provider.fullId,
		responseModel,
		usage,
	};
}
