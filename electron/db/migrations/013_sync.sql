-- Migration 013: change tracking for the optional Postgres sync.
--
-- Every write to a synced table records (table, natural key) in _sync_meta
-- with a millisecond timestamp and a dirty flag; deletes leave a tombstone.
-- The sync engine pushes dirty rows and compares timestamps (last write wins
-- per row). Keys are JSON arrays of the row's natural key, never the local
-- integer id, so they mean the same row on every PC.
--
-- Triggers stay quiet while the engine applies rows pulled from the server
-- (_sync_state.applying = '1'), so remote changes are not echoed back.
-- A timestamp never moves backwards for a row: an edit made right after
-- pulling a row from a PC whose clock runs ahead still counts as newer.
-- Existing rows are not marked here; connecting sync backfills them.

CREATE TABLE IF NOT EXISTS _sync_meta (
    tbl     TEXT    NOT NULL,
    key     TEXT    NOT NULL,
    ts      INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    dirty   INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tbl, key)
);

CREATE INDEX IF NOT EXISTS idx_sync_meta_dirty ON _sync_meta(dirty) WHERE dirty = 1;

CREATE TABLE IF NOT EXISTS _sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO _sync_state (key, value) VALUES ('applying', '0');

-- ────────────────────────────────────────────────
-- SETS (key: set_number)
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_sets_insert AFTER INSERT ON sets
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('sets', json_array(NEW.set_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_sets_update AFTER UPDATE ON sets
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'sets', json_array(OLD.set_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE OLD.set_number IS NOT NEW.set_number
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('sets', json_array(NEW.set_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_sets_delete AFTER DELETE ON sets
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('sets', json_array(OLD.set_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- MINIFIGURES (key: fig_number)
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_minifigures_insert AFTER INSERT ON minifigures
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('minifigures', json_array(NEW.fig_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_minifigures_update AFTER UPDATE ON minifigures
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'minifigures', json_array(OLD.fig_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE OLD.fig_number IS NOT NEW.fig_number
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('minifigures', json_array(NEW.fig_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_minifigures_delete AFTER DELETE ON minifigures
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('minifigures', json_array(OLD.fig_number), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- PRICE HISTORY (key: entity_type, entity_id, condition, day)
-- recordPrice() upserts; its DO UPDATE branch fires the UPDATE trigger.
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_price_history_insert AFTER INSERT ON price_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_history', json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.day), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_price_history_update AFTER UPDATE ON price_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'price_history', json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.day), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.day) IS NOT json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.day)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_history', json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.day), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_price_history_delete AFTER DELETE ON price_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_history', json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.day), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- PRICE ALERTS (key: entity_type, entity_id, condition, direction)
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_price_alerts_insert AFTER INSERT ON price_alerts
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_alerts', json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.direction), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_price_alerts_update AFTER UPDATE ON price_alerts
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'price_alerts', json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.direction), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.direction) IS NOT json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.direction)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_alerts', json_array(NEW.entity_type, NEW.entity_id, NEW.condition, NEW.direction), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_price_alerts_delete AFTER DELETE ON price_alerts
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('price_alerts', json_array(OLD.entity_type, OLD.entity_id, OLD.condition, OLD.direction), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- LISTING HISTORY (key: uid)
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_listing_history_insert AFTER INSERT ON listing_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('listing_history', json_array(NEW.uid), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_listing_history_update AFTER UPDATE ON listing_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'listing_history', json_array(OLD.uid), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE OLD.uid IS NOT NEW.uid
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('listing_history', json_array(NEW.uid), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_listing_history_delete AFTER DELETE ON listing_history
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('listing_history', json_array(OLD.uid), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- TAGS (key: name)
-- Tag links are keyed by the tag's NAME (tag_id is local), so renaming or
-- deleting a tag also re-keys or tombstones every link that uses it. The
-- links are handled BEFORE DELETE: by the time the FK cascade removes them,
-- the tag row (and with it the name) is already gone.
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_tags_insert AFTER INSERT ON tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('tags', json_array(NEW.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_tags_update AFTER UPDATE ON tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'tags', json_array(OLD.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE OLD.name IS NOT NEW.name
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'item_tags', json_array(entity_type, entity_id, OLD.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    FROM item_tags WHERE tag_id = NEW.id AND OLD.name IS NOT NEW.name
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'item_tags', json_array(entity_type, entity_id, NEW.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1
    FROM item_tags WHERE tag_id = NEW.id AND OLD.name IS NOT NEW.name
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('tags', json_array(NEW.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_tags_before_delete BEFORE DELETE ON tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'item_tags', json_array(entity_type, entity_id, OLD.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    FROM item_tags WHERE tag_id = OLD.id
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_tags_delete AFTER DELETE ON tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('tags', json_array(OLD.name), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;

-- ────────────────────────────────────────────────
-- ITEM TAGS (key: entity_type, entity_id, tag name)
-- ────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS sync_item_tags_insert AFTER INSERT ON item_tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('item_tags', json_array(NEW.entity_type, NEW.entity_id, (SELECT name FROM tags WHERE id = NEW.tag_id)), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

CREATE TRIGGER IF NOT EXISTS sync_item_tags_update AFTER UPDATE ON item_tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    SELECT 'item_tags', json_array(OLD.entity_type, OLD.entity_id, (SELECT name FROM tags WHERE id = OLD.tag_id)), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1
    WHERE OLD.entity_type IS NOT NEW.entity_type OR OLD.entity_id IS NOT NEW.entity_id OR OLD.tag_id IS NOT NEW.tag_id
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('item_tags', json_array(NEW.entity_type, NEW.entity_id, (SELECT name FROM tags WHERE id = NEW.tag_id)), CAST(unixepoch('subsec') * 1000 AS INTEGER), 0, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 0, dirty = 1;
END;

-- Links removed by a tag's FK cascade were already tombstoned before the delete.
CREATE TRIGGER IF NOT EXISTS sync_item_tags_delete AFTER DELETE ON item_tags
WHEN (SELECT value FROM _sync_state WHERE key = 'applying') = '0'
    AND EXISTS (SELECT 1 FROM tags WHERE id = OLD.tag_id)
BEGIN
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
    VALUES ('item_tags', json_array(OLD.entity_type, OLD.entity_id, (SELECT name FROM tags WHERE id = OLD.tag_id)), CAST(unixepoch('subsec') * 1000 AS INTEGER), 1, 1)
    ON CONFLICT (tbl, key) DO UPDATE SET ts = MAX(excluded.ts, _sync_meta.ts + 1), deleted = 1, dirty = 1;
END;
