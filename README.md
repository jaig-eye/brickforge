<div align="center">

<img src="resources/icon.png" width="104" alt="BrickForge icon" />

# BrickForge

**A LEGO® collection manager for Windows.** Track your sets and minifigures, see what they're worth on BrickLink, identify them from a photo, and write eBay listings in one click.

[![Release](https://img.shields.io/github/v/release/jaig-eye/brickforge?color=FFC929&label=download)](https://github.com/jaig-eye/brickforge/releases/latest)
[![CI](https://github.com/jaig-eye/brickforge/actions/workflows/ci.yml/badge.svg)](https://github.com/jaig-eye/brickforge/actions/workflows/ci.yml)
![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4)
[![MIT license](https://img.shields.io/badge/license-MIT-3dd68c)](LICENSE)

<img src="docs/screenshots/home.png" alt="BrickForge home screen: collection value, portfolio chart, top movers, and recently added sets" />

</div>

## What it does

BrickForge keeps your whole LEGO collection in one place on your PC: every set and minifigure you own, the ones on your wishlist, what each is worth today, and how that has changed. It's free, it works offline, and your data stays in a single file you control.

| | |
|---|---|
| **Collection** | Sets and minifigures with condition, quantity, purchase price, tags, notes, and a wishlist. Grid or table view, filters by theme, condition, and tag, and bulk edits. |
| **Catalog** | Browse and search every LEGO set and minifigure from Rebrickable, with what you already own marked. |
| **Scan** | Drop photos of sets or minifigures and get matches from the catalog. With an AI provider set up, a photo of several minifigures is split into one scan per figure. |
| **Value** | Market prices from BrickLink sales, portfolio history, gain over what you paid, top movers, value by theme, and price alerts. |
| **Sell** | An eBay-ready title and HTML description for any set, plus BrickLink's recent sold prices to price it. |
| **Import and export** | CSV from Brickset, Rebrickable, or BrickForge, BrickLink wanted-list XML, or a photo of a list. Every import is reviewed before anything is added. |
| **Sync** | Optional two-way sync with a PostgreSQL database you own (Supabase, Neon, or your own server) to keep two PCs in step. |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/collection.png" alt="Collection grid with themes, conditions, and values" /><br /><sub><b>Collection.</b> Your sets and minifigures with live values.</sub></td>
    <td width="50%"><img src="docs/screenshots/item.png" alt="Item details sheet with price history and price alert" /><br /><sub><b>Item details.</b> Price history, gain, and alerts for one set.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/scan.png" alt="Scan results matching a set photo and a minifigure photo" /><br /><sub><b>Scan.</b> Photos matched to the catalog, best match first.</sub></td>
    <td><img src="docs/screenshots/value.png" alt="Value page with portfolio chart, movers, and value by theme" /><br /><sub><b>Value.</b> What the collection is worth and where it's moving.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/catalog.png" alt="Catalog browser showing LEGO sets with owned badges" /><br /><sub><b>Catalog.</b> Every set and minifigure, searchable.</sub></td>
    <td><img src="docs/screenshots/sell.png" alt="Sell page with a generated eBay listing preview" /><br /><sub><b>Sell.</b> A finished eBay listing and a suggested price.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/settings.png" alt="Settings page with connections and data options" /><br /><sub><b>Settings.</b> Connections, prices, backups, and sync.</sub></td>
    <td><img src="docs/screenshots/home-light.png" alt="Home screen in the light theme" /><br /><sub><b>Light theme.</b> Dark or light, with four accent colors.</sub></td>
  </tr>
</table>

## Install

1. Download **`BrickForge-Setup-<version>.exe`** from the [latest release](https://github.com/jaig-eye/brickforge/releases/latest).
2. Run it. BrickForge installs for your Windows user and opens when it's done.
3. The installer isn't code-signed yet, so Windows SmartScreen may say *Windows protected your PC*. Click **More info**, then **Run anyway**.

BrickForge checks GitHub for new versions and offers to install them. Each download's SHA-512 checksum is verified before it runs.

**Just want to look around?** Open **Settings → About → Open the demo** to browse a sample collection of 21 sets and 15 minifigures with real prices. The demo keeps its own data and never touches yours.

## Set up

The first time you open BrickForge, it walks you through connecting the free services it uses. Every connection has a **Test** button that proves the key works before you rely on it. You can change any of them later in **Settings → Connections**.

| Service | What it unlocks | Cost | Needed? |
|---|---|---|---|
| [Rebrickable](https://rebrickable.com/api/) | Set and minifigure names, pictures, themes, piece counts. Search, add, and Catalog. | Free | Yes |
| [BrickLink](https://www.bricklink.com/v2/api/register_consumer.page) | Market prices, price history, alerts, and Sell's price suggestion. | Free | For prices |
| [Brickognize](https://brickognize.com/) | The photo recognizer behind Scan. | Free, no key | Built in |
| AI provider | Double-checks uncertain scans, reads photographed lists, writes eBay listings. | Pay per use, or your Claude Code sign-in | Optional |

### Rebrickable key

1. Create a free account at [rebrickable.com](https://rebrickable.com/).
2. Open your account's **Settings → API** page and click **Generate new API key**.
3. Paste the key into BrickForge and click **Test**.

### BrickLink keys

BrickLink's API uses four values: a consumer key and secret, and a token and token secret.

1. Sign in to [bricklink.com](https://www.bricklink.com/) (a free buyer account is enough).
2. Go to the [API consumer registration page](https://www.bricklink.com/v2/api/register_consumer.page) and register.
3. Create an access token. For **IP address**, enter `0.0.0.0` so the token works from any network. For **mask**, enter `0.0.0.0` too.
4. Copy all four values into BrickForge and click **Test**.

Prices are BrickLink's sold prices from the last six months (US region, in US dollars), falling back to current listings when nothing has sold. BrickForge refreshes them daily if you leave **Update prices daily** on.

### AI provider (optional)

Scan works without AI: Brickognize handles clear photos on its own. Pick one provider in **Settings → Connections** for the rest:

- **Anthropic**: an API key from [platform.claude.com](https://platform.claude.com/). Uses Claude Opus 5.5 by default.
- **OpenAI**: an API key from [platform.openai.com](https://platform.openai.com/api-keys).
- **Claude Code**: uses the [Claude Code](https://code.claude.com/docs) app already installed and signed in on your PC, so no key is needed. Each call is a little slower.

## Using BrickForge

- **Add things.** Press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere and type a set number or a name, or use **Add** on any screen. Adding a set offers to add its minifigures too.
- **Scan.** Drag photos onto **Scan**, or click to pick them. Choose **Sets** or **Minifigures** first. With an AI provider set up, turn on **Split group photos** to scan a lineup of figures in one go. Pick the right match and click **Add**, or the heart to wishlist it.
- **Edit and organize.** Click any item for its details sheet. In **Collection**, <kbd>Ctrl</kbd>-click or <kbd>Shift</kbd>-click to select several, <kbd>Ctrl</kbd>+<kbd>A</kbd> to select everything shown, then tag, move, or edit them together. <kbd>Esc</kbd> clears the selection.
- **Watch prices.** In an item's details, set an alert for when its price drops below or rises above a target. Alerts are checked after every price update and show a Windows notification.
- **Sell.** Pick a set on **Sell**, describe your copy (how complete it is, and whether the instructions, minifigures, and box are included), and click **Write the listing**. Copy the title and the HTML straight into eBay.
- **Back up.** BrickForge backs up your collection weekly on its own. **Settings → Your data** backs up now, restores a backup, imports, and exports CSV.

## Your data

Everything lives on your PC in `%APPDATA%\brickforge`:

| | |
|---|---|
| `brickforge.db` | Your collection, prices, alerts, and listings (SQLite) |
| `settings.json` | Preferences. API keys in it are encrypted with Windows' own data protection and can only be read by your Windows account on this PC |
| `backups\` | Automatic weekly backups and any you make yourself |
| `scans\` | Photos you've scanned, until you clear them |

BrickForge sends nothing anywhere except to the service each feature needs: catalog lookups to Rebrickable, price lookups to BrickLink, scanned photos to Brickognize (and to your AI provider when it double-checks a match), and listing details to your AI provider. There's no account, no analytics, and no telemetry.

### Sync to your own database

Sync keeps two PCs in step, or keeps an off-site copy. BrickForge still works from its local file and sends and receives changes in the background, so it keeps working offline. When two PCs change the same item, the newest change wins.

1. Create a free PostgreSQL database, for example on [Supabase](https://supabase.com/) or [Neon](https://neon.com/), or use your own server.
2. Copy its connection string (`postgresql://user:password@host:5432/dbname`). Supabase and Neon may need `?sslmode=require` on the end.
3. In **Settings → Your data → Sync**, paste it, click **Test**, then **Connect**.

BrickForge creates one table, `brickforge_sync`, and touches nothing else in that database. Restoring a backup while sync is on makes this PC rejoin as a new device and converge with the database.

## Build from source

You need **Windows 10 or 11**, [Node.js 24](https://nodejs.org/), and [Git](https://git-scm.com/).

```bash
git clone https://github.com/jaig-eye/brickforge.git
```

```bash
cd brickforge
```

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` builds the main process, starts the Vite dev server, and opens the app with hot reload. Your real collection in `%APPDATA%\brickforge` is used; run `npm run demo` instead to work against the sample collection.

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run demo` | Run the app with the sample collection |
| `npm run typecheck` | Type-check the renderer and the main process |
| `npm run lint` | ESLint |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Build, then drive the real app end to end (Playwright) |
| `npm run screenshots` | Regenerate the screenshots in this README |
| `npm run package:win` | Build the Windows installer into `release\` |

The tests never touch the internet or your data. Every web service (Rebrickable, BrickLink, Brickognize, Anthropic, OpenAI) is replaced by a local stand-in that replays recorded real responses, sync runs against an in-process PostgreSQL ([PGlite](https://pglite.dev/)), and each test gets a fresh data folder. `.env.example` lists the environment variables for pointing the app at other folders and services.

### How it's built

| | |
|---|---|
| App | [Electron](https://www.electronjs.org/) 44, sandboxed renderer, context-isolated preload |
| Interface | [React](https://react.dev/) 19, TypeScript, [Tailwind CSS](https://tailwindcss.com/) 4, [Framer Motion](https://motion.dev/), [TanStack Query](https://tanstack.com/query) |
| Data | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), versioned SQL migrations, optional PostgreSQL sync via [node-postgres](https://node-postgres.com/) |
| Recognition | [Brickognize](https://brickognize.com/), then [Claude](https://www.anthropic.com/claude) or OpenAI to double-check |
| Tests | [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) for Electron, PGlite |

```
electron/          Main process
  api/             Rebrickable, BrickLink, Brickognize, and AI clients
  db/              SQLite connection, migrations, queries
  ipc/             Typed handlers the interface calls
  services/        Scan queue, pricing, listings, import, sync, updates
src/               Interface (React)
  pages/           Home, Collection, Catalog, Scan, Value, Sell, Settings
  components/      Shell, brick graphics, charts, UI kit
tests/             Unit, integration, and end-to-end tests, fixtures, stand-in APIs
resources/         Icons and the demo collection
```

## Roadmap

Ideas for what comes next are in [ROADMAP.md](ROADMAP.md), and every release is described in [CHANGELOG.md](CHANGELOG.md). Bug reports and suggestions are welcome in [Issues](https://github.com/jaig-eye/brickforge/issues).

## License

[MIT](LICENSE) © jaig-eye

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize, or endorse this project. BrickLink® is a trademark of the LEGO Group. Set and minifigure data and images come from [Rebrickable](https://rebrickable.com/); prices come from the [BrickLink API](https://www.bricklink.com/v3/api.page). BrickForge isn't affiliated with Rebrickable, BrickLink, Brickset, or Brickognize.

<sub>Keywords: LEGO collection tracker, LEGO inventory app, LEGO set value, LEGO price tracker, minifigure collection, BrickLink price guide, Rebrickable, Brickset import, LEGO identifier, LEGO scanner, AFOL, LEGO investing, eBay LEGO listing, Windows desktop app.</sub>
