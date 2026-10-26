-- Migration 008: roadmap upgrade — inventory 2.0, tags, scan queue
-- (sets quantity/completeness, fig acquired_date, tags, persistent AI scan jobs,
--  legacy condition cleanup)

-- Sets: own multiple copies + structured completeness tracking
ALTER TABLE sets ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sets ADD COLUMN has_box INTEGER;
ALTER TABLE sets ADD COLUMN has_instructions INTEGER;
ALTER TABLE sets ADD COLUMN missing_parts TEXT;

-- Minifigures: acquisition date (sets already have it)
ALTER TABLE minifigures ADD COLUMN acquired_date TEXT;

-- Kill remaining legacy condition values (005 migrated, but manual upserts could re-introduce)
UPDATE sets SET condition = 'sealed'        WHERE condition = 'new';
UPDATE sets SET condition = 'open_complete' WHERE condition = 'used';

-- Tags — free-form labels on any set or minifig
CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    color      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_tags (
    entity_type TEXT    NOT NULL,             -- 'set' | 'minifig'
    entity_id   TEXT    NOT NULL,             -- set_number or fig_number
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entity_type, entity_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_entity ON item_tags(entity_type, entity_id);

-- Persistent AI scan queue — batch photo identification survives restarts
CREATE TABLE IF NOT EXISTS scan_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_type   TEXT    NOT NULL DEFAULT 'minifig',  -- 'minifig' | 'set'
    image_path  TEXT    NOT NULL,
    image_hash  TEXT,
    status      TEXT    NOT NULL DEFAULT 'queued',   -- queued | running | done | error | added | dismissed
    result_json TEXT,
    confidence  REAL,
    error       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status);
