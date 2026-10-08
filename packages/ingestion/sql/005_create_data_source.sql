CREATE TABLE IF NOT EXISTS data_source (
  source_id VARCHAR(128) PRIMARY KEY,
  source_kind VARCHAR(64) NOT NULL,
  label VARCHAR(256) NOT NULL,
  source_url TEXT
);
