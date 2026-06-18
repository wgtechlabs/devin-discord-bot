# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Add caller permissions so release builds publish latest container tags

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
