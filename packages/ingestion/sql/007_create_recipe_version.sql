CREATE TABLE IF NOT EXISTS recipe_version (
  recipe_version_id VARCHAR(256) PRIMARY KEY,
  recipe_id VARCHAR(128) NOT NULL,
  build_id VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  UNIQUE (recipe_id, build_id)
);
