import { describe, expect, test } from "bun:test";
import { formatMarkdownForDiscord } from "../src/services/discord-markdown.js";

describe("formatMarkdownForDiscord", () => {
	test("wraps a simple table in a code block", () => {
		const input = [
			"Here is a table:",
			"",
			"| Name | Value |",
			"|------|-------|",
			"| foo  | bar   |",
			"",
			"End of message.",
		].join("\n");

		const result = formatMarkdownForDiscord(input);

		expect(result).toContain("```\n| Name | Value |");
		expect(result).toContain("| foo  | bar   |\n```");
		expect(result).toContain("Here is a table:");
		expect(result).toContain("End of message.");
	});

	test("handles table with alignment markers in separator", () => {
		const input = [
			"| Left | Center | Right |",
			"|:-----|:------:|------:|",
			"| a    |   b    |     c |",
		].join("\n");

		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(
			[
				"```",
				"| Left | Center | Right |",
				"|:-----|:------:|------:|",
				"| a    |   b    |     c |",
				"```",
			].join("\n"),
		);
	});

	test("does not wrap pipe-delimited lines without separator row", () => {
		const input = "| this is not | a table |";
		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(input);
	});

	test("leaves tables inside code blocks unchanged", () => {
		const input = ["```", "| Name | Value |", "|------|-------|", "| foo  | bar   |", "```"].join(
			"\n",
		);

		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(input);
	});

	test("handles multiple tables in one message", () => {
		const input = [
			"Table 1:",
			"| A | B |",
			"|---|---|",
			"| 1 | 2 |",
			"",
			"Table 2:",
			"| C | D |",
			"|---|---|",
			"| 3 | 4 |",
		].join("\n");

		const result = formatMarkdownForDiscord(input);

		const codeBlockCount = (result.match(/^```$/gm) || []).length;
		expect(codeBlockCount).toBe(4);
	});

	test("returns content unchanged when no tables present", () => {
		const input = "Hello **bold** and *italic*\n\nSome `code` here.";
		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(input);
	});

	test("handles empty content", () => {
		expect(formatMarkdownForDiscord("")).toBe("");
	});

	test("handles header-only table (header + separator, no data rows)", () => {
		const input = ["| Col1 | Col2 |", "|------|------|"].join("\n");
		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(["```", "| Col1 | Col2 |", "|------|------|", "```"].join("\n"));
	});

	test("preserves mixed content around tables", () => {
		const input = [
			"# Heading",
			"",
			"Some text with **bold** and [link](https://example.com).",
			"",
			"| Key | Value |",
			"|-----|-------|",
			"| a   | b     |",
			"",
			"More text after the table.",
			"",
			"```typescript",
			'console.log("hello");',
			"```",
		].join("\n");

		const result = formatMarkdownForDiscord(input);

		expect(result).toContain("# Heading");
		expect(result).toContain("**bold**");
		expect(result).toContain("```\n| Key | Value |");
		expect(result).toContain("| a   | b     |\n```");
		expect(result).toContain("```typescript");
		expect(result).toContain('console.log("hello");');
	});

	test("does not double-wrap table already in a code block with language", () => {
		const input = ["```markdown", "| A | B |", "|---|---|", "| 1 | 2 |", "```"].join("\n");

		const result = formatMarkdownForDiscord(input);
		expect(result).toBe(input);
	});
});
