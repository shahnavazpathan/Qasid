const express = require("express");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");
const dotenv = require("dotenv").config();
const crypto = require('crypto');

const app = express();
const PORT = 3000;

/* =========================================================
   REGISTRARS URLs
========================================================= */

const KFIN_BASE_URL = "https://ipostatus.kfintech.com";
const KFIN_API_URL =
  "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";

const MUFG_BASE_URL =
  "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx";

const MUFG_LIST_URL = `${MUFG_BASE_URL}/GetDetails`;
const MUFG_TOKEN_URL = `${MUFG_BASE_URL}/generateToken`;
const MUFG_SEARCH_URL = `${MUFG_BASE_URL}/SearchOnPan`;

const BIGSHARE_SERVERS = [
  "https://ipo.bigshareonline.com",
  "https://ipo1.bigshareonline.com",
  "https://ipo2.bigshareonline.com"
];

/* =========================================================
   EXPRESS
========================================================= */


app.use(express.json());

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const pushTokens = new Set(); // Stores device tokens


// 1. HMAC Signature Middleware
app.use((req, res, next) => {
  // Let the frontend website load without a key
  if (req.path === '/' || req.path.startsWith('/public')) return next();
  
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !timestamp) {
    return res.status(403).json({ error: "Missing signature" });
  }

  // Prevent Replay Attacks: Reject requests older than 2 minutes
  const now = Date.now();
  if (now - parseInt(timestamp) > 120000) {
    return res.status(403).json({ error: "Request expired" });
  }

  // Re-create the signature on the server to see if it matches the app's signature
  const bodyString = Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const payload = timestamp + req.path + bodyString;
  
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_API_KEY)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  next();
});

// 2. Endpoint to save device tokens
app.post("/api/register-token", (req, res) => {
  const { token } = req.body;
  if (token) {
    pushTokens.add(token);
    console.log(`[PUSH] Token registered. Total devices: ${pushTokens.size}`);
  }
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   IPO LIST CACHE
========================================================= */

let ipoCache = {
  data: null,
  fetchedAt: 0
};

const IPO_CACHE_TIME = 5 * 60 * 1000;

/*
   Prevent two IPO-list fetches from happening simultaneously.
*/
let ipoFetchInProgress = null;

/* =========================================================
   SUCCESSFUL ALLOTMENT RESULT CACHE
========================================================= */

/*
   Key:
   source:clientId:PAN

   Example:
   kfin:12345:ABCDE1234F
   mufg:98765:ABCDE1234F
   bigshare:45678:ABCDE1234F

   IMPORTANT:
   We ONLY save successful results.
   "You have not applied" is NOT cached.
*/
const allotmentResultCache = new Map();

function getAllotmentCacheKey(ipo, pan) {
  return `${ipo.source}:${String(ipo.clientId)}:${pan}`;
}

/* =========================================================
   SSE CLIENT CONNECTIONS
========================================================= */

const sseClients = new Set();

/*
   Send an SSE event to every connected frontend.
*/
function broadcastEvent(eventType, data) {
  const message =
    `event: ${eventType}\n` +
    `data: ${JSON.stringify(data)}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (error) {
      sseClients.delete(client);
    }
  }
}

/* =========================================================
   SSE FRONTEND NOTIFICATION ENDPOINT
========================================================= */

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  /*
     Send headers immediately.
  */
  res.flushHeaders();

  /*
     Keep this connection alive.
  */
  res.write(`event: connected\n`);
  res.write(
    `data: ${JSON.stringify({
      message: "Connected to IPO notification service"
    })}\n\n`
  );

  sseClients.add(res);

  console.log(
    `[SSE] Frontend connected. Active clients: ${sseClients.size}`
  );

  /*
     Remove client when browser closes connection.
  */
  req.on("close", () => {
    sseClients.delete(res);

    console.log(
      `[SSE] Frontend disconnected. Active clients: ${sseClients.size}`
    );
  });
});

/*
   Heartbeat every 30 seconds.
   This prevents many proxies/hosting platforms from closing
   an idle SSE connection.
*/
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(`: heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      sseClients.delete(client);
    }
  }
}, 30 * 1000);

/* =========================================================
   BIGSHARE OCR & CAPTCHA LOGIC
========================================================= */

let tesseractWorker = null;

