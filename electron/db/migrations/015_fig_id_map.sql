-- Migration 015: what the minifig id bridge has learned, for figures in the
-- collection or not:
-- search results show BrickLink ids from here. bricklink_id NULL means it
-- looked and found none, which stands for a week, and only for the matching
-- rules (rule) it looked with. Local only, not synced.
CREATE TABLE IF NOT EXISTS fig_id_map (
    rebrickable_id TEXT PRIMARY KEY,
    bricklink_id   TEXT,
    checked_at     TEXT NOT NULL DEFAULT (datetime('now')),
    rule           INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO fig_id_map (rebrickable_id, bricklink_id)
    SELECT COALESCE(rebrickable_id, fig_number), bricklink_id FROM minifigures
    WHERE COALESCE(rebrickable_id, fig_number) LIKE 'fig-%' AND bricklink_id IS NOT NULL AND bricklink_id <> '';
