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
): Promise<DevinCreateSessionResponse> {
	log.info("Creating session with prompt:", prompt.slice(0, 100));

	const response = await fetch(`${DEVIN_API_BASE_URL}/sessions`, {
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

	const data = (await response.json()) as DevinCreateSessionResponse;
	log.info("Session created:", data.session_id);
	return data;
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
): Promise<void> {
	log.debug("Sending message to session:", sessionId);

	const response = await fetch(`${DEVIN_API_BASE_URL}/sessions/${sessionId}/messages`, {
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
): Promise<DevinSessionState> {
	const response = await fetch(`${DEVIN_API_BASE_URL}/sessions/${sessionId}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Failed to get session: ${response.status} ${body}`);
	}

	return (await response.json()) as DevinSessionState;
}

/**
 * Terminates an active Devin session.
 *
 * @param apiKey - Devin API authentication key
 * @param sessionId - Session identifier to stop
 * @throws Error if the API request fails
 */
export async function terminateSession(apiKey: string, sessionId: string): Promise<void> {
	log.info("Terminating session:", sessionId);

	const response = await fetch(`${DEVIN_API_BASE_URL}/sessions/${sessionId}`, {
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
): Promise<string> {
	log.debug("Uploading attachment:", fileName);

	const formData = new FormData();
	const blob = new Blob([fileBuffer]);
	formData.append("file", blob, fileName);

	const response = await fetch(`${DEVIN_API_BASE_URL}/attachments`, {
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
