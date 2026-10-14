# Qasid 🚀

**Qasid** is an all-in-one Indian IPO app: bulk allotment checking across **10 registrars** plus a live **IPO dashboard** with upcoming/open/listed IPOs, price bands, dates, live category-wise subscription, GMP, RHP links and fresh DRHP filings — all scraped live, no paid APIs.

## ✨ Features

### Allotment checker
* **10 registrars, one screen:** KFintech, MUFG (Link Intime), Bigshare, Skyline Financial, Purva Sharegistry, Maashitla, Integrated Registry, Satellite Corporate, Accurate Securities and MAS Services.
* **Bulk PAN checking:** up to 50 PANs per check, run in parallel per registrar.
* **Bigshare multi-server failover:** Bigshare's three mirrors (`ipo`, `ipo1`, `ipo2`) are merged so a new allotment published on any one of them shows up, and every lookup fails over to the next server on errors, timeouts or rate limits (`RATELIMIT` / `WARMING` / 429 / 503), with per-server cooldowns.
* **Multiple applications per PAN** are summed (applied + allotted shares).
* **Saved PANs with nicknames** (stored only in the browser), pick which PANs to check, one-off PAN checks, copy results / download CSV.
* **New-allotment push notifications** (Expo) — polled every minute in the evening (IST), every 5 minutes otherwise.

### IPO dashboard
* **Open / Upcoming / Closed / Listed** IPOs, Mainboard and SME, with search.
* Price band, lot size, minimum investment, issue size, face value, registrar, lead managers.
* Full timeline: open, close, allotment, listing.
* **Live subscription** — QIB, NII (bNII/sNII), Retail, Employee, Total.
* **GMP** (grey market premium) and listing gains.
* **Documents:** RHP, anchor allocation report, basis of issue price.
* **DRHP filed** tab: latest draft offer documents filed with SEBI.
* "Allotment out" badge and one-tap jump from an IPO to its allotment check.
* Dark mode, mobile-first layout.

## 🛠️ Tech stack
* **Backend:** Node.js, Express, Axios
* **Frontend:** Vanilla HTML/CSS/JS (`public/`)

```
server.js               Express app, auth, caching, push monitor, routes
lib/http.js             Shared HTTP helpers (browser headers, cookie jar, concurrency)
lib/html.js             Generic HTML result-table parser
lib/market.js           IPO calendar / subscription / GMP / SEBI filings aggregation
lib/registrars/*.js     One module per registrar: listIpos() + checkPan()
```

### Data sources
| Data | Source |
|---|---|
| Allotment | Each registrar's public allotment page |
| IPO calendar, GMP, SME subscription | Investorgain |
| Symbols, price band, lot, RHP, live mainboard subscription | NSE India |
| DRHP / RHP filings | SEBI |

### Adding a registrar
Create `lib/registrars/<name>.js` exporting `{ id, tag, label, website, concurrency, listIpos, checkPan }` and add it to `lib/registrars/index.js`. `checkPan(ipo, pan)` returns `{ status: "found" | "not_applied" | "error", name, applied, allotted, applications }`.

## 🔌 API
| Method | Route | Description |
|---|---|---|
| GET | `/api/ipos` | IPOs with allotment out, all registrars |
| POST | `/api/check` | `{ clientId, source?, pans[] }` → allotment per PAN |
| GET | `/api/registrars` | Registrar health (+ Bigshare server status) |
| GET | `/api/market` | Open / upcoming / closed / listed IPO board (`?refresh=1` to bypass cache) |
| GET | `/api/market/ipo/:symbol?type=SME` | IPO detail + live subscription |
| GET | `/api/market/drhp` | Latest SEBI DRHP filings |
| POST | `/api/register-token` | Register an Expo push token |

Requests from non-whitelisted origins must be signed with `x-timestamp` and `x-signature` (HMAC-SHA256 of `timestamp + path + body` using `SECRET_API_KEY`).

## 🚀 Getting started
```bash
git clone https://github.com/shahnavazpathan/Qasid.git
cd Qasid
npm install
echo "SECRET_API_KEY=your-secret" > .env
npm start
```
Open http://localhost:3000.

> Data is fetched live from public registrar, exchange and SEBI pages and may change without notice. GMP is unofficial and indicative only. Not investment advice.
