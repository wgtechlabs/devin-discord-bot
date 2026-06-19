# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [0.1.5] - 2026-06-19

### Changed

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
