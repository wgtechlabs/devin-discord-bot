import { describe, expect, test } from "bun:test";
import { extractDevinAttachments } from "../src/services/session-manager.js";

describe("extractDevinAttachments", () => {
	test("removes Devin attachment markers and returns attachment URLs", () => {
		const result = extractDevinAttachments(
			[
				"Here is the screenshot.",
				'ATTACHMENT:{"url":"https://app.devin.ai/attachments/a/ss.png","fileSize":710982}',
				'ATTACHMENT:"https://app.devin.ai/attachments/a/log.txt"',
			].join("\n"),
		);

		expect(result.content).toBe("Here is the screenshot.");
		expect(result.urls).toEqual([
			"https://app.devin.ai/attachments/a/ss.png",
			"https://app.devin.ai/attachments/a/log.txt",
		]);
	});
});
