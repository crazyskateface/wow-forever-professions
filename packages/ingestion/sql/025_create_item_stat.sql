CREATE TABLE IF NOT EXISTS item_stat (
  item_id VARCHAR(128) NOT NULL,
  recipe_build_id VARCHAR(128) NOT NULL,
  stat_index INTEGER NOT NULL,
  stat_id INTEGER NOT NULL,
  stat_value INTEGER NOT NULL,
  display_text VARCHAR(512) NOT NULL,
  display_tone VARCHAR(16) NOT NULL,
  source_product VARCHAR(64) NOT NULL,
  source_build_id VARCHAR(128) NOT NULL,
  source_locale VARCHAR(16) NOT NULL,
  PRIMARY KEY (item_id, recipe_build_id, stat_index)
);
