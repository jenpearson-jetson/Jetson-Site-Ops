---
name: jetson-site-dashboard-sync
description: Keep the Site Operations launch-readiness dashboard and the "Jetson Site Operations Master V.2" Google Sheet current with Notion, in one pass. Use whenever someone wants the dashboard or the master sheet refreshed, synced, or brought up to date — "update the dashboard", "sync the site ops sheet", "refresh the launch dashboard", "the dashboard is stale", "push the latest sites to the sheet and dashboard", "run the Monday site sync" — and whenever site data has changed in Notion and both downstream surfaces need to catch up. This is the orchestrator that runs the weekly refresh; it pulls the latest from the Notion Site Operations Master, regenerates the sheet, refreshes the dashboard snapshot, and commits and pushes so the deployed dashboard redeploys. For editing one site's facts use jetson-site-ops; for changing the sheet's structure use jetson-site-workbook.
---

# Site Ops dashboard & sheet — live sync

Three surfaces show the same site data. **Notion is the one source of truth**; the other two
must be pulled from it, never edited independently.

| Surface | What it is | How it stays current |
|---|---|---|
| **Notion** Site Operations Master | One page per site, the full guide | People edit it directly — the source of truth |
| **Dashboard** `site-operations-dashboard.html` (this repo) | Launch-readiness view, deployed on Vercel | **Already live**: polls `/api/sites` → Notion every 60s. Plus a baked-in snapshot this skill refreshes. |
| **Google Sheet V.2** `1VxFLWlTz6CYQfUZ8UjbXHXqrKEqblatq6Z_3Z0e1UM8` | Every field, one tab per site + All Sites | Not self-updating — this skill regenerates it |

Notion DB `6c92249e087348b0a9d713cbbbbdc959` (data source `c13b1212-0234-4770-8a68-74eb4b5faeb8`).

Both records are **confidential** — WiFi passwords and gate codes live in the sheet, vendor and
utility passwords in Notion. Never paste their contents into Slack, a document, or an artifact.
Report the one field asked for, not the record.

## What "live" means here, and what this skill actually does

The deployed dashboard is *already* live: with a `NOTION_TOKEN` set on Vercel it re-pulls Notion
every minute, so the leaderboard, statuses, and status mix track Notion in real time with no help
from anyone. The two things that do **not** update themselves are:

1. **The dashboard's fallback snapshot** — the `SNAPSHOT_SITES` array baked into the HTML. It is
   what the page shows before the feed answers and whenever the feed is unreachable, and it carries
   the deep **139-field** completeness measure the live feed can't compute. It goes stale until
   regenerated and pushed.
2. **The Google Sheet V.2** — the MCP tools here cannot write cells, so the sheet only moves when
   it is regenerated and re-uploaded.

So this skill is the recurring pass that closes those two gaps from Notion. Run it on demand, and
it runs every Monday on a schedule (see *Weekly automation*). Do the whole sequence — a half-run
leaves the two surfaces disagreeing, which is worse than either being uniformly behind.

## The sync, end to end

Work in a scratch directory, not in the conversation — the exports are large.

### 1. Pull the truth from Notion
Fetch every page of the Site Operations Master database and read its current schema first (property
names and select options drift). This is exactly what `jetson-site-ops` does for auditing — follow
its "Auditing" flow to get, per site: identity (code, name, city, state, type), status, and the
values for all recorded fields. If a site was added or renamed in Notion since the last run, it
flows through here automatically. Note anything that looks *wrong* rather than merely missing (a
vendor row naming another site's vendor, a city that contradicts the code) — surface these in the
run summary; do not silently propagate them.

### 2. Regenerate the Google Sheet V.2
This is a **rebuild**, because row order is load-bearing and cells can't be written individually.
Hand off to `jetson-site-workbook`, which owns the sheet's shape and has the tooling:

- Read the live sheet (`read_file_content` on the file ID above) to `export.md`, then
  `parse_export.py export.md --out values.json --report` to capture every current value.
- Fold in the changes from step 1 — new sites, new field values — by editing `values.json`.
- `build_workbook.py --out "Jetson Site Operations Master.xlsx" --values values.json` regenerates
  every tab, formula, and format with the values carried forward.
- Upload with `create_file`, **verify the `--report` percentages match** before trashing anything,
  then trash the old file and repoint every reference (Notion `Master Sheet` property, hub page).
  Say plainly if the URL changed.

`values.json` is also the input to the next step, so keep it.

### 3. Refresh the dashboard snapshot
The same `values.json` drives the dashboard's 139-field snapshot, so both surfaces show identical
counts. From this skill's directory:

```bash
python3 scripts/refresh_dashboard.py \
    --values <scratch>/values.json \
    --dashboard site-operations-dashboard.html \
    --as-of "$(date +'%-d %b %Y')"
```

It rewrites only the `SNAPSHOT_SITES` array and the `📄 Snapshot · <date>` badge — nothing else,
so a diff of the HTML shows exactly the sites and the date moving. Run it with `--check` first to
eyeball the rows. The **curated audit layer** (`RISKS`, `GAPS`, `INCON`, `TASKS` further down the
HTML) is analytical findings, not queryable data — leave it alone unless a person asks to update
those findings.

### 4. Commit and push — this is the deploy
The dashboard deploys from the repo, so the push *is* the update; Vercel redeploys the branch
automatically. On branch `claude/dashboard-sheet-live-sync-989tkp`:

```bash
git add site-operations-dashboard.html
git commit -m "Sync dashboard snapshot with Notion (site ops, <date>)"
git push -u origin claude/dashboard-sheet-live-sync-989tkp
```

Retry a failed push up to 4× with exponential backoff (2s, 4s, 8s, 16s). Do **not** open a pull
request unless asked.

### 5. Report
One short summary: sites synced, any that changed status or completeness meaningfully, whether the
sheet URL changed, and — leading — anything that looked *wrong* in Notion and needs a human. Absent
fields are work; wrong fields are risk.

## Weekly automation

The sheet's own Start Here tab promises a Monday auto-refresh. A Routine fires this skill every
Monday morning; on each firing, run the full sequence above against whatever Notion holds that day.
If the Routine is missing, recreate it: a weekly `create_trigger` on this repo's environment whose
prompt is "Run the jetson-site-dashboard-sync skill: pull the latest from the Notion Site
Operations Master and refresh both the V.2 Google Sheet and the dashboard snapshot, then commit and
push." Keep it to once a week — the deployed dashboard is already minute-fresh from Notion on its
own; this pass is only for the snapshot and the sheet.

## When something's off

- **`SNAPSHOT_SITES array not found`** from the refresh script → the dashboard's script block was
  restructured. Don't force it; open the HTML, find the array, and reconcile the regex or the array
  by hand, then rerun.
- **`--report` percentages moved unexpectedly** after a rebuild → a value didn't carry across. Stop
  and find out why before trashing the old sheet; a rebuild must never lose data.
- **Live badge still says Snapshot on the deployed site** → that's a `NOTION_TOKEN` / Vercel
  problem, not this skill's. See the repo README's "Live Notion feed" section.
- **Notion and the sheet disagree** → Notion wins; never overwrite Notion from the sheet. Say which
  one you took and why.

## Related skills
- `jetson-site-ops` — edit one site's facts in Notion + note the sheet is behind. Start there for data changes.
- `jetson-site-workbook` — the sheet's structure, the 139-field spec, and the rebuild scripts this skill calls.

## Files
| File | What it does |
|---|---|
| `scripts/refresh_dashboard.py` | Rewrites the dashboard's `SNAPSHOT_SITES` array + freshness badge from `values.json`. Only touches those two things. |
