CREATE TABLE IF NOT EXISTS recipe_metadata (
  recipe_version_id VARCHAR(256) PRIMARY KEY,
  spell_id INTEGER NOT NULL,
  learn_skill INTEGER,
  acquisition VARCHAR(32) NOT NULL,
  faction VARCHAR(32) NOT NULL,
  specialization_spell_id INTEGER,
  cooldown_seconds INTEGER,
  availability VARCHAR(32) NOT NULL
);
