
# Devin Discord Bot

[![Devin Discord Bot – GitHub Repo Banner](https://ghrb.waren.build/banner?header=Devin+Discord+Bot+%F0%9F%A4%96&subheader=Self-hosted+Discord+bot+integration+for+Devin+AI&bg=4752C4-5865F2&color=FFFFFF)](https://github.com/wgtechlabs/devin-discord-bot)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f472b6.svg)](https://bun.sh/)

---

## Why

Development teams already live in Discord. When a coding task comes up, context-switching to a separate tool breaks flow and slows teams down. Developers need Devin's autonomous coding power right where they already collaborate.

## How

Devin Discord Bot bridges Discord and the Devin AI API through a self-hosted TypeScript bot. Tag `@Devin` in any channel or use slash commands to start a session — the bot creates a dedicated thread, polls for updates, and posts real-time progress with color-coded status embeds. Thread conversations are automatically forwarded to Devin, enabling seamless back-and-forth without leaving Discord.

## What

A self-hosted Discord bot that integrates with the [Devin AI](https://devin.ai) API, built with TypeScript and discord.js. Start coding sessions, review PRs, write tests, and fix bugs — all from Discord.

---

## Features

- **Slash Commands** — `/devin start`, `/devin reply`, `/devin stop`, `/devin sessions`, `/devin template`
- **@Mention Support** — Tag the bot in any channel to start a session
- **Threaded Conversations** — Each session gets a dedicated thread with real-time updates
- **Adaptive Polling** — Fast updates during active work, slower when idle
- **Template System** — Pre-built templates for common tasks (PR, code review, tests, bug fix)
- **File Attachments** — Upload files directly to Devin via Discord
- **Thread Keywords** — `mute`, `unmute`, `!aside`, `EXIT` for in-thread control
- **Status Embeds** — Color-coded session status with emoji indicators
- **Customizable Bot Name** — Set `BOT_NAME` in `.env` to rebrand embed headers and thread names
- **Self-Hosted** — Full control over your data and deployment

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.8+ |
| Runtime | Node.js 26 (default), 22 & 24 LTS supported |
| Framework | discord.js v14 |
| Toolchain | Bun |
| Linter | Biome |
| Testing | Bun Test |
| CI | GitHub Actions |

## Prerequisites

- **Node.js** 22+ (26 recommended)
- **Bun** 1.0+
- A **Discord bot** ([create one here](https://discord.com/developers/applications))
  - Enable the **Message Content** privileged gateway intent
  - Invite with permissions: Send Messages, Send Messages in Threads, Create Public Threads, Embed Links, Read Message History, Add Reactions, Use Slash Commands
- A **Devin API key** (starts with `apk_`)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/wgtechlabs/devin-discord-bot.git
cd devin-discord-bot
bun install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DEVIN_API_KEY=apk_your_api_key

# Optional — customize the bot's display name in embeds and thread names
# BOT_NAME=Devin
```

### 3. Run

```bash
# Development (with hot reload)
bun run dev

# Production
bun run build
bun run start
```

## Usage

### Slash Commands

| Command | Description |
|---------|-------------|
| `/devin start task:` | Start a new Devin session with a freeform task |
| `/devin template` | Start a session from a pre-built template |
| `/devin reply message:` | Send a message to Devin (use in a session thread) |
| `/devin stop` | Terminate a session (use in a session thread) |
| `/devin sessions` | List all active sessions |

### @Mention

Tag the bot in any text channel:

> **@Devin** Write a Python script that fetches top stories from Hacker News

The bot creates a Devin session and opens a thread for the conversation.

### Thread Keywords

| Keyword | Function |
|---------|----------|
| `mute` | Stop forwarding messages to Devin (owner only) |
| `unmute` | Resume forwarding messages (owner only) |
| `!aside` or `(aside)` | Message is ignored by Devin |
| `EXIT` | Terminate the session (owner only) |

### Templates

| Template | Description |
|----------|-------------|
| **Open a PR** | Write code and open a pull request |
| **Code Review** | Review an existing pull request |
| **Write Tests** | Add test coverage to a repository |
| **Fix a Bug** | Investigate and fix a bug |

### Status Indicators

| Status | Color | Meaning |
|--------|-------|---------|
| Working | Yellow | Devin is actively working |
| Blocked | Orange | Devin needs input |
| Finished | Green | Task complete |
| Error | Red | Session expired, stopped, or failed |

## Architecture

```
src/
├── index.ts                  # Bot entry point
├── config.ts                 # Environment config and constants
├── commands/
│   ├── index.ts              # Unified /devin command and subcommand routing
│   ├── devin.ts              # /devin start — start a session
│   ├── devin-reply.ts        # /devin reply — send message to session
│   ├── devin-stop.ts         # /devin stop — terminate session
│   ├── devin-sessions.ts     # /devin sessions — list active sessions
│   └── devin-template.ts     # /devin template — template-based sessions
├── handlers/
│   ├── interaction.ts        # Slash command and component router
│   └── message.ts            # @mention and thread message handler
├── services/
│   ├── devin-api.ts          # Devin REST API client
│   ├── session-manager.ts    # Session tracking and polling
│   └── logger.ts             # Structured logger with level filtering
├── templates/
│   └── index.ts              # Pre-built prompt templates
└── types/
    └── index.ts              # Shared type definitions
```

Single-process, in-memory state. No database required.

## Development

```bash
# Install dependencies
bun install

# Run linter
bun run lint

# Fix lint issues
bun run lint:fix

# Type check
bun run typecheck

# Run tests
bun test

# Run tests in watch mode
bun run test:watch

# Build for production
bun run build
```

## Container Publishing

Production CI publishes container images to both Docker Hub and GitHub Container
Registry (GHCR) through [build-flow.yml](.github/workflows/build-flow.yml).

Required repository secrets:

- `DOCKER_HUB_USERNAME`
- `DOCKER_HUB_ACCESS_TOKEN` (recommended: Docker Hub access token)

Required repository permissions:

- Contents: Read and write
- Packages: Read and write
- Pull requests: Read and write
- Security events: Read and write
- Actions: Read

Notes:

- GHCR publishing uses the workflow token and repository package permissions.
- Docker Hub publishing uses the configured Docker Hub secrets.
- Pull requests run validation, while pushes to `dev` and `main` can publish images.
- Pushes to `main` also update the mutable `latest` tag in both registries.
- Published release builds continue to publish versioned release tags.

## Workflow

This project follows [Clean Flow](https://github.com/wgtechlabs/clean-flow), [Clean Commit](https://github.com/nicedoc/clean-commit), and [Clean Labels](https://github.com/wgtechlabs/clean-labels) conventions.

- **Branches**: `main` (stable) + `dev` (integration) + feature branches
- **Merge Strategy**: Feature branches squash-merge into `dev`, `dev` merges into `main`
- **Commit Format**: `<emoji> <type>: <description>` (see Clean Commit)
- **Labels**: 21 standardized labels across 5 categories (see `.github/labels.yml`)

## License

GPL-3.0 — [WG Tech Labs](https://github.com/wgtechlabs)
