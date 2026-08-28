# Site Operations — Launch Readiness Dashboard

An interactive, Jetson-branded dashboard summarizing the **Site Operations Master**
rebuild & guide audit (data as of **26 Aug 2026**). It covers all 13 warehouse / HQ
operations guides: a completeness leaderboard, launch-status mix, the seven open
data-quality risks with owners, structural schema gaps, smaller inconsistencies,
and an outstanding-actions checklist.

> 🔒 **Confidential — internal.** The dashboard names sites, addresses, and staff,
> and this repo sits alongside records that hold gate codes and vendor credentials.
> Do not expose it on a public URL without an access gate (see **Deploy** below).

The dashboard is a single self-contained HTML file (brand MNKY Jane fonts
embedded, light/dark themes). On load it tries the **live Notion feed** at
`/api/sites`; if that isn't configured or reachable it falls back to the baked-in
**26 Aug snapshot**, and a badge in the header shows which is in play. Each site
row has a button that opens its list of **incomplete fields**, and the
outstanding-actions checklist + theme persist per viewer in the browser.

## Files

| File | Purpose |
|------|---------|
| `site-operations-dashboard.html` | The dashboard (all HTML/CSS/JS/fonts inline) |
| `api/sites.js` | Vercel serverless function — reads Notion live, returns JSON |
| `index.html` | Redirects `/` to the dashboard so root works on any static server |
| `conductor.json` | Run config for [Conductor](https://conductor.build) |
| `vercel.json` | Static-hosting config: clean URLs + serve the dashboard at `/` |
| `.env.example` | Environment variables the live feed needs |

## Live Notion feed

The browser can't call Notion directly (the token must stay server-side, and
Notion blocks cross-origin browser calls), so `api/sites.js` runs as a Vercel
serverless function: it reads the **Site Operations Master** database with a
server-side token and returns the JSON the dashboard renders. The token is never
sent to the browser.

**One-time setup:**

1. **Create an internal integration** at
   [notion.so/my-integrations](https://www.notion.so/my-integrations) → *New
   integration* → internal. Copy the secret (starts with `ntn_`).
2. **Share the database with it:** open the Site Operations Master database in
   Notion → **⋯ → Connections → Add connection →** your integration.
3. **Set the env var in Vercel:** Project → Settings → Environment Variables →
   `NOTION_TOKEN` = the secret. (Optional `NOTION_DATABASE_ID` to point at a
   different database.) Redeploy.

That's it — the header badge flips to **🟢 Live · Notion** and the **Refresh**
button re-pulls on demand.

**What's live vs. curated:** the live feed drives site identity, launch status,
the status mix, and completeness measured across the **24 structured record
fields Notion actually stores** (so the live "% complete" uses a different, live
denominator than the deep 139-field audit). The risks, structural gaps, and
outstanding actions remain the curated **26 Aug audit** layer — they're analytical
findings, not queryable fields. Without a token the whole page shows the snapshot.

**Local live testing:** `npm i -g vercel` then `vercel dev` (reads `.env`) serves
`/api/sites` locally. Plain `python3 -m http.server` has no API, so it shows the
snapshot.

## Run it locally

Any static file server works. With Python (no install needed):

```bash
python3 -m http.server 4321
```

Then open **http://localhost:4321/**. (Node alternative: `npx -y serve -l 4321 .`)

Or just open `site-operations-dashboard.html` directly in a browser.

## Run it in Conductor

1. Add this repo as a workspace in [Conductor](https://conductor.build) and pick a
   branch (`main` or `claude/live-dashboard-hib9h0`).
2. Press **Run**. Conductor reads `conductor.json` and starts
   `python3 -m http.server 4321`, then opens the preview at
   **http://localhost:4321/**.
3. If your version doesn't auto-read `conductor.json`, set the workspace **Run**
   script to `python3 -m http.server 4321` manually.

The preview is local to your machine — don't tunnel/expose the port publicly
without access control.

## Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import
   this repo.
2. Framework Preset = **Other**; leave **Build Command** and **Output Directory**
   empty (it's a static site — `vercel.json` handles routing).
3. Deploy. `/` will load the dashboard.
4. **Before sharing the link**, enable an access gate:
   **Project → Settings → Deployment Protection → Vercel Authentication or
   Password Protection.** On a free/Hobby plan there's no built-in gate — don't put
   confidential site data on a public Hobby URL.

Vercel deploys the repo's default (production) branch, so every push to it
auto-redeploys.

## Updating the data

- **Site rows, status, completeness, incomplete-field lists** update themselves
  from Notion once the live feed is configured — edit the site records in Notion
  and hit **Refresh**.
- **The snapshot fallback** (`SNAPSHOT_SITES`) and the **curated audit layer**
  (`RISKS`, `GAPS`, `INCON`, `TASKS`) are still hand-maintained arrays near the top
  of the `<script>` block in `site-operations-dashboard.html`. Update these when
  the 26 Aug findings change. Commit and push; a connected Vercel project
  redeploys automatically.

### Not yet live (possible next steps)

- The **139-field deep completeness** (the audit's original measure) needs each
  Notion page *body* parsed, not just its database properties — a bigger job than
  this feed.
- **Auto-verifying the risks** (e.g. flagging any site whose Water & Power provider
  still reads "Burbank Water and Power") could move some findings from curated to
  live. The plumbing is here; say the word.
