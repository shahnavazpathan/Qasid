#!/usr/bin/env node
// Preview today's Telegram channel posts from live IPO data, and optionally send a test post.
//
//   node scripts/test-telegram.js          print the morning and evening digests and a sample allotment post
//   node scripts/test-telegram.js --send   also post a short test message (needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)
require("dotenv").config();
const market = require("../lib/market");
const telegram = require("../lib/telegram");
const { morningDigest, eveningDigest, allotmentMessage } = require("../services/telegram.service");

(async () => {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const board = await market.getBoard();
  console.log("=== Morning digest ===\n" + (morningDigest(board, today) || "(nothing to post today)"));
  console.log("\n=== Evening digest ===\n" + (eveningDigest(board, today) || "(nothing listed today)"));
  console.log("\n=== Allotment post (sample) ===\n" + allotmentMessage({ name: "[KFin] Example Industries Limited", source: "kfin", clientId: "1234", registrar: "KFintech" }));

  if (process.argv.includes("--send")) {
    if (!telegram.enabled()) throw new Error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first.");
    await telegram.post("✅ <b>Qasid bot is connected.</b>\nIPO updates and allotment alerts will appear here.");
    console.log("\nTest message sent.");
  }
  process.exit(0);
})().catch(err => { console.error(err.message); process.exit(1); });
