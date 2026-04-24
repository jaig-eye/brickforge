-- ────────────────────────────────────────────────
-- LISTING HISTORY
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    set_number  TEXT    NOT NULL,
    set_name    TEXT    NOT NULL,
    year        INTEGER,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL,
    provider    TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listing_history_set
    ON listing_history(set_number);
