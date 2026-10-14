CREATE INDEX ASYNC IF NOT EXISTS idx_recipe_change_lookup ON recipe_change (comparison_id, profession_id, change_type);
