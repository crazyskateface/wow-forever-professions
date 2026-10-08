CREATE INDEX ASYNC IF NOT EXISTS idx_auction_price_current_market ON auction_price_current (market_id, game_item_id);
