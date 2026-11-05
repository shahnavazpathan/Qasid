// Posts to the Qasid Telegram channel through the Bot API. Off unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
const axios = require("axios");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("../config");

const enabled = () => Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

// Telegram's HTML mode needs these escaped in any text we didn't write ourselves
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function post(html) {
  if (!enabled()) return false;
  const res = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true
  }, { timeout: 15000, validateStatus: () => true });
  // The error never includes the request URL, which contains the bot token
  if (!res.data?.ok) throw new Error(res.data?.description || `HTTP ${res.status}`);
  return true;
}

module.exports = { enabled, esc, post };
