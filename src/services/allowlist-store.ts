/**
 * PostgreSQL-backed allowlist store for DM access control.
 *
 * Manages a persistent set of Discord user IDs that are authorized
 * to interact with the bot via direct messages. Uses the same
 * PostgreSQL connection as the session state store.
 */

import { Pool } from "pg";
import { createLogger } from "./logger.js";

const log = createLogger("AllowlistStore");

type QueryClient = {
	query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS dm_allowlist (
	user_id TEXT PRIMARY KEY,
	added_by TEXT NOT NULL,
	added_at BIGINT NOT NULL
)
`;

export class AllowlistStore {
	private readonly client: QueryClient;
	private initialized = false;

	constructor(databaseUrl: string, client?: QueryClient) {
		this.client = client ?? new Pool({ connectionString: databaseUrl });
	}

	private async init(): Promise<void> {
		if (this.initialized) return;
		await this.client.query(CREATE_TABLE_SQL);
		this.initialized = true;
	}

	/**
	 * Checks whether a user ID is in the DM allowlist.
	 *
	 * @param userId - Discord user ID to check
	 * @returns True if the user is allowlisted
	 */
	async isAllowed(userId: string): Promise<boolean> {
		await this.init();
		const result = await this.client.query("SELECT 1 FROM dm_allowlist WHERE user_id = $1", [
			userId,
		]);
		return result.rows.length > 0;
	}

	/**
	 * Adds a user ID to the DM allowlist.
	 *
	 * @param userId - Discord user ID to allowlist
	 * @param addedBy - Discord user ID of the admin who added the entry
	 * @returns True if the user was newly added, false if already present
	 */
	async add(userId: string, addedBy: string): Promise<boolean> {
		await this.init();
		const result = await this.client.query(
			`INSERT INTO dm_allowlist (user_id, added_by, added_at)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id) DO NOTHING`,
			[userId, addedBy, Date.now()],
		);
		const inserted = (result as { rowCount?: number }).rowCount !== 0;
		if (inserted) {
			log.info(`User ${userId} added to DM allowlist by ${addedBy}`);
		}
		return inserted;
	}

	/**
	 * Removes a user ID from the DM allowlist.
	 *
	 * @param userId - Discord user ID to remove
	 * @returns True if the user was removed, false if not found
	 */
	async remove(userId: string): Promise<boolean> {
		await this.init();
		const result = await this.client.query("DELETE FROM dm_allowlist WHERE user_id = $1", [userId]);
		const removed = (result as { rowCount?: number }).rowCount !== 0;
		if (removed) {
			log.info(`User ${userId} removed from DM allowlist`);
		}
		return removed;
	}

	/**
	 * Returns all allowlisted user IDs with metadata.
	 *
	 * @returns Array of allowlist entries
	 */
	async list(): Promise<Array<{ userId: string; addedBy: string; addedAt: number }>> {
		await this.init();
		const result = await this.client.query(
			"SELECT user_id, added_by, added_at FROM dm_allowlist ORDER BY added_at ASC",
		);
		return result.rows
			.filter((row) => typeof row.user_id === "string" && typeof row.added_by === "string")
			.map((row) => ({
				userId: row.user_id as string,
				addedBy: row.added_by as string,
				addedAt: Number(row.added_at),
			}));
	}
}
