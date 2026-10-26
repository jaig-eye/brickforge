CREATE TABLE IF NOT EXISTS feature_flags (
    key         TEXT    PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 0,
    tier        TEXT    NOT NULL DEFAULT 'free',
    description TEXT,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO feature_flags (key, enabled, tier, description) VALUES
    ('ai_builder',       0, 'premium', 'AI Builder — text/image/OBJ to LEGO model (paid tier)'),
    ('picture_lookup',   1, 'alpha',   'Photo → set/minifig identification via AI'),
    ('piece_identifier', 1, 'alpha',   'Photo → individual LEGO piece identification'),
    ('value_tracking',   1, 'alpha',   'BrickLink price history charts and portfolio value'),
    ('rebrickable_sync', 1, 'free',    'Rebrickable API collection import and sync'),
    ('camera_capture',   0, 'alpha',   'In-app webcam capture for picture lookup');
