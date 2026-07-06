/**
 * PostgreSQL-backed runtime settings store.
 *
 * Persists mutable operator settings controlled via slash commands.
 */

import { Pool } from "pg";
import { VALID_DEVIN_MODES } from "../config.js";
import type { DevinMode } from "../types/index.js";

type QueryClient = {
	query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bot_settings (
	setting_key TEXT PRIMARY KEY,
	setting_value TEXT NOT NULL,
	updated_at BIGINT NOT NULL
)
`;

const DEVIN_MODE_KEY = "devin_mode";

export class BotSettingsStore {
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

	async getDevinMode(): Promise<DevinMode | undefined> {
		await this.init();
		const result = await this.client.query(
			"SELECT setting_value FROM bot_settings WHERE setting_key = $1",
			[DEVIN_MODE_KEY],
		);
		const raw = result.rows[0]?.setting_value;
		if (typeof raw !== "string" || !VALID_DEVIN_MODES.has(raw as DevinMode)) {
			return undefined;
		}
		return raw as DevinMode;
	}

	async setDevinMode(mode: DevinMode): Promise<void> {
		await this.init();
		await this.client.query(
			`INSERT INTO bot_settings (setting_key, setting_value, updated_at)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (setting_key) DO UPDATE SET
				setting_value = EXCLUDED.setting_value,
				updated_at = EXCLUDED.updated_at`,
			[DEVIN_MODE_KEY, mode, Date.now()],
		);
	}
}