async function getOcrWorker() {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng");

    await tesseractWorker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7"
    });
  }

  return tesseractWorker;
}

async function solveCaptchaFromBase64(base64String) {
  try {
    const base64Data = base64String.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    const imgBuffer = Buffer.from(base64Data, "base64");

    const image = await Jimp.read(imgBuffer);

    image.resize(
      image.bitmap.width * 2,
      image.bitmap.height * 2,
      Jimp.RESIZE_BILINEAR
    );

    image.greyscale();

    image.scan(
      0,
      0,
      image.bitmap.width,
      image.bitmap.height,
      function (x, y, idx) {
        const red = this.bitmap.data[idx + 0];
        const green = this.bitmap.data[idx + 1];
        const blue = this.bitmap.data[idx + 2];

        const brightness =
          0.299 * red +
          0.587 * green +
          0.114 * blue;

        const colorVal = brightness < 135 ? 0 : 255;

        this.bitmap.data[idx + 0] = colorVal;
        this.bitmap.data[idx + 1] = colorVal;
        this.bitmap.data[idx + 2] = colorVal;
      }
    );

    const processedBuffer =
      await image.getBufferAsync(Jimp.MIME_PNG);

    const worker = await getOcrWorker();

    const {
      data: { text }
    } = await worker.recognize(processedBuffer);

    return text.replace(/\D/g, "").trim();
  } catch (err) {
    return null;
  }
}

/* =========================================================
   BIGSHARE QUERY
========================================================= */

async function queryBigshareServer(
  baseUrl,
  companyId,
  pan,
  maxRetries = 4
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const captchaRes = await axios.get(
        `${baseUrl}/Captcha.ashx?_=${Date.now()}`,
        {
          headers: {
            "user-agent": "Mozilla/5.0"
          },
          timeout: 10000
        }
      );

      const token =
        captchaRes.data?.token ||
        captchaRes.data?.Token;

      const base64Img =
        captchaRes.data?.image ||
        captchaRes.data?.Image;

      const cookie = captchaRes.headers["set-cookie"]
        ? captchaRes.headers["set-cookie"]
            .map(c => c.split(";")[0])
            .join("; ")
        : "";

      if (!token || !base64Img) continue;

      const solvedDigits =
        await solveCaptchaFromBase64(base64Img);

      if (!solvedDigits || solvedDigits.length !== 6) {
        continue;
      }

      const payload = {
        Applicationno: "",
        Company: String(companyId),
        SelectionType: "PN",
        PanNo: pan,
        txtcsdl: "",
        txtDPID: "",
        txtClId: "",
        ddlType: "0",
        lang: "en",
        CaptchaToken: token,
        CaptchaAnswer: solvedDigits,
        ResultToken: ""
      };

      const searchRes = await axios.post(
        `${baseUrl}/Data.aspx/FetchIpodetails`,
        payload,
        {
          headers: {
            "content-type":
              "application/json; charset=UTF-8",
            cookie,
            origin: baseUrl,
            referer: `${baseUrl}/ipo_status.html`,
            "user-agent": "Mozilla/5.0",
            "x-requested-with": "XMLHttpRequest"
          },
          timeout: 12000
        }
      );

      const result = searchRes.data?.d;

      if (!result) continue;

      if (result.Status === "CAPTCHA") {
        continue;
      }

      const hasRecord =
        result.Name ||
        (result.Records &&
          result.Records.length > 0);

      if (
        hasRecord &&
        result.Status !== "NOTFOUND"
      ) {
        const primaryRecord =
          result.Records &&
          result.Records.length > 0
            ? result.Records[0]
            : result;

        let invName =
          primaryRecord.Name ||
          result.Name ||
          "";

        if (!invName.trim()) {
          invName = "Name Not Provided";
        }

        let allottedStr = String(
          primaryRecord.ALLOTED ||
          result.ALLOTED ||
          "0"
        ).toUpperCase();

        let allottedQty = 0;

        if (!allottedStr.includes("NON")) {
          allottedQty =
            parseInt(
              allottedStr.replace(/\D/g, ""),
              10
            ) || 0;
        }

        return {
          found: true,
          data: {
            pan,
            success: true,
            data: {
              Name: invName,
              Allotted: allottedQty
            }
          }
        };
      }

      if (
        result.Status === "NOTFOUND" ||
        !result.Name
      ) {
        return {
          found: false
        };
      }
    } catch (err) {
      // Retry
    }
  }

  return {
    found: false
  };
}

