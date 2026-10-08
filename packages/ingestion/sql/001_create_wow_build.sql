CREATE TABLE IF NOT EXISTS wow_build (
  build_id VARCHAR(128) PRIMARY KEY,
  version VARCHAR(64) NOT NULL,
  released_at TIMESTAMP,
  imported_at TIMESTAMP NOT NULL,
  raw_object_key TEXT NOT NULL UNIQUE,
  raw_sha256 VARCHAR(64) NOT NULL UNIQUE
);
