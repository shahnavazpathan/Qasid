const { decodeHtml } = require("./http");

const stripTags = s => decodeHtml(String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

// Collect label/value pairs from any HTML tables: both header-row tables (<th> row + <td> rows)
// and vertical "label | value" tables. Used for registrars whose result page is plain HTML.
function extractTableFields(html) {
  const fields = [];
  for (const table of String(html).match(/<table[\s\S]*?<\/table>/gi) || []) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(tr =>
      (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(stripTags));
    if (rows.length === 0) continue;

    const headerRow = /<th/i.test(table) ? rows.find(r => r.length > 1) : null;
    if (headerRow && rows.length > 1) {
      for (const row of rows) {
        if (row === headerRow) continue;
        row.forEach((value, i) => { if (headerRow[i]) fields.push([headerRow[i], value]); });
      }
    }
    for (const row of rows) {
      for (let i = 0; i + 1 < row.length; i += 2) fields.push([row[i], row[i + 1]]);
    }
  }
  return fields;
}

function pickField(fields, ...patterns) {
  for (const pattern of patterns) {
    const hit = fields.find(([label, value]) => pattern.test(label) && value && !pattern.test(value));
    if (hit) return hit[1];
  }
  return "";
}

const toQty = v => {
  const s = String(v || "").toUpperCase();
  if (!s || /NON|NOT|^NIL$|^-$/.test(s)) return 0;
  return parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
};

// Best-effort interpretation of a registrar's HTML result
function parseAllotmentHtml(html) {
  const fields = extractTableFields(html);
  const name = pickField(fields, /^name|applicant.*name|investor.*name|name of/i);
  const allottedRaw = pickField(fields, /allot(t)?ed|shares\s*allot|allotment/i);
  const appliedRaw = pickField(fields, /applied|shares\s*bid|bid\s*qty|applied\s*qty/i);
  if (!name && !allottedRaw) return null;
  return { status: "found", name: name || "N/A", applied: toQty(appliedRaw), allotted: toQty(allottedRaw) };
}

module.exports = { stripTags, extractTableFields, pickField, toQty, parseAllotmentHtml };
