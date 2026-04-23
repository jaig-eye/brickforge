# BrickForge 🧱

> A playful yet modern LEGO companion app — collection tracking, AI set/piece identification, value tracking, and more.

**Status:** Alpha — local-machine testing only

---

## Features

| Feature | Status |
|---|---|
| Account & Customizability | ✅ Alpha |
| Collection App (sets + minifigs) | ✅ Alpha |
| Value Tracking (BrickLink prices) | ✅ Alpha |
| Picture Lookup (AI set/fig ID) | ✅ Alpha |
| Piece Identifier (AI part detection) | ✅ Alpha |
| AI Builder (text/image/OBJ → model) | 🔒 Premium (coming soon) |

---

## Tech Stack

- **Desktop:** Electron 35+
- **Frontend:** React 19 + TypeScript + TailwindCSS v4 + Framer Motion
- **Database:** SQLite (local, via better-sqlite3)
- **AI Sidecar:** Python 3.11 + FastAPI + OpenAI GPT-4o Vision
- **Build:** electron-builder → `.exe` / `.dmg` / `.AppImage`

---

## Getting Started (Development)

### Prerequisites

- Node.js 21+
- Python 3.11+
- npm 10+

### Install

```bash
git clone https://github.com/jaig-eye/brickforge.git
cd brickforge
npm install
pip install -r sidecar/requirements.txt
```

### Configure

```bash
cp .env.example .env
# Edit .env and add your API keys (optional for basic use)
```

### Run

```bash
# Start both Vite dev server + Electron
npm run dev

# Or start sidecar separately (for AI features)
npm run sidecar:dev
```

---

## Building

```bash
# Package for current platform
npm run package

# Platform-specific
npm run package:win   # Windows NSIS installer
npm run package:mac   # macOS DMG
npm run package:linux # Linux AppImage
```

---

## API Keys

| Service | Purpose | Get it at |
|---|---|---|
| Rebrickable | LEGO set/part database | rebrickable.com/api |
| BrickLink | Market price data | bricklink.com/v3/api.page |
| OpenAI | AI picture lookup & piece ID | platform.openai.com |

Add keys in **Settings** within the app (stored securely via OS keychain).

---

## Project Structure

```
brickforge/
├── electron/          Main process (IPC, SQLite, sidecar spawn)
├── src/               Renderer (React SPA)
├── sidecar/           Python FastAPI AI service
├── resources/         App icons
└── scripts/           Build helpers
```

---

## Roadmap

- [ ] Camera capture (in-app webcam)
- [ ] Minifigure value tracking
- [ ] BrickLink want list sync
- [ ] AI Builder (text/image/OBJ → BrickLink Studio file) — Premium
- [ ] Mobile companion app

---

*Built with ❤️ by jaig-eye*
