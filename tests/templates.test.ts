/**
 * Tests for the prompt template registry.
 *
 * Validates template structure, field definitions, and prompt
 * builder functions for all registered templates.
 */

import { describe, expect, test } from "bun:test";
import { TEMPLATES, getTemplate } from "../src/templates/index.js";

describe("TEMPLATES", () => {
	test("contains at least one template", () => {
		expect(TEMPLATES.length).toBeGreaterThan(0);
	});

	test("all templates have required properties", () => {
		for (const template of TEMPLATES) {
			expect(template.id).toBeTruthy();
			expect(template.name).toBeTruthy();
			expect(template.description).toBeTruthy();
			expect(template.fields.length).toBeGreaterThan(0);
			expect(typeof template.buildPrompt).toBe("function");
		}
	});

	test("all template fields have required properties", () => {
		for (const template of TEMPLATES) {
			for (const field of template.fields) {
				expect(field.id).toBeTruthy();
				expect(field.label).toBeTruthy();
				expect(field.placeholder).toBeTruthy();
				expect(typeof field.required).toBe("boolean");
				expect(["short", "paragraph"]).toContain(field.style);
			}
		}
	});

	test("template IDs are unique", () => {
		const ids = TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("getTemplate", () => {
	test("returns template by ID", () => {
		const template = getTemplate("open-pr");
		expect(template).toBeDefined();
		expect(template?.name).toBe("Open a PR");
	});

	test("returns undefined for unknown ID", () => {
		expect(getTemplate("nonexistent")).toBeUndefined();
	});
});

describe("template prompt builders", () => {
	test("open-pr builds correct prompt", () => {
		const template = getTemplate("open-pr");
		if (!template) throw new Error("Template not found");
		const prompt = template.buildPrompt({
			repo: "owner/repo",
			task: "add validation",
		});

		expect(prompt).toContain("owner/repo");
		expect(prompt).toContain("add validation");
		expect(prompt).toContain("pull request");
	});

	test("code-review builds prompt with optional focus", () => {
		const template = getTemplate("code-review");
		if (!template) throw new Error("Template not found");

		const withFocus = template.buildPrompt({
			pr_url: "https://github.com/owner/repo/pull/1",
			focus: "security",
		});
		expect(withFocus).toContain("security");

		const withoutFocus = template.buildPrompt({
			pr_url: "https://github.com/owner/repo/pull/1",
			focus: "",
		});
		expect(withoutFocus).not.toContain("Focus on");
	});

	test("fix-bug builds correct prompt", () => {
		const template = getTemplate("fix-bug");
		if (!template) throw new Error("Template not found");
		const prompt = template.buildPrompt({
			repo: "owner/repo",
			description: "dates are wrong",
		});

		expect(prompt).toContain("owner/repo");
		expect(prompt).toContain("dates are wrong");
	});
});
