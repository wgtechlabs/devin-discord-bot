/**
 * Pre-built prompt templates for common Devin tasks.
 *
 * Each template defines a guided form with labeled fields that
 * produce a structured prompt for the Devin API. Templates are
 * surfaced via the `/devin-template` slash command as a select menu.
 */

import type { PromptTemplate } from "../types/index.js";

/**
 * Registry of all available prompt templates.
 * Add new templates here to make them available in the bot.
 */
export const TEMPLATES: PromptTemplate[] = [
	{
		id: "open-pr",
		name: "Open a PR",
		description: "Write code and open a pull request",
		fields: [
			{
				id: "repo",
				label: "Repository",
				placeholder: "owner/repo",
				required: true,
				style: "short",
			},
			{
				id: "task",
				label: "What should the PR do?",
				placeholder: "Add input validation to the signup form",
				required: true,
				style: "paragraph",
			},
		],
		buildPrompt: (values) =>
			`In the repository ${values.repo}, please: ${values.task}. Open a pull request with your changes.`,
	},
	{
		id: "code-review",
		name: "Code Review",
		description: "Review an existing pull request",
		fields: [
			{
				id: "pr_url",
				label: "Pull Request URL",
				placeholder: "https://github.com/owner/repo/pull/123",
				required: true,
				style: "short",
			},
			{
				id: "focus",
				label: "Focus Areas (optional)",
				placeholder: "Security, performance, error handling",
				required: false,
				style: "paragraph",
			},
		],
		buildPrompt: (values) => {
			let prompt = `Review this pull request: ${values.pr_url}`;
			if (values.focus) {
				prompt += `. Focus on: ${values.focus}`;
			}
			return prompt;
		},
	},
	{
		id: "write-tests",
		name: "Write Tests",
		description: "Add test coverage to a repository",
		fields: [
			{
				id: "repo",
				label: "Repository",
				placeholder: "owner/repo",
				required: true,
				style: "short",
			},
			{
				id: "target",
				label: "What to test",
				placeholder: "The authentication module in src/auth/",
				required: true,
				style: "paragraph",
			},
		],
		buildPrompt: (values) =>
			`In the repository ${values.repo}, write tests for: ${values.target}. Open a pull request with the new tests.`,
	},
	{
		id: "fix-bug",
		name: "Fix a Bug",
		description: "Investigate and fix a bug",
		fields: [
			{
				id: "repo",
				label: "Repository",
				placeholder: "owner/repo",
				required: true,
				style: "short",
			},
			{
				id: "description",
				label: "Bug Description",
				placeholder: "The date picker shows wrong timezone for UTC+12 users",
				required: true,
				style: "paragraph",
			},
		],
		buildPrompt: (values) =>
			`In the repository ${values.repo}, investigate and fix this bug: ${values.description}. Open a pull request with the fix.`,
	},
];

/**
 * Retrieves a template by its unique identifier.
 *
 * @param id - Template identifier string
 * @returns Matching template or undefined if not found
 */
export function getTemplate(id: string): PromptTemplate | undefined {
	return TEMPLATES.find((t) => t.id === id);
}
