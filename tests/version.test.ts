/**
 * Tests for the `/version` slash command handler.
 */

import { describe, expect, test } from "bun:test";
import { version } from "../package.json";

describe("version command", () => {
	test("package.json version is a valid semver string", () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
	});

	test("handleVersion replies with the package version", async () => {
		const { handleVersion } = await import("../src/commands/version.js");

		let replyPayload: { content: string; ephemeral: boolean } | undefined;
		const interaction = {
			reply: async (payload: { content: string; ephemeral: boolean }) => {
				replyPayload = payload;
			},
		} as Parameters<typeof handleVersion>[0];

		await handleVersion(interaction);

		expect(replyPayload).toEqual({
			content: `v${version}`,
			ephemeral: true,
		});
	});
});
