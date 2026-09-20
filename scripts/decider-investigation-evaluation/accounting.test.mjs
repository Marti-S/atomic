import assert from "node:assert/strict";
import { test } from "node:test";
import { EvaluationAccounting } from "./evaluation-only-accounting.mjs";

test("evaluation charges access before dispatch without claiming native scan measurements", () => {
	const account = new EvaluationAccounting({ maxActions: 2, maxScannedBytes: 8, maxEvidenceBytes: 4 });
	account.beforeAccess(4);
	account.acceptEvidence("é");
	const expected = {
		tools: 1,
		chargedBytes: 4,
		accountingMethod: "full_scope_precharge",
		bytesScanned: null,
		bytesScannedObserved: false,
		evidenceBytes: 2,
	};
	assert.deepEqual(account.metrics(), expected);
	assert.throws(() => account.beforeAccess(5), /budget/);
	assert.throws(() => account.acceptEvidence("abc"), /budget/);
	assert.deepEqual(account.metrics(), expected);
	account.beforeAccess(4);
	assert.throws(() => account.beforeAccess(0), /budget/);
});
