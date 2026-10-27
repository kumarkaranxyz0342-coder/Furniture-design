
#!/usr/bin/env python3
"""
Woodcraft Studio backend.

Features:
- Serves the website's HTML, CSS, JavaScript and images.
- Stores customer reviews in SQLite.
- Stores customer design submissions in SQLite.
- Provides a password-protected owner dashboard.
- Protects the designs API with server-side authentication.

Admin setup in PowerShell:
    $secure = Read-Host "Enter admin password" -AsSecureString
    $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
    python server.py

Open:
    Website:   http://localhost:8000
    Dashboard: http://localhost:8000/admin

For local development. Do not expose this basic HTTP authentication
setup to the public internet without HTTPS, CSRF protection and
a more complete production security review.
"""

import base64
import datetime
import json
import os
import secrets
import sqlite3

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
from html import escape as E


ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "studio.db")
PORT = 8000
MAX_BODY = 8 * 1024 * 1024  # 8 MB


SEED_REVIEWS = [
    (
        "Ahmed Raza", "Lahore", 5,
        "Ordered a walnut dining table through the sketch tool. "
        "The workshop matched my drawing exactly — beautiful finish.",
        "Sep 2026"
    ),
    (
        "Fatima Khan", "Karachi", 5,
        "The 3D preview helped me explain what I wanted. "
        "Pine bookshelf arrived sturdy and well made.",
        "Aug 2026"
    ),
    (
        "Bilal Hussain", "Islamabad", 4,
        "Got a set of four oak chairs. Solid joinery and fair price. "
        "Delivery took a few extra days but worth it.",
        "Aug 2026"
    ),
    (
        "Ayesha Malik", "Lahore", 5,
        "Designed a kids bed with my daughter — she loved drawing it "
        "herself! Great experience and quality.",
        "Jul 2026"
    ),
]


# ---------------------------------------------------------
# ADMIN AUTHENTICATION
# ---------------------------------------------------------

def require_admin(handler):
    """
    Verify HTTP Basic Authentication using a server-side password.

    The password is never read from site.js, the URL, or the request body.
    """

    expected = os.environ.get("ADMIN_PASSWORD")

    # Never allow admin access when no password is configured.
    if not expected:
        handler._send(
            503,
            json.dumps({
                "ok": False,
                "error": "Admin access is not configured."
            })
        )
        return False

    auth = handler.headers.get("Authorization", "")
    scheme, _, encoded = auth.partition(" ")

    if scheme.lower() == "basic" and encoded:
        try:
            decoded = base64.b64decode(
                encoded,
                validate=True
            ).decode("utf-8")

            username, separator, password = decoded.partition(":")

            if (
                separator
                and username == "admin"
                and secrets.compare_digest(password, expected)
            ):
                return True

        except (ValueError, UnicodeDecodeError):
            pass

    handler.send_response(401)
    handler.send_header(
        "WWW-Authenticate",
        'Basic realm="Woodcraft Admin"'
    )
    handler.send_header("Content-Length", "0")
    handler.end_headers()

    return False


# ---------------------------------------------------------
# DATABASE
# ---------------------------------------------------------

def db():
    con = sqlite3.connect(DB)

    con.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            city TEXT,
            rating INTEGER,
            text TEXT,
            date TEXT,
            created TEXT
        )
    """)

    con.execute("""
        CREATE TABLE IF NOT EXISTS designs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT,
            material TEXT,
            dims TEXT,
            strokes TEXT,
            thumb TEXT,
            date TEXT,
            created TEXT
        )
    """)

    # Add sample reviews only when the table is empty.
    if con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0:
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

        con.executemany(
            """
            INSERT INTO reviews
                (name, city, rating, text, date, created)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (name, city, rating, text, date, now)
                for name, city, rating, text, date in SEED_REVIEWS
            ]
        )

    con.commit()
    return con


