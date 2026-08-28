#!/usr/bin/env python3
"""Refresh the dashboard's baked-in snapshot from current site data.

The Site Operations dashboard (`site-operations-dashboard.html`) polls the live
Notion feed at `/api/sites` every minute, so a deployed copy is already live.
But it also carries a baked-in **snapshot** — the `SNAPSHOT_SITES` array — that
it paints instantly on load and falls back to whenever the live feed is
unreachable (no token, offline, API down). That snapshot is the deep
**139-field** completeness measure, which the live feed can't compute, so it has
to be regenerated from the rebuilt workbook rather than the API.

This script rewrites exactly two things in the HTML, and nothing else:
  1. the `const SNAPSHOT_SITES=[ ... ]` array, and
  2. the snapshot freshness badge (`📄 Snapshot · <date>`).

It reads `values.json` as produced by the workbook skill's
`parse_export.py` — `{ "<CODE>": { "SECTION||Field": "value", ... }, ... }` —
so the snapshot's 139-field counts match the sheet exactly. One source, both
surfaces.

Usage
-----
  python3 refresh_dashboard.py \
      --values values.json \
      --dashboard ../../../../site-operations-dashboard.html \
      --as-of "28 Aug 2026"      # optional; defaults to today

Run with --check to see the computed rows without writing the file.
"""

import argparse
import datetime as dt
import json
import re
import sys

TOTAL_FIELDS = 139  # the deep-audit denominator the dashboard snapshot divides by

# Where the per-site identity lives inside values.json (SECTION||Field keys).
K_TYPE = "SITE OVERVIEW||Site Type"
K_CITY = "SITE OVERVIEW||City"
K_STATE = "SITE OVERVIEW||State"
K_STATUS = "SITE OVERVIEW||Status"

# The dashboard styles these status values; anything else still renders but is
# grouped under "No status". Keep in step with STATUS_LABEL in the HTML.
KNOWN_STATUSES = {
    "Live", "Launched", "Prelaunch", "LOI Signed", "Site Selection", "Closed",
}


def js_str(value):
    """Emit a JS double-quoted string, escaping what has to be escaped."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_rows(values, total):
    rows = []
    for code, fields in values.items():
        filled = sum(1 for v in fields.values() if str(v).strip())
        city = (fields.get(K_CITY) or "").strip()
        state = (fields.get(K_STATE) or "").strip()
        loc = ", ".join(p for p in (city, state) if p) or "—"
        site_type = (fields.get(K_TYPE) or "").strip() or "—"
        status = (fields.get(K_STATUS) or "").strip()
        if status not in KNOWN_STATUSES:
            status = "unset"
        pct = round(filled / total * 1000) / 10 if total else 0.0
        rows.append({
            "code": code, "loc": loc, "type": site_type,
            "status": status, "fields": filled, "total": total, "pct": pct,
        })
    # High → low, exactly how the dashboard ranks the leaderboard.
    rows.sort(key=lambda r: r["pct"], reverse=True)
    return rows


def render_array(rows):
    lines = ["const SNAPSHOT_SITES=["]
    body = []
    for r in rows:
        body.append(
            " {{code:{c},loc:{l},type:{t},status:{s},fields:{f},total:{n},pct:{p}}}".format(
                c=js_str(r["code"]), l=js_str(r["loc"]), t=js_str(r["type"]),
                s=js_str(r["status"]), f=r["fields"], n=r["total"], p=r["pct"],
            )
        )
    lines.append(",\n".join(body))
    lines.append("].map(s=>({...s,codeDisplay:s.code}));")
    return "\n".join(lines)


ARRAY_RE = re.compile(
    r"const SNAPSHOT_SITES=\[.*?\]\.map\(s=>\(\{\.\.\.s,codeDisplay:s\.code\}\)\);",
    re.DOTALL,
)
BADGE_RE = re.compile(r'(📄 Snapshot · )([^"<]+)')


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--values", required=True, help="values.json from parse_export.py")
    ap.add_argument("--dashboard", required=True, help="site-operations-dashboard.html")
    ap.add_argument("--total", type=int, default=TOTAL_FIELDS,
                    help="deep-audit denominator (default 139)")
    ap.add_argument("--as-of", default=None,
                    help='snapshot date for the badge, e.g. "28 Aug 2026" (default: today)')
    ap.add_argument("--check", action="store_true",
                    help="print the computed rows and exit without writing")
    args = ap.parse_args(argv)

    with open(args.values, encoding="utf-8") as fh:
        values = json.load(fh)
    rows = build_rows(values, args.total)
    if not rows:
        sys.exit("values.json held no sites — refusing to blank the snapshot.")

    as_of = args.as_of or dt.date.today().strftime("%-d %b %Y")

    if args.check:
        for r in rows:
            print("  {code:<12} {fields:>3}/{total:<3} {pct:>5.1f}%  {status:<13} {loc}".format(**r))
        print("\nbadge date -> {}".format(as_of))
        return

    with open(args.dashboard, encoding="utf-8") as fh:
        html = fh.read()

    new_array = render_array(rows)
    html, n = ARRAY_RE.subn(lambda _m: new_array, html, count=1)
    if n != 1:
        sys.exit("SNAPSHOT_SITES array not found — the dashboard layout changed. Stopping.")

    html, b = BADGE_RE.subn(lambda m: m.group(1) + as_of, html, count=1)
    if b != 1:
        print("warning: snapshot badge not found; array updated, date left as-is",
              file=sys.stderr)

    with open(args.dashboard, "w", encoding="utf-8") as fh:
        fh.write(html)

    print("Refreshed {} sites into {} (as of {}).".format(len(rows), args.dashboard, as_of))


if __name__ == "__main__":
    main()
