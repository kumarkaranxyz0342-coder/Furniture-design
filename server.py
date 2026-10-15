#!/usr/bin/env python3
"""
Woodcraft Studio backend — pure Python 3, NOTHING to install.

It does two jobs:
  1. serves the website files (HTML/CSS/JS), exactly like Live Server
  2. adds a small database API (SQLite file studio.db) so that:
       - reviews are stored centrally (all visitors, not just one browser)
       - every design a customer saves also arrives in YOUR database
       - you can open a private owner dashboard at /admin?key=YOUR_KEY

The admin key is read from site.js -> SITE.adminKey, so you only need to edit it there.

Run it:   python server.py      (then open http://localhost:8000)
Dashboard: http://localhost:8000/admin?key=workshop123   (change the key in site.js!)
"""
import json, re, sqlite3, os, datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from html import escape as E

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, 'studio.db')
PORT = 8000
MAX_BODY = 8 * 1024 * 1024  # 8 MB safety limit for uploads (designs include thumbnails)

SEED_REVIEWS = [
    ('Ahmed Raza', 'Lahore', 5, 'Ordered a walnut dining table through the sketch tool. The workshop matched my drawing exactly — beautiful finish.', 'Sep 2026'),
    ('Fatima Khan', 'Karachi', 5, 'The 3D preview helped me explain what I wanted. Pine bookshelf arrived sturdy and well made.', 'Aug 2026'),
    ('Bilal Hussain', 'Islamabad', 4, 'Got a set of four oak chairs. Solid joinery and fair price. Delivery took a few extra days but worth it.', 'Aug 2026'),
    ('Ayesha Malik', 'Lahore', 5, 'Designed a kids bed with my daughter — she loved drawing it herself! Great experience and quality.', 'Jul 2026'),
]

def admin_key():
    """Single source of truth: SITE.adminKey inside site.js"""
    try:
        src = open(os.path.join(ROOT, 'site.js'), encoding='utf-8').read()
        m = re.search(r'adminKey:\s*"([^"]+)"', src)
        if m and m.group(1):
            return m.group(1)
    except Exception:
        pass
    return 'workshop123'