# ---------------------------------------------------------
# REQUEST HANDLER
# ---------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):

    # ---------- response helper ----------

    def _send(
        self,
        code,
        body="",
        ctype="application/json; charset=utf-8"
    ):
        if isinstance(body, str):
            body = body.encode("utf-8")

        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")

        # Retained for compatibility with the existing frontend.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization"
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )

        self.end_headers()

        if body:
            self.wfile.write(body)

    # ---------- request body ----------

    def _json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except (ValueError, TypeError):
            return None

        if length <= 0 or length > MAX_BODY:
            return None

        raw = self.rfile.read(length)

        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    # ---------- static-file protection ----------

    def _is_protected_file(self, url_path):
        """
        Prevent static access to source code, databases, environment
        files and hidden directories such as .git.
        """

        path = unquote(url_path)
        parts = path.replace("\\", "/").split("/")
        parts = [part for part in parts if part]

        for part in parts:
            lower = part.lower()

            if part.startswith("."):
                return True

            if lower in {
                "server.py",
                "studio.db",
                "studio.db-journal",
                "studio.db-wal",
                "studio.db-shm",
            }:
                return True

            if lower.endswith((".py", ".pyc", ".pyo", ".db", ".sqlite", ".sqlite3")):
                return True

            if lower == ".env":
                return True

        return False

    # ---------- OPTIONS ----------

    def do_OPTIONS(self):
        self._send(204)

    # ---------- GET ----------

    def do_GET(self):
        u = urlparse(self.path)

        # Never serve backend source, database files or hidden files.
        if self._is_protected_file(u.path):
            self._send(
                404,
                json.dumps({
                    "ok": False,
                    "error": "Not found"
                })
            )
            return

        # Public reviews API.
        if u.path == "/api/reviews":
            con = db()

            rows = con.execute(
                """
                SELECT id, name, city, rating, text, date
                FROM reviews
                ORDER BY id DESC
                """
            ).fetchall()

            con.close()

            output = [
                {
                    "id": row[0],
                    "name": row[1],
                    "city": row[2],
                    "rating": row[3],
                    "text": row[4],
                    "date": row[5]
                }
                for row in rows
            ]

            self._send(200, json.dumps(output))
            return

        # Protected designs API.
        if u.path == "/api/designs":
            if not require_admin(self):
                return

            con = db()

            rows = con.execute(
                """
                SELECT id, name, type, material, dims,
                       strokes, thumb, date, created
                FROM designs
                ORDER BY id DESC
                """
            ).fetchall()

            con.close()

            output = []

            for row in rows:
                try:
                    dims = json.loads(row[4] or "{}")
                    strokes = json.loads(row[5] or "[]")
                except (json.JSONDecodeError, TypeError):
                    dims = {}
                    strokes = []

                output.append({
                    "id": row[0],
                    "name": row[1],
                    "type": row[2],
                    "material": row[3],
                    "dims": dims,
                    "strokes": strokes,
                    "thumb": row[6],
                    "date": row[7],
                    "created": row[8]
                })

            self._send(200, json.dumps(output))
            return

        # Protected owner dashboard.
        if u.path == "/admin":
            self._admin(u)
            return

        # Everything else is served as a website file.
        return super().do_GET()

    # ---------- POST ----------

    def do_POST(self):
        u = urlparse(self.path)

        # Only accept POST requests to known API endpoints.
        if u.path not in ("/api/reviews", "/api/designs"):
            self._send(
                404,
                json.dumps({
                    "ok": False,
                    "error": "Unknown API path"
                })
            )
            return

        data = self._json_body()

        if not isinstance(data, dict):
            self._send(
                400,
                json.dumps({
                    "ok": False,
                    "error": "Bad or missing JSON body"
                })
            )
            return

        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

        # Public review submissions.
        if u.path == "/api/reviews":
            name = str(data.get("name", "")).strip()[:80]
            city = str(data.get("city", "")).strip()[:80]
            text = str(data.get("text", "")).strip()[:2000]

            try:
                rating = int(data.get("rating", 0))
            except (TypeError, ValueError):
                rating = 0

            rating = max(1, min(5, rating))

            if not name or not text:
                self._send(
                    400,
                    json.dumps({
                        "ok": False,
                        "error": "Name and review text are required"
                    })
                )
                return

            date = (
                str(data.get("date", "")).strip()[:40]
                or datetime.datetime.now().strftime("%b %Y")
            )

            con = db()

            cur = con.execute(
                """
                INSERT INTO reviews
                    (name, city, rating, text, date, created)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, city, rating, text, date, now)
            )

            con.commit()
            review_id = cur.lastrowid
            con.close()

            self._send(
                201,
                json.dumps({
                    "ok": True,
                    "review": {
                        "id": review_id,
                        "name": name,
                        "city": city,
                        "rating": rating,
                        "text": text,
                        "date": date
                    }
                })
            )
            return

        # Public customer design submissions.
        # This endpoint remains public for compatibility with the Studio.
        if u.path == "/api/designs":
            name = (
                str(data.get("name", "")).strip()[:120]
                or "Untitled design"
            )

            design_type = str(data.get("type", "")).strip()[:20]
            material = str(data.get("material", "")).strip()[:20]

            dims = {
                key: data.get(key, 0)
                for key in ("w", "d", "h", "s", "t")
            }

            strokes = data.get("strokes", [])

            if not isinstance(strokes, list):
                self._send(
                    400,
                    json.dumps({
                        "ok": False,
                        "error": "Strokes must be a list"
                    })
                )
                return

            thumb = str(data.get("thumb", ""))[:400000]
            date = str(data.get("date", "")).strip()[:40] or now[:10]

            con = db()

            con.execute(
                """
                INSERT INTO designs
                    (name, type, material, dims, strokes,
                     thumb, date, created)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    design_type,
                    material,
                    json.dumps(dims),
                    json.dumps(strokes)[:900000],
                    thumb,
                    date,
                    now
                )
            )

            con.commit()
            con.close()

            self._send(201, json.dumps({"ok": True}))
            return

    # -----------------------------------------------------
    # OWNER DASHBOARD
    # -----------------------------------------------------

    def _admin(self, u):
        if not require_admin(self):
            return

        query = parse_qs(u.query)
        con = db()

        # NOTE: These legacy deletion links use GET.
        # Replace them with authenticated POST requests and CSRF
        # protection before deploying this dashboard publicly.
        try:
            if "del_review" in query:
                review_id = int(query["del_review"][0])

                con.execute(
                    "DELETE FROM reviews WHERE id = ?",
                    (review_id,)
                )
                con.commit()

            if "del_design" in query:
                design_id = int(query["del_design"][0])

                con.execute(
                    "DELETE FROM designs WHERE id = ?",
                    (design_id,)
                )
                con.commit()

        except (ValueError, IndexError):
            pass

        reviews = con.execute(
            """
            SELECT id, name, city, rating, text, date, created
            FROM reviews
            ORDER BY id DESC
            """
        ).fetchall()

        designs = con.execute(
            """
            SELECT id, name, type, material, dims,
                   thumb, date, created
            FROM designs
            ORDER BY id DESC
            """
        ).fetchall()

        con.close()

        def stars(rating):
            rating = max(0, min(5, int(rating or 0)))
            return "★" * rating + "☆" * (5 - rating)

        # Review table.
        review_html = "".join(
            (
                "<tr>"
                "<td>{}</td>"
                "<td><b>{}</b><br><small>{}</small></td>"
                '<td class="st">{}</td>'
                "<td>{}</td>"
                "<td><small>{}</small></td>"
                '<td><a href="/admin?del_review={}" '
                'onclick="return confirm(\'Delete this review?\')">'
                "🗑</a></td>"
                "</tr>"
            ).format(
                row[0],
                E(row[1] or ""),
                E(row[2] or ""),
                stars(row[3]),
                E(row[4] or ""),
                E(row[5] or row[6] or ""),
                row[0]
            )
            for row in reviews
        ) or '<tr><td colspan="6">No reviews yet.</td></tr>'

        # Design table.
        design_html = "".join(
            (
                "<tr>"
                "<td>{}</td>"
                "<td>{}</td>"
                "<td><b>{}</b></td>"
                "<td>{}</td>"
                "<td>{}</td>"
                "<td><small>{}</small></td>"
                "<td><small>{} · {}</small></td>"
                '<td><a href="/admin?del_design={}" '
                'onclick="return confirm(\'Delete this design?\')">'
                "🗑</a></td>"
                "</tr>"
            ).format(
                row[0],
                (
                    '<img class="th" src="' + E(row[5]) + '">'
                    if row[5] else "—"
                ),
                E(row[1] or ""),
                E(row[2] or ""),
                E(row[3] or ""),
                E((row[4] or "").replace('"', "&quot;")),
                E(row[6] or ""),
                E(row[7] or ""),
                row[0]
            )
            for row in designs
        ) or (
            '<tr><td colspan="8">No customer designs yet. '
            'They appear here when customers press “Save design”.'
            "</td></tr>"
        )

        page = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workshop dashboard</title>