async function queryBigshareMultiServer(
  companyId,
  pan
) {
  for (const serverUrl of BIGSHARE_SERVERS) {
    const res = await queryBigshareServer(
      serverUrl,
      companyId,
      pan
    );

    if (res.found) {
      return res.data;
    }
  }

  return {
    pan,
    success: false,
    error: "You have not applied for this IPO."
  };
}

/* =========================================================
   FETCH IPO LISTS FROM ALL 3 REGISTRARS
========================================================= */

async function fetchLiveIpoList(forceRefresh = false) {
  const now = Date.now();

  /*
     Normal API request:
     use 5-minute cache.
  */
  if (
    !forceRefresh &&
    ipoCache.data &&
    now - ipoCache.fetchedAt < IPO_CACHE_TIME
  ) {
    return ipoCache.data;
  }

  /*
     Prevent duplicate simultaneous fetches.
  */
  if (ipoFetchInProgress) {
    return ipoFetchInProgress;
  }

  ipoFetchInProgress = (async () => {
    try {
      /* ============================================
         KFIN
      ============================================ */

      let cleanKfinIpos = [];

      try {
        const htmlResponse =
          await axios.get(KFIN_BASE_URL);

        const scriptMatch =
          htmlResponse.data.match(
            /src=["'](\.?\/static\/js\/main\.[a-f0-9]+\.js)["']/i
          );

        if (
          scriptMatch &&
          scriptMatch[1]
        ) {
          let bundlePath =
            scriptMatch[1].startsWith(".")
              ? scriptMatch[1].substring(1)
              : scriptMatch[1];

          const jsResponse =
            await axios.get(
              `${KFIN_BASE_URL}${
                bundlePath.startsWith("/")
                  ? ""
                  : "/"
              }${bundlePath}`
            );

          const jsonMatch =
            jsResponse.data.match(
              /JSON\.parse\(\s*['"](\[\s*\{.*?clientId.*?\}\s*\])['"]\s*\)/s
            );

          if (
            jsonMatch &&
            jsonMatch[1]
          ) {
            cleanKfinIpos =
              JSON.parse(jsonMatch[1])
                .filter(
                  ipo =>
                    ipo &&
                    ipo.clientId &&
                    ipo.name
                )
                .map(
                  ipo => ({
                    name: `[KFin] ${String(
                      ipo.name
                    )}`,
                    clientId:
                      String(
                        ipo.clientId
                      ),
                    source: "kfin"
                  })
                );
          }
        }
      } catch (err) {
        console.log(
          "[KFin] IPO list fetch failed:",
          err.message
        );
      }

      /* ============================================
         MUFG
      ============================================ */

      let cleanMufgIpos = [];

      try {
        const response =
          await axios.post(
            MUFG_LIST_URL,
            {},
            {
              headers: {
                "x-requested-with":
                  "XMLHttpRequest"
              }
            }
          );

        const rawXml =
          response.data?.d || "";

        const regex =
          /<Table>[\s\S]*?<company_id>(\d+)<\/company_id>[\s\S]*?<companyname>(.*?)<\/companyname>[\s\S]*?<\/Table>/gi;

        let match;

        while (
          (match = regex.exec(rawXml)) !== null
        ) {
          cleanMufgIpos.push({
            name: `[MUFG] ${match[2].trim()}`,
            clientId: match[1].trim(),
            source: "mufg"
          });
        }
      } catch (error) {
        console.log(
          "[MUFG] IPO list fetch failed:",
          error.message
        );
      }

      /* ============================================
         BIGSHARE
      ============================================ */

      const combinedBigshare = new Map();

      for (
        const server of BIGSHARE_SERVERS
      ) {
        try {
          const response =
            await axios.get(
              `${server}/ipo_status.html`,
              {
                timeout: 8000
              }
            );

          const selectMatch =
            response.data.match(
              /<select[^>]*id=["']ddlCompany["'][^>]*>([\s\S]*?)<\/select>/i
            );

          if (selectMatch) {
            const regex =
              /<option[^>]*value=["'](\d+)["'][^>]*>([^<]+)<\/option>/gi;

            let match;

            while (
              (match = regex.exec(
                selectMatch[1]
              )) !== null
            ) {
              combinedBigshare.set(
                match[1].trim(),
                {
                  name: `[Bigshare] ${match[2].trim()}`,
                  clientId:
                    match[1].trim(),
                  source:
                    "bigshare"
                }
              );
            }
          }
        } catch (e) {
          console.log(
            `[Bigshare] ${server} fetch failed`
          );
        }
      }

      const cleanBigshareIpos =
        Array.from(
          combinedBigshare.values()
        );

      /* ============================================
         MERGE
      ============================================ */

      const mergedIpos = [
        ...cleanKfinIpos,
        ...cleanMufgIpos,
        ...cleanBigshareIpos
      ];

      mergedIpos.sort(
        (a, b) =>
          (parseInt(b.clientId, 10) || 0) -
          (parseInt(a.clientId, 10) || 0)
      );

      ipoCache = {
        data: mergedIpos,
        fetchedAt: Date.now()
      };

      console.log(
        `[IPO] Refreshed list. Total IPOs: ${mergedIpos.length}`
      );

      return mergedIpos;
    } catch (error) {
      if (ipoCache.data) {
        return ipoCache.data;
      }

      throw error;
    } finally {
      ipoFetchInProgress = null;
    }
  })();

  return ipoFetchInProgress;
}

/* =========================================================
   BACKGROUND IPO MONITOR
========================================================= */

let previousIpoSnapshot = null;

/*
   Remove fields that aren't needed for comparison.
*/
function ipoIdentity(ipo) {
  return `${ipo.source}:${ipo.clientId}`;
}

/*
   Check whether an IPO is new.
*/
function findNewIpos(oldList, newList) {
  if (!oldList) {
    return [];
  }

  const oldIds = new Set(
    oldList.map(ipo => ipoIdentity(ipo))
  );

  return newList.filter(
    ipo => !oldIds.has(ipoIdentity(ipo))
  );
}

/*
   Initial background refresh.
   We DO NOT notify on startup because all IPOs are
   already "known" at that point.
*/
async function initializeIpoMonitor() {
  try {
    const ipos =
      await fetchLiveIpoList(true);

    previousIpoSnapshot = ipos.map(
      ipo => ({ ...ipo })
    );

    console.log(
      `[IPO MONITOR] Initial snapshot saved: ${ipos.length} IPOs`
    );
  } catch (error) {
    console.error(
      "[IPO MONITOR] Initial fetch failed:",
      error.message
    );
  }
}

/*
   Check all 3 registrars every 5 minutes.
*/
async function runIpoMonitor() {
  try {
    console.log(
      `[IPO MONITOR] Checking IPO lists at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    

    const newIpos =
      await fetchLiveIpoList(true);

    if (!previousIpoSnapshot) {
      previousIpoSnapshot =
        newIpos.map(ipo => ({ ...ipo }));

      return;
    }

    const addedIpos =
      findNewIpos(
        previousIpoSnapshot,
        newIpos
      );

   if (addedIpos.length > 0) {
      console.log(`[IPO MONITOR] ${addedIpos.length} new IPO/result entries found`);

      for (const ipo of addedIpos) {
        console.log(`[IPO MONITOR] NEW: ${ipo.name} (${ipo.clientId})`);

        /* Send to Expo Push Servers */
        const messages = [];
        for (const token of pushTokens) {
          messages.push({
            to: token,
            sound: 'default',
            title: 'New IPO Allotment Out! 🎉',
            body: `${ipo.name} allotment is now available.`,
          });
        }

        if (messages.length > 0) {
          axios.post('https://exp.host/--/api/v2/push/send', messages)
            .then(() => console.log(`[PUSH] Sent to ${messages.length} devices.`))
            .catch(err => console.error("[PUSH] Failed to send:", err.message));
        }
      }
    }
    else {
      console.log(
        "[IPO MONITOR] No new IPO entries."
      );
    }

    /*
       Replace snapshot with current list.
    */
    previousIpoSnapshot =
      newIpos.map(ipo => ({ ...ipo }));

  } catch (error) {
    console.error(
      "[IPO MONITOR] Error:",
      error.message
    );
  }
}

/* =========================================================
   START BACKGROUND MONITOR
========================================================= */

const IPO_MONITOR_INTERVAL =
  5 * 60 * 1000;

/*
   Start after server initialization.
*/
async function startIpoMonitor() {
  await initializeIpoMonitor();

  setInterval(
    runIpoMonitor,
    IPO_MONITOR_INTERVAL
  );

  console.log(
    "[IPO MONITOR] Background monitoring started."
  );
  console.log(
    "[IPO MONITOR] Checking every 5 minutes."
  );
}

/* =========================================================
   GET IPO LIST
========================================================= */

app.get("/api/ipos", async (req, res) => {
  try {
    const ipos =
      await fetchLiveIpoList(false);

    res.json({
      success: true,
      total: ipos.length,
      ipos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================================================
   CHECK ALLOTMENT API
========================================================= */

app.post("/api/check", async (req, res) => {
  try {
    const { clientId, pans } =
      req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Please select an IPO."
      });
    }

    if (
      !Array.isArray(pans) ||
      pans.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Please enter at least one PAN."
      });
    }

    if (pans.length > 50) {
      return res.status(400).json({
        success: false,
        error:
          "Maximum 50 PANs at once."
      });
    }

    const ipos =
      await fetchLiveIpoList(false);

    const selectedIpo =
      ipos.find(
        ipo =>
          ipo.clientId ===
          String(clientId)
      );

    if (!selectedIpo) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid IPO selected."
      });
    }

    const results = [];

    for (const pan of pans) {
      const cleanPan =
        String(pan)
          .trim()
          .toUpperCase();

      /* ==========================================
         VALIDATE PAN
      ========================================== */

      if (
        !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
          cleanPan
        )
      ) {
        results.push({
          pan: cleanPan,
          success: false,
          error: "Invalid PAN"
        });

        continue;
      }

      /* ==========================================
         CHECK SUCCESS CACHE FIRST
      ========================================== */

      const cacheKey =
        getAllotmentCacheKey(
          selectedIpo,
          cleanPan
        );

      const cachedResult =
        allotmentResultCache.get(
          cacheKey
        );

      if (cachedResult) {
        console.log(
          `[CACHE HIT] ${selectedIpo.name} - ${cleanPan}`
        );

        results.push({
          ...cachedResult,
          cached: true
        });

        continue;
      }

      console.log(
        `[CACHE MISS] Querying registrar for ${selectedIpo.name} - ${cleanPan}`
      );

      /* ==========================================
         QUERY REGISTRAR
      ========================================== */

      try {
        /* ------------------------------------------
           BIGSHARE
        ------------------------------------------ */

        if (
          selectedIpo.source ===
          "bigshare"
        ) {
          const result =
            await queryBigshareMultiServer(
              selectedIpo.clientId,
              cleanPan
            );

          /*
             ONLY CACHE SUCCESSFUL RESULT.
          */
          if (
            result &&
            result.success === true
          ) {
            allotmentResultCache.set(
              cacheKey,
              result
            );

            console.log(
              `[CACHE SAVE] ${selectedIpo.name} - ${cleanPan}`
            );
          }

          results.push(result);

        /* ------------------------------------------
           MUFG
        ------------------------------------------ */

        } else if (
          selectedIpo.source ===
          "mufg"
        ) {
          const tokenRes =
            await axios.post(
              MUFG_TOKEN_URL,
              {},
              {
                headers: {
                  "x-requested-with":
                    "XMLHttpRequest"
                }
              }
            );

          const token =
            tokenRes.data.d;

          const cookies =
            tokenRes.headers["set-cookie"]
              ? tokenRes.headers[
                  "set-cookie"
                ]
                  .map(
                    c =>
                      c.split(";")[0]
                  )
                  .join("; ")
              : "";

          const payload =
            JSON.stringify({
              clientid:
                String(clientId),
              PAN: cleanPan,
              IFSC: "",
              CHKVAL: "1",
              token
            });

          const searchRes =
            await axios.post(
              MUFG_SEARCH_URL,
              payload,
              {
                headers: {
                  "content-type":
                    "application/json; charset=UTF-8",
                  cookie: cookies
                }
              }
            );

          const rawXml =
            searchRes.data?.d || "";

          if (
            !rawXml.includes(
              "<NewDataSet>"
            ) ||
            !rawXml.includes(
              "<Table>"
            )
          ) {
            results.push({
              pan: cleanPan,
              success: false,
              error:
                "You have not applied for this IPO."
            });

            continue;
          }

          const extract = tag => {
            const match =
              new RegExp(
                `<${tag}>(.*?)</${tag}>`
              ).exec(rawXml);

            return match
              ? match[1]
              : null;
          };

          const mufgResult = {
            pan: cleanPan,
            success: true,
            data: {
              Name:
                extract("NAME1") ||
                "N/A",
              Allotted:
                parseInt(
                  extract("ALLOT") ||
                    "0",
                  10
                )
            }
          };

          /*
             CACHE SUCCESSFUL MUFG RESULT.
          */
          allotmentResultCache.set(
            cacheKey,
            mufgResult
          );

          console.log(
            `[CACHE SAVE] ${selectedIpo.name} - ${cleanPan}`
          );

          results.push(
            mufgResult
          );

        /* ------------------------------------------
           KFINTECH
        ------------------------------------------ */

        } else {
          const response =
            await axios.get(
              KFIN_API_URL,
              {
                headers: {
                  client_id:
                    String(clientId),
                  reqparam:
                    cleanPan
                },
                validateStatus:
                  () => true
              }
            );

          let data =
            response.data;

          if (
            typeof data ===
            "string"
          ) {
            try {
              data =
                JSON.parse(data);
            } catch {}
          }

          /*
             NOT APPLIED
          */
          if (
            response.status ===
              404 ||
            (
              data &&
              data.error ===
                "Record Not Found"
            ) ||
            (
              data &&
              data.error ===
                "Bad Reqeust"
            )
          ) {
            results.push({
              pan: cleanPan,
              success: false,
              error:
                "You have not applied for this IPO."
            });

            continue;
          }

          /*
             OTHER ERROR
          */
          if (
            data &&
            data.error
          ) {
            results.push({
              pan: cleanPan,
              success: false,
              error:
                "IPO Details Unavailable / Invalid."
            });

            continue;
          }

          let kfinName =
            "N/A";

          let kfinAllot =
            0;

          if (
            data &&
            data.data &&
            data.data.length > 0
          ) {
            kfinName =
              data.data[0].Name ||
              data.data[0].name ||
              "N/A";

            kfinAllot =
              data.data.reduce(
                (sum, item) =>
                  sum +
                  parseInt(
                    item.All_Shares ||
                      item.allot ||
                      "0",
                    10
                  ),
                0
              );
          }

          const kfinResult = {
            pan: cleanPan,
            success: true,
            data: {
              Name: kfinName,
              Allotted: kfinAllot
            }
          };

          /*
             CACHE SUCCESSFUL KFIN RESULT.
          */
          allotmentResultCache.set(
            cacheKey,
            kfinResult
          );

          console.log(
            `[CACHE SAVE] ${selectedIpo.name} - ${cleanPan}`
          );

          results.push(
            kfinResult
          );
        }
      } catch (error) {
        results.push({
          pan: cleanPan,
          success: false,
          error:
            "Unable to contact allotment service."
        });
      }
    }

    return res.json({
      success: true,
      total: results.length,
      results
    });

  } catch (error) {
    console.error(
      "[CHECK ERROR]",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Internal server error"
    });
  }
});

/* =========================================================
   CACHE STATUS - OPTIONAL DEBUG ROUTE
========================================================= */

app.get("/api/cache", (req, res) => {
  res.json({
    success: true,
    cachedResults:
      allotmentResultCache.size,
    activeFrontendConnections:
      sseClients.size,
    ipoCount:
      ipoCache.data
        ? ipoCache.data.length
        : 0,
    lastIpoFetch:
      ipoCache.fetchedAt
        ? new Date(
            ipoCache.fetchedAt
          ).toISOString()
        : null
  });
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp:
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  });
});

/* =========================================================
   FRONTEND ROUTE
========================================================= */

app.get("/", (req, res) =>
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  )
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  async () => {
    console.log("");
    console.log(
      "=================================================="
    );
    console.log(
      "  ALL-IN-ONE IPO CHECKER"
    );
    console.log(
      "  KFin / MUFG / Bigshare"
    );
    console.log(
      "=================================================="
    );
    console.log(
      `  Open: http://localhost:${PORT}`
    );

    /*
       Start OCR.
    */
    await getOcrWorker();

    console.log(
      "  OCR Engine is ready!"
    );

    /*
       Start background IPO monitoring.
    */
    await startIpoMonitor();

    console.log("");
  }
);