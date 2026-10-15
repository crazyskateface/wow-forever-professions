CREATE TABLE IF NOT EXISTS item_client_data (
  item_id VARCHAR(128) NOT NULL,
  recipe_build_id VARCHAR(128) NOT NULL,
  display_name VARCHAR(256) NOT NULL,
  item_class_id INTEGER NOT NULL,
  item_subclass_id INTEGER NOT NULL,
  inventory_type VARCHAR(64) NOT NULL,
  equipment_slot VARCHAR(64),
  armor INTEGER,
  required_level INTEGER NOT NULL,
  sell_price_copper INTEGER NOT NULL,
  source_product VARCHAR(64) NOT NULL,
  source_build_id VARCHAR(128) NOT NULL,
  source_locale VARCHAR(16) NOT NULL,
  PRIMARY KEY (item_id, recipe_build_id)
);
