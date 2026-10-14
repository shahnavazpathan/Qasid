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

### Home
* Live market snapshot: open now, closing today, upcoming, allotment today, listing today.
* Today's events strip, **one-tap allotment check** for the latest published allotments, open IPOs, upcoming calendar, **Top GMP** ranking and **recent listing gains**.

### IPO dashboard
* **Open / Upcoming / Closed / Listed / Watchlist / DRHP filed** tabs, Mainboard and SME filters, search, and sorting by GMP %, subscription, issue size or listing gain.
* Colourful cards with company logos, price band, lot, minimum investment, **GMP with estimated listing price and profit per lot**, colour-coded subscription and countdowns ("Closes tomorrow").
* IPO detail with shareable links (`#/ipo/SYMBOL`) and tabs:
  * **Overview:** key facts, applications count, timeline stepper, fresh issue vs OFS split, registrar and lead managers.
  * **Allotment:** check saved PANs right inside the IPO once allotment is out.
  * **GMP:** current GMP, expected gain, estimated listing price and profit, **GMP trend chart**.
  * **Subscription:** live category bars (QIB, NII, bNII, sNII, Retail, Employee), **day-wise subscription**.
  * **Calculator:** retail/sHNI/bHNI lot table and a lot calculator with estimated profit.
  * **Documents:** RHP, anchor allocation, basis of issue price, plus links to broker apps to apply.
* Data refreshes every minute; the IPO detail refreshes subscription every 90 seconds.

### Alerts & PANs
* **Watchlist (★)** with browser notifications when a watched IPO opens, closes or lists.
* **Auto-check:** when a watched IPO's allotment is published, every selected PAN is checked automatically and you're notified of the result.
* Saved PANs with nicknames, coloured avatars, masking, export, and **per-PAN allotment history** (allotments won, shares received).
* Results with confetti for allotted PANs, WhatsApp share, copy and CSV export; recent checks list.
* Light and dark themes, mobile bottom navigation.

## 🛠️ Tech stack
* **Backend:** Node.js, Express, Axios
* **Frontend:** React 19 + Vite + Tailwind CSS 4 (`client/`), served from `client/dist` when built

```
server.js               Express app, auth, caching, push monitor, routes
lib/http.js             Shared HTTP helpers (browser headers, cookie jar, concurrency)
lib/html.js             Generic HTML result-table parser
lib/market.js           IPO calendar / subscription / GMP / SEBI filings aggregation
lib/history.js          Daily GMP + subscription snapshots (data/history.json) for trends
lib/registrars/*.js     One module per registrar: listIpos() + checkPan()
client/src/modules/     home, market, allotment, pans, alerts (controller + views each)
```

### Data sources
| Data | Source | Backup |
|---|---|---|
| Allotment | Each registrar's public allotment page | — |
| IPO calendar, GMP, SME subscription, allotment & listing dates | Investorgain | Chittorgarh |
| Logos, applications count, fresh/OFS split | Chittorgarh | — |
| Symbols, price band, lot, RHP, live mainboard subscription | NSE India | Chittorgarh / Investorgain |
| DRHP / RHP filings | SEBI | — |
| GMP trend, day-wise subscription | Recorded by Qasid from the above | — |

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

Extra allowed browser origins can be added with `EXTRA_ORIGINS` (comma-separated). Requests from non-whitelisted origins must be signed with `x-timestamp` and `x-signature` (HMAC-SHA256 of `timestamp + path + body` using `SECRET_API_KEY`).

## 🚀 Getting started
```bash
git clone https://github.com/shahnavazpathan/Qasid.git
cd Qasid
npm install
npm --prefix client install
npm --prefix client run build
echo "SECRET_API_KEY=your-secret" > .env
npm start
```
Open http://localhost:3000. For frontend development run `npm --prefix client run dev` (Vite on :5173, proxying `/api` to :3000).

> Data is fetched live from public registrar, exchange and SEBI pages and may change without notice. GMP is unofficial and indicative only. Not investment advice.
