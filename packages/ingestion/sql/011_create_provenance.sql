CREATE TABLE IF NOT EXISTS provenance (
  provenance_id VARCHAR(256) PRIMARY KEY,
  recipe_version_id VARCHAR(256) NOT NULL UNIQUE,
  source_id VARCHAR(128) NOT NULL,
  verification_id VARCHAR(256) NOT NULL,
  notes TEXT
);
