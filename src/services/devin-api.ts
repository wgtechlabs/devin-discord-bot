/**
 * Devin API client for session lifecycle management.
 *
 * Handles all HTTP communication with the Devin REST API including
 * session creation, message sending, file uploads, session polling,
 * and session termination. Uses native fetch with typed responses.
 */

import { DEVIN_API_BASE_URL } from "../config.js";
import type { DevinCreateSessionResponse, DevinSessionState } from "../types/index.js";
import { createLogger } from "./logger.js";

const log = createLogger("DevinAPI");

const DEVIN_API_V3_BASE_URL = "https://api.devin.ai/v3";

type DevinApiVersion = "v1" | "v3";

interface V3SessionResponse {
	session_id: string;
	url: string;
	status: "new" | "claimed" | "running" | "exit" | "error" | "suspended" | "resuming";
	status_detail?: string | null;
	pull_requests?: Array<{ pr_url: string; pr_state?: string | null }>;
}

interface V3MessagesResponse {
	items: Array<{
		event_id: string;
		source: "devin" | "user";
		message: string;
		created_at: number;
	}>;
	has_next_page?: boolean;
	end_cursor?: string | null;
}

function getApiVersion(apiKey: string): DevinApiVersion {
	return apiKey.startsWith("cog_") ? "v3" : "v1";
}

function resolveBaseUrl(apiKey: string, orgId?: string): string {
	const version = getApiVersion(apiKey);
	if (version === "v1") return DEVIN_API_BASE_URL;

	if (!orgId) {
		throw new Error(
			"DEVIN_ORG_ID is required when using a cog_ Devin API key. Add DEVIN_ORG_ID to your environment.",
		);
	}

	return `${DEVIN_API_V3_BASE_URL}/organizations/${encodeURIComponent(orgId)}`;
}

function toDevinId(sessionId: string): string {
	return sessionId.startsWith("devin-") ? sessionId : `devin-${sessionId}`;
}

function mapV3Status(status: V3SessionResponse["status"], statusDetail?: string | null) {
	if (status === "error") return "failed";
	if (statusDetail === "finished" || status === "exit") return "finished";

	if (status === "suspended") {
		if (statusDetail === "inactivity") return "expired";
		if (statusDetail === "user_request") return "stopped";
		return "blocked";
	}

	if (statusDetail === "waiting_for_user" || statusDetail === "waiting_for_approval") {
		return "blocked";
	}

	return "running";
}

/**
 * Creates a new Devin coding session with the given prompt.
 *
 * @param apiKey - Devin API authentication key
 * @param prompt - Task description for Devin to execute
 * @returns Session ID and dashboard URL for the created session
 * @throws Error if the API request fails
 */
