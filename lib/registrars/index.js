// Each registrar module exports: { id, label, website, concurrency, listIpos(), checkPan(ipo, pan) }
// listIpos() -> [{ name, clientId, ...extra }]
// checkPan()  -> { status: "found" | "not_applied" | "error", name?, applied?, allotted?, applications?, error? }
const registrars = [
  require("./kfin"),
  require("./mufg"),
  require("./bigshare"),
  require("./skyline"),
  require("./purva"),
  require("./maashitla"),
  require("./integrated"),
  require("./satellite"),
  require("./accurate"),
  require("./mas")
];

const byId = new Map(registrars.map(r => [r.id, r]));

module.exports = { registrars, getRegistrar: id => byId.get(id) };
