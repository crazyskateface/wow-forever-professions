CREATE TABLE IF NOT EXISTS recipe_comparison (
  comparison_id VARCHAR(80) PRIMARY KEY,
  base_build_id VARCHAR(128) NOT NULL,
  target_build_id VARCHAR(128) NOT NULL,
  comparison_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE (base_build_id, target_build_id, comparison_type)
);
