#!/usr/bin/env python3

import html
import json
import re
import urllib.request
from pathlib import Path


API_URL = "https://raspi.kubabin.dev/suggest/api/suggestions"
SITE_URL = "https://kubabin.dev"
REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "suggest"


def safe_slug(value):
    slug = re.sub(r"[^a-z0-9-]+", "-", str(value).lower()).strip("-")
    return slug[:200]


def escape(value):
    return html.escape(str(value or ""), quote=True)


request = urllib.request.Request(
    API_URL,
    headers={"User-Agent": "Assembly-Line-SMP-Pages/1.0"},
)
with urllib.request.urlopen(request, timeout=20) as response:
    payload = json.load(response)

suggestions = payload.get("suggestions", [])
for suggestion in suggestions:
    slug = safe_slug(suggestion.get("modrinth_slug") or suggestion.get("id"))
    if not slug:
        continue

    title = suggestion.get("title") or slug
    description = suggestion.get("description") or "View this mod suggestion from Assembly Line SMP."
    icon = suggestion.get("icon_url") or ""
    canonical = f"{SITE_URL}/suggest/{slug}"
    og_image = f'<meta property="og:image" content="{escape(icon)}">' if icon else ""
    twitter_image = f'<meta name="twitter:image" content="{escape(icon)}">' if icon else ""

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(title)} — Suggest a Mod</title>
<meta name="description" content="{escape(description[:300])}">
<link rel="canonical" href="{escape(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Assembly Line SMP">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(description[:300])}">
<meta property="og:url" content="{escape(canonical)}">
{og_image}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description[:300])}">
{twitter_image}
</head>
<body>
<script>
window.location.replace("/suggest/suggestion.html?slug={escape(slug)}");
</script>
</body>
</html>
"""
    (OUTPUT_DIR / slug).write_text(page, encoding="utf-8")

print(f"Generated {len(suggestions)} suggestion social pages")
