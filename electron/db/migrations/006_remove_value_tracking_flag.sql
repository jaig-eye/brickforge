-- value_tracking is now always-on functionality, not a feature flag
DELETE FROM feature_flags WHERE key = 'value_tracking';
