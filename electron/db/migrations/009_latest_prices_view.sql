-- Migration 009: one shared definition of "latest price per entity+condition".
-- Five queries previously each embedded their own ROW_NUMBER CTE for this;
-- drifting copies meant alerts could fire on a different "current price" than
-- the UI displays.
CREATE VIEW IF NOT EXISTS latest_prices AS
SELECT entity_type, entity_id, condition, source, avg_price, min_price, max_price,
       sample_count, currency, recorded_at
FROM (
  SELECT ph.*,
         ROW_NUMBER() OVER (
           PARTITION BY entity_type, entity_id, condition
           ORDER BY recorded_at DESC
         ) AS rn
  FROM price_history ph
)
WHERE rn = 1;
