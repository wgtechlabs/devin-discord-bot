/**
 * Tests for the `/version` slash command handler.
 */

import { describe, expect, test } from "bun:test";
import { version } from "../package.json";

describe("version command", () => {
	test("package.json version is a valid semver string", () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});

	test("handleVersion replies with the package version", async () => {
		const { handleVersion } = await import("../src/commands/version.js");

		let repliedContent: string | undefined;
		const interaction = {
			reply: async ({ content }: { content: string }) => {
				repliedContent = content;
			},
		} as Parameters<typeof handleVersion>[0];

		await handleVersion(interaction);

		expect(repliedContent).toBe(`v${version}`);
	});
});
