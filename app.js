(() => {
  const $ = s => document.querySelector(s);
  const cv = $('#sketch'), ctx = cv.getContext('2d');
  const CW = cv.width, CH = cv.height;

  // ---------- data ----------
  const MATERIALS = {
    oak:    { label: 'Oak',         color: '#c8a06a', rough: 0.7 },
    walnut: { label: 'Walnut',      color: '#5b3a29', rough: 0.6 },
    pine:   { label: 'Pine',        color: '#e0c28a', rough: 0.8 },
    teak:   { label: 'Teak',        color: '#a0693a', rough: 0.6 },
    steel:  { label: 'Black steel', color: '#2b2b2b', rough: 0.35 }
  };
  const TYPES = {
    table: { w: 140, d: 80,  h: 75 },
    chair: { w: 45,  d: 48,  h: 90 },
    shelf: { w: 90,  d: 30,  h: 180 },
    bed:   { w: 160, d: 200, h: 100 }
  };
  const LABEL = { table: 'Table', chair: 'Chair', shelf: 'Bookshelf', bed: 'Bed' };
  const SEGKINDS = ['line', 'horizontal line', 'polyline', 'rectangle'];
  const BRUSHES = ['pencil', 'brush', 'marker', 'calligraphy', 'airbrush', 'crayon', 'watercolor'];
  const SHAPES = ['line', 'rectangle', 'rounded', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'star', 'arrow'];
  const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
                   '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'];

  // objects: {id, kind, pts:[{x,y}], closed, color, size, brush, fill?, noStroke?, assist?}
  // text objects: {id, kind:'text', pts:[], x, y, text, fs, color}
  let strokes = [], cur = null, sel = null, drag = null;
  let tool = 'pencil', c1 = '#2a211a', c2 = '#f3d9b1', slot = 1;
  let bg = '#ffffff', bgImg = null, zoom = 1, idc = Date.now();
  let hist = [], redoSt = [], autoFit = true, sizeEdit = false, rbT = null;

  // ---------- UI setup ----------
  const matSel = $('#material');
  Object.entries(MATERIALS).forEach(([k, m]) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = m.label; matSel.appendChild(o);
  });

  const sl = { w: $('#w'), d: $('#d'), h: $('#h'), s: $('#s'), t: $('#t') };
  const out = { w: $('#wOut'), d: $('#dOut'), h: $('#hOut'), s: $('#sOut'), t: $('#tOut') };
  function syncLabels() { for (const k in sl) out[k].textContent = sl[k].value; }
  function applyDefaults() {
    const t = TYPES[$('#type').value];
    sl.w.value = t.w; sl.d.value = t.d; sl.h.value = t.h;
    syncLabels();
  }
  applyDefaults();

  function say(msg) { $('#status').textContent = msg; }

  function setTool(t) {
    tool = t;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    cv.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
    if (t !== 'select' && sel) { sel = null; draw(); }
  }
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));

  // colours
  function setColor(c, s, noApply) {
    if (s === 2) c2 = c; else c1 = c;
    $('#c1box').style.background = c1;
    $('#c2box').style.background = c2;
    if (/^#[0-9a-f]{6}$/i.test(c)) $('#custom').value = c;
    if (sel && !noApply) {
      pushHist();
      if (s === 2) { if (sel.closed) sel.fill = c; } else sel.color = c;
      draw();
    }
  }
  function setSlot(n) {
    slot = n;
    $('#c1box').classList.toggle('active', n === 1);
    $('#c2box').classList.toggle('active', n === 2);
  }
  $('#c1box').onclick = () => setSlot(1);
  $('#c2box').onclick = () => setSlot(2);
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = c; b.title = c + ' (right-click = Color 2)';
    b.onclick = () => setColor(c, slot);
    b.oncontextmenu = e => { e.preventDefault(); setColor(c, 2); };
    $('#palette').appendChild(b);
  });
  $('#custom').onchange = e => setColor(e.target.value, slot);

  // size
  $('#size').oninput = () => {
    const v = +$('#size').value;
    $('#sizeOut').textContent = v;
    if (sel) {
      if (!sizeEdit) { pushHist(); sizeEdit = true; }
      if (sel.kind === 'text') sel.fs = Math.max(14, v * 3 + 8); else sel.size = v;
      draw();
    }
  };
  $('#size').onchange = () => { sizeEdit = false; };

  // buttons
  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;
  $('#delBtn').onclick = deleteSel;
  $('#clearBtn').onclick = () => {
    pushHist(); strokes = []; bgImg = null; sel = null;
    draw(); detect(); rebuildLive(); say('Canvas cleared.');
  };
  $('#type').onchange = () => { applyDefaults(); autoFit = true; if ($('#mode').value === 'exact') syncSize(); draw(); build(); };
  $('#mode').onchange = () => { autoFit = true; if ($('#mode').value === 'exact') syncSize(); build(); };
  matSel.onchange = build;
  $('#guide').onchange = () => draw();
  $('#gridChk').onchange = () => draw();
  $('#dims').onchange = () => build();
  $('#v3d').onclick = () => setView('3d');
  $('#v2d').onclick = () => setView('2d');
  sl.w.oninput = () => { autoFit = false; syncLabels(); build(); };
  sl.h.oninput = () => { syncLabels(); if ($('#mode').value === 'exact' && autoFit) syncSize(); build(); };
  ['d', 's', 't'].forEach(k => sl[k].oninput = () => { syncLabels(); build(); });
  $('#completeBtn').onclick = completeSketch;
  $('#pngBtn').onclick = savePng;
  $('#rotBtn').onclick = () => {
    if (!strokes.length) return;
    const B = bboxAll(), cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
    transformAll(p => ({ x: CW / 2 - (p.y - cy), y: CH / 2 + (p.x - cx) }));
  };
  $('#flipHBtn').onclick = () => {
    if (!strokes.length) return;
    const B = bboxAll(), cx = (B.x0 + B.x1) / 2;
    transformAll(p => ({ x: 2 * cx - p.x, y: p.y }));
  };
  $('#flipVBtn').onclick = () => {
    if (!strokes.length) return;
    const B = bboxAll(), cy = (B.y0 + B.y1) / 2;
    transformAll(p => ({ x: p.x, y: 2 * cy - p.y }));
  };
  $('#zoomIn').onclick = () => setZoom(zoom + 0.25);
  $('#zoomOutBtn').onclick = () => setZoom(zoom - 0.25);
  $('#zoomReset').onclick = () => setZoom(1);
  $('#wrap').addEventListener('wheel', e => {
    if (e.ctrlKey) { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.15 : -0.15)); }
  }, { passive: false });
  function setZoom(z) {
    zoom = Math.max(0.5, Math.min(4, z));
    cv.style.width = (zoom * 100) + '%';
  }

  // open a picture to trace over
  $('#openImg').onclick = () => $('#imgFile').click();
  $('#imgFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => { bgImg = im; draw(); say('Picture added. Trace over it, then press Build 3D.'); };
      im.src = r.result;
    };
    r.readAsDataURL(f); e.target.value = '';
  };

  function savePng() {
    draw({ clean: true });
    const a = document.createElement('a');
    a.download = 'my-sketch.png'; a.href = cv.toDataURL('image/png'); a.click();
    draw();
  }

  // keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input[type=text], input:not([type]), textarea')) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (ctrl && k === 's') { e.preventDefault(); savePng(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { e.preventDefault(); deleteSel(); } }
    else if (e.key === 'Escape') { sel = null; draw(); }
  });

  // ---------- history (undo / redo) ----------
  const snap = () => JSON.stringify({ strokes, bg });
  function pushHist() { hist.push(snap()); if (hist.length > 80) hist.shift(); redoSt = []; }
  function restore(str) {
    const d = JSON.parse(str);
    strokes = d.strokes; bg = d.bg || '#ffffff'; sel = null;
    draw(); detect(); rebuildLive();
  }
  function undo() {
    if (!hist.length) { say('Nothing to undo.'); return; }
    redoSt.push(snap()); restore(hist.pop()); say('Undone.');
  }
  function redo() {
    if (!redoSt.length) { say('Nothing to redo.'); return; }
    hist.push(snap()); restore(redoSt.pop()); say('Redone.');
  }
  function deleteSel() {
    if (!sel) { say('Select something first (Select tool).'); return; }
    pushHist(); strokes = strokes.filter(o => o !== sel); sel = null;
    draw(); detect(); rebuildLive();
  }

  // ---------- geometry helpers ----------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pathLen = p => p.reduce((s, q, i) => i ? s + dist(p[i - 1], q) : 0, 0);
  const bbox = p => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };
  function nearest(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (!l2) return a;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  function smooth(p) {
    if (p.length < 5) return p;
    return p.map((q, i) => {
      if (i === 0 || i === p.length - 1) return q;
      let sx = 0, sy = 0, n = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(p.length - 1, i + 2); j++) { sx += p[j].x; sy += p[j].y; n++; }
      return { x: sx / n, y: sy / n };
    });
  }
  // Douglas-Peucker: reduce a wobbly path to its real corners
  function dp(pts, eps) {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let idx = 0, max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], nearest(pts[i], a, b));
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps) {
      const l = dp(pts.slice(0, idx + 1), eps), r = dp(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [a, b];
  }
  function axisSnap(p) {
    const q = [{ x: p[0].x, y: p[0].y }];
    for (let i = 1; i < p.length; i++) {
      const a = q[i - 1], b = { x: p[i].x, y: p[i].y };
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      if (dy < dx * 0.25) b.y = a.y; else if (dx < dy * 0.25) b.x = a.x;
      q.push(b);
    }
    return q;
  }
  function snapPoint(p) {
    let best = null, bd = 16;
    strokes.forEach(s => (s.pts || []).forEach(q => { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }));
    if (!best) {
      strokes.forEach(s => {
        if (!SEGKINDS.includes(s.kind)) return;
        for (let i = 0; i < s.pts.length - 1; i++) {
          const q = nearest(p, s.pts[i], s.pts[i + 1]), d = dist(p, q);
          if (d < bd) { bd = d; best = q; }
        }
      });
    }
    return best ? { x: best.x, y: best.y } : p;
  }
  function inPoly(p, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  function segDist(p, pts, closed) {
    if (pts.length === 1) return dist(p, pts[0]);
    let m = 1e9;
    for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, dist(p, nearest(p, pts[i], pts[i + 1])));
    if (closed && pts.length > 2) m = Math.min(m, dist(p, nearest(p, pts[pts.length - 1], pts[0])));
    return m;
  }
  function textBox(o) {
    const fs = o.fs || 20;
    return { x0: o.x, y0: o.y, x1: o.x + o.text.length * fs * 0.55, y1: o.y + fs * 1.2 };
  }
  function hit(o, p, r, inside) {
    if (o.kind === 'text') { const b = textBox(o); return p.x >= b.x0 - r && p.x <= b.x1 + r && p.y >= b.y0 - r && p.y <= b.y1 + r; }
    if (!o.pts || !o.pts.length) return false;
    if (inside && o.closed && inPoly(p, o.pts)) return true;
    return segDist(p, o.pts, o.closed) <= r + (o.size || 3) / 2;
  }
  function pick(p, inside) {
    for (let i = strokes.length - 1; i >= 0; i--) if (hit(strokes[i], p, 6, inside)) return strokes[i];
    return null;
  }
  function translateObj(o, dx, dy) {
    if (o.kind === 'text') { o.x += dx; o.y += dy; }
    else if (o.pts) o.pts = o.pts.map(q => ({ x: q.x + dx, y: q.y + dy }));
  }
  function bboxAll() {
    const pts = strokes.flatMap(s => s.pts || []).concat(strokes.filter(s => s.kind === 'text').map(s => ({ x: s.x, y: s.y })));
    return bbox(pts);
  }
  function transformAll(fn) {
    pushHist();
    strokes.forEach(o => {
      if (o.pts) o.pts = o.pts.map(fn);
      if (o.kind === 'text') { const q = fn({ x: o.x, y: o.y }); o.x = q.x; o.y = q.y; }
    });
    draw(); detect(); rebuildLive();
  }

  // ---------- understand ONE stroke ----------
  function recognize(pts) {
    const len = pathLen(pts), b = bbox(pts), diag = Math.hypot(b.w, b.h);
    if (len < 15) return { pts, kind: 'dot' };
    const closed = dist(pts[0], pts[pts.length - 1]) < 0.2 * len;

    if (closed && b.w > 20 && b.h > 20) {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = b.w / 2, ry = b.h / 2;
      const eErr = pts.reduce((s, p) => s + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0) / pts.length;
      if (eErr < 0.12) {
        const e = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; e.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); }
        return { pts: e, kind: 'circle' };
      }
      const m = Math.min(b.w, b.h);
      const rErr = pts.reduce((s, p) => s + Math.min(Math.abs(p.x - b.x0), Math.abs(p.x - b.x1), Math.abs(p.y - b.y0), Math.abs(p.y - b.y1)), 0) / pts.length / m;
      if (rErr < 0.1) {
        return { pts: [{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1},{x:b.x0,y:b.y0}], kind: 'rectangle' };
      }
      const poly = dp(pts.concat([pts[0]]), Math.max(6, diag * 0.06));
      if (poly.length <= 8) return { pts: poly, kind: 'shape' };
      const s = smooth(pts); s.push(s[0]);
      return { pts: s, kind: 'shape' };
    }

    if (dist(pts[0], pts[pts.length - 1]) / len > 0.88) {
      const a = pts[0], z = pts[pts.length - 1];
      const dx = Math.abs(z.x - a.x), dy = Math.abs(z.y - a.y);
      const snapped = axisSnap([a, z]);
      return { pts: snapped, kind: dy < dx * 0.25 ? 'horizontal line' : 'line' };
    }

    const simp = dp(pts, Math.max(6, diag * 0.07));
    if (simp.length >= 3 && simp.length <= 6) return { pts: axisSnap(simp), kind: 'polyline' };
    return { pts: smooth(pts), kind: 'curve' };
  }

  // ---------- understand the WHOLE sketch ----------
  function merge(list, k, a0, a1, tol) {
    const outList = [];
    list.forEach(s => {
      const m = outList.find(o => Math.abs(o[k] - s[k]) < tol && s[a0] <= o[a1] + 30 && s[a1] >= o[a0] - 30);
      if (m) { m[a0] = Math.min(m[a0], s[a0]); m[a1] = Math.max(m[a1], s[a1]); m[k] = (m[k] + s[k]) / 2; }
      else outList.push(Object.assign({}, s));
    });
    return outList;
  }
  function parts() {
    const Hs = [], Vs = [];
    strokes.forEach(s => {
      if (!SEGKINDS.includes(s.kind)) return;
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = s.pts[i], b = s.pts[i + 1];
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        if (dy <= dx * 0.2 && dx > 8) Hs.push({ y: (a.y + b.y) / 2, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
        else if (dx <= dy * 0.2 && dy > 8) Vs.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
      }
    });
    return { H: merge(Hs, 'y', 'x0', 'x1', 18), V: merge(Vs, 'x', 'y0', 'y1', 18) };
  }

  function analyze() {
    const all = strokes.flatMap(s => s.pts || []);
    if (all.length < 4) return null;
    const B = bbox(all);
    if (B.w < 40 && B.h < 40) return null;
    const { H, V } = parts();
    const aspect = B.w / Math.max(B.h, 1);

    // bookshelf: two tall sides + stacked horizontals
    const tallV = V.filter(v => v.y1 - v.y0 > B.h * 0.6);
    const spanH = H.filter(h => h.x1 - h.x0 > B.w * 0.6);
    const frame = spanH.some(h => h.y - B.y0 < B.h * 0.15) && spanH.some(h => B.y1 - h.y < B.h * 0.15);
    if (aspect < 1.6 && tallV.length >= 2 && spanH.length >= 2 && (spanH.length >= 3 || frame)) {
      return { type: 'shelf', B, H, V, count: spanH.length, reason: spanH.length + ' shelf levels' };
    }

    // seat / top / bed frame: the widest horizontal (topmost if tied)
    const wide = H.filter(h => h.x1 - h.x0 > B.w * 0.35);
    if (!wide.length) return null;
    const maxW = Math.max(...wide.map(h => h.x1 - h.x0));
    const slab = wide.filter(h => h.x1 - h.x0 > maxW * 0.9).sort((a, b) => a.y - b.y)[0];
    const topFrac = (slab.y - B.y0) / Math.max(B.h, 1);
    const inRange = v => v.x >= slab.x0 - 25 && v.x <= slab.x1 + 25;
    const backAbove = V.filter(v => inRange(v) && slab.y - v.y0 > B.h * 0.25).length;
    const legsBelow = V.filter(v => inRange(v) && v.y1 - slab.y > B.h * 0.2).length;

    if (backAbove >= 1 && legsBelow >= 1) {
      return aspect > 1.5
        ? { type: 'bed', B, H, V, slab, backAbove, legsBelow, reason: 'wide frame with a headboard' }
        : { type: 'chair', B, H, V, slab, backAbove, legsBelow, reason: 'seat, back and legs' };
    }
    if (backAbove >= 1 && legsBelow === 0 && topFrac > 0.55 && aspect > 1.5) {
      return { type: 'bed', B, H, V, slab, backAbove, legsBelow, reason: 'low frame with a headboard' };
    }
    if (legsBelow >= 1) {
      return { type: 'table', B, H, V, slab, backAbove, legsBelow, reason: 'flat top with ' + legsBelow + ' leg' + (legsBelow > 1 ? 's' : '') };
    }
    return null;
  }

  function detect() {
    const a = analyze(), el = $('#detected');
    if (!a) { el.textContent = 'Detected: keep drawing…'; return; }
    el.textContent = 'Detected: ' + LABEL[a.type] + ' (' + a.reason + ')';
    if ($('#auto').checked && $('#type').value !== a.type) {
      $('#type').value = a.type;
      if ($('#mode').value === 'template') { applyDefaults(); build(); }
      else { sl.d.value = TYPES[a.type].d; syncLabels(); }
    }
  }

  // ---------- "Complete my sketch": the software draws missing parts ----------
  function completeSketch() {
    const a = analyze();
    if (!a) { say('Draw a flat top or a frame first, so I know what to complete.'); return; }
    const { type, B, H, V } = a;
    pushHist();
    let added = 0;
    const add = (p, q) => {
      strokes.push({ id: idc++, kind: 'line', pts: [p, q], closed: false, color: '#b8743a', size: 3, brush: 'brush', assist: true });
      added++;
    };
    if (type === 'shelf') {
      if (!V.some(v => Math.abs(v.x - B.x0) < 24)) add({ x: B.x0, y: B.y0 }, { x: B.x0, y: B.y1 });
      if (!V.some(v => Math.abs(v.x - B.x1) < 24)) add({ x: B.x1, y: B.y0 }, { x: B.x1, y: B.y1 });
      const n = Math.max(4, H.length);
      for (let i = 0; i < n; i++) {
        const y = B.y0 + i * (B.y1 - B.y0) / (n - 1);
        if (!H.some(h => Math.abs(h.y - y) < 24)) add({ x: B.x0, y }, { x: B.x1, y });
      }
    } else {
      const slab = a.slab, width = slab.x1 - slab.x0;
      const ground = Math.min(CH - 10, Math.max(B.y1, slab.y + Math.max(70, width * 0.35)));
      const inset = Math.min(20, width * 0.06);
      [slab.x0 + inset, slab.x1 - inset].forEach(x => {
        if (!V.some(v => Math.abs(v.x - x) < 24 && v.y1 - slab.y > 20)) add({ x, y: slab.y }, { x, y: ground });
      });
    }
    if (!added) hist.pop();
    draw(); detect(); rebuildLive();
    say(added ? 'I added ' + added + ' missing part' + (added > 1 ? 's' : '') + ' (drawn in brown). Press Undo to remove them.' : 'Your sketch already looks complete!');
  }

  // ---------- creating objects ----------
  function style() {
    return { color: c1, size: +$('#size').value, brush: BRUSHES.includes(tool) ? tool : 'brush' };
  }
  function mk(kind, pts, closed) {
    const fm = $('#fillmode').value;
    const o = Object.assign({ id: idc++, kind: kind, pts: pts, closed: !!closed }, style());
    if (closed && fm !== 'outline') o.fill = c2;
    if (closed && fm === 'fill') o.noStroke = true;
    return o;
  }

  function poly(n, x0, y0, x1, y1, rot) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, res = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i * 2 * Math.PI / n;
      res.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return res;
  }
  function shapePts(t, a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (t === 'line' || t === 'arrow') { if (dist(a, b) < 4) return null; }
    else if (w < 4 || h < 4) return null;
    switch (t) {
      case 'line': return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
      case 'rectangle': return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1},{x:x0,y:y0}];
      case 'rounded': {
        const r = Math.min(w, h) * 0.2, res = [];
        [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]].forEach(c => {
          for (let k = 0; k <= 6; k++) {
            const ang = c[2] + k * (Math.PI / 2) / 6;
            res.push({ x: c[0] + r * Math.cos(ang), y: c[1] + r * Math.sin(ang) });
          }
        });
        return res;
      }
      case 'ellipse': {
        const res = [];
        for (let i = 0; i <= 48; i++) { const an = i / 48 * 2 * Math.PI; res.push({ x: cx + w / 2 * Math.cos(an), y: cy + h / 2 * Math.sin(an) }); }
        return res;
      }
      case 'triangle': return [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: cx, y: y0 }];
      case 'rtriangle': return [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }];
      case 'diamond': return [{ x: cx, y: y0 }, { x: x1, y: cy }, { x: cx, y: y1 }, { x: x0, y: cy }];
      case 'pentagon': return poly(5, x0, y0, x1, y1, -Math.PI / 2);
      case 'hexagon': return poly(6, x0, y0, x1, y1, 0);
      case 'star': {
        const res = [];
        for (let i = 0; i < 10; i++) {
          const an = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? 0.4 : 1;
          res.push({ x: cx + k * w / 2 * Math.cos(an), y: cy + k * h / 2 * Math.sin(an) });
        }
        return res;
      }
      case 'arrow': {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 14 + (+$('#size').value) * 2;
        const h1 = { x: b.x - L * Math.cos(ang - 0.5), y: b.y - L * Math.sin(ang - 0.5) };
        const h2 = { x: b.x - L * Math.cos(ang + 0.5), y: b.y - L * Math.sin(ang + 0.5) };
        return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, h1, { x: b.x, y: b.y }, h2];
      }
    }
    return null;
  }
  function makeShape(t, a, b, commit) {
    const pts = shapePts(t, a, b);
    if (!pts) return null;
    if (t === 'line') {
      let p = pts.map(q => ({ x: q.x, y: q.y }));
      if ($('#snap').checked) {
        if (commit) { p[0] = snapPoint(p[0]); p[1] = snapPoint(p[1]); }
        p = axisSnap(p);
      }
      return mk('line', p, false);
    }
    if (t === 'arrow') return mk('arrow', pts, false);
    if (t === 'rectangle') return mk('rectangle', pts, true);
    if (t === 'ellipse') return mk('circle', pts, true);
    return mk('shape', pts, true);
  }
  function constrain(a, b, shift) {
    if (!shift) return b;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (tool === 'line' || tool === 'arrow') {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d };
    }
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
  }

  // ---------- Paint-style tools: fill, pick, text, erase ----------
  function doFill(p) {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const o = strokes[i];
      if (o.closed && o.pts && inPoly(p, o.pts)) {
        pushHist(); o.fill = c1; draw(); say('Shape filled.'); return;
      }
    }
    pushHist(); bg = c1; draw(); say('Background colour changed.');
  }
  function doPick(p) {
    const o = pick(p, true);
    let col = bg;
    if (o) col = (o.closed && o.fill && o.pts && inPoly(p, o.pts)) ? o.fill : (o.color || c1);
    setColor(col, slot, true);
    say('Colour picked: ' + col);
  }
  function doText(p) {
    const t = window.prompt('Type your text:');
    if (!t) return;
    pushHist();
    strokes.push({ id: idc++, kind: 'text', pts: [], text: t, x: p.x, y: p.y, fs: Math.max(14, (+$('#size').value) * 3 + 8), color: c1 });
    draw();
  }
  function eraseAt(p) {
    const keep = strokes.filter(o => !hit(o, p, 8, false));
    if (keep.length !== strokes.length) {
      if (cur && !cur.pushed) { pushHist(); cur.pushed = true; }
      strokes = keep;
      if (sel && !strokes.includes(sel)) sel = null;
      draw();
    }
  }

  // ---------- pointer events ----------
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * CH / r.height };
  }
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (tool === 'eraser') { cur = { erasing: true, pushed: false }; eraseAt(p); return; }
    if (tool === 'fill') { doFill(p); return; }
    if (tool === 'picker') { doPick(p); return; }
    if (tool === 'text') { doText(p); return; }
    if (tool === 'select') {
      sel = pick(p, true);
      drag = sel ? { last: p, pushed: false } : null;
      draw();
      say(sel ? 'Selected. Drag to move it, press Delete to remove it.' : 'Click a shape to select it.');
      return;
    }
    if (SHAPES.includes(tool)) { cur = { shape: true, s0: p, p: p }; return; }
    cur = { pts: [p], id: idc++ };
  });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    $('#coords').textContent = Math.round(p.x) + ', ' + Math.round(p.y) + ' px   |   ' + CW + ' × ' + CH + ' px   |   ' + Math.round(zoom * 100) + '%';
    if (drag && sel) {
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y;
      if (!drag.pushed && (dx || dy)) { pushHist(); drag.pushed = true; }
      translateObj(sel, dx, dy); drag.last = p; draw();
      return;
    }
    if (!cur) return;
    if (cur.erasing) { eraseAt(p); return; }
    if (cur.shape) { cur.p = constrain(cur.s0, p, e.shiftKey); draw(); return; }
    cur.pts.push(p); draw();
  });
  function finish() {
    if (drag) { drag = null; detect(); rebuildLive(); return; }
    if (!cur) return;
    const c = cur; cur = null;
    if (c.erasing) { draw(); detect(); rebuildLive(); return; }
    if (c.shape) {
      const o = makeShape(tool, c.s0, c.p, true);
      if (o) { pushHist(); strokes.push(o); }
      draw(); detect(); rebuildLive();
      return;
    }
    if (c.pts.length > 1) {
      let obj = null;
      if ($('#snap').checked) {
        const r = recognize(c.pts);
        if (r.kind === 'dot') { draw(); return; }
        let p = r.pts;
        const closed = ['rectangle', 'circle', 'shape'].includes(r.kind);
        if (['line', 'horizontal line', 'polyline'].includes(r.kind)) {
          p = p.map(q => ({ x: q.x, y: q.y }));
          p[0] = snapPoint(p[0]); p[p.length - 1] = snapPoint(p[p.length - 1]);
          p = axisSnap(p);
        }
        obj = mk(r.kind, p, closed);
        say('I read that as: ' + r.kind + '.');
      } else {
        obj = mk('free', c.pts, false);
      }
      pushHist(); strokes.push(obj);
    }
    draw(); detect(); rebuildLive();
  }
  cv.addEventListener('pointerup', finish);
  cv.addEventListener('pointercancel', finish);

  // ---------- drawing ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function resample(pts, step) {
    const res = [];
    if (!pts.length) return res;
    res.push(pts[0]);
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = dist(a, b);
      if (!d) continue;
      let ps = step - carry;
      while (ps <= d) { const t = ps / d; res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); ps += step; }
      carry = d - (ps - step);
    }
    return res;
  }
  function trace(pts, closed) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    if (closed) ctx.closePath();
  }
  function renderObj(o) {
    const col = o.color || '#2a211a', sz = o.size || 3, br = o.brush || 'brush';
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.kind === 'text') {
      ctx.fillStyle = col; ctx.font = (o.fs || 20) + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
      ctx.fillText(o.text, o.x, o.y);
      ctx.restore(); return;
    }
    const pts = o.pts;
    if (!pts || !pts.length) { ctx.restore(); return; }
    if (o.closed && o.fill) { trace(pts, true); ctx.fillStyle = o.fill; ctx.fill(); }
    if (!o.noStroke) {
      ctx.strokeStyle = col; ctx.fillStyle = col;
      if (br === 'pencil') {
        ctx.lineWidth = Math.max(1, sz * 0.5); trace(pts, o.closed); ctx.stroke();
      } else if (br === 'marker') {
        ctx.globalAlpha = 0.5; ctx.lineWidth = sz * 1.8; ctx.lineCap = 'square'; trace(pts, o.closed); ctx.stroke();
      } else if (br === 'calligraphy') {
        ctx.lineWidth = 1.5;
        const w = Math.max(2, sz);
        for (let k = -w / 2; k <= w / 2; k += 1) {
          ctx.save(); ctx.translate(k * 0.7, -k * 0.7); trace(pts, o.closed); ctx.stroke(); ctx.restore();
        }
      } else if (br === 'airbrush') {
        const r = rng(o.id || 1), rad = sz * 2.2;
        ctx.globalAlpha = 0.5;
        resample(pts, 3).forEach(p => {
          for (let i = 0; i < Math.ceil(rad * 0.9); i++) {
            const an = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
            ctx.fillRect(p.x + Math.cos(an) * d, p.y + Math.sin(an) * d, 1.4, 1.4);
          }
        });
      } else if (br === 'crayon') {
        const r = rng(o.id || 1);
        ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, sz * 0.45);
        for (let k = 0; k < 4; k++) {
          ctx.save(); ctx.translate((r() - 0.5) * sz * 0.7, (r() - 0.5) * sz * 0.7);
          trace(pts, o.closed); ctx.stroke(); ctx.restore();
        }
      } else if (br === 'watercolor') {
        ctx.globalAlpha = 0.18;
        for (let k = 1; k <= 3; k++) { ctx.lineWidth = sz * (1 + k * 0.7); trace(pts, o.closed); ctx.stroke(); }
      } else {
        ctx.lineWidth = sz; trace(pts, o.closed); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function bboxOf(o) {
    if (o.kind === 'text') return textBox(o);
    const b = bbox(o.pts); return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  }
  function drawSel(o) {
    if (o.kind !== 'text' && (!o.pts || !o.pts.length)) return;
    const b = bboxOf(o);
    ctx.save();
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.x0 - 6, b.y0 - 6, b.x1 - b.x0 + 12, b.y1 - b.y0 + 12);
    ctx.restore();
  }

  function drawGuide() {
    const t = $('#type').value;
    ctx.save();
    ctx.strokeStyle = 'rgba(154,91,46,.28)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.fillStyle = 'rgba(154,91,46,.35)'; ctx.font = '15px system-ui';
    const L = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (t === 'table') { ctx.strokeRect(150, 170, 500, 40); L(190, 210, 190, 430); L(610, 210, 610, 430); }
    if (t === 'chair') { ctx.strokeRect(280, 280, 240, 30); L(290, 310, 290, 440); L(510, 310, 510, 440); L(290, 280, 290, 110); L(510, 280, 510, 110); L(290, 110, 510, 110); }
    if (t === 'shelf') { ctx.strokeRect(250, 60, 300, 400); L(250, 160, 550, 160); L(250, 260, 550, 260); L(250, 360, 550, 360); }
    if (t === 'bed') { ctx.strokeRect(120, 280, 560, 60); ctx.strokeRect(120, 150, 40, 190); L(160, 340, 160, 420); L(640, 340, 640, 420); }
    ctx.setLineDash([]);
    ctx.fillText('Guide: sketch over this (front view). No need to be exact.', 20, 30);
    ctx.restore();
  }

  function draw(opts) {
    opts = opts || {};
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    if (bgImg) {
      const s = Math.min(CW / bgImg.width, CH / bgImg.height), w = bgImg.width * s, h = bgImg.height * s;
      ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(bgImg, (CW - w) / 2, (CH - h) / 2, w, h); ctx.restore();
    }
    if (!opts.clean && $('#gridChk').checked) {
      ctx.save(); ctx.strokeStyle = '#e6e6e6'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= CW; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, CH); }
      for (let y = 0; y <= CH; y += 40) { ctx.moveTo(0, y); ctx.lineTo(CW, y); }
      ctx.stroke(); ctx.restore();
    }
    if (!opts.clean && $('#guide').checked) drawGuide();
    strokes.forEach(o => renderObj(o));
    if (cur) {
      if (cur.pts) renderObj(Object.assign({ id: cur.id, kind: 'free', pts: cur.pts, closed: false }, style()));
      else if (cur.shape) { const o = makeShape(tool, cur.s0, cur.p, false); if (o) renderObj(o); }
    }
    if (!opts.clean && sel) drawSel(sel);
  }

  // ---------- sketch -> 3D sizes ----------
  function syncSize() {
    const pts = strokes.flatMap(s => s.pts || []);
    if (pts.length < 2) return;
    const B = bbox(pts);
    if (B.w < 3 && B.h < 3) return;
    if (B.h < B.w * 0.15) {
      const w = +sl.w.value;
      sl.h.value = Math.max(10, Math.round(w * B.h / Math.max(B.w, 1)));
    } else {
      const h = +sl.h.value;
      sl.w.value = Math.max(10, Math.min(400, Math.round(h * B.w / B.h)));
    }
    syncLabels();
  }
  function fitFromSketch() {
    const pts = strokes.flatMap(s => s.pts || []);
    if (!pts.length) { say('Draw something first. Using default size.'); return; }
    const b = bbox(pts);
    if (b.h < 10) return;
    const type = $('#type').value, base = TYPES[type];
    const ratio = b.w / b.h;
    let width = Math.max(30, Math.min(250, Math.round(base.h * ratio)));
    if (type === 'chair') width = Math.max(40, Math.min(60, Math.round(width / 2)));
    sl.w.value = width; sl.h.value = base.h; sl.d.value = base.d;
    if (type === 'shelf') {
      const a = analyze();
      sl.s.value = Math.max(2, Math.min(6, a && a.type === 'shelf' ? a.count : 3));
    }
    syncLabels();
    say('Template built from your sketch proportions ' + ratio.toFixed(2) + ':1.');
  }
  function rebuildLive() {
    clearTimeout(rbT);
    rbT = setTimeout(() => {
      if ($('#mode').value === 'exact' && autoFit) syncSize();
      build();
    }, 60);
  }
  $('#buildBtn').onclick = () => {
    autoFit = true;
    if ($('#mode').value === 'exact') {
      if (!strokes.some(s => s.pts && s.pts.length > 1)) { say('Draw something first, then press Build 3D.'); return; }
      syncSize(); build();
      say('3D built from exactly what you drew. Use Height, Depth and Thickness to adjust it.');
    } else {
      fitFromSketch(); build();
    }
  };

  // ---------- 3D ----------
  const viewer = $('#viewer');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 800 / 520, 1, 3000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  viewer.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(200, 400, 250); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: 0xd8cbb7, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  let model = null, rotY = -0.6, rotX = 0.25, camDist = 320;

  function resize() {
    const w = viewer.clientWidth, h = viewer.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewer); resize();

  // ---------- 3D / 2D view toggle ----------
  const canvas2d = $('#view2d');
  let viewMode = '3d';
  function setView(v) {
    viewMode = v;
    $('#v3d').classList.toggle('active', v === '3d');
    $('#v2d').classList.toggle('active', v === '2d');
    viewer.style.display = v === '3d' ? 'block' : 'none';
    canvas2d.style.display = v === '2d' ? 'block' : 'none';
    if (v === '2d') draw2D();
  }

  // Workshop-style 2D drawing of the sketch with real measurements in cm
  function draw2D() {
    const g = canvas2d.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, canvas2d.width, canvas2d.height);
    const items = strokes.filter(s => s.pts && s.pts.length > 1);
    if (!items.length) {
      g.fillStyle = '#7a6c5f'; g.font = '20px system-ui'; g.textAlign = 'center';
      g.fillText('Draw a sketch first to see the 2D working drawing.', canvas2d.width / 2, canvas2d.height / 2);
      g.textAlign = 'start';
      return;
    }
    const B = bbox(items.flatMap(s => s.pts));
    const pad = 80;
    const sc = Math.min((canvas2d.width - 2 * pad) / Math.max(B.w, 1), (canvas2d.height - 2 * pad) / Math.max(B.h, 1));
    const offx = pad + ((canvas2d.width - 2 * pad) - B.w * sc) / 2 - B.x0 * sc;
    const offy = pad + ((canvas2d.height - 2 * pad) - B.h * sc) / 2 - B.y0 * sc;
    const M = p => ({ x: offx + p.x * sc, y: offy + p.y * sc });

    // the drawing itself
    g.lineJoin = 'round'; g.lineCap = 'round';
    items.forEach(o => {
      g.beginPath();
      o.pts.map(M).forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
      if (o.closed) g.closePath();
      if (o.closed && o.fill) { g.save(); g.globalAlpha = 0.25; g.fillStyle = o.fill; g.fill(); g.restore(); }
      g.strokeStyle = '#2a211a'; g.lineWidth = 2; g.stroke();
    });
    strokes.filter(s => s.kind === 'text').forEach(o => {
      const p = M({ x: o.x, y: o.y });
      g.fillStyle = o.color || '#2a211a'; g.font = Math.max(10, (o.fs || 20) * sc) + 'px system-ui';
      g.textBaseline = 'top'; g.fillText(o.text, p.x, p.y);
    });

    // dimension lines in cm
    const W3 = +sl.w.value, H3 = +sl.h.value, Dv = +sl.d.value, T = +sl.t.value;
    const x1 = offx + B.x0 * sc, x2 = offx + B.x1 * sc, y1 = offy + B.y0 * sc, y2 = offy + B.y1 * sc;
    g.strokeStyle = '#9a5b2e'; g.fillStyle = '#9a5b2e'; g.lineWidth = 1.5;
    g.font = '17px system-ui'; g.textAlign = 'center';
    const dimLine = (ax, ay, bx, by) => {
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      [[ax, ay], [bx, by]].forEach(([x, y]) => {
        const vert = ay === by;
        g.beginPath();
        if (vert) { g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
        else { g.moveTo(x - 6, y); g.lineTo(x + 6, y); }
        g.stroke();
      });
    };
    dimLine(x1, pad - 40, x2, pad - 40);
    g.fillText(W3 + ' cm', (x1 + x2) / 2, pad - 48);
    dimLine(pad - 40, y1, pad - 40, y2);
    g.save(); g.translate(pad - 48, (y1 + y2) / 2); g.rotate(-Math.PI / 2);
    g.fillText(H3 + ' cm', 0, 0); g.restore();
    g.textAlign = 'left';
    g.fillText('Depth: ' + Dv + ' cm    Thickness: ' + T + ' cm    Front view', pad, canvas2d.height - 24);
    g.textAlign = 'start';
  }

  function disposeModel() {
    if (!model) return;
    scene.remove(model);
    model.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    model = null;
  }

  function build() {
    disposeModel();
    const has = strokes.some(s => s.pts && s.pts.length > 1);
    if ($('#mode').value === 'exact' && has) buildFromDrawing(); else buildTemplate();
    if (viewMode === '2d') draw2D();
  }

  // Every shape you drew becomes a real 3D part
  function buildFromDrawing() {
    const items = strokes.filter(s => s.pts && s.pts.length > 1);
    const all = items.flatMap(s => s.pts), B = bbox(all);
    const W3 = +sl.w.value, H3 = +sl.h.value, D = +sl.d.value, T = +sl.t.value;
    const sx = W3 / Math.max(B.w, 1), sy = H3 / Math.max(B.h, 1), cx = (B.x0 + B.x1) / 2;
    const X = p => (p.x - cx) * sx, Y = p => (B.y1 - p.y) * sy;
    const a = analyze();
    const DIM = ($('#dims') && $('#dims').value) || '3d';
    const panelMode = !!(a && a.type === 'shelf') || DIM === '2d';
    const mat = MATERIALS[matSel.value];
    const m = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.rough, side: THREE.DoubleSide });
    const g = new THREE.Group();

    const bar = (x1, y1, x2, y2, thick, depth, z) => {
      const len = Math.hypot(x2 - x1, y2 - y1) + thick * 0.6, ang = Math.atan2(y2 - y1, x2 - x1);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, thick, depth), m);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
      mesh.rotation.z = ang;
      g.add(mesh);
    };
    // lines: horizontal = full-depth slab (top, seat, shelf); vertical = post at front and back
    const seg = (p, q) => {
      const x1 = X(p), y1 = Y(p), x2 = X(q), y2 = Y(q), dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      if (dy <= dx * 0.2) bar(x1, y1, x2, y2, T, DIM === '1d' ? T : D, 0);
      else if (panelMode && dx <= dy * 0.2) bar(x1, y1, x2, y2, T, DIM === '1d' ? T : D, 0);
      else {
        const z = Math.max(0, D / 2 - T / 2);
        bar(x1, y1, x2, y2, T, T, z);
        if (z > 0) bar(x1, y1, x2, y2, T, T, -z);
      }
    };
    // closed shapes are extruded; tall narrow ones become legs (posts)
    const solid = pts => {
      const s = new THREE.Shape();
      pts.forEach((p, i) => i ? s.lineTo(X(p), Y(p)) : s.moveTo(X(p), Y(p)));
      const bb = bbox(pts), pw = bb.w * sx, ph = bb.h * sy;
      const post = !panelMode && ph > 2 * pw && pw < 30;
      const make = (depth, z) => {
        const geo = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false });
        geo.translate(0, 0, -depth / 2 + z);
        g.add(new THREE.Mesh(geo, m));
      };
      if (post) { const d = Math.max(pw, T), z = Math.max(0, D / 2 - d / 2); make(d, z); if (z > 0) make(d, -z); }
      else make(DIM === '1d' ? T : D, 0);
    };

    items.forEach(o => {
      if (o.closed && o.pts.length >= 3) {
        const bb = bbox(o.pts);
        if (bb.w > 2 && bb.h > 2) { solid(o.pts); return; }
      }
      let pts = o.pts;
      if (o.kind === 'curve' || o.kind === 'free' || pts.length > 12) pts = dp(pts, Math.max(5, Math.hypot(B.w, B.h) * 0.02));
      for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1]);
    });

    const box = new THREE.Box3().setFromObject(g);
    g.position.y = -box.min.y;
    model = g; scene.add(g);
    camDist = Math.max(W3, D, H3) * 2.2 + 80;
    updateCam();
  }

  // ready-made furniture based on the detected type
  function buildTemplate() {
    const type = $('#type').value, mat = MATERIALS[matSel.value];
    const W3 = +sl.w.value, D = +sl.d.value, H3 = +sl.h.value, S = +sl.s.value;
    const m = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.rough });
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || m);
      mesh.position.set(x, y, z); g.add(mesh);
    };
    if (type === 'table') {
      const t = 4, leg = 6, inset = 5;
      box(W3, t, D, 0, H3 - t / 2, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
        box(leg, H3 - t, leg, sx * (W3 / 2 - inset - leg / 2), (H3 - t) / 2, sz * (D / 2 - inset - leg / 2)));
    }
    if (type === 'chair') {
      const seatH = Math.min(46, H3 * 0.5), t = 4, leg = 4;
      box(W3, t, D, 0, seatH, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
        box(leg, seatH, leg, sx * (W3 / 2 - leg), seatH / 2 - 1, sz * (D / 2 - leg)));
      box(W3, H3 - seatH, 3, 0, seatH + (H3 - seatH) / 2, -D / 2 + 2);
    }
    if (type === 'shelf') {
      const t = 2.5;
      box(t, H3, D, -W3 / 2 + t / 2, H3 / 2, 0);
      box(t, H3, D, W3 / 2 - t / 2, H3 / 2, 0);
      box(W3, H3, 1, 0, H3 / 2, -D / 2 + 0.5, new THREE.MeshStandardMaterial({ color: mat.color, roughness: 1 }));
      for (let i = 0; i < S; i++) box(W3 - 2 * t, t, D, 0, t / 2 + i * (H3 - t) / (S - 1), 0);
    }
    if (type === 'bed') {
      const frameH = 30;
      box(W3, frameH, D, 0, frameH / 2 + 10, 0);
      box(W3 - 6, 18, D - 8, 0, frameH + 19, 0, new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 1 }));
      box(W3, H3, 6, 0, H3 / 2, -D / 2 + 3);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
        box(8, 10, 8, sx * (W3 / 2 - 6), 5, sz * (D / 2 - 6)));
    }
    model = g; scene.add(g);
    camDist = Math.max(W3, D, H3) * 2.2 + 80;
    updateCam();
  }

  function updateCam() {
    const target = new THREE.Vector3(0, +sl.h.value * 0.4, 0);
    camera.position.set(
      Math.sin(rotY) * Math.cos(rotX) * camDist,
      target.y + Math.sin(rotX) * camDist,
      Math.cos(rotY) * Math.cos(rotX) * camDist);
    camera.lookAt(target);
  }

  let dragging = false, lx = 0, ly = 0;
  viewer.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; viewer.setPointerCapture(e.pointerId); });
  viewer.addEventListener('pointermove', e => {
    if (!dragging) return;
    rotY -= (e.clientX - lx) * 0.01; rotX = Math.max(0.02, Math.min(1.3, rotX + (e.clientY - ly) * 0.008));
    lx = e.clientX; ly = e.clientY; updateCam();
  });
  viewer.addEventListener('pointerup', () => dragging = false);
  viewer.addEventListener('wheel', e => { e.preventDefault(); camDist = Math.max(80, Math.min(1500, camDist * (1 + e.deltaY * 0.001))); updateCam(); }, { passive: false });
  (function loop() { renderer.render(scene, camera); requestAnimationFrame(loop); })();

  // ---------- send to workshop ----------
  $('#sendBtn').onclick = () => {
    const nm = $('#name').value.trim() || 'Untitled design';
    const msg = 'Hello ' + SITE.name + ',\nI designed a custom piece in your studio:\n' +
      'Name: ' + nm + '\nType: ' + LABEL[$('#type').value] +
      '\nMaterial: ' + MATERIALS[matSel.value].label +
      '\nSize: ' + sl.w.value + ' x ' + sl.d.value + ' x ' + sl.h.value + ' cm (W x D x H)' +
      '\nPlease contact me with a quote.';
    window.open('https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(msg), '_blank');
  };

  // ---------- saved designs ----------
  const KEY = 'woodcraft_designs';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { say('Could not save (browser storage blocked).'); } }

  $('#saveBtn').onclick = () => {
    const t = document.createElement('canvas'); t.width = 240; t.height = 156;
    draw({ clean: true });
    t.getContext('2d').drawImage(cv, 0, 0, 240, 156);
    draw();
    const entry = {
      id: Date.now(), name: $('#name').value.trim() || 'Untitled design',
      type: $('#type').value, material: matSel.value,
      w: +sl.w.value, d: +sl.d.value, h: +sl.h.value, s: +sl.s.value, t: +sl.t.value,
      strokes, bg, thumb: t.toDataURL('image/png'), date: new Date().toLocaleDateString()
    };
    const list = load();
    list.unshift(entry);
    store(list); $('#name').value = ''; renderGallery(); say('Design saved to My Designs.');
    // also send a copy to the workshop database, if the backend is running
    try {
      fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      }).catch(() => {});
    } catch (e) {}
  };

  function renderGallery() {
    const list = load(), box = $('#gallery');
    box.textContent = '';
    $('#empty').style.display = list.length ? 'none' : 'block';
    list.forEach(d => {
      const card = document.createElement('div'); card.className = 'card';
      const img = document.createElement('img'); img.src = d.thumb; img.alt = d.name;
      const meta = document.createElement('div'); meta.className = 'meta';
      const b = document.createElement('b'); b.textContent = d.name;
      const info = document.createElement('span');
      info.textContent = d.type + ' · ' + MATERIALS[d.material].label + ' · ' + d.w + '×' + d.d + '×' + d.h + ' cm · ' + d.date;
      meta.append(b, info);
      const act = document.createElement('div'); act.className = 'actions';
      const open = document.createElement('button'); open.textContent = 'Open';
      open.onclick = () => {
        $('#auto').checked = false;
        $('#type').value = d.type; matSel.value = d.material;
        sl.w.value = d.w; sl.d.value = d.d; sl.h.value = d.h; sl.s.value = d.s || 3; sl.t.value = d.t || 5;
        strokes = (d.strokes || []).map(o => {
          if (o.closed === undefined) o.closed = ['rectangle', 'circle', 'shape'].includes(o.kind);
          if (!o.pts) o.pts = [];
          return o;
        });
        bg = d.bg || '#ffffff'; sel = null; hist = []; redoSt = []; autoFit = false;
        syncLabels(); draw(); build(); detect();
        document.getElementById('studio').scrollIntoView({ behavior: 'smooth' });
        say('Loaded "' + d.name + '". Edit it and save again as a new version.');
      };
      const del = document.createElement('button'); del.textContent = 'Delete';
      del.onclick = () => { store(load().filter(x => x.id !== d.id)); renderGallery(); };
      act.append(open, del);
      card.append(img, meta, act); box.appendChild(card);
    });
  }

  // ---------- import a design from the AI Designer page ----------
  try {
    const h = JSON.parse(localStorage.getItem('woodcraft_handoff'));
    if (h) {
      localStorage.removeItem('woodcraft_handoff');
      if (Array.isArray(h.strokes) && h.strokes.length) {
        strokes = h.strokes.map(o => {
          if (o.closed === undefined) o.closed = ['rectangle', 'circle', 'shape'].includes(o.kind);
          if (!o.pts) o.pts = [];
          if (o.id === undefined) o.id = idc++;
          return o;
        });
      }
      if (h.type && TYPES[h.type]) $('#type').value = h.type;
      if (h.material && MATERIALS[h.material]) matSel.value = h.material;
      $('#auto').checked = false;
      autoFit = true; syncSize();
      say('Imported your AI design — edit it here, then Save it to My Designs.');
    }
  } catch (e) {}

  // ---------- start ----------
  setColor(c1, 1, true);
  setColor(c2, 2, true);
  setTool('pencil');
  draw();
  detect();
  build();
  renderGallery();
})();
