import { describe, expect, test } from "bun:test";
import { getDevinErrorFeedback } from "../src/services/devin-api.js";

describe("getDevinErrorFeedback", () => {
	test("returns usage-limit message for Devin 429 errors", () => {
		const err = new Error("Devin API error 429: Too many requests");
		expect(getDevinErrorFeedback(err, "session_start")).toContain("usage limit reached");
	});

	test("returns null for non-Devin errors", () => {
		const err = new Error("database connection dropped");
		expect(getDevinErrorFeedback(err, "session_start")).toBeNull();
	});

	test("does not misclassify non-Devin rate limit errors", () => {
		const err = new Error("upstream quota exceeded 429");
		expect(getDevinErrorFeedback(err, "session_start")).toBeNull();
	});
});
