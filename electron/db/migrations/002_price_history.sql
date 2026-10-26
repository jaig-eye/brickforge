-- Price alerts — notify when set drops to target price
CREATE TABLE IF NOT EXISTS price_alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT    NOT NULL,
    entity_id    TEXT    NOT NULL,
    target_price REAL    NOT NULL,
    condition    TEXT    NOT NULL DEFAULT 'used',
    is_active    INTEGER NOT NULL DEFAULT 1,
    triggered_at TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active
    ON price_alerts(entity_id, is_active);
