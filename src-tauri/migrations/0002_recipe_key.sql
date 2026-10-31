-- Stable, user-chosen recipe identifier so a CSV re-import updates the same
-- recipe instead of creating a duplicate.
ALTER TABLE recipes ADD COLUMN recipe_key TEXT;
CREATE UNIQUE INDEX ux_recipes_key ON recipes (recipe_key) WHERE recipe_key IS NOT NULL;
