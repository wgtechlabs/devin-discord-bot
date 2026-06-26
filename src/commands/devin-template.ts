/**
 * Slash command and component handlers for `/devin template`.
 *
 * Presents a select menu of pre-built task templates, then shows
 * a modal form for the selected template. On submission, builds
 * a structured prompt and creates a Devin session.
 */

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	ModalBuilder,
	type ModalSubmitInteraction,
	StringSelectMenuBuilder,
	type StringSelectMenuInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { EMBED_COLORS, THREAD_AUTO_ARCHIVE_DURATION, THREAD_NAME_MAX_LENGTH } from "../config.js";
import { createSession } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import { SessionQueueError } from "../services/session-queue.js";
import { TEMPLATES, getTemplate } from "../templates/index.js";
import type { BotConfig, ThreadableChannel } from "../types/index.js";

const log = createLogger("Command:DevinTemplate");

/**
 * Displays the template selection dropdown menu.
 *
 * @param interaction - Discord slash command interaction
 * @param _config - Validated bot configuration (unused)
 * @param _sessionManager - Session tracking manager instance (unused)
 */
export async function handleDevinTemplate(
	interaction: ChatInputCommandInteraction,
	_config: BotConfig,
	_sessionManager: SessionManager,
): Promise<void> {
	const options = TEMPLATES.map((t) => ({
		label: t.name,
		description: t.description,
		value: t.id,
	}));

	const select = new StringSelectMenuBuilder()
		.setCustomId("template-select")
		.setPlaceholder("Choose a template")
		.addOptions(options);

	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
	await interaction.reply({
		content: "Select a template:",
		components: [row],
		ephemeral: true,
	});
}

/**
 * Handles template selection from the dropdown menu.
 * Opens a modal form with the template's configured fields.
 *
 * @param interaction - Discord select menu interaction
 */
export async function handleTemplateSelect(
	interaction: StringSelectMenuInteraction,
): Promise<void> {
	const templateId = interaction.values[0];
	const template = getTemplate(templateId);

	if (!template) {
		await interaction.reply({
			content: "Template not found.",
			ephemeral: true,
		});
		return;
	}

	const modal = new ModalBuilder()
		.setCustomId(`template-modal:${templateId}`)
		.setTitle(template.name);

	for (const field of template.fields) {
		const input = new TextInputBuilder()
			.setCustomId(field.id)
			.setLabel(field.label)
			.setPlaceholder(field.placeholder)
			.setRequired(field.required)
			.setStyle(field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short);

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
	}

	await interaction.showModal(modal);
}

/**
 * Handles modal form submission for a template. Extracts field values,
 * builds the prompt, creates a Devin session, and opens a thread.
 *
 * @param interaction - Discord modal submit interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleTemplateSubmit(
	interaction: ModalSubmitInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const templateId = interaction.customId.replace("template-modal:", "");
	const template = getTemplate(templateId);

	if (!template) {
		await interaction.reply({
			content: "Template not found.",
			ephemeral: true,
		});
		return;
	}

	const channel = interaction.channel as ThreadableChannel | null;
	if (!channel?.threads) {
		await interaction.reply({
			content: "This command can only be used in a text channel.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	const values: Record<string, string> = {};
	for (const field of template.fields) {
		values[field.id] = interaction.fields.getTextInputValue(field.id);
	}

	const prompt = template.buildPrompt(values);
	const queue = sessionManager.getQueue();

	let session_id: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(interaction.user.id, prompt, (p) =>
				createSession(config.devinApiKey, p, config.devinOrgId),
			);
			session_id = result.sessionId;
			url = result.url;
		} catch (err) {
			if (err instanceof SessionQueueError) {
				await interaction.editReply(err.message);
				return;
			}
			throw err;
		}
	} else {
		const result = await createSession(config.devinApiKey, prompt, config.devinOrgId);
		session_id = result.session_id;
		url = result.url;
	}

	log.info(`Template session created: ${session_id}`);

	let tracked = false;
	try {
		const threadName = `${config.botName}: ${template.name}`.slice(0, THREAD_NAME_MAX_LENGTH);
		const thread = await channel.threads.create({
			name: threadName,
			autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
			reason: `Devin session ${session_id}`,
		});

		const embed = new EmbedBuilder()
			.setDescription(
				`Talk to ${config.botName} in this thread\n\n\u{1F4A1} **Tip:** Type \`mute\` to stop ${config.botName} from reading your messages`,
			)
			.setColor(EMBED_COLORS.working);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel("Open web app").setStyle(ButtonStyle.Link).setURL(url),
		);

		await sessionManager.track(session_id, thread, url, interaction.user.id);
		tracked = true;
		await thread.send({ embeds: [embed], components: [row] });
		await interaction.editReply(`Session started in ${thread}`);
	} catch (err) {
		if (!tracked) {
			queue?.releaseSession(session_id, interaction.user.id);
		}
		throw err;
	}
}