<style>
body {
    font-family: system-ui, sans-serif;
    margin: 0;
    background: #faf6f0;
    color: #2a211a;
    padding: 28px 5vw;
}
h1 { font-size: 1.5rem; }
h2 { margin-top: 34px; }
table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
}
td, th {
    border: 1px solid #e5dccf;
    padding: 8px 10px;
    text-align: left;
    font-size: .9rem;
    vertical-align: top;
}
th { background: #9a5b2e; color: #fff; }
.st { color: #e9a23b; white-space: nowrap; }
.th {
    width: 110px;
    border-radius: 6px;
    border: 1px solid #e5dccf;
}
a { color: #9a5b2e; }
.badge {
    background: #f1e8da;
    padding: 4px 12px;
    border-radius: 14px;
    font-size: .8rem;
}
.table-wrap { overflow-x: auto; }
</style>
</head>
<body>
<h1>🪵 Workshop dashboard</h1>
<p>
    <span class="badge">@@ND@@ designs</span>
    <span class="badge">@@NR@@ reviews</span>
    &nbsp; <a href="/">← open website</a>
</p>

<h2>Customer designs</h2>
<p>
    New designs appear here automatically when a customer presses
    <b>Save design</b> in the Studio.
</p>
<div class="table-wrap">
<table>
<tr>
    <th>#</th><th>Sketch</th><th>Name</th><th>Type</th>
    <th>Material</th><th>Size (cm)</th><th>Date</th><th></th>
</tr>
@@DESIGNS@@
</table>
</div>

<h2>Reviews</h2>
<div class="table-wrap">
<table>
<tr>
    <th>#</th><th>Customer</th><th>Rating</th>
    <th>Review</th><th>Date</th><th></th>
</tr>
@@REVIEWS@@
</table>
</div>
</body>
</html>
"""

        page = (
            page.replace("@@ND@@", str(len(designs)))
                .replace("@@NR@@", str(len(reviews)))
                .replace("@@DESIGNS@@", design_html)
                .replace("@@REVIEWS@@", review_html)
        )

        self._send(
            200,
            page,
            "text/html; charset=utf-8"
        )

    # ---------- quieter console ----------

    def log_message(self, fmt, *args):
        line = fmt % args

        if (
            "/api/" in line
            or "/admin" in line
            or " 404 " in line
            or " 500 " in line
        ):
            super().log_message(fmt, *args)


# ---------------------------------------------------------
# START SERVER
# ---------------------------------------------------------

if __name__ == "__main__":
    os.chdir(ROOT)

    # Create database and tables.
    con = db()
    con.close()

    print("=" * 60)
    print("  Woodcraft Studio website + backend running!")
    print("  Website:   http://localhost:%d" % PORT)
    print("  Dashboard: http://localhost:%d/admin" % PORT)
    print("  (Stop with Ctrl+C)")
    print("=" * 60)

    # Local development: listen only on this computer.
    ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        Handler
    ).serve_forever()
