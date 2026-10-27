const express = require("express");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");
const dotenv = require("dotenv").config();
const crypto = require('crypto');
const cors = require("cors");
const app = express();
const PORT = 3000;

/* =========================================================
   REGISTRARS URLs
========================================================= */
const KFIN_BASE_URL = "https://ipostatus.kfintech.com";
const KFIN_API_URL = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";

const MUFG_BASE_URL = "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx";
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
app.use(cors());
app.use(express.json());

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const PDFDocument = require('pdfkit');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY)");
  db.run("CREATE TABLE IF NOT EXISTS allotment_cache (cache_key TEXT PRIMARY KEY, result_json TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, created_at INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS user_pans (user_id TEXT, pan TEXT, nickname TEXT, PRIMARY KEY(user_id, pan))");
  db.run("CREATE TABLE IF NOT EXISTS allotment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, pan TEXT, ipo_name TEXT, allotted INTEGER, timestamp INTEGER)");
});

const pushTokens = new Set();
// Load push tokens into memory on startup
db.all("SELECT token FROM push_tokens", [], (err, rows) => {
  if (!err && rows) {
    rows.forEach(row => pushTokens.add(row.token));
  }
});

const ALLOWED_WEB_DOMAINS = [
  "https://qasid.thevellora.co.in",
  "https://ipo.thevellora.co.in",
  "https://qasid-x637.onrender.com",
  "http://localhost:3000",
  "http://localhost:8081"
];

app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/public')) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const isWhitelistedWeb = ALLOWED_WEB_DOMAINS.some(domain => 
    (origin && origin.startsWith(domain)) || 
    (referer && referer.startsWith(domain)) ||
    (req.headers.host && domain.includes(req.headers.host))
  );

  if (isWhitelistedWeb) return next();

  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  if (!signature || !timestamp) return res.status(403).json({ error: "Unauthorized: Missing signature" });

  const now = Date.now();
  if (now - parseInt(timestamp, 10) > 120000) return res.status(403).json({ error: "Request expired" });

  const bodyString = Object.keys(req.body).length ? JSON.stringify(req.body) : "";
  const payload = timestamp + req.path + bodyString;
  
  const expectedSignature = crypto.createHmac('sha256', SECRET_API_KEY).update(payload).digest('hex');
  if (signature !== expectedSignature) return res.status(403).json({ error: "Unauthorized: Invalid signature" });

  next();
});

