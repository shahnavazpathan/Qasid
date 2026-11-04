// Persistent storage for web push subscribers, server config (VAPID keys, session secret, announced allotments),
// signed-in users with their saved PANs, the log of Terms/Privacy agreements, and the encrypted allotment
// result archive (lib/resultArchive.js).
// MongoDB when MONGODB_URI is set (production), otherwise a local JSON file (development).
const fs = require("fs");
const path = require("path");
// mongodb is only needed when MONGODB_URI is set; require it lazily so the local file store works
// without the dependency installed.
let MongoClient = null;
try { ({ MongoClient } = require("mongodb")); } catch {}

const FILE = path.join(__dirname, "..", "data", "store.json");

let backend = null;

/* ---------------- MongoDB ---------------- */
async function mongoBackend(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "qasid");
  const webSubs = db.collection("webPushSubscriptions");
  const config = db.collection("config");
  const archive = db.collection("resultArchive");
  const users = db.collection("users");
  const consentLog = db.collection("consentLog");
  await webSubs.createIndex({ endpoint: 1 }, { unique: true });
  await consentLog.createIndex({ userId: 1, at: -1 });
  await archive.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  return {
    name: "mongodb",
    getConfig: async key => (await config.findOne({ _id: key }))?.value ?? null,
    setConfig: (key, value) => config.updateOne({ _id: key }, { $set: { value } }, { upsert: true }),
    upsertWebSub: (sub, meta = {}) => webSubs.updateOne(
      { endpoint: sub.endpoint },
      { $set: { endpoint: sub.endpoint, keys: sub.keys, ...meta, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    ),
    removeWebSub: endpoint => webSubs.deleteOne({ endpoint }),
    listWebSubs: () => webSubs.find({}, { projection: { _id: 0 } }).toArray(),
    countWebSubs: () => webSubs.countDocuments(),
    getArchived: id => archive.findOne({ _id: id }),
    putArchived: doc => archive.replaceOne({ _id: doc._id }, doc, { upsert: true }),
    getUser: id => users.findOne({ _id: id }),
    saveProfile: (id, profile) => users.updateOne(
      { _id: id },
      { $set: { ...profile, updatedAt: new Date() }, $setOnInsert: { pans: [], createdAt: new Date() } },
      { upsert: true }
    ),
    savePans: (id, pans) => users.updateOne(
      { _id: id },
      { $set: { pans, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    ),
    saveConsent: (id, consent) => users.updateOne({ _id: id }, { $set: { consent, updatedAt: new Date() } }),
    // Deletes the account; its consent records lose the email but stay, as proof of what was agreed
    deleteUser: async id => {
      await users.deleteOne({ _id: id });
      await consentLog.updateMany({ userId: id }, { $unset: { email: "" } });
    },
    // Append-only record of agreements and account deletions
    logConsent: entry => consentLog.insertOne({ ...entry, at: new Date() })
  };
}

/* ---------------- JSON file (local dev) ---------------- */
function fileBackend() {
  let data = { config: {}, webSubs: {}, archive: {}, users: {}, consentLog: [] };
  try { data = { ...data, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  const save = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 1));
  };
  return {
    name: "file",
    getConfig: async key => data.config[key] ?? null,
    setConfig: async (key, value) => { data.config[key] = value; save(); },
    upsertWebSub: async (sub, meta = {}) => {
      data.webSubs[sub.endpoint] = { ...(data.webSubs[sub.endpoint] || { createdAt: new Date().toISOString() }), endpoint: sub.endpoint, keys: sub.keys, ...meta, updatedAt: new Date().toISOString() };
      save();
    },
    removeWebSub: async endpoint => { delete data.webSubs[endpoint]; save(); },
    listWebSubs: async () => Object.values(data.webSubs),
    countWebSubs: async () => Object.keys(data.webSubs).length,
    getArchived: async id => {
      const doc = data.archive[id];
      return doc && new Date(doc.expiresAt) > new Date() ? doc : null;
    },
    putArchived: async doc => {
      const now = new Date();
      for (const [id, d] of Object.entries(data.archive)) if (new Date(d.expiresAt) <= now) delete data.archive[id];
      data.archive[doc._id] = doc;
      save();
    },
    getUser: async id => data.users[id] || null,
    saveProfile: async (id, profile) => {
      data.users[id] = { pans: [], createdAt: new Date().toISOString(), ...data.users[id], ...profile, updatedAt: new Date().toISOString() };
      save();
    },
    savePans: async (id, pans) => {
      data.users[id] = { createdAt: new Date().toISOString(), ...data.users[id], pans, updatedAt: new Date().toISOString() };
      save();
    },
    saveConsent: async (id, consent) => {
      if (data.users[id]) { data.users[id].consent = consent; save(); }
    },
    deleteUser: async id => {
      delete data.users[id];
      for (const entry of data.consentLog) if (entry.userId === id) delete entry.email;
      save();
    },
    logConsent: async entry => { data.consentLog.push({ ...entry, at: new Date().toISOString() }); save(); }
  };
}

async function init() {
  if (backend) return backend;
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      backend = await mongoBackend(uri);
      console.log("[STORE] Connected to MongoDB");
      return backend;
    } catch (err) {
      console.error("[STORE] MongoDB connection failed, using local file store:", err.message);
    }
  } else {
    console.warn("[STORE] MONGODB_URI not set - using local file store (data/store.json). Set it in production so subscribers survive redeploys.");
  }
  backend = fileBackend();
  return backend;
}

const store = () => {
  if (!backend) throw new Error("store not initialised");
  return backend;
};

module.exports = { init, store };
