CREATE TABLE IF NOT EXISTS item_quality (
  item_id VARCHAR(128) NOT NULL,
  recipe_build_id VARCHAR(128) NOT NULL,
  quality_id INTEGER NOT NULL,
  PRIMARY KEY (item_id, recipe_build_id)
);
