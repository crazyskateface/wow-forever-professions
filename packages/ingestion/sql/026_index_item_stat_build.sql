CREATE INDEX ASYNC IF NOT EXISTS idx_item_stat_build ON item_stat (recipe_build_id, item_id, stat_index);
