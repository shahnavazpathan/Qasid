// Archive of allotment results, so a result stays available after the registrar retires the IPO
// (Bigshare, for one, then answers "no data found" for every PAN).
//
// Nothing readable is stored: the record id is an HMAC of IPO + PAN, and the result itself is encrypted
// with a key derived from the PAN. Without the PAN (and the server's archive secret) a record can't be
// found or read.
const crypto = require("crypto");
const { store } = require("./store");

const KEEP_MS = 365 * 864e5;
let secret = null;

async function init() {
  secret = await store().getConfig("archiveSecret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    await store().setConfig("archiveSecret", secret);
  }
}

const hmac = text => crypto.createHmac("sha256", secret).update(text).digest();
const recordId = (ipoId, pan) => hmac(`id|${ipoId}|${pan}`).toString("hex");
const keyFor = pan => hmac(`key|${pan}`);

async function save(ipoId, pan, value) {
  if (!secret) return;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFor(pan), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const now = Date.now();
  await store().putArchived({
    _id: recordId(ipoId, pan),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    savedAt: now,
    expiresAt: new Date(now + KEEP_MS)
  });
}

// -> { value, savedAt } or null
async function get(ipoId, pan) {
  if (!secret) return null;
  const doc = await store().getArchived(recordId(ipoId, pan));
  if (!doc) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFor(pan), Buffer.from(doc.iv, "base64"));
    decipher.setAuthTag(Buffer.from(doc.tag, "base64"));
    const text = Buffer.concat([decipher.update(Buffer.from(doc.data, "base64")), decipher.final()]).toString("utf8");
    return { value: JSON.parse(text), savedAt: doc.savedAt };
  } catch {
    return null;
  }
}

module.exports = { init, save, get };
