const express = require("express");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");

const app = express();
const PORT = 3000;

// Registrars URLs
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

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")))

/* =========================================================
   IPO CACHE
========================================================= */
let ipoCache = { data: null, fetchedAt: 0 };
const IPO_CACHE_TIME = 5 * 60 * 1000;

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

async function queryBigshareServer(baseUrl, companyId, pan, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const captchaRes = await axios.get(`${baseUrl}/Captcha.ashx?_=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0" },
        timeout: 10000
      });

      const token = captchaRes.data?.token || captchaRes.data?.Token;
      const base64Img = captchaRes.data?.image || captchaRes.data?.Image;
      const cookie = captchaRes.headers["set-cookie"] ? captchaRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ") : "";

      if (!token || !base64Img) continue;

      const solvedDigits = await solveCaptchaFromBase64(base64Img);
      if (!solvedDigits || solvedDigits.length !== 6) continue;

      const payload = {
        Applicationno: "", Company: String(companyId), SelectionType: "PN",
        PanNo: pan, txtcsdl: "", txtDPID: "", txtClId: "", ddlType: "0",
        lang: "en", CaptchaToken: token, CaptchaAnswer: solvedDigits, ResultToken: ""
      };

      const searchRes = await axios.post(`${baseUrl}/Data.aspx/FetchIpodetails`, payload, {
        headers: {
          "content-type": "application/json; charset=UTF-8",
          "cookie": cookie, "origin": baseUrl, "referer": `${baseUrl}/ipo_status.html`, "user-agent": "Mozilla/5.0", "x-requested-with": "XMLHttpRequest"
        },
        timeout: 12000
      });

      const result = searchRes.data?.d;
      if (!result) continue;
      if (result.Status === "CAPTCHA") continue;

      const hasRecord = result.Name || (result.Records && result.Records.length > 0);
      if (hasRecord && result.Status !== "NOTFOUND") {
        const primaryRecord = (result.Records && result.Records.length > 0) ? result.Records[0] : result;
        
        // Fix for Bigshare missing name
        let invName = primaryRecord.Name || result.Name || "";
        if (!invName.trim()) invName = "Name Not Provided";

        // Fix for Bigshare "NON-ALLOTTE" text
        let allottedStr = String(primaryRecord.ALLOTED || result.ALLOTED || "0").toUpperCase();
        let allottedQty = 0;
        if (!allottedStr.includes("NON")) {
            allottedQty = parseInt(allottedStr.replace(/\D/g, ""), 10) || 0;
        }

        return {
          found: true,
          data: {
            pan, success: true,
            data: { Name: invName, Allotted: allottedQty }
          }
        };
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
async function fetchLiveIpoList() {
  const now = Date.now();
  if (ipoCache.data && now - ipoCache.fetchedAt < IPO_CACHE_TIME) return ipoCache.data;

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

    const mergedIpos = [...cleanKfinIpos, ...cleanMufgIpos, ...cleanBigshareIpos];
    mergedIpos.sort((a, b) => (parseInt(b.clientId, 10) || 0) - (parseInt(a.clientId, 10) || 0));

    ipoCache = { data: mergedIpos, fetchedAt: now };
    return mergedIpos;
  } catch (error) {
    if (ipoCache.data) return ipoCache.data;
    throw error;
  }
}

app.get("/api/ipos", async (req, res) => {
  try {
    const ipos = await fetchLiveIpoList();
    res.json({ success: true, total: ipos.length, ipos });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/* =========================================================
   CHECK ALLOTMENT API (Standardized Output)
========================================================= */
app.post("/api/check", async (req, res) => {
  try {
    const { clientId, pans } = req.body;

    if (!clientId) return res.status(400).json({ success: false, error: "Please select an IPO." });
    if (!Array.isArray(pans) || pans.length === 0) return res.status(400).json({ success: false, error: "Please enter at least one PAN." });
    if (pans.length > 50) return res.status(400).json({ success: false, error: "Maximum 50 PANs at once." });

    const ipos = await fetchLiveIpoList();
    const selectedIpo = ipos.find(ipo => ipo.clientId === String(clientId));
    if (!selectedIpo) return res.status(400).json({ success: false, error: "Invalid IPO selected." });

    const results = [];

    for (const pan of pans) {
      const cleanPan = String(pan).trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
        results.push({ pan: cleanPan, success: false, error: "Invalid PAN" });
        continue;
      }

      try {
        if (selectedIpo.source === "bigshare") {
          // --- BIGSHARE ---
          const result = await queryBigshareMultiServer(selectedIpo.clientId, cleanPan);
          results.push(result);

        } else if (selectedIpo.source === "mufg") {
          // --- MUFG ---
          const tokenRes = await axios.post(MUFG_TOKEN_URL, {}, { headers: { "x-requested-with": "XMLHttpRequest" } });
          const token = tokenRes.data.d;
          const cookies = tokenRes.headers["set-cookie"] ? tokenRes.headers["set-cookie"].map(c => c.split(";")[0]).join("; ") : "";
          
          const payload = JSON.stringify({ clientid: String(clientId), PAN: cleanPan, IFSC: "", CHKVAL: "1", token: token });
          const searchRes = await axios.post(MUFG_SEARCH_URL, payload, { headers: { "content-type": "application/json; charset=UTF-8", "cookie": cookies } });
          const rawXml = searchRes.data?.d || "";

          if (!rawXml.includes("<NewDataSet>") || !rawXml.includes("<Table>")) {
            results.push({ pan: cleanPan, success: false, error: "You have not applied for this IPO." });
            continue;
          }

          const extract = tag => { const match = new RegExp(`<${tag}>(.*?)<\/${tag}>`).exec(rawXml); return match ? match[1] : null; };
          results.push({
            pan: cleanPan, success: true,
            data: { Name: extract("NAME1") || "N/A", Allotted: parseInt(extract("ALLOT") || "0", 10) }
          });

        } else {
          // --- KFINTECH ---
          const response = await axios.get(KFIN_API_URL, { headers: { client_id: String(clientId), reqparam: cleanPan }, validateStatus: () => true });
          let data = response.data;
          if (typeof data === "string") { try { data = JSON.parse(data); } catch {} }

          // Catch Kfintech "Bad Reqeust" spelling error or standard Not Found
          if (response.status === 404 || (data && data.error === "Record Not Found") || (data && data.error === "Bad Reqeust")) {
            results.push({ pan: cleanPan, success: false, error: "You have not applied for this IPO." });
            continue;
          }
          if (data && data.error) {
             results.push({ pan: cleanPan, success: false, error: "IPO Details Unavailable / Invalid." });
             continue;
          }

          // Format KFintech Name and Allotted
          let kfinName = "N/A";
          let kfinAllot = 0;
          if (data && data.data && data.data.length > 0) {
            kfinName = data.data[0].Name || data.data[0].name || "N/A";
            kfinAllot = data.data.reduce((sum, item) => sum + parseInt(item.All_Shares || item.allot || "0", 10), 0);
          }

          results.push({
            pan: cleanPan, success: true,
            data: { Name: kfinName, Allotted: kfinAllot }
          });
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
   HEALTH CHECK ROUTE (Used for UptimeRobot / Render Keep-Alive)
========================================================= */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
   FRONTEND ROUTE
========================================================= */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

/* =========================================================
   START SERVER
========================================================= */
app.listen(PORT, async () => {
  console.log("");
  console.log("==================================================");
  console.log("  ALL-IN-ONE IPO CHECKER (KFin/MUFG/Bigshare)");
  console.log("==================================================");
  console.log(`  Open: http://localhost:${PORT}`);
  await getOcrWorker();
  console.log("  OCR Engine is ready!");
  console.log("");
});
