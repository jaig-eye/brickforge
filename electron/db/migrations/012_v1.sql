-- Migration 012: the v1 data model.

-- Price history keeps ONE point per item, condition and day. Refreshing twice
-- in a day used to stack identical rows (12 copies of one price was common);
-- the latest refresh of the day now replaces the earlier one.
ALTER TABLE price_history ADD COLUMN day TEXT;
UPDATE price_history SET day = date(recorded_at);
DELETE FROM price_history WHERE id NOT IN (
    SELECT MAX(id) FROM price_history GROUP BY entity_type, entity_id, condition, day
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_day
    ON price_history(entity_type, entity_id, condition, day);

-- Alerts watch for a drop to a buy target ('below') or a rise to a sell
-- target ('above'). One alert per item, condition and direction.
ALTER TABLE price_alerts ADD COLUMN direction TEXT NOT NULL DEFAULT 'below';
DELETE FROM price_alerts WHERE id NOT IN (
    SELECT MAX(id) FROM price_alerts GROUP BY entity_type, entity_id, condition, direction
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_alerts_key
    ON price_alerts(entity_type, entity_id, condition, direction);

-- Group photos are split by the background worker instead of blocking the
-- enqueue call, so a queued job can carry "split me first".
ALTER TABLE scan_jobs ADD COLUMN split_pending INTEGER NOT NULL DEFAULT 0;

-- Listings get a stable id that survives sync between machines.
ALTER TABLE listing_history ADD COLUMN uid TEXT;
UPDATE listing_history SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_history_uid ON listing_history(uid);

-- Tag links pointing at items that no longer exist.
DELETE FROM item_tags WHERE
    (entity_type = 'set' AND entity_id NOT IN (SELECT set_number FROM sets)) OR
    (entity_type = 'minifig' AND entity_id NOT IN (SELECT fig_number FROM minifigures));

-- Retired: feature flags (nothing enforced them) and three tables no code
-- ever wrote to.
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS ai_scan_cache;
DROP TABLE IF EXISTS set_minifigures;
DROP TABLE IF EXISTS pieces;
