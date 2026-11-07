#!/usr/bin/env python3
"""Write feed.xml: an Atom feed of the latest releases of the apps on index.html.

Run from the repo root after an evening release:  python3 _tools/make-feed.py
Needs the gh CLI (signed in). Jekyll leaves _tools/ out of the published site.
"""
import html, json, re, subprocess, sys
from datetime import datetime, timezone

SITE = "https://wanderthe.dev/"
OWNER = "wanderwildwood"
KEEP = 60  # entries in the feed

page = open("index.html", encoding="utf-8").read()

# repo -> app name, from each card's h4 and its Download/Source link
names = {}
for card in re.split(r'<div class="app[ "]', page)[1:]:
    h4 = re.search(r"<h4>(.*?)(?:<button|<span|</h4>)", card, re.S)
    repo = re.search(rf"github\.com/{OWNER}/([^/\"]+)", card)
    if h4 and repo:
        names.setdefault(repo.group(1), html.unescape(re.sub("<[^>]+>", "", h4.group(1))).strip())
if len(names) < 40:
    sys.exit(f"only found {len(names)} apps in index.html; refusing to write a short feed")

entries = []
for repo, name in names.items():
    out = subprocess.run(
        ["gh", "api", f"repos/{OWNER}/{repo}/releases?per_page=5"],
        capture_output=True, text=True, check=True).stdout
    for r in json.loads(out):
        if r["draft"] or r["prerelease"] or not r.get("published_at"):
            continue
        entries.append((r["published_at"], repo, name, r))

if not entries:
    sys.exit("no releases found; refusing to write an empty feed")
entries.sort(key=lambda e: e[0], reverse=True)
entries = entries[:KEEP]

x = html.escape
lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    "  <title>wander 彷徨う: releases</title>",
    f'  <link href="{SITE}"/>',
    f'  <link rel="self" href="{SITE}feed.xml"/>',
    f"  <id>{SITE}feed.xml</id>",
    f"  <updated>{entries[0][0]}</updated>",
    "  <author><name>wander wildwood</name></author>",
]
for when, repo, name, r in entries:
    version = r["tag_name"].lstrip("v")
    lines += [
        "  <entry>",
        f"    <title>{x(name)} {x(version)}</title>",
        f'    <link href="{x(r["html_url"])}"/>',
        f"    <id>{x(r['html_url'])}</id>",
        f"    <updated>{when}</updated>",
        f'    <content type="text">{x((r.get("body") or "").strip())}</content>',
        "  </entry>",
    ]
lines.append("</feed>")
open("feed.xml", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"feed.xml: {len(entries)} entries from {len(names)} apps, newest {entries[0][0]}")
