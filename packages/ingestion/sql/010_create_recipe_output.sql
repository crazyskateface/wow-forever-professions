CREATE TABLE IF NOT EXISTS recipe_output (
  recipe_version_id VARCHAR(256) NOT NULL,
  item_id VARCHAR(128) NOT NULL,
  minimum_quantity INTEGER NOT NULL,
  maximum_quantity INTEGER NOT NULL,
  PRIMARY KEY (recipe_version_id, item_id),
  CHECK (minimum_quantity > 0),
  CHECK (minimum_quantity <= maximum_quantity)
);
