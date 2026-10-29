CREATE TABLE IF NOT EXISTS gathering_evidence (dataset_id VARCHAR(128) NOT NULL, record_id VARCHAR(128) NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY (dataset_id, record_id));
