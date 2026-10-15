// IPO market data (calendar, subscription, GMP, filings)
const market = require("../lib/market");

async function board(req, res) {
  try {
    const data = await market.getBoard(req.query.refresh === "1");
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("[MARKET] Error:", error.message);
    res.status(502).json({ success: false, error: "IPO data sources are unavailable right now." });
  }
}

// :id is the board's IPO id (NSE symbol, or a normalised name when NSE has no symbol for it)
async function ipoDetail(req, res) {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9&-]{1,80}$/.test(id)) return res.status(400).json({ success: false, error: "Invalid IPO id." });
  try {
    const detail = await market.getIpoDetail(id);
    res.json({ success: true, detail });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ success: false, error: "IPO not found." });
    console.error(`[MARKET] Detail ${id}:`, error.message);
    res.status(502).json({ success: false, error: "Details unavailable right now." });
  }
}

async function gmpHistory(req, res) {
  const gmpPath = String(req.query.path || "");
  if (!/^\/gmp\/[a-z0-9-]+\/\d+\/$/.test(gmpPath)) return res.status(400).json({ success: false, error: "Invalid path." });
  try {
    res.json({ success: true, history: await market.getGmpHistory(gmpPath) });
  } catch (error) {
    console.error("[MARKET] GMP history:", error.message);
    res.status(502).json({ success: false, error: "GMP history unavailable right now." });
  }
}

async function drhpFilings(req, res) {
  try {
    res.json({ success: true, filings: await market.getDrhpFilings() });
  } catch (error) {
    console.error("[MARKET] DRHP:", error.message);
    res.status(502).json({ success: false, error: "SEBI filings unavailable right now." });
  }
}

module.exports = { board, ipoDetail, gmpHistory, drhpFilings };
