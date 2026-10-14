CREATE TABLE IF NOT EXISTS recipe_change (
  change_id VARCHAR(80) PRIMARY KEY,
  comparison_id VARCHAR(80) NOT NULL,
  profession_id VARCHAR(128) NOT NULL,
  spell_id INTEGER NOT NULL,
  profession_name VARCHAR(256) NOT NULL,
  recipe_name VARCHAR(256) NOT NULL,
  change_type VARCHAR(16) NOT NULL,
  changed_fields TEXT NOT NULL,
  base_snapshot TEXT,
  target_snapshot TEXT,
  UNIQUE (comparison_id, profession_id, spell_id)
);
