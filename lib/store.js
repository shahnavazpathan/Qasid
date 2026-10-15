// Persistent storage for push subscribers and server config.
// MongoDB when MONGODB_URI is set (production), otherwise a local JSON file (development).
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const FILE = path.join(__dirname, "..", "data", "store.json");

let backend = null;

/* ---------------- MongoDB ---------------- */
async function mongoBackend(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "qasid");
  const webSubs = db.collection("webPushSubscriptions");
  const expo = db.collection("expoPushTokens");
  const config = db.collection("config");
  await Promise.all([
    webSubs.createIndex({ endpoint: 1 }, { unique: true }),
    expo.createIndex({ token: 1 }, { unique: true })
  ]);

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
    addExpoToken: token => expo.updateOne({ token }, { $set: { token, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true }),
    removeExpoToken: token => expo.deleteOne({ token }),
    listExpoTokens: async () => (await expo.find({}, { projection: { _id: 0, token: 1 } }).toArray()).map(d => d.token)
  };
}

/* ---------------- JSON file (local dev) ---------------- */
function fileBackend() {
  let data = { config: {}, webSubs: {}, expoTokens: [] };
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
    addExpoToken: async token => { if (!data.expoTokens.includes(token)) { data.expoTokens.push(token); save(); } },
    removeExpoToken: async token => { data.expoTokens = data.expoTokens.filter(t => t !== token); save(); },
    listExpoTokens: async () => [...data.expoTokens]
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
