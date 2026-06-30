/**
 * Discord-compatible markdown formatting utilities.
 *
 * Discord supports a subset of markdown but notably lacks GFM table
 * rendering. This module transforms standard markdown into formats
 * that display correctly in Discord messages.
 */

/**
 * Converts markdown content to Discord-compatible formatting.
 *
 * Detects GFM tables (pipe-delimited rows with a separator line)
 * and wraps them in code blocks so Discord renders them with
 * monospace font, preserving columnar alignment. Tables already
 * inside code blocks are left unchanged.
 */
export function formatMarkdownForDiscord(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let i = 0;
	let inCodeBlock = false;

	while (i < lines.length) {
		const trimmed = lines[i].trimStart();

		if (trimmed.startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			result.push(lines[i]);
			i++;
			continue;
		}

		if (!inCodeBlock && trimmed.startsWith("|")) {
			const tableLines: string[] = [];
			while (i < lines.length && lines[i].trimStart().startsWith("|")) {
				tableLines.push(lines[i]);
				i++;
			}

			const hasSeparator = tableLines.some((line) => /^\s*\|[\s\-:|]+\|\s*$/.test(line));

			if (hasSeparator && tableLines.length >= 2) {
				result.push("```", ...tableLines, "```");
			} else {
				result.push(...tableLines);
			}
		} else {
			result.push(lines[i]);
			i++;
		}
	}

	return result.join("\n");
}
