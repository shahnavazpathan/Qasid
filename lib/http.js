const axios = require("axios");

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Many registrar/exchange sites serve a different (or blocked) response to non-browser clients
function browserHeaders(extra = {}) {
  return {
    "user-agent": BROWSER_UA,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    ...extra
  };
}

// Collapse set-cookie headers into a single cookie request header
function cookieString(response) {
  const setCookie = response.headers["set-cookie"];
  return setCookie ? setCookie.map(c => c.split(";")[0]).join("; ") : "";
}

function mergeCookies(...cookieStrings) {
  const jar = new Map();
  for (const str of cookieStrings) {
    if (!str) continue;
    for (const part of str.split(/;\s*/)) {
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Run fn over items with at most `limit` in flight, preserving result order
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function decodeHtml(str) {
  return String(str)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Minimal per-session cookie jar for form-based registrar sites
class CookieJar {
  constructor() { this.value = ""; }
  absorb(response) { this.value = mergeCookies(this.value, cookieString(response)); return response; }
  toString() { return this.value; }
}

const form = obj => new URLSearchParams(obj).toString();

module.exports = { axios, BROWSER_UA, browserHeaders, cookieString, mergeCookies, sleep, mapWithConcurrency, decodeHtml, CookieJar, form };
