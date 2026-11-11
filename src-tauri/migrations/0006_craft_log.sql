-- Craft log: one row each time the user marks a plan as crafted. Cost and estimate are frozen
-- at that moment; the real sale is typed in later. NULL cost or estimate = it was incomplete
-- (missing price, unknown fee, commission not set): never zero.
CREATE TABLE craft_log (
  id                  INTEGER PRIMARY KEY,
  item_id             INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  market_id           INTEGER REFERENCES markets (id) ON DELETE SET NULL,
  total_cost          INTEGER CHECK (total_cost >= 0),
  valuation           TEXT    NOT NULL CHECK (valuation IN ('cash', 'economic')),
  est_unit_price      INTEGER CHECK (est_unit_price >= 0),
  est_profit          INTEGER,
  sold_quantity       INTEGER CHECK (sold_quantity > 0 AND sold_quantity <= quantity),
  sold_unit_price     INTEGER CHECK (sold_unit_price >= 0),
  sold_commission_bps INTEGER CHECK (sold_commission_bps >= 0 AND sold_commission_bps < 10000),
  sold_at             TEXT,
  crafted_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ix_craft_log_crafted_at ON craft_log (crafted_at);
