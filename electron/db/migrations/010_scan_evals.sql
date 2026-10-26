-- Migration 010: identification accuracy ground truth.
-- Every scan the user confirms or corrects becomes a labeled eval row, so the
-- app can MEASURE its identify accuracy instead of guessing (competitors
-- market accuracy numbers; ours comes from real usage).
CREATE TABLE IF NOT EXISTS scan_evals (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    -- one sample per scan job: later picks replace, never double-count
    job_id               INTEGER UNIQUE,
    scan_type            TEXT    NOT NULL,             -- 'minifig' | 'set'
    source               TEXT,                          -- 'brickognize' | model id
    predicted            TEXT,                          -- top predicted number
    predicted_confidence REAL,
    chosen               TEXT    NOT NULL,              -- what the user actually added
    outcome              TEXT    NOT NULL,              -- 'confirmed' | 'corrected'
    created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scan_evals_source ON scan_evals(source, outcome);
