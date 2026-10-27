CREATE TABLE IF NOT EXISTS recipe_source_kind (
  recipe_version_id VARCHAR(256) NOT NULL,
  source_kind VARCHAR(32) NOT NULL,
  PRIMARY KEY (recipe_version_id, source_kind)
);
