-- Migration 007: add bricklink_id to minifigures for Rebrickable→BrickLink cross-reference
-- Rebrickable-sourced figs use a "fig-XXXXXX" fig_number that doesn't exist in BrickLink.
-- This column caches the BrickLink equivalent ID (e.g. "sw0001") so price lookups can use it.
ALTER TABLE minifigures ADD COLUMN bricklink_id TEXT;
