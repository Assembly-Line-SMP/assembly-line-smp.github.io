#!/usr/bin/env python3
"""
LOCAL TEST SERVER ONLY.

This is not used in production — the real site is static and deployed to
GitHub Pages from the website/ folder in this repo (see
.github/workflows/static.yml). This script just lets you preview both
season folders locally before pushing.

Serves two site variants on one process:
  /s1/...  -> website/s1 (unchanged content/URLs)
  /s2/...  -> website/s2 (season 2 URLs)

"/" serves website/index.html, a landing page with two buttons
(Season 1 / Season 2) whose background crossfades between
backgrounds/default.jpg, backgrounds/season1.jpg, and
backgrounds/season2.jpg on hover (see landing.css / landing.js).

s1's tab scripts call bare "/api/..." paths (unchanged from production,
where the site is at domain root). Locally, since s1 lives under /s1/,
this server infers the calling site from the Referer header so those
bare calls still get proxied correctly during local testing.
"""

import http.server
import mimetypes
import os
import socketserver
import urllib.error
import urllib.request
from pathlib import Path


base_dir = Path(__file__).parent
PORT = 8000

SITES = {
    "s1": {
        "dir": base_dir / "s1",
        "chat_url": "https://api.kubabin.dev/chat",
        "analytics_base": "https://raspi.kubabin.dev/api",
    },
    "s2": {
        "dir": base_dir / "s2",
        "chat_url": "https://api.season2.kubabin.dev/chat",
        # Season 2 analytics are served through the same raspi.kubabin.dev
        # host, but under an /s2 prefix, so the reverse proxy / FastAPI
        # instance backed by the season 2 database (see main.py) can be
        # routed independently from season 1's analytics API.
        "analytics_base": "https://raspi.kubabin.dev/api/s2",
    },
}

ANALYTICS_TABLES = {
    "daily_player_peaks",
    "global_player_peaks",
    "player_count_samples",
    "player_stats",
}


class LiveChatHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self._route(method="GET")

    def do_POST(self):
        self._route(method="POST")

    def do_PATCH(self):
        self._route(method="PATCH")

    def do_DELETE(self):
        self._route(method="DELETE")

    def _route(self, method):
        request_path = self.path.split("?", 1)[0]

        if method != "GET":
            # Only /suggest/api/* and /suggest/auth/* accept non-GET
            # requests (voting, submitting suggestions, admin actions).
            # Everything else in this project is GET-only.
            if request_path.startswith("/suggest/api/") or request_path.startswith("/suggest/auth/"):
                self.serve_generic_proxy(f"https://raspi.kubabin.dev{self.path}", method=method)
            else:
                self.send_error(405, "Method not allowed")
            return

        self.do_GET_routed(request_path)

    def do_GET_routed(self, request_path):
        if request_path == "/":
            self.serve_root_static_file("/index.html")
            return

        # Landing page assets (index.html, landing.css, landing.js,
        # backgrounds/*) live at the repo root, shared across s1 and s2.
        if request_path in {"/landing.css", "/landing.js"} or request_path.startswith("/backgrounds/"):
            self.serve_root_static_file(request_path)
            return

        # Bare "/s1" or "/s2" (no trailing slash) breaks relative asset
        # paths in the page, so redirect to the slashed form. Same for
        # /suggest and /suggest/admin.
        if request_path in {"/s1", "/s2", "/suggest", "/suggest/admin"}:
            self.send_response(302)
            self.send_header("Location", request_path + "/")
            self.end_headers()
            return

        # /suggest/api/* and /suggest/auth/* are the mod-suggestion
        # backend, served by main.py on the Pi. Locally, suggest.js calls
        # them at "/suggest/api"/"/suggest/auth" (see its API_BASE /
        # AUTH_BASE localhost branch), so this server must proxy those
        # through to raspi.kubabin.dev rather than serve them as files.
        if request_path.startswith("/suggest/api/") or request_path.startswith("/suggest/auth/"):
            self.serve_generic_proxy(f"https://raspi.kubabin.dev{self.path}", method="GET")
            return

        # /suggest itself (the page, its CSS/JS, and the admin panel) is a
        # plain static site — just serve its files.
        if request_path == "/suggest/" or request_path.startswith("/suggest/"):
            self.serve_suggest_static_file(request_path)
            return

        # s1's tab scripts call bare "/api/..." (unchanged from production
        # where the site lives at domain root). Locally that request has
        # no /s1 or /s2 prefix, so infer which site called it from Referer.
        if request_path == "/api/chat" or request_path.startswith("/api/"):
            site = self._site_from_referer()
            if site is None:
                self.send_error(404, "Unknown site (no Referer)")
                return
            if request_path == "/api/chat":
                self.serve_chat_proxy(site)
            else:
                table_name = request_path[len("/api/"):]
                if table_name in ANALYTICS_TABLES:
                    self.serve_analytics_proxy(site, table_name)
                else:
                    self.send_error(404, "Unknown API table")
            return

        site_id, remainder = self._split_site(request_path)
        if site_id is None:
            self.send_error(404, "Unknown site")
            return

        site = SITES[site_id]

        if remainder == "/api/chat":
            self.serve_chat_proxy(site)
            return

        if remainder.startswith("/api/"):
            table_name = remainder[len("/api/"):]
            if table_name in ANALYTICS_TABLES:
                self.serve_analytics_proxy(site, table_name)
                return
            self.send_error(404, "Unknown API table")
            return

        self.serve_static_file(site, remainder)

    def _site_from_referer(self):
        referer = self.headers.get("Referer", "")
        for site_id in SITES:
            if f"/{site_id}/" in referer:
                return SITES[site_id]
        return None

    @staticmethod
    def _split_site(request_path):
        """Split '/s1/foo/bar' into ('s1', '/foo/bar')."""
        parts = request_path.split("/", 2)
        # parts[0] is '' because request_path starts with '/'
        if len(parts) < 2 or parts[1] not in SITES:
            return None, None
        remainder = "/" + parts[2] if len(parts) > 2 else "/"
        return parts[1], remainder

    def serve_suggest_static_file(self, request_path):
        """Serve website/suggest/... (and website/suggest/admin/...) as
        plain static files, mirroring how GitHub Pages will serve them."""
        suggest_dir = base_dir / "suggest"
        remainder = request_path[len("/suggest"):] or "/"
        if remainder == "/":
            target_path = suggest_dir / "index.html"
        elif remainder == "/admin/":
            target_path = suggest_dir / "admin" / "index.html"
        else:
            target_path = suggest_dir / remainder.lstrip("/")

        try:
            target_path = target_path.resolve()
            target_path.relative_to(suggest_dir.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not target_path.exists() or not target_path.is_file():
            self.send_error(404, "File not found")
            return

        mime_type, _ = mimetypes.guess_type(str(target_path))
        if mime_type is None:
            mime_type = "application/octet-stream"

        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(target_path.stat().st_size))
        self.end_headers()

        with target_path.open("rb") as file_obj:
            self.wfile.write(file_obj.read())

    def serve_root_static_file(self, request_path):
        """Serve files that live at website/ root (e.g. /backgrounds/*),
        shared across both s1 and s2, not inside either site folder."""
        target_path = base_dir / request_path.lstrip("/")

        try:
            target_path = target_path.resolve()
            target_path.relative_to(base_dir.resolve())
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not target_path.exists() or not target_path.is_file():
            self.send_error(404, "File not found")
            return

        mime_type, _ = mimetypes.guess_type(str(target_path))
        if mime_type is None:
            mime_type = "application/octet-stream"

        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(target_path.stat().st_size))
        self.end_headers()

        with target_path.open("rb") as file_obj:
            self.wfile.write(file_obj.read())

    def serve_static_file(self, site, remainder):
        site_dir = site["dir"]
        if remainder in {"", "/"}:
            target_path = site_dir / "index.html"
        else:
            target_path = site_dir / remainder.lstrip("/")

        # Prevent escaping the site directory.
        try:
            target_path = target_path.resolve()
            site_dir_resolved = site_dir.resolve()
            target_path.relative_to(site_dir_resolved)
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not target_path.exists() or not target_path.is_file():
            self.send_error(404, "File not found")
            return

        mime_type, _ = mimetypes.guess_type(str(target_path))
        if mime_type is None:
            mime_type = "application/octet-stream"

        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(target_path.stat().st_size))
        self.end_headers()

        with target_path.open("rb") as file_obj:
            self.wfile.write(file_obj.read())

    def serve_generic_proxy(self, url, method="GET"):
        """Proxy any /suggest/api/* or /suggest/auth/* request to the real
        backend on raspi.kubabin.dev, forwarding method, body, cookies,
        and auth headers, and relaying Set-Cookie back to the browser."""
        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        forward_headers = {"User-Agent": "Mozilla/5.0"}
        for header_name in ("Content-Type", "Cookie", "Authorization"):
            value = self.headers.get(header_name)
            if value:
                forward_headers[header_name] = value

        try:
            req = urllib.request.Request(
                url, data=body, headers=forward_headers, method=method
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                response_body = response.read()
                self.send_response(response.status)
                for header_name, header_value in response.getheaders():
                    if header_name.lower() in ("content-length", "connection", "transfer-encoding"):
                        continue
                    self.send_header(header_name, header_value)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
        except urllib.error.HTTPError as exc:
            error_body = exc.read()
            try:
                self.send_response(exc.code)
                for header_name, header_value in exc.headers.items():
                    if header_name.lower() in ("content-length", "connection", "transfer-encoding"):
                        continue
                    self.send_header(header_name, header_value)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(error_body)))
                self.end_headers()
                self.wfile.write(error_body)
            except (BrokenPipeError, ConnectionResetError):
                return
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            error_body = str(exc).encode("utf-8")
            try:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(error_body)))
                self.end_headers()
                self.wfile.write(error_body)
            except (BrokenPipeError, ConnectionResetError):
                return

    def serve_chat_proxy(self, site):
        try:
            req = urllib.request.Request(
                site["chat_url"],
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            error_body = str(exc).encode("utf-8")
            try:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(error_body)))
                self.end_headers()
                self.wfile.write(error_body)
            except (BrokenPipeError, ConnectionResetError):
                return

    def serve_analytics_proxy(self, site, table_name):
        try:
            req = urllib.request.Request(
                f"{site['analytics_base']}/{table_name}",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                body = response.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            error_body = str(exc).encode("utf-8")
            try:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(error_body)))
                self.end_headers()
                self.wfile.write(error_body)
            except (BrokenPipeError, ConnectionResetError):
                return


print(f"Serving s1 from: {SITES['s1']['dir']}")
print(f"Serving s2 from: {SITES['s2']['dir']}")
print(f"Starting server at http://localhost:{PORT} (routes: /s1/ and /s2/)")
print("Press Ctrl+C to stop the server")

try:
    with socketserver.TCPServer(("", PORT), LiveChatHandler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
