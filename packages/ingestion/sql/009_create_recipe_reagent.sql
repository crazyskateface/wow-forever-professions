CREATE TABLE IF NOT EXISTS recipe_reagent (
  recipe_version_id VARCHAR(256) NOT NULL,
  item_id VARCHAR(128) NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (recipe_version_id, item_id),
  CHECK (quantity > 0)
);
