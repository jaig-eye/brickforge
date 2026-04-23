PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────
-- PROFILE (single row, id = 1)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name  TEXT    NOT NULL DEFAULT 'Brick Builder',
    avatar_id     TEXT    NOT NULL DEFAULT 'default-01',
    theme_name    TEXT    NOT NULL DEFAULT 'dark-midnight',
    color_accent  TEXT    NOT NULL DEFAULT '#FFD700',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO profiles (id) VALUES (1);

-- ────────────────────────────────────────────────
-- LEGO SETS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    set_number        TEXT    NOT NULL UNIQUE,
    name              TEXT    NOT NULL,
    year              INTEGER,
    theme             TEXT,
    piece_count       INTEGER,
    retail_price_usd  REAL,
    image_url         TEXT,
    rebrickable_url   TEXT,
    bricklink_url     TEXT,
    notes             TEXT,
    is_owned          INTEGER NOT NULL DEFAULT 0,
    is_wanted         INTEGER NOT NULL DEFAULT 0,
    condition         TEXT    NOT NULL DEFAULT 'new',
    acquired_date     TEXT,
    acquired_price    REAL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sets_owned  ON sets(is_owned);
CREATE INDEX IF NOT EXISTS idx_sets_wanted ON sets(is_wanted);
CREATE INDEX IF NOT EXISTS idx_sets_theme  ON sets(theme);

-- ────────────────────────────────────────────────
-- MINIFIGURES
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS minifigures (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fig_number    TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    character     TEXT,
    theme         TEXT,
    year          INTEGER,
    image_url     TEXT,
    bricklink_url TEXT,
    notes         TEXT,
    is_owned      INTEGER NOT NULL DEFAULT 0,
    is_wanted     INTEGER NOT NULL DEFAULT 0,
    quantity      INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS set_minifigures (
    set_id  INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    fig_id  INTEGER NOT NULL REFERENCES minifigures(id) ON DELETE CASCADE,
    qty     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (set_id, fig_id)
);

-- ────────────────────────────────────────────────
-- PIECES / PARTS
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pieces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number     TEXT    NOT NULL,
    color_id        INTEGER,
    color_name      TEXT,
    name            TEXT    NOT NULL,
    category        TEXT,
    image_url       TEXT,
    bricklink_url   TEXT,
    quantity_owned  INTEGER NOT NULL DEFAULT 0,
    quantity_wanted INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(part_number, color_id)
);

-- ────────────────────────────────────────────────
-- PRICE HISTORY
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT    NOT NULL,
    entity_id    TEXT    NOT NULL,
    source       TEXT    NOT NULL DEFAULT 'bricklink',
    condition    TEXT    NOT NULL DEFAULT 'used',
    avg_price    REAL    NOT NULL,
    min_price    REAL,
    max_price    REAL,
    sample_count INTEGER,
    currency     TEXT    NOT NULL DEFAULT 'USD',
    recorded_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_entity
    ON price_history(entity_type, entity_id, recorded_at DESC);

-- ────────────────────────────────────────────────
-- AI SCAN CACHE
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_scan_cache (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    image_hash    TEXT    NOT NULL UNIQUE,
    scan_type     TEXT    NOT NULL,
    result_json   TEXT    NOT NULL,
    model_used    TEXT,
    confidence    REAL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
