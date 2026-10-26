-- Migration 011: crops from split group photos are marked permanently.
-- The queue survives restarts, so "this job is a crop of a multi-fig photo"
-- must persist — crop jobs are never rerouted to set identification.
ALTER TABLE scan_jobs ADD COLUMN is_crop INTEGER NOT NULL DEFAULT 0;
