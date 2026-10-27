# Changelog

All notable changes to BrickForge are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-26

### Changed
- BrickLink ids are now the source of truth for minifigures: every minifigure in your collection goes by its BrickLink id (like `sw0700`), with its prices, alerts, and tags. Your existing collection moves over on first launch, and sync carries the move to your other computers.
- A minifigure's BrickLink id is found from the BrickLink inventories of the sets it comes in, which is far more reliable than matching pictures; the picture match now only has to choose among that set's figures.
- A set's minifigures come from its BrickLink inventory, with their BrickLink ids and how many of each.

### Added
- Catalog and search results show minifigures' BrickLink ids, filling them in as they're found.
- macOS: disk images for Apple Silicon and Intel Macs, with the system's own window controls, a macOS menu bar, and ⌘ shortcuts. macOS can't update an app that isn't signed with an Apple Developer ID, so BrickForge checks GitHub for new versions and opens the download page.
- The Claude Code AI provider finds the `claude` command on a Mac even when BrickForge is opened from the Dock.

### Security
- Electron 44.9.3, which mitigates the compromised eMudhra intermediate certificates ([GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)) and brings backported fixes from Chromium, V8, Skia, ANGLE, and PDFium.

## [1.0.0] - 2026-10-26

The first public release. BrickForge was rebuilt from the ground up: a new interface, a new data layer, and a test suite that covers every feature.

### Collection
- Sets and minifigures with condition, quantity, purchase price, tags, notes, and a wishlist.
- Grid and table views, filters by theme, condition, and tag, multi-select with bulk tag, move, and edit, and undo after deleting.
- Search anything and add it from anywhere with <kbd>Ctrl</kbd>+<kbd>K</kbd>. Adding a set offers to add its minifigures.
- Catalog browser for every LEGO set and minifigure on Rebrickable, with owned and wanted items marked.

### Scan
- Photo identification of sets and minifigures through Brickognize, with an optional AI check for uncertain matches.
- A queue that keeps working through photos in the background and picks up again after a restart.
- Group photos split into one scan per minifigure (needs an AI provider).

### Value
- BrickLink market prices matched to each item's condition, refreshed daily.
- Portfolio history, gain over purchase price, top movers, value by theme, and most valuable items.
- Price alerts for drops below or rises above a target, with Windows notifications.

### Sell
- eBay listing title and HTML description written by your AI provider, with a live preview and saved past listings.
- BrickLink sold-price guide for new and used copies.

### Data
- Everything stored locally in one SQLite file, with weekly automatic backups and one-click restore.
- Optional two-way sync with a PostgreSQL database you own (Supabase, Neon, or self-hosted).
- Import from Brickset and Rebrickable CSV, BrickLink wanted-list XML, or a photo of a list, with a review step. Export to CSV.
- API keys encrypted at rest with Windows data protection.

### App
- Night Studio design: dark and light themes, four accent colors, and animated brick graphics that respect reduced motion.
- First-run setup with a test for every connection, and a demo mode with a sample collection.
- Anthropic (Claude Opus 5.5 by default), OpenAI, or a local Claude Code sign-in as the AI provider.
- Automatic updates from GitHub releases, verified by checksum.

[1.1.0]: https://github.com/jaig-eye/brickforge/releases/tag/v1.1.0
[1.0.0]: https://github.com/jaig-eye/brickforge/releases/tag/v1.0.0
