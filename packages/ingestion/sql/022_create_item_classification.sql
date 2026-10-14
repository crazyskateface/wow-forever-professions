CREATE TABLE IF NOT EXISTS item_classification (
  item_id VARCHAR(128) NOT NULL,
  recipe_build_id VARCHAR(128) NOT NULL,
  classification_id INTEGER NOT NULL,
  classification_label VARCHAR(128) NOT NULL,
  color INTEGER NOT NULL,
  source_product VARCHAR(64) NOT NULL,
  source_build_id VARCHAR(128) NOT NULL,
  source_locale VARCHAR(16) NOT NULL,
  PRIMARY KEY (item_id, recipe_build_id)
);
