-- README 16.4 price model. What a number IS (price_kind) is stored, never guessed:
-- a listing is never a sale. Every observation belongs to one market (region/server/faction).
-- Rebuild because SQLite cannot change a CHECK constraint in place. Existing rows are kept:
-- step 3 stored role-based types, mapped honestly (a typed "buy price" is of unknown kind).
-- market_id becomes NOT NULL: a row without a market makes this migration fail instead of
-- being dropped.

CREATE TABLE market_prices_v4 (
  id                INTEGER PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  market_id         INTEGER NOT NULL REFERENCES markets (id) ON DELETE RESTRICT,
  price_kind        TEXT    NOT NULL CHECK (price_kind IN
                      ('lowest_listing', 'typical_listing', 'median_listing', 'sale_price', 'estimate', 'unknown')),
  unit_price        INTEGER NOT NULL CHECK (unit_price >= 0),
  currency          TEXT,
  quantity_observed INTEGER CHECK (quantity_observed >= 0),
  source_id         INTEGER NOT NULL REFERENCES data_sources (id) ON DELETE RESTRICT,
  -- provider record id or URL, when the source gives one
  source_ref        TEXT,
  -- manual override: wins over provider data for this item/kind (README 16.5)
  is_override       INTEGER NOT NULL DEFAULT 0 CHECK (is_override IN (0, 1)),
  observed_at       TEXT    NOT NULL,
  retrieved_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  comment           TEXT,
  -- small diagnostic snapshot of the provider record, where permitted
  raw_snapshot      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO market_prices_v4 (id, item_id, market_id, price_kind, unit_price, quantity_observed, source_id,
                              observed_at, retrieved_at, comment, created_at)
SELECT id, item_id, market_id,
       CASE price_type WHEN 'sell_estimated' THEN 'estimate' ELSE 'unknown' END,
       unit_price, quantity_observed, source_id, observed_at, created_at, comment, created_at
FROM market_prices;

DROP TABLE market_prices;
ALTER TABLE market_prices_v4 RENAME TO market_prices;

CREATE INDEX ix_market_prices_lookup ON market_prices (market_id, item_id, price_kind, observed_at DESC);
-- The same observation imported twice is stored once (deterministic duplicates, README 16.7).
CREATE UNIQUE INDEX ux_market_prices_observation
  ON market_prices (item_id, market_id, price_kind, source_id, observed_at, unit_price);
