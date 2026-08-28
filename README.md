# Site Operations — Launch Readiness Dashboard

An interactive, Jetson-branded dashboard summarizing the **Site Operations Master**
rebuild & guide audit (data as of **26 Aug 2026**). It covers all 13 warehouse / HQ
operations guides: a completeness leaderboard, launch-status mix, the seven open
data-quality risks with owners, structural schema gaps, smaller inconsistencies,
and an outstanding-actions checklist.

> 🔒 **Confidential — internal.** The dashboard names sites, addresses, and staff,
> and this repo sits alongside records that hold gate codes and vendor credentials.
> Do not expose it on a public URL without an access gate (see **Deploy** below).

It's a single self-contained HTML file — no build step, no dependencies. Brand
fonts (MNKY Jane) are embedded, and it supports light/dark themes. The
outstanding-actions checklist and the theme choice persist per viewer in the
browser (they don't sync between people).

## Files

| File | Purpose |
|------|---------|
| `site-operations-dashboard.html` | The dashboard (all HTML/CSS/JS/fonts inline) |
| `index.html` | Redirects `/` to the dashboard so root works on any static server |
| `conductor.json` | Run config for [Conductor](https://conductor.build) |
| `vercel.json` | Static-hosting config: clean URLs + serve the dashboard at `/` |

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

The numbers are a **snapshot** baked into the HTML — hosting it anywhere does not
make it pull live from Notion or the master Google Sheet. To update it, edit the
data arrays near the top of the `<script>` block in
`site-operations-dashboard.html`:

- `SITES` — per-site code, location, type, status, field count, completeness %
- `RISKS` — the open data-quality risks (severity, affected sites, owner, action)
- `GAPS`, `INCON`, `TASKS` — structural gaps, inconsistencies, outstanding actions

Commit and push; any connected Vercel project redeploys automatically.

If you'd like the dashboard to refresh from Notion / the Sheet automatically
rather than from a hand-edited snapshot, that's a separate connected-data build.
