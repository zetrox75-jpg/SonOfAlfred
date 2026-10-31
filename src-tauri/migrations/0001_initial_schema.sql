-- AION 2 Craft Profit Manager - initial schema.
-- Money is stored as INTEGER in the smallest in-game currency unit.
-- Timestamps are ISO 8601 UTC text. A NULL value means "unknown", never zero.
-- Recipes and items are archived (archived_at), not deleted.

CREATE TABLE data_sources (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL UNIQUE,
  url            TEXT,
  source_type    TEXT    NOT NULL CHECK (source_type IN ('official', 'community', 'user', 'import', 'demo')),
  terms_or_notes TEXT,
  is_authorized  INTEGER NOT NULL DEFAULT 0 CHECK (is_authorized IN (0, 1)),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  parent_id INTEGER REFERENCES categories (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_categories_name_parent ON categories (name, COALESCE(parent_id, 0));

CREATE TABLE professions (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE items (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  normalized_name     TEXT    NOT NULL,
  category_id         INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  description         TEXT,
  icon_path           TEXT,
  game_region         TEXT    NOT NULL CHECK (game_region IN ('GLOBAL', 'KR', 'TW', 'OTHER')),
  game_version        TEXT,
  verification_status TEXT    NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('verified', 'unverified', 'community', 'user_provided')),
  source_id           INTEGER REFERENCES data_sources (id) ON DELETE RESTRICT,
  last_verified_at    TEXT,
  archived_at         TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (normalized_name, game_region)
);
CREATE INDEX ix_items_category ON items (category_id);

CREATE TABLE recipes (
  id                  INTEGER PRIMARY KEY,
  output_item_id      INTEGER NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  profession_id       INTEGER REFERENCES professions (id) ON DELETE RESTRICT,
  required_level      INTEGER CHECK (required_level >= 0),
  output_quantity     INTEGER NOT NULL CHECK (output_quantity > 0),
  craft_fee           INTEGER CHECK (craft_fee >= 0),
  notes               TEXT,
  game_region         TEXT    NOT NULL CHECK (game_region IN ('GLOBAL', 'KR', 'TW', 'OTHER')),
  game_version        TEXT,
  verification_status TEXT    NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('verified', 'unverified', 'community', 'user_provided')),
  source_id           INTEGER REFERENCES data_sources (id) ON DELETE RESTRICT,
  last_verified_at    TEXT,
  archived_at         TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ix_recipes_output ON recipes (output_item_id);
CREATE INDEX ix_recipes_profession ON recipes (profession_id);

-- Ingredients are part of their recipe, so they go with it.
CREATE TABLE recipe_ingredients (
  id                 INTEGER PRIMARY KEY,
  recipe_id          INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  ingredient_item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (recipe_id, ingredient_item_id)
);
CREATE INDEX ix_recipe_ingredients_item ON recipe_ingredients (ingredient_item_id);

CREATE TABLE markets (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  region      TEXT,
  server      TEXT,
  description TEXT
);

-- Observations are append-only: history is never overwritten.
CREATE TABLE market_prices (
  id                INTEGER PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES items (id) ON DELETE RESTRICT,
  market_id         INTEGER REFERENCES markets (id) ON DELETE RESTRICT,
  price_type        TEXT    NOT NULL CHECK (price_type IN ('buy', 'sell_observed', 'sell_estimated')),
  unit_price        INTEGER NOT NULL CHECK (unit_price >= 0),
  quantity_observed INTEGER CHECK (quantity_observed >= 0),
  source_id         INTEGER REFERENCES data_sources (id) ON DELETE RESTRICT,
  observed_at       TEXT    NOT NULL,
  comment           TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ix_market_prices_lookup ON market_prices (item_id, price_type, observed_at DESC);

CREATE TABLE inventory (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL UNIQUE REFERENCES items (id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