export async function createSession(
	apiKey: string,
	prompt: string,
	orgId?: string,
): Promise<DevinCreateSessionResponse> {
	log.info("Creating session with prompt:", prompt.slice(0, 100));
	const baseUrl = resolveBaseUrl(apiKey, orgId);
	const createUrl = `${baseUrl}/sessions`;

	const response = await fetch(createUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ prompt }),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Devin API error ${response.status}: ${body}`);
	}

	const data = (await response.json()) as DevinCreateSessionResponse | V3SessionResponse;
	log.info("Session created:", data.session_id);
	return {
		session_id: data.session_id,
		url: data.url,
	};
}

/**
 * Sends a follow-up message to an active Devin session.
 *
 * @param apiKey - Devin API authentication key
 * @param sessionId - Target session identifier
 * @param message - Message text to send to Devin
 * @throws Error if the API request fails
 */
export async function sendMessage(
	apiKey: string,
	sessionId: string,
	message: string,
	orgId?: string,
): Promise<void> {
	log.debug("Sending message to session:", sessionId);
	const version = getApiVersion(apiKey);
	const baseUrl = resolveBaseUrl(apiKey, orgId);
	const targetSessionId = version === "v3" ? toDevinId(sessionId) : sessionId;
	const messagePath = version === "v3" ? "messages" : "message";

	const response = await fetch(`${baseUrl}/sessions/${targetSessionId}/${messagePath}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ message }),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to send message: ${response.status} ${body}`);
	}
}

/**
 * Retrieves the current state of a Devin session including
 * status, messages, and any pull requests created.
 *
 * @param apiKey - Devin API authentication key
 * @param sessionId - Session identifier to poll
 * @returns Current session state with messages and PR info
 * @throws Error if the API request fails
 */
export async function getSessionState(
	apiKey: string,
	sessionId: string,
	orgId?: string,
): Promise<DevinSessionState> {
	const version = getApiVersion(apiKey);
	const baseUrl = resolveBaseUrl(apiKey, orgId);
	const targetSessionId = version === "v3" ? toDevinId(sessionId) : sessionId;

	const response = await fetch(`${baseUrl}/sessions/${targetSessionId}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to get session: ${response.status} ${body}`);
	}

	if (version === "v1") {
		return (await response.json()) as DevinSessionState;
	}

	const sessionData = (await response.json()) as V3SessionResponse;
	const messages: DevinSessionState["messages"] = [];
	let afterCursor: string | undefined;
	let hasNextPage = true;

	while (hasNextPage) {
		const params = new URLSearchParams({ first: "200" });
		if (afterCursor) params.set("after", afterCursor);

		const messagesResponse = await fetch(
			`${baseUrl}/sessions/${targetSessionId}/messages?${params.toString()}`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
			},
		);

		if (!messagesResponse.ok) {
			const body = await messagesResponse.text();
			throw new Error(`Failed to list session messages: ${messagesResponse.status} ${body}`);
		}

		const messagesPage = (await messagesResponse.json()) as V3MessagesResponse;
		for (const item of messagesPage.items) {
			const createdAtMs =
				item.created_at > 10_000_000_000 ? item.created_at : item.created_at * 1000;
			messages.push({
				message_id: item.event_id,
				role: item.source === "devin" ? "devin" : "user",
				content: item.message,
				created_at: new Date(createdAtMs).toISOString(),
			});
		}

		hasNextPage = Boolean(messagesPage.has_next_page);
		afterCursor = messagesPage.end_cursor ?? undefined;
		if (hasNextPage && !afterCursor) {
			throw new Error(
				"Failed to paginate session messages: API returned has_next_page=true without end_cursor.",
			);
		}
	}

	return {
		status: mapV3Status(sessionData.status, sessionData.status_detail),
		messages,
		pull_requests: (sessionData.pull_requests ?? []).map((pr) => ({
			url: pr.pr_url,
			title: pr.pr_state ? `Pull Request (${pr.pr_state})` : "Pull Request",
			repository: "Unknown repository",
		})),
	};
}

/**
 * Terminates an active Devin session.
 *
 * @param apiKey - Devin API authentication key
 * @param sessionId - Session identifier to stop
 * @throws Error if the API request fails
 */
export async function terminateSession(
	apiKey: string,
	sessionId: string,
	orgId?: string,
): Promise<void> {
	log.info("Terminating session:", sessionId);
	const version = getApiVersion(apiKey);
	const baseUrl = resolveBaseUrl(apiKey, orgId);
	const targetSessionId = version === "v3" ? toDevinId(sessionId) : sessionId;

	const response = await fetch(`${baseUrl}/sessions/${targetSessionId}`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to terminate session: ${response.status} ${body}`);
	}
}

/**
 * Uploads a file attachment to Devin's storage for use in a session.
 *
 * @param apiKey - Devin API authentication key
 * @param fileName - Original file name with extension
 * @param fileBuffer - Raw file content as a Buffer
 * @returns Public URL of the uploaded file
 * @throws Error if the upload fails
 */
export async function uploadAttachment(
	apiKey: string,
	fileName: string,
	fileBuffer: Buffer,
	orgId?: string,
): Promise<string> {
	log.debug("Uploading attachment:", fileName);
	const baseUrl = resolveBaseUrl(apiKey, orgId);

	const formData = new FormData();
	const blob = new Blob([fileBuffer]);
	formData.append("file", blob, fileName);

	const response = await fetch(`${baseUrl}/attachments`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to upload attachment: ${response.status} ${body}`);
	}

	const data = (await response.json()) as { url: string };
	return data.url;
}
