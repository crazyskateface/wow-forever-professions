CREATE TABLE IF NOT EXISTS recipe_acquisition_detail (
  recipe_version_id VARCHAR(256) PRIMARY KEY,
  teaching_item_id INTEGER,
  source_data_origin VARCHAR(32)
);