app.post("/api/register-token", (req, res) => {
  const { token } = req.body;
  if (token && !pushTokens.has(token)) {
    pushTokens.add(token);
    db.run("INSERT OR IGNORE INTO push_tokens (token) VALUES (?)", [token]);
  }
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   IPO LIST CACHE
========================================================= */
let ipoCache = { data: null, fetchedAt: 0 };
const IPO_CACHE_TIME = 5 * 60 * 1000;
let ipoFetchInProgress = null;

function getAllotmentCacheKey(ipo, pan) {
  return `${ipo.source}:${String(ipo.clientId)}:${pan}`;
}

async function getCachedResult(cacheKey) {
  return new Promise((resolve) => {
    db.get("SELECT result_json FROM allotment_cache WHERE cache_key = ?", [cacheKey], (err, row) => {
      if (err || !row) return resolve(null);
      try { resolve(JSON.parse(row.result_json)); } catch { resolve(null); }
    });
  });
}

async function setCachedResult(cacheKey, result) {
  const jsonStr = JSON.stringify(result);
  db.run("INSERT OR REPLACE INTO allotment_cache (cache_key, result_json) VALUES (?, ?)", [cacheKey, jsonStr]);
}

/* =========================================================
   BIGSHARE OCR
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
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");
    const image = await Jimp.read(imgBuffer);
    
    image.resize(image.bitmap.width * 2, image.bitmap.height * 2, Jimp.RESIZE_BILINEAR);
    image.greyscale();
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
      const colorVal = brightness < 135 ? 0 : 255;
      this.bitmap.data[idx + 0] = colorVal;
      this.bitmap.data[idx + 1] = colorVal;
      this.bitmap.data[idx + 2] = colorVal;
    });

    const processedBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(processedBuffer);
    return text.replace(/\D/g, "").trim();
  } catch (err) {
    return null;
  }
}

/* =========================================================
   BIGSHARE QUERY
========================================================= */
async function queryBigshareServer(baseUrl, companyId, pan, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const captchaRes = await axios.get(`${baseUrl}/Captcha.ashx?_=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0" }, timeout: 10000
      });

      const token = captchaRes.data?.token || captchaRes.data?.Token;
      const base64Img = captchaRes.data?.image || captchaRes.data?.Image;
      const cookie = captchaRes.headers["set-cookie"] ? captchaRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ") : "";

      if (!token || !base64Img) continue;
      const solvedDigits = await solveCaptchaFromBase64(base64Img);
      if (!solvedDigits || solvedDigits.length !== 6) continue;

      const payload = {
        Applicationno: "", Company: String(companyId), SelectionType: "PN", PanNo: pan,
        txtcsdl: "", txtDPID: "", txtClId: "", ddlType: "0", lang: "en", CaptchaToken: token,
        CaptchaAnswer: solvedDigits, ResultToken: ""
      };

      const searchRes = await axios.post(`${baseUrl}/Data.aspx/FetchIpodetails`, payload, {
        headers: { "content-type": "application/json; charset=UTF-8", cookie, origin: baseUrl, referer: `${baseUrl}/ipo_status.html`, "user-agent": "Mozilla/5.0", "x-requested-with": "XMLHttpRequest" },
        timeout: 12000
      });

      const result = searchRes.data?.d;
      if (!result) continue;
      if (result.Status === "CAPTCHA") continue;

      const hasRecord = result.Name || (result.Records && result.Records.length > 0);
      if (hasRecord && result.Status !== "NOTFOUND") {
        const primaryRecord = result.Records && result.Records.length > 0 ? result.Records[0] : result;
        let invName = primaryRecord.Name || result.Name || "";
        if (!invName.trim()) invName = "Name Not Provided";
        let allottedStr = String(primaryRecord.ALLOTED || result.ALLOTED || "0").toUpperCase();
        let allottedQty = 0;
        if (!allottedStr.includes("NON")) allottedQty = parseInt(allottedStr.replace(/\D/g, ""), 10) || 0;
        
        return { found: true, data: { pan, success: true, data: { Name: invName, Allotted: allottedQty } } };
      }

      if (result.Status === "NOTFOUND" || !result.Name) return { found: false };
    } catch (err) {}
  }
  return { found: false };
}

async function queryBigshareMultiServer(companyId, pan) {
  for (const serverUrl of BIGSHARE_SERVERS) {
    const res = await queryBigshareServer(serverUrl, companyId, pan);
    if (res.found) return res.data;
  }
  return { pan, success: false, error: "You have not applied for this IPO." };
}

/* =========================================================
   FETCH IPO LISTS
========================================================= */
async function fetchLiveIpoList(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && ipoCache.data && now - ipoCache.fetchedAt < IPO_CACHE_TIME) {
    return ipoCache.data;
  }

  if (ipoFetchInProgress) return ipoFetchInProgress;

  ipoFetchInProgress = (async () => {
    try {
      let cleanKfinIpos = [];
      try {
        const htmlResponse = await axios.get(KFIN_BASE_URL);
        const scriptMatch = htmlResponse.data.match(/src=["'](\.?\/static\/js\/main\.[a-f0-9]+\.js)["']/i);
        if (scriptMatch && scriptMatch[1]) {
          let bundlePath = scriptMatch[1].startsWith(".") ? scriptMatch[1].substring(1) : scriptMatch[1];
          const jsResponse = await axios.get(`${KFIN_BASE_URL}${bundlePath.startsWith("/") ? "" : "/"}${bundlePath}`);
          const jsonMatch = jsResponse.data.match(/JSON\.parse\(\s*['"](\[\s*\{.*?clientId.*?\}\s*\])['"]\s*\)/s);
          if (jsonMatch && jsonMatch[1]) {
            cleanKfinIpos = JSON.parse(jsonMatch[1])
              .filter(ipo => ipo && ipo.clientId && ipo.name)
              .map(ipo => ({ name: `[KFin] ${String(ipo.name)}`, clientId: String(ipo.clientId), source: "kfin" }));
          }
        }
      } catch (err) {}

      let cleanMufgIpos = [];
      try {
        const response = await axios.post(MUFG_LIST_URL, {}, { headers: { "x-requested-with": "XMLHttpRequest" } });
        const rawXml = response.data?.d || "";
        const regex = /<Table>[\s\S]*?<company_id>(\d+)<\/company_id>[\s\S]*?<companyname>(.*?)<\/companyname>[\s\S]*?<\/Table>/gi;
        let match;
        while ((match = regex.exec(rawXml)) !== null) {
          cleanMufgIpos.push({ name: `[MUFG] ${match[2].trim()}`, clientId: match[1].trim(), source: "mufg" });
        }
      } catch (error) {}

      const combinedBigshare = new Map();
      for (const server of BIGSHARE_SERVERS) {
        try {
          const response = await axios.get(`${server}/ipo_status.html`, { timeout: 8000 });
          const selectMatch = response.data.match(/<select[^>]*id=["']ddlCompany["'][^>]*>([\s\S]*?)<\/select>/i);
          if (selectMatch) {
            const regex = /<option[^>]*value=["'](\d+)["'][^>]*>([^<]+)<\/option>/gi;
            let match;
            while ((match = regex.exec(selectMatch[1])) !== null) {
              combinedBigshare.set(match[1].trim(), { name: `[Bigshare] ${match[2].trim()}`, clientId: match[1].trim(), source: "bigshare" });
            }
          }
        } catch (e) {}
      }
      const cleanBigshareIpos = Array.from(combinedBigshare.values());

     // Sort individually within registrar
      cleanKfinIpos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));
      cleanMufgIpos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));
      cleanBigshareIpos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));

      const mergedIpos = [...cleanKfinIpos, ...cleanMufgIpos, ...cleanBigshareIpos];
      const nowTime = Date.now();

      // 1. Assign discovery timestamp for newly seen IPOs
      mergedIpos.forEach(ipo => {
        const key = ipoIdentity(ipo);
        if (!ipoDiscoveryTimes.has(key)) {
          ipoDiscoveryTimes.set(key, nowTime);
        }
      });

      // 2. Sort so newly discovered IPOs float to position #1 across all registrars
      mergedIpos.sort((a, b) => {
        const timeA = ipoDiscoveryTimes.get(ipoIdentity(a)) || 0;
        const timeB = ipoDiscoveryTimes.get(ipoIdentity(b)) || 0;

        if (timeB !== timeA) {
          return timeB - timeA;
        }

        return (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0);
      });

      ipoCache = { data: mergedIpos, fetchedAt: Date.now() };
      return mergedIpos;
    } catch (error) {
      if (ipoCache.data) return ipoCache.data;
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

function ipoIdentity(ipo) { return `${ipo.source}:${ipo.clientId}`; }

function findNewIpos(oldList, newList) {
  if (!oldList) return [];
  const oldIds = new Set(oldList.map(ipo => ipoIdentity(ipo)));
  return newList.filter(ipo => !oldIds.has(ipoIdentity(ipo)));
}

async function initializeIpoMonitor() {
  try {
    const ipos = await fetchLiveIpoList(true);
    previousIpoSnapshot = ipos.map(ipo => ({ ...ipo }));
  } catch (error) {}
}

async function runIpoMonitor() {
  try {
    const newIpos = await fetchLiveIpoList(true);
    if (!previousIpoSnapshot) {
      previousIpoSnapshot = newIpos.map(ipo => ({ ...ipo }));
      return;
    }

    const addedIpos = findNewIpos(previousIpoSnapshot, newIpos);
    if (addedIpos.length > 0) {
      for (const ipo of addedIpos) {
        const messages = [];
        for (const token of pushTokens) {
          messages.push({
            to: token, sound: 'default', title: 'New IPO Allotment Out! 🎉', body: `${ipo.name} allotment is now available.`
          });
        }
        if (messages.length > 0) {
          axios.post('https://exp.host/--/api/v2/push/send', messages)
            .then(() => console.log(`[PUSH] Sent notifications for ${ipo.name} to ${messages.length} devices.`))
            .catch(err => console.error("[PUSH] Failed to send:", err.message));
        }
      }
    }
    previousIpoSnapshot = newIpos.map(ipo => ({ ...ipo }));
  } catch (error) {
    console.error("[IPO MONITOR] Error:", error.message);
  }
}

async function startIpoMonitor() {
  await initializeIpoMonitor();

  function scheduleNextRun() {
    // 1. Get current time in IST
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (330 * 60000)); // IST is UTC+5:30
    const hour = istDate.getHours();

    // 2. Determine interval: 1 min between 7 PM (19) and 4 AM (4), else 5 mins
    const intervalMs = (hour >= 19 || hour < 4) ? (1 * 60 * 1000) : (5 * 60 * 1000);

    // 3. Schedule the monitor
    setTimeout(async () => {
      await runIpoMonitor();
      await runPanMonitor(); // Feature 2: poll saved PANs for allotment results
      scheduleNextRun(); // Re-schedule for the next cycle
    }, intervalMs);
  }

  // Start the scheduling loop
  scheduleNextRun();
}

/* =========================================================
   FEATURE 2: SAVED PAN ALLOTMENT POLLING
========================================================= */
async function runPanMonitor() {
  try {
    const pans = await new Promise((resolve) => {
      db.all("SELECT DISTINCT pan FROM user_pans", [], (err, rows) => resolve(err ? [] : (rows || []).map(r => r.pan)));
    });
    if (pans.length === 0) return;

    const ipos = await fetchLiveIpoList(true);
    const openIpos = ipos.filter(ipo => !['closed', 'listed'].includes(String(ipo.name).toLowerCase()));

    for (const ipo of openIpos) {
      for (const pan of pans) {
        const cacheKey = getAllotmentCacheKey(ipo, pan);
        const cached = await getCachedResult(cacheKey);
        if (cached && cached.success && cached.data && cached.data.Allotted > 0) {
          const messages = [];
          for (const token of pushTokens) {
            messages.push({
              to: token, sound: 'default', title: '🎉 Allotment Out!', body: `${ipo.name}: ${pan} allotted ${cached.data.Allotted} shares.`
            });
          }
          if (messages.length > 0) {
            axios.post('https://exp.host/--/api/v2/push/send', messages)
              .then(() => console.log(`[PUSH] Sent allotment alert for ${pan} on ${ipo.name}`))
              .catch(err => console.error("[PUSH] Failed:", err.message));
          }
        }
      }
    }
  } catch (error) {
    console.error("[PAN MONITOR] Error:", error.message);
  }
}

/* =========================================================
   API ROUTES
========================================================= */
app.get("/api/ipos", async (req, res) => {
  try {
    const ipos = await fetchLiveIpoList(false);
    res.json({ success: true, total: ipos.length, ipos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/check", async (req, res) => {
  try {
    const { clientId, pans } = req.body;
    if (!clientId) return res.status(400).json({ success: false, error: "Please select an IPO." });
    if (!Array.isArray(pans) || pans.length === 0) return res.status(400).json({ success: false, error: "Please enter at least one PAN." });
    if (pans.length > 50) return res.status(400).json({ success: false, error: "Maximum 50 PANs at once." });

    const ipos = await fetchLiveIpoList(false);
    const selectedIpo = ipos.find(ipo => ipo.clientId === String(clientId));
    if (!selectedIpo) return res.status(400).json({ success: false, error: "Invalid IPO selected." });

    const results = [];

    for (const pan of pans) {
      const cleanPan = String(pan).trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
        results.push({ pan: cleanPan, success: false, error: "Invalid PAN" });
        continue;
      }

      const cacheKey = getAllotmentCacheKey(selectedIpo, cleanPan);
      const cachedResult = await getCachedResult(cacheKey);

      if (cachedResult) {
        results.push({ ...cachedResult, cached: true });
        continue;
      }

      try {
        if (selectedIpo.source === "bigshare") {
          const result = await queryBigshareMultiServer(selectedIpo.clientId, cleanPan);
          if (result && result.success === true) await setCachedResult(cacheKey, result);
          if (result && result.success === true && result.data && result.data.Allotted > 0) {
            db.run("INSERT INTO allotment_history (user_id, pan, ipo_name, allotted, timestamp) VALUES (?, ?, ?, ?, ?)",
              [req.body.userId || "anonymous", cleanPan, selectedIpo.name, result.data.Allotted, Date.now()]);
          }
          results.push(result);
        } else if (selectedIpo.source === "mufg") {
          const tokenRes = await axios.post(MUFG_TOKEN_URL, {}, { headers: { "x-requested-with": "XMLHttpRequest" } });
          const token = tokenRes.data.d;
          const cookies = tokenRes.headers["set-cookie"] ? tokenRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ") : "";

          const payload = JSON.stringify({ clientid: String(clientId), PAN: cleanPan, IFSC: "", CHKVAL: "1", token });
          const searchRes = await axios.post(MUFG_SEARCH_URL, payload, { headers: { "content-type": "application/json; charset=UTF-8", cookie: cookies } });
          const rawXml = searchRes.data?.d || "";

          if (!rawXml.includes("<NewDataSet>") || !rawXml.includes("<Table>")) {
            results.push({ pan: cleanPan, success: false, error: "You have not applied for this IPO." });
            continue;
          }
          const extract = tag => { const match = new RegExp(`<${tag}>(.*?)</${tag}>`).exec(rawXml); return match ? match[1] : null; };
          const mufgResult = { pan: cleanPan, success: true, data: { Name: extract("NAME1") || "N/A", Allotted: parseInt(extract("ALLOT") || "0", 10) } };

          await setCachedResult(cacheKey, mufgResult);
          if (mufgResult.success) {
            db.run("INSERT INTO allotment_history (user_id, pan, ipo_name, allotted, timestamp) VALUES (?, ?, ?, ?, ?)",
              [req.body.userId || "anonymous", cleanPan, selectedIpo.name, mufgResult.data.Allotted, Date.now()]);
          }
          results.push(mufgResult);
        } else {
          const response = await axios.get(KFIN_API_URL, { headers: { client_id: String(clientId), reqparam: cleanPan }, validateStatus: () => true });
          let data = response.data;
          if (typeof data === "string") { try { data = JSON.parse(data); } catch {} }

          if (response.status === 404 || (data && data.error === "Record Not Found") || (data && data.error === "Bad Reqeust")) {
            results.push({ pan: cleanPan, success: false, error: "You have not applied for this IPO." });
            continue;
          }
          if (data && data.error) {
            results.push({ pan: cleanPan, success: false, error: "IPO Details Unavailable / Invalid." });
            continue;
          }

          let kfinName = "N/A";
          let kfinAllot = 0;
          if (data && data.data && data.data.length > 0) {
            kfinName = data.data[0].Name || data.data[0].name || "N/A";
            kfinAllot = data.data.reduce((sum, item) => sum + parseInt(item.All_Shares || item.allot || "0", 10), 0);
          }
          const kfinResult = { pan: cleanPan, success: true, data: { Name: kfinName, Allotted: kfinAllot } };
          await setCachedResult(cacheKey, kfinResult);

          if (kfinResult.success) {
            db.run("INSERT INTO allotment_history (user_id, pan, ipo_name, allotted, timestamp) VALUES (?, ?, ?, ?, ?)",
              [req.body.userId || "anonymous", cleanPan, selectedIpo.name, kfinAllot, Date.now()]);
          }

          results.push(kfinResult);
        }
      } catch (error) {
        results.push({ pan: cleanPan, success: false, error: "Unable to contact allotment service." });
      }
    }
    return res.json({ success: true, total: results.length, results });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* =========================================================
   FEATURE 3: CLOUD SYNC FOR USER PANS & PROFILES
========================================================= */
app.post("/api/sync/pans", (req, res) => {
  const { userId, pans } = req.body;
  if (!userId || !Array.isArray(pans)) return res.status(400).json({ success: false, error: "userId and pans array required" });

  db.serialize(() => {
    db.run("INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)", [userId, Date.now()]);
    db.run("DELETE FROM user_pans WHERE user_id = ?", [userId]);

    const stmt = db.prepare("INSERT INTO user_pans (user_id, pan, nickname) VALUES (?, ?, ?)");
    for (const item of pans) {
      if (item && item.pan) {
        stmt.run(userId, String(item.pan).trim().toUpperCase(), String(item.nickname || "Main"));
      }
    }
    stmt.finalize();
  });

  res.json({ success: true, message: "PANs synced to cloud." });
});

app.get("/api/sync/pans/:userId", (req, res) => {
  const { userId } = req.params;
  db.all("SELECT pan, nickname FROM user_pans WHERE user_id = ?", [userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, pans: rows || [] });
  });
});

/* =========================================================
   FEATURE 4: ANALYTICS & SUCCESS RATE TRACKER
========================================================= */
app.get("/api/analytics", (req, res) => {
  const { pan, userId } = req.query;
  let query = "SELECT pan, ipo_name, allotted, timestamp FROM allotment_history";
  let params = [];

  if (userId) {
    query += " WHERE user_id = ?";
    params.push(userId);
  } else if (pan) {
    query += " WHERE pan = ?";
    params.push(pan);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });

    const totalApplications = rows.length;
    const wins = rows.filter(r => r.allotted > 0).length;
    const totalSharesAllotted = rows.reduce((sum, r) => sum + r.allotted, 0);
    const winRatePercent = totalApplications > 0 ? ((wins / totalApplications) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      summary: {
        totalApplications,
        wins,
        losses: totalApplications - wins,
        winRatePercent: Number(winRatePercent),
        totalSharesAllotted
      },
      history: rows
    });
  });
});

/* =========================================================
   FEATURE 5: PDF ALLOTMENT SLIP DOWNLOADER
========================================================= */
app.get("/api/allotment/pdf", (req, res) => {
  const { pan, name, ipoName, allotted, source } = req.query;

  if (!pan || !ipoName) {
    return res.status(400).json({ error: "Missing pan or ipoName query parameter." });
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Allotment_Slip_${pan}.pdf"`);

  doc.pipe(res);

  // Header
  doc.fontSize(22).fillColor('#1A365D').text('OFFICIAL IPO ALLOTMENT ADVICE', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#718096').text(`Generated by Qasid Messenger • ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(1.5);

  doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(1.5);

  // Details
  doc.fontSize(12).fillColor('#2D3748');
  doc.text(`IPO Name:`, 50, doc.y, { continued: true, bold: true });
  doc.font('Helvetica-Bold').text(` ${ipoName}`);
  doc.moveDown(0.8);

  doc.font('Helvetica').text(`Investor PAN:`, 50, doc.y, { continued: true });
  doc.font('Helvetica-Bold').text(` ${String(pan).toUpperCase()}`);
  doc.moveDown(0.8);

  doc.font('Helvetica').text(`Investor Name:`, 50, doc.y, { continued: true });
  doc.font('Helvetica-Bold').text(` ${name || 'N/A'}`);
  doc.moveDown(0.8);

  doc.font('Helvetica').text(`Registrar Source:`, 50, doc.y, { continued: true });
  doc.font('Helvetica-Bold').text(` ${source || 'KFin / MUFG / Bigshare'}`);
  doc.moveDown(1.5);

  // Allotment Result Box
  const isAllotted = Number(allotted) > 0;
  const boxColor = isAllotted ? '#C6F6D5' : '#FED7D7';
  const textColor = isAllotted ? '#22543D' : '#742A2A';
  const statusText = isAllotted ? `SUCCESSFUL ALLOTMENT: ${allotted} SHARES` : 'NO SHARES ALLOTTED';

  doc.rect(50, doc.y, 500, 60).fill(boxColor);
  doc.fillColor(textColor).fontSize(14).font('Helvetica-Bold').text(statusText, 60, doc.y - 40, { align: 'center' });

  doc.moveDown(4);
  doc.fontSize(9).fillColor('#A0AEC0').text('This document is a computer-generated summary based on public registrar responses.', 50, doc.y, { align: 'center' });

  doc.end();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, async () => {
  console.log("==================================================");
  console.log("  ALL-IN-ONE IPO CHECKER (KFin/MUFG/Bigshare)");
  console.log("==================================================");
  console.log(`  Open: http://localhost:${PORT}`);
  await getOcrWorker();
  await startIpoMonitor();
});