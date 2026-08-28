// Vercel serverless function: live feed of the Site Operations Master (Notion).
//
// Reads the Notion "Site Operations Master" database server-side and returns the
// JSON the dashboard consumes. The Notion token stays on the server and is never
// sent to the browser.
//
// Required env var:  NOTION_TOKEN         (internal integration secret, "ntn_…")
// Optional env var:  NOTION_DATABASE_ID   (defaults to the known Site Ops DB)
//
// The database must be shared with the integration (Notion → database → ⋯ →
// Connections → your integration).

const DEFAULT_DB = "6c92249e087348b0a9d713cbbbbdc959";
const NOTION_VERSION = "2022-06-28";

// The queryable fields that count toward the live "core record" completeness.
// These are the structured properties the Notion database actually stores; the
// deep 139-field audit lives in each page's body and is a separate, dated measure.
const CORE_FIELDS = [
  "Site Code", "Site", "City", "State", "Site Type", "Status",
  "Street Address", "ZIP", "Square Footage",
  "General Manager", "Warehouse Manager", "Property Manager",
  "Internet Provider", "Gas Provider", "Water & Power Provider",
  "Trash Vendor", "Cleaning Vendor", "Pest Control Vendor", "Signage Vendor",
  "Slack Channel", "Target Launch", "Actual Launch", "Lease Expiration",
];

// Pull a plain value out of a Notion property object, whatever its type.
function propValue(p) {
  if (!p) return null;
  switch (p.type) {
    case "title":     return textJoin(p.title);
    case "rich_text": return textJoin(p.rich_text);
    case "select":    return p.select ? p.select.name : null;
    case "status":    return p.status ? p.status.name : null;
    case "number":    return p.number === null || p.number === undefined ? null : p.number;
    case "date":      return p.date ? p.date.start : null;
    case "url":       return p.url || null;
    case "email":     return p.email || null;
    case "phone_number": return p.phone_number || null;
    default:          return null;
  }
}
function textJoin(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const s = arr.map((t) => t.plain_text || "").join("").trim();
  return s || null;
}
const filled = (v) =>
  v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");

// Friendlier labels for the "incomplete fields" list shown per site.
const FIELD_LABEL = { Site: "Site Name" };
const labelFor = (f) => FIELD_LABEL[f] || f;

async function queryAllPages(token, dbId) {
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Notion ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function mapSite(page) {
  const P = page.properties || {};
  const g = (name) => propValue(P[name]);

  const code = g("Site Code");
  const name = g("Site");
  // Skip the template row.
  if (code === "XX-XXX-0" || (name && /template/i.test(name))) return null;

  const missing = CORE_FIELDS.filter((f) => !filled(g(f))).map(labelFor);
  const coreFilled = CORE_FIELDS.length - missing.length;
  const total = CORE_FIELDS.length;

  return {
    code: code || null,
    codeDisplay: code || "code TBC",
    name: name || null,
    city: g("City"),
    state: g("State"),
    type: g("Site Type") || "—",
    status: g("Status") || null,
    slack: g("Slack Channel"),
    generalManager: g("General Manager"),
    warehouseManager: g("Warehouse Manager"),
    propertyManager: g("Property Manager"),
    internet: g("Internet Provider"),
    gas: g("Gas Provider"),
    waterPower: g("Water & Power Provider"),
    trash: g("Trash Vendor"),
    cleaning: g("Cleaning Vendor"),
    pest: g("Pest Control Vendor"),
    signage: g("Signage Vendor"),
    squareFootage: g("Square Footage"),
    targetLaunch: g("Target Launch"),
    actualLaunch: g("Actual Launch"),
    leaseExpiration: g("Lease Expiration"),
    fields: coreFilled,
    total,
    missing,
    pct: Math.round((coreFilled / total) * 1000) / 10,
  };
}

// Live verification of the audit risks that can be checked from structured data.
// Each returns the list of site codes currently in violation (empty = resolved).
function computeChecks(sites) {
  const code = (s) => s.codeDisplay || s.code || s.name;
  const has = (v) => typeof v === "string" && v.trim() !== "";
  const hostRe = /provided by|readyspaces|cubework/i;
  return {
    // "Burbank Water and Power" copied onto a site that isn't CA-LAX-1.
    burbankWaterPower: sites
      .filter((s) => /burbank water/i.test(s.waterPower || "") && s.code !== "CA-LAX-1")
      .map(code),
    // Marked Launched/Live but the record is still mostly empty.
    launchedButEmpty: sites
      .filter((s) => ["Launched", "Live"].includes(s.status) && s.fields < 15)
      .map(code),
    // No site code assigned yet.
    missingCode: sites.filter((s) => !has(s.code)).map(code),
    // Water & Power recorded but Gas Provider left blank.
    gasBlank: sites.filter((s) => has(s.waterPower) && !has(s.gas)).map(code),
    // Recorded as a plain Warehouse but utilities/services are host-supplied.
    hostSuppliedType: sites
      .filter(
        (s) =>
          hostRe.test([s.waterPower, s.gas, s.trash, s.cleaning, s.internet].join(" ")) &&
          !/rocket|shared/i.test(s.type || "")
      )
      .map(code),
    // No launch status set at all.
    noStatus: sites.filter((s) => !s.status).map(code),
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID || DEFAULT_DB;

  if (!token) {
    res.status(503).json({
      error: "not_configured",
      message: "Set the NOTION_TOKEN environment variable to enable the live feed.",
    });
    return;
  }

  try {
    const pages = await queryAllPages(token, dbId);
    const sites = pages.map(mapSite).filter(Boolean);

    // Rank the completeness leaderboard high → low, same as the dashboard.
    sites.sort((a, b) => b.pct - a.pct);

    const statusCounts = {};
    for (const s of sites) {
      const key = s.status || "No status";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    const avgPct = sites.length
      ? Math.round((sites.reduce((a, s) => a + s.pct, 0) / sites.length) * 10) / 10
      : 0;

    res.status(200).json({
      source: "notion",
      syncedAt: new Date().toISOString(),
      count: sites.length,
      coreTotal: CORE_FIELDS.length,
      noStatus: sites.filter((s) => !s.status).length,
      avgPct,
      statusCounts,
      checks: computeChecks(sites),
      sites,
    });
  } catch (err) {
    res.status(502).json({ error: "notion_error", message: String(err.message || err) });
  }
};
