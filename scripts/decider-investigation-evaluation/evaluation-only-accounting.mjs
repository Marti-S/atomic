/** Evaluation only: conservative access debits, not native scan telemetry. No host registration. */
export class EvaluationAccounting {
	constructor({ maxActions, maxScannedBytes, maxEvidenceBytes }) {
		this.limits = { maxActions, maxScannedBytes, maxEvidenceBytes };
		this.actions = 0;
		this.chargedBytes = 0;
		this.evidenceBytes = 0;
	}

	beforeAccess(scopeBytes) {
		if (!Number.isSafeInteger(scopeBytes) || scopeBytes < 0) throw new Error("Invalid scope debit.");
		if (this.actions >= this.limits.maxActions || this.chargedBytes + scopeBytes > this.limits.maxScannedBytes)
			throw new Error("Evaluation access budget exhausted.");
		this.actions++;
		this.chargedBytes += scopeBytes;
	}

	acceptEvidence(text) {
		const size = Buffer.byteLength(text, "utf8");
		if (this.evidenceBytes + size > this.limits.maxEvidenceBytes)
			throw new Error("Evaluation evidence budget exhausted.");
		this.evidenceBytes += size;
		return text;
	}

	metrics() {
		return {
			tools: this.actions,
			chargedBytes: this.chargedBytes,
			accountingMethod: "full_scope_precharge",
			bytesScanned: null,
			bytesScannedObserved: false,
			evidenceBytes: this.evidenceBytes,
		};
	}
}
