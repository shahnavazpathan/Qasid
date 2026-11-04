# RapidAPI listing: Indian IPO Data

Everything needed to publish the `/v1` API on RapidAPI. The code is in `routes/v1.routes.js` and
`controllers/publicApi.controller.js`.

## What is and isn't in the API

| In | Left out, on purpose |
|---|---|
| IPO list, calendar and dates, price band, lot size, minimum investment, issue size | **PAN / allotment checks**: personal data; never offer these |
| Live category-wise subscription and day-wise history | **GMP**: other sites' content |
| Listing price and listing gain | Per-IPO detail pages: each one is a fresh lookup on NSE/BSE |
| SEBI DRHP / RHP filings | |

Every response is served from the same cache as the website (the IPO board refreshes at most every
90 seconds, SEBI filings every 3 hours), so API traffic can never add load on the sources or get the
server blocked.

## Setting it up

1. Create a RapidAPI provider account and choose **Add New API**. Name it **Indian IPO Data**,
   category **Finance**.
2. Under **Definitions**, import `docs/rapidapi/openapi.json`. Base URL:
   `https://qasid.thevellora.co.in/v1`.
3. Under **Gateway**, copy the **X-RapidAPI-Proxy-Secret**.
4. In Render, add the environment variable `RAPIDAPI_PROXY_SECRET` with that value and redeploy.
   Until it is set, the API answers `503 API not enabled`. Afterwards, calls that don't come through
   RapidAPI get `401`.
5. Check it: `https://qasid.thevellora.co.in/v1/health` should show `"enabled": true`. Then use
   RapidAPI's **Test endpoint** button.
6. Add the plans and terms below, then make the API public.

## Suggested plans

| Plan | Price | Requests / month |
|---|---|---|
| Basic | Free | 100 |
| Pro (recommended) | $1.99 | 10,000 |
| Ultra | $7.99 | 100,000 |
| Mega | $24.99 | 500,000 |

Priced below the other Indian IPO APIs on RapidAPI per request (the most used start at $0.99 for
1,000–7,000 requests). Extra requests cost nothing to serve, since every call is answered from the cache.

Hard limits (block when exceeded) are safer than overage charges for a new API. On Render's free plan
the server sleeps after 15 minutes without traffic and takes about a minute to wake, which paying
users will notice: move to a paid Render instance once the API earns more than it costs. The server also caps
each subscriber at 120 requests per minute.

## Short description

> Indian IPO calendar, price band, lot size, live QIB / NII / retail subscription and listing gains for
> Mainboard and SME IPOs, plus SEBI DRHP and RHP filings. Clean JSON, refreshed every 90 seconds.

## Long description

> Everything about Indian IPOs in one simple API:
>
> - **IPOs**: open, upcoming, closed and recently listed issues, with price band, lot size, minimum
>   investment, issue size and every key date.
> - **Live subscription**: category-wise (QIB, NII, bNII, sNII, Retail) with day-wise history.
> - **Calendar**: bidding opens and closes, allotment and listing dates in any date range.
> - **Listing performance**: listing price and listing gain.
> - **SEBI filings**: the latest DRHP and RHP documents with links.
>
> Built for Telegram and Discord bots, trading dashboards, finance apps and research.

## Terms of use (paste into the listing)

> 1. The data is compiled from publicly available exchange, registrar and SEBI pages. It is provided
>    "as is", without any warranty of accuracy, completeness or availability, and may be delayed,
>    wrong or change without notice. Check important figures with the official source.
> 2. Nothing in this API is investment advice or a recommendation. The provider is not registered with
>    SEBI as an investment adviser or research analyst.
> 3. You may use the data in your own apps, sites and bots. You may not resell it or redistribute it in
>    bulk as a dataset, or present it as official exchange data.
> 4. Service may be interrupted when a source changes or is unavailable. There is no uptime guarantee
>    and no refund for downtime beyond what RapidAPI's own policies provide. The server may pause when
>    idle, so the first request after a quiet period can take up to a minute or time out; retry it.
> 5. To the extent the law allows, the provider is not liable for any loss arising from use of the data.
>    Total liability is limited to the fees you paid in the previous month.
> 6. These terms are governed by the laws of India. Courts in Rajkot, Gujarat have jurisdiction.
>    Contact: sk7611065@gmail.com.

## Getting the first users

RapidAPI's search alone sends few users. Post the free plan where developers in Indian markets are:
r/IndianStreetBets, r/developersIndia, and Telegram and Discord trading groups. A small free example,
such as a Telegram bot that posts "IPO opens today", is the best advert.
