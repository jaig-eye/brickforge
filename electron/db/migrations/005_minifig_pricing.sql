-- Migration 005: minifig condition + acquired_price; set condition rename

-- Add condition and acquisition price to minifigures
ALTER TABLE minifigures ADD COLUMN condition TEXT NOT NULL DEFAULT 'used';
ALTER TABLE minifigures ADD COLUMN acquired_price REAL;

-- Migrate set conditions to the new 3-value model:
--   Old 'new' (New/Sealed) + 'sealed' (Sealed coll.) → 'sealed'
--   Old 'used' (Open/Used) → 'open_complete' (assume complete)
UPDATE sets SET condition = 'sealed'        WHERE condition IN ('new', 'sealed');
UPDATE sets SET condition = 'open_complete' WHERE condition = 'used';
