-- Migration 014: BrickLink ids become the minifigures' keys.
--
-- A minifigure's fig_number is its BrickLink id whenever that's known; the
-- Rebrickable number (fig-…) moves to rebrickable_id, still used for the
-- catalog's pictures and set lists. The move itself (prices, alerts, and tags
-- follow the figure) runs in code right after the migrations, as it does
-- whenever a figure's BrickLink id is found later.
ALTER TABLE minifigures ADD COLUMN rebrickable_id TEXT;

UPDATE minifigures SET rebrickable_id = fig_number WHERE fig_number LIKE 'fig-%';

CREATE INDEX IF NOT EXISTS idx_minifigures_rebrickable ON minifigures(rebrickable_id);
CREATE INDEX IF NOT EXISTS idx_minifigures_bricklink ON minifigures(bricklink_id);
