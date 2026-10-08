CREATE TABLE IF NOT EXISTS recipe_threshold (
  recipe_version_id VARCHAR(256) PRIMARY KEY,
  orange INTEGER NOT NULL,
  yellow INTEGER NOT NULL,
  green INTEGER NOT NULL,
  gray INTEGER NOT NULL,
  CHECK (orange >= 0),
  CHECK (orange <= yellow),
  CHECK (yellow <= green),
  CHECK (green <= gray)
);
