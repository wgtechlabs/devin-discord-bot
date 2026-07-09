
# Devin AI — Discord Bot

![GitHub Repo Banner](https://ghrb.waren.build/banner?header=Devin+AI+%E2%80%94+Discord+Bot+%21%5Bdiscord%5D&subheader=Bring+your+AI+software+engineer+to+your+Discord&bg=013B84-016EEA&color=FFFFFF&headerfont=Inter&subheaderfont=Kinewave&watermarkpos=bottom-right)
<!-- Created with GitHub Repo Banner by Waren Gonzaga: https://ghrb.waren.build -->

[![License](https://img.shields.io/badge/License-GPLv3-06B6D4.svg?style=flat-square)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?style=flat-square)](https://www.typescriptlang.org/) [![DiscordJS](https://img.shields.io/badge/DiscordJS-v14-5865F2.svg?style=flat-square)](https://discord.js.org/) [![NodeJS](https://img.shields.io/badge/NodeJS-v26-5FA04E.svg?style=flat-square)](https://nodejs.org/) [![BunJS](https://img.shields.io/badge/BunJS-v1.3.13-F9F1E1.svg?style=flat-square)](https://bun.sh/) [![Docker Hub](https://img.shields.io/badge/Docker%20Hub-2496ED?logo=docker&logoColor=white&style=flat-square)](https://hub.docker.com/r/wgtechlabs/devin-discord-bot) [![GitHub Packages](https://img.shields.io/badge/GitHub%20Packages-181717?logo=github&logoColor=white&style=flat-square)](https://github.com/wgtechlabs/devin-discord-bot/pkgs/container/devin-discord-bot)

Devin AI — Discord Bot is a self-hosted TypeScript integration that brings Devin AI into Discord. Start sessions with a mention or slash command, collaborate in dedicated threads with live status updates, and run tasks like PRs, tests, and bug fixes without leaving Discord.

## Deploy Your Own

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/devin-ai-discord-bot?referralCode=dTwT-i&utm_medium=integration&utm_source=template&utm_campaign=generic)

Deploy your own copy and support the project. 💖

## Features

- **Slash Commands** — `/devin start`, `/devin reply`, `/devin stop`, `/devin sessions`, `/devin template`
- **@Mention Support** — Tag the bot in any channel to start a session
- **Threaded Conversations** — Each session gets a dedicated thread with live updates
- **Adaptive Polling** — Fast updates during active work, slower when idle
- **Template System** — Pre-built templates for common tasks (PRs, code review, tests, bug fixes)
- **File Attachments** — Upload files directly to Devin via Discord
- **Thread Keywords** — `mute`, `unmute`, `!aside`, `EXIT` for in-thread control
- **Status Embeds** — Color-coded status with emoji indicators
- **Restart Recovery** — Session ownership and thread mapping persist across bot restarts
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
- A **Discord bot** ([create one](https://discord.com/developers/applications))
  - **OAuth2 > URL Generator**: select scopes `bot` and `applications.commands` only
  - **Integration Type**: Guild Install
  - **Bot permissions**: View Channels, Send Messages, Create Public Threads, Send Messages in Threads, Embed Links, Attach Files, Read Message History, Add Reactions, Use Slash Commands
  - **Generated guild install link**: copy the URL Discord generates for you — it will look like `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=311385246784&integration_type=0&scope=bot+applications.commands`
  - **Bot tab**: Public Bot off, Requires OAuth2 Code Grant off, Presence Intent on, Server Members Intent on, Message Content Intent on
- A **Devin API key** (starts with `apk_`)
- **PostgreSQL** 14+ (for persistent session state)

## Quick Start

### 1. Install dependencies

```bash
git clone https://github.com/wgtechlabs/devin-discord-bot.git
cd devin-discord-bot
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=postgres://postgres:postgres@localhost:5432/devin_discord_bot
DEVIN_API_KEY=apk_your_api_key
# Required when DEVIN_API_KEY starts with cog_ (service-user v3 keys)
# DEVIN_ORG_ID=org_your_org_id

# Optional — session compute tier for v3 keys (normal, fast, lite, ultra)
# Startup default only; can be changed at runtime with:
# /devin settings mode value:<normal|fast|lite|ultra>
# DEVIN_MODE=normal

# Optional — per-user concurrent session cap in Discord (disabled by default)
# Set a positive integer to enable (example: 2)
# Runtime override available via: /devin settings cap per_user:<n|0>
# DEVIN_MAX_SESSIONS_PER_USER=2
# Runtime-only global cap via slash command: /devin settings cap global:<n|0>

# Optional — customize the bot's display name in embeds and thread names
# BOT_NAME=Devin
```

### 3. Run the bot

```bash
# Development (with hot reload)
bun run dev

# Production
bun run build
bun run start
```

### Deploy with Railway

Use the **Deploy on Railway** button above for one-click hosting.
Deploying from this template supports the author and ongoing maintenance.

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

Tag the bot (default: `@Devin`) in any text channel:

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

Runtime state is in-memory; restart recovery snapshots are stored in PostgreSQL via `DATABASE_URL`.

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

This project follows [Clean Flow](https://github.com/wgtechlabs/clean-flow), [Clean Commit](https://github.com/wgtechlabs/clean-commit), and [Clean Labels](https://github.com/wgtechlabs/clean-labels) conventions.

- **Branches**: `main` (stable) + `dev` (integration) + feature branches
- **Merge Strategy**: Feature branches squash-merge into `dev`, `dev` merges into `main`
- **Commit Format**: `<emoji> <type>: <description>` (see Clean Commit)
- **Labels**: 21 standardized labels across 5 categories (see `.github/labels.yml`)

## 💬 Community Discussions

Join our community discussions to get help, share ideas, and connect with other users:

- 📣 **[Announcements](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/announcements)**: Official updates from the maintainer
- 📸 **[Showcase](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/showcase)**: Show and tell your implementation
- 💖 **[Wall of Love](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/wall-of-love)**: Share your experience with the bot
- 🛟 **[Help & Support](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/help-support)**: Get assistance from the community
- 🧠 **[Ideas](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/ideas)**: Suggest new features and improvements

## 🛟 Help & Support

Need help? Check our [Help & Support](https://github.com/wgtechlabs/devin-discord-bot/discussions/categories/help-support) discussions or [create a new issue](https://github.com/wgtechlabs/devin-discord-bot/issues/new/choose).

## 🎯 Contributing

**Important**: All pull requests must be submitted to the `dev` branch. PRs to `main` will be automatically rejected.

Contributions are welcome! Your code must pass `bun run typecheck` before merging.

## 💖 Sponsors

Like this project? **Leave a star**! ⭐⭐⭐⭐⭐

There are several ways you can support this project:

- [Become a sponsor](https://github.com/sponsors/wgtechlabs) and get some perks! 💖
- [Buy me a coffee](https://buymeacoffee.com/wgtechlabs) if you just love what we do! ☕

## ⭐ GitHub Star Nomination

Found this project helpful? Consider nominating me **(@warengonzaga)** for the [GitHub Star program](https://stars.github.com/nominate/)! This recognition supports ongoing development of this project and [my other open-source projects](https://github.com/warengonzaga?tab=repositories). GitHub Stars are recognized for their significant contributions to the developer community — your nomination makes a difference and encourages continued innovation!

## 📃 License

This project is licensed under the [GNU General Public License v3.0](https://opensource.org/licenses/GPL-3.0).

## 📝 Author

This project is created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with the help of awesome [contributors](https://github.com/wgtechlabs/devin-discord-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/devin-discord-bot)](https://github.com/wgtechlabs/devin-discord-bot/graphs/contributors)

---

💻💖☕ by [Waren Gonzaga](https://warengonzaga.com) | [YHWH](https://www.youtube.com/watch?v=VOZbswniA-g) 🙏 - Without _Him_, none of this exists, _even me_.
