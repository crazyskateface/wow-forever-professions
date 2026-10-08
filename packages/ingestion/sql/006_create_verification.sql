CREATE TABLE IF NOT EXISTS verification (
  verification_id VARCHAR(256) PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  verified_at TIMESTAMP,
  verified_by VARCHAR(256),
  notes TEXT
);
