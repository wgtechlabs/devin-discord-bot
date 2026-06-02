/**
 * Tests for shared type definitions and constants.
 *
 * Validates runtime type exports and the TERMINAL_STATUSES set.
 */

import { describe, expect, test } from "bun:test";
import { TERMINAL_STATUSES } from "../src/types/index.js";

describe("TERMINAL_STATUSES", () => {
	test("includes all terminal statuses", () => {
		expect(TERMINAL_STATUSES.has("finished")).toBe(true);
		expect(TERMINAL_STATUSES.has("stopped")).toBe(true);
		expect(TERMINAL_STATUSES.has("expired")).toBe(true);
		expect(TERMINAL_STATUSES.has("failed")).toBe(true);
	});

	test("excludes active statuses", () => {
		expect(TERMINAL_STATUSES.has("running")).toBe(false);
		expect(TERMINAL_STATUSES.has("blocked")).toBe(false);
	});

	test("has exactly 4 terminal statuses", () => {
		expect(TERMINAL_STATUSES.size).toBe(4);
	});
});
