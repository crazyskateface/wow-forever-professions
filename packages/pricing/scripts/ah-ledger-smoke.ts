import { AhLedgerAuctionPriceProvider } from "../src/index.js";

const provider = new AhLedgerAuctionPriceProvider({
  ...(process.env.AH_LEDGER_API_KEY === undefined
    ? {}
    : { apiKey: process.env.AH_LEDGER_API_KEY }),
});
const marketId = process.env.AH_LEDGER_MARKET ?? "forever.pvp.horde.us";
const gameItemIds = (process.env.AH_LEDGER_ITEM_IDS ?? "2589,2592")
  .split(",")
  .map((value) => Number(value.trim()));

const markets = await provider.listMarkets();
if (!markets.some(({ id }) => id === marketId)) {
  throw new Error(`AH Ledger did not return requested market ${marketId}.`);
}

const observations = await provider.getCurrentPrices({ marketId, gameItemIds });
console.log(JSON.stringify({ marketId, observations }, null, 2));
