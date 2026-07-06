# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [0.5.1] - 2026-07-06

### Changed

- add runtime settings slash commands
- add runtime session cap slash config
- add slash-configurable devin mode
- bump version and update scripts
- remove prepare check from install path
- harden thread reply session checks (#51)
- make per-user session cap opt-in (#50)

## [0.5.0] - 2026-07-06

### Added

- show bot version on startup and add /version command (#48)

### Changed

- reflect /version top-level command
- update CHANGELOG.md for v0.4.0
- update README banner image link and CI workflow configuration (#45)

## [0.4.0] - 2026-07-04

### Added

- add og-image HTML for Discord bot preview
- add DEVIN_MODE config for v3 session compute tier (#38)
- add og image for landing page (#33)

### Changed

- synchronize library versions
- update Node.js badge in README
- improve devin usage-limit feedback (#44)
- address PR review feedback
- trim and validate devin_mode (#41)
- add DEVIN_MODE support for v3 sessions (#42)
- disable review button after click (#35)
- render Devin attachments in Discord (#36)
- migrate to @wgtechlabs/log-engine (#34)

### Security

- patch bundled npm undici (#43)

## [0.3.0] - 2026-06-30

### Added

- add landing page and github pages deployment (#32)
- add Review with Devin button to PR embeds (#28)

### Changed

- update README for clarity and consistency
- fix pool transaction, splitMessage overflow, and thread error feedback (#31)
- update README with new deployment link and add sponsor section
- add icon for devin
- convert markdown tables to code blocks for Discord (#27)

### Removed

- delete unused label configuration

### Security

- patch node-tar vulnerability
- patch undici and node-tar vulnerabilities (#26)

## [0.2.0] - 2026-06-20

### Added

- add DM support with allowlist and improve session UX (#25)

## [0.1.7] - 2026-06-20

### Changed

- fix splitMessage char drop and isolate sendTyping errors
- sync package version to 0.1.6
- replace envelope reaction with eyes + typing indicator and use plain messages (#22)
- update readme

## [0.1.6] - 2026-06-19

### Changed

- update README to include deploy button in header
- remove unsafe pool pseudo-transaction
- harden postgres state recovery (#20)

## [0.1.5] - 2026-06-19

### Changed

- harden v3 url and pagination guards
- fix package.json biome formatting
- add support for service-user v3 keys with org id
- persist session state in PostgreSQL for restart recovery
- restore sessions on startup with thread/permission guardrails
- validate and skip malformed persisted rows with clear logs
- add tests for persistence roundtrip and restore decisions
- document `DATABASE_URL` and Railway deployment option

## [0.1.4] - 2026-06-19

### Changed

- publish latest tag on main pushes (#18)

## [0.1.3] - 2026-06-19

### Changed

- align package version with main
- restore pr codeql trigger on main
- avoid duplicate PR-main validation
- align workflow permission docs
- publish latest container tags

## [0.1.2] - 2026-06-18

### Changed

- fix prepare formatting
- enable release trigger and use build-flow v0.1.8

## [0.1.1] - 2026-06-18

### Changed

- pin build flow action to v0.1.7 (#14)

## [0.1.0] - 2026-06-18

### Added

- Add container publishing workflow and documentation
- add multi-stage dockerfile and container flow
- scaffold devin discord bot project (#1)

### Changed

- switch build‑flow action to main branch
- fix workflow ref from tag object SHA to v0 tag (#12)
- use both docker hub and ghcr for container registry (#10)
- move syntax directive to first line
- trigger ci re-run after build-flow-action fix
- replace manual ci with build flow action (#8)
- promote dev to main (#5)
- restructure slash commands as subcommands and add bot name customization (#2)
- initialize repository