def db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS reviews(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, city TEXT, rating INTEGER, text TEXT, date TEXT, created TEXT)""")
    con.execute("""CREATE TABLE IF NOT EXISTS designs(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, type TEXT, material TEXT, dims TEXT,
        strokes TEXT, thumb TEXT, date TEXT, created TEXT)""")
    if con.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 0:
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
        con.executemany("INSERT INTO reviews(name,city,rating,text,date,created) VALUES(?,?,?,?,?,?)",
                        [(n, c, r, t, d, now) for n, c, r, t, d in SEED_REVIEWS])
    con.commit()
    return con

class Handler(SimpleHTTPRequestHandler):
    # ---------- helpers ----------
    def _send(self, code, body='', ctype='application/json; charset=utf-8'):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _json_body(self):
        try:
            n = int(self.headers.get('Content-Length', 0) or 0)
        except ValueError:
            return None
        if n <= 0 or n > MAX_BODY:
            return None
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return None

    def _key_ok(self, query):
        return parse_qs(query).get('key', [''])[0] == admin_key()

    # ---------- API + pages ----------
    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        u = urlparse(self.path)

        if u.path == '/api/reviews':
            con = db()
            rows = con.execute(
                "SELECT id,name,city,rating,text,date FROM reviews ORDER BY id DESC").fetchall()
            con.close()
            out = [{'id': r[0], 'name': r[1], 'city': r[2], 'rating': r[3],
                    'text': r[4], 'date': r[5]} for r in rows]
            self._send(200, json.dumps(out))
            return

        if u.path == '/api/designs':
            if not self._key_ok(u.query):
                self._send(401, json.dumps({'ok': False, 'error': 'wrong or missing key'}))
                return
            con = db()
            rows = con.execute(
                "SELECT id,name,type,material,dims,strokes,thumb,date,created FROM designs ORDER BY id DESC").fetchall()
            con.close()
            out = [{'id': r[0], 'name': r[1], 'type': r[2], 'material': r[3],
                    'dims': json.loads(r[4] or '{}'), 'strokes': json.loads(r[5] or '[]'),
                    'thumb': r[6], 'date': r[7], 'created': r[8]} for r in rows]
            self._send(200, json.dumps(out))
            return

        if u.path == '/admin':
            self._admin(u)
            return

        # everything else: static website files
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        data = self._json_body()
        if data is None:
            self._send(400, json.dumps({'ok': False, 'error': 'bad or missing JSON body'}))
            return
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

        if u.path == '/api/reviews':
            name = str(data.get('name', '')).strip()[:80]
            city = str(data.get('city', '')).strip()[:80]
            text = str(data.get('text', '')).strip()[:2000]
            try:
                rating = int(data.get('rating', 0))
            except (TypeError, ValueError):
                rating = 0
            rating = max(1, min(5, rating))
            if not name or not text:
                self._send(400, json.dumps({'ok': False, 'error': 'name and text required'}))
                return
            date = str(data.get('date', '')).strip()[:40] or datetime.datetime.now().strftime('%b %Y')
            con = db()
            cur = con.execute(
                "INSERT INTO reviews(name,city,rating,text,date,created) VALUES(?,?,?,?,?,?)",
                (name, city, rating, text, date, now))
            con.commit()
            rid = cur.lastrowid
            con.close()
            self._send(201, json.dumps({'ok': True,
                'review': {'id': rid, 'name': name, 'city': city, 'rating': rating, 'text': text, 'date': date}}))
            return

        if u.path == '/api/designs':
            name = str(data.get('name', '')).strip()[:120] or 'Untitled design'
            dtype = str(data.get('type', '')).strip()[:20]
            material = str(data.get('material', '')).strip()[:20]
            dims = {k: data.get(k, 0) for k in ('w', 'd', 'h', 's', 't')}
            strokes = data.get('strokes', [])
            thumb = str(data.get('thumb', ''))[:400000]
            date = str(data.get('date', '')).strip()[:40] or now[:10]
            con = db()
            con.execute(
                "INSERT INTO designs(name,type,material,dims,strokes,thumb,date,created) VALUES(?,?,?,?,?,?,?,?)",
                (name, dtype, material, json.dumps(dims), json.dumps(strokes)[:900000], thumb, date, now))
            con.commit()
            con.close()
            self._send(201, json.dumps({'ok': True}))
            return

        self._send(404, json.dumps({'ok': False, 'error': 'unknown API path'}))

    # ---------- owner dashboard ----------
    def _admin(self, u):
        if not self._key_ok(u.query):
            self._send(401, '<h2 style="font-family:sans-serif">401 — wrong key.</h2>'
                            '<p style="font-family:sans-serif">Open /admin?key=YOUR_KEY '
                            '(the key is SITE.adminKey in site.js)</p>', 'text/html; charset=utf-8')
            return
        q = parse_qs(u.query)
        key = admin_key()
        con = db()
        # simple delete links: /admin?key=..&del_review=ID / &del_design=ID
        try:
            if 'del_review' in q:
                con.execute("DELETE FROM reviews WHERE id=?", (int(q['del_review'][0]),))
                con.commit()
            if 'del_design' in q:
                con.execute("DELETE FROM designs WHERE id=?", (int(q['del_design'][0]),))
                con.commit()
        except ValueError:
            pass
        reviews = con.execute("SELECT id,name,city,rating,text,date,created FROM reviews ORDER BY id DESC").fetchall()
        designs = con.execute("SELECT id,name,type,material,dims,thumb,date,created FROM designs ORDER BY id DESC").fetchall()
        con.close()

        def stars(n):
            return '★' * int(n) + '☆' * (5 - int(n))

        rhtml = ''.join(
            '<tr><td>{}</td><td><b>{}</b><br><small>{}</small></td><td class="st">{}</td>'
            '<td>{}</td><td><small>{}</small></td>'
            '<td><a href="/admin?key={}&del_review={}" onclick="return confirm(\'Delete this review?\')">🗑</a></td></tr>'.format(
                r[0], E(r[1]), E(r[2] or ''), stars(r[3]), E(r[4]), E(r[5] or r[6]), key, r[0])
            for r in reviews) or '<tr><td colspan="6">No reviews yet.</td></tr>'

        dhtml = ''.join(
            '<tr><td>{}</td><td>{}</td><td><b>{}</b></td><td>{}</td><td>{}</td>'
            '<td><small>{}</small></td><td><small>{} · {}</small></td>'
            '<td><a href="/admin?key={}&del_design={}" onclick="return confirm(\'Delete this design?\')">🗑</a></td></tr>'.format(
                d[0], ('<img class="th" src="' + E(d[5]) + '">') if d[5] else '—',
                E(d[1]), E(d[2]), E(d[3]), E(d[4].replace('"', '&quot;')), E(d[6] or ''), E(d[7] or ''), key, d[0])
            for d in designs) or '<tr><td colspan="8">No customer designs yet. They appear here when customers press “Save design”.</td></tr>'

        page = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workshop dashboard</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#faf6f0;color:#2a211a;padding:28px 5vw}
h1{font-size:1.5rem} h2{margin-top:34px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}
td,th{border:1px solid #e5dccf;padding:8px 10px;text-align:left;font-size:.9rem;vertical-align:top}
th{background:#9a5b2e;color:#fff}
.st{color:#e9a23b;white-space:nowrap}
.th{width:110px;border-radius:6px;border:1px solid #e5dccf}
a{color:#9a5b2e}
.badge{background:#f1e8da;padding:4px 12px;border-radius:14px;font-size:.8rem}
</style></head><body>
<h1>🪵 Workshop dashboard</h1>
<p><span class="badge">@@ND@@ designs</span> <span class="badge">@@NR@@ reviews</span> &nbsp; <a href="/">← open website</a></p>
<h2>Customer designs</h2>
<p>New designs appear here automatically when a customer presses <b>Save design</b> in the Studio.</p>
<table><tr><th>#</th><th>Sketch</th><th>Name</th><th>Type</th><th>Material</th><th>Size (cm)</th><th>Date</th><th></th></tr>@@DESIGNS@@</table>
<h2>Reviews</h2>
<table><tr><th>#</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th><th></th></tr>@@REVIEWS@@</table>
</body></html>"""
        page = (page.replace('@@ND@@', str(len(designs)))
                    .replace('@@NR@@', str(len(reviews)))
                    .replace('@@DESIGNS@@', dhtml)
                    .replace('@@REVIEWS@@', rhtml))
        self._send(200, page, 'text/html; charset=utf-8')

    # quieter console (keep one line per request, minus the noise of static thumbs)
    def log_message(self, fmt, *args):
        line = fmt % args
        if '/api/' in line or '/admin' in line or ' 404 ' in line or ' 500 ' in line:
            super().log_message(fmt, *args)

if __name__ == '__main__':
    os.chdir(ROOT)
    db().close()
    print('=' * 60)
    print('  Woodcraft Studio website + backend running!')
    print('  Website:   http://localhost:%d' % PORT)
    print('  Dashboard: http://localhost:%d/admin?key=%s' % (PORT, admin_key()))
    print('  (Stop with Ctrl+C)')
    print('=' * 60)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
