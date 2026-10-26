# Changelog

All notable changes to BrickForge are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/jaig-eye/brickforge/releases/tag/v1.0.0
