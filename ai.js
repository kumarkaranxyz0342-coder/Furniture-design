// AI Design Assistant: turns a typed description into a sketch + 3D model.
// Works fully in the browser (rule-based understanding + parametric drawing).
(() => {
  const $ = s => document.querySelector(s);
  const log = $('#chatLog'), input = $('#aiInput'), meta = $('#aiMeta');
  const cv = $('#aiSketch'), ctx = cv.getContext('2d');
  const CW = cv.width, CH = cv.height;

  const MATERIALS = {
    oak:    { label: 'Oak',         color: '#c8a06a', rough: 0.7 },
    walnut: { label: 'Walnut',      color: '#5b3a29', rough: 0.6 },
    pine:   { label: 'Pine',        color: '#e0c28a', rough: 0.8 },
    teak:   { label: 'Teak',        color: '#a0693a', rough: 0.6 },
    steel:  { label: 'Black steel', color: '#2b2b2b', rough: 0.35 }
  };
  const TYPES = {
    table:{w:140,d:80,h:75,label:'Table'}, chair:{w:45,d:48,h:90,label:'Chair'},
    shelf:{w:90,d:30,h:180,label:'Bookshelf'}, bed:{w:160,d:200,h:100,label:'Bed'},
    wardrobe:{w:122,d:56,h:200,label:'Wardrobe / Almira'}, cabinet:{w:100,d:45,h:90,label:'Cabinet'},
    dresser:{w:100,d:45,h:95,label:'Dresser'}, sideboard:{w:150,d:45,h:85,label:'Sideboard'},
    tv_unit:{w:150,d:40,h:55,label:'TV unit'}, shoe_cabinet:{w:90,d:35,h:100,label:'Shoe cabinet'},
    desk:{w:140,d:65,h:75,label:'Desk'}, sofa:{w:200,d:85,h:85,label:'Sofa'}, bench:{w:120,d:40,h:45,label:'Bench'}
  };
  const STYLES = { modern: 'Modern', classic: 'Classic', industrial: 'Industrial', minimal: 'Minimal' };

  let current = null; // {type, material, style, w, d, h, shelves}

  // ---------------- chat ----------------
  function bubble(kind, html, instant) {
    const d = document.createElement('div');
    d.className = 'msg ' + kind;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    if (instant || kind === 'me') { d.innerHTML = html; log.scrollTop = log.scrollHeight; return Promise.resolve(); }
    // typing effect for the assistant
    return new Promise(res => {
      const plain = html.replace(/<[^>]*>/g, '');
      let i = 0;
      const tick = () => {
        i += 3;
        d.textContent = plain.slice(0, i);
        log.scrollTop = log.scrollHeight;
        if (i < plain.length) { setTimeout(tick, 14); } else { d.innerHTML = html; res(); }
      };
      tick();
    });
  }
  function thinking() {
    const d = document.createElement('div');
    d.className = 'msg ai';
    d.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  // ---------------- understand the request ----------------
  function parse(text) { return window.FurnitureAI.parse(text, current); }
  function design(p) { return window.FurnitureAI.normalize(p, current); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- generate strokes (front view) ----------------
  // Same object format as the studio: {kind, pts, closed, color, size, brush, fill}
  function genStrokes(d) {
    if (window.FurnitureAI.isStorage(d)) return window.FurnitureAI.drawStorage(d, CW, CH);
    const S = [];
    const ink = '#2a211a', fillCol = MATERIALS[d.material].color + '55';
    const rect = (x0, y0, x1, y1, fill) => S.push({
      kind: 'rectangle', closed: true, color: ink, size: 3, brush: 'brush',
      fill: fill ? fillCol : undefined,
      pts: [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1},{x:x0,y:y0}]
    });
    const line = (x0, y0, x1, y1) => S.push({ kind: 'line', closed: false, color: ink, size: 3, brush: 'brush', pts: [{x:x0,y:y0},{x:x1,y:y1}] });

    // fit into canvas with margins; canvas y grows downward so ground is at bottom
    const aspect = d.w / d.h;
    let bw = CW * 0.62, bh = bw / aspect;
    if (bh > CH * 0.78) { bh = CH * 0.78; bw = bh * aspect; }
    const x0 = (CW - bw) / 2, x1 = x0 + bw, y1 = CH * 0.9, y0 = y1 - bh;

    if (d.type === 'table') {
      const th = bh * 0.07;
      rect(x0, y0 + bh * 0.02, x1, y0 + bh * 0.02 + th, true); // top
      const leg = d.style === 'classic' ? bw * 0.05 : bw * 0.028;
      const inset = bw * (d.style === 'industrial' ? 0.02 : 0.06);
      rect(x0 + inset, y0 + bh * 0.02 + th, x0 + inset + leg, y1, false);      // left leg
      rect(x1 - inset - leg, y0 + bh * 0.02 + th, x1 - inset, y1, false);      // right leg
      if (d.style === 'classic') // apron under the top
        rect(x0 + inset, y0 + bh * 0.02 + th, x1 - inset, y0 + bh * 0.02 + th + bh * 0.06, false);
      if (d.style === 'industrial') // crossbar between legs
        line(x0 + inset + leg, y1 - bh * 0.25, x1 - inset - leg, y1 - bh * 0.25);
    }
    if (d.type === 'chair') {
      const seatY = y0 + bh * 0.55, th = bh * 0.05, leg = bw * 0.05;
      rect(x0, seatY, x1, seatY + th, true);                                    // seat
      rect(x0, seatY + th, x0 + leg, y1, false);
      rect(x1 - leg, seatY + th, x1, y1, false);                                // legs
      if (d.style === 'classic' || d.style === 'industrial') {
        rect(x0, y0, x1, seatY, false);                                         // solid back panel
        if (d.style === 'classic') rect(x0 - bw * 0.02, y0 - bh * 0.03, x1 + bw * 0.02, y0 + bh * 0.04, true); // crown
      } else {
        rect(x0, y0, x0 + leg, seatY, false);
        rect(x1 - leg, y0, x1, seatY, false);                                   // back posts
        const slats = d.style === 'minimal' ? 2 : 3;
        for (let i = 0; i < slats; i++) {
          const y = y0 + (i + 1) * (seatY - y0) / (slats + 1);
          line(x0 + leg, y, x1 - leg, y);                                       // back slats
        }
      }
    }
    if (d.type === 'shelf') {
      rect(x0, y0, x1, y1, false);                                              // frame
      for (let i = 1; i < d.shelves; i++) {
        const y = y0 + i * bh / d.shelves;
        line(x0, y, x1, y);                                                     // shelves
      }
      if (d.style === 'industrial') { line(x0, y1, x1, y0); line(x1, y1, x0, y0); } // X braces idea as diagonals on back: draw subtle
    }
    if (d.type === 'bed') {
      const top = y0 + bh * 0.45, th = bh * 0.16;
      rect(x0, top, x1, top + th, true);                                        // frame
      const leg = bw * 0.025;
      rect(x0 + bw * 0.03, top + th, x0 + bw * 0.03 + leg, y1, false);
      rect(x1 - bw * 0.03 - leg, top + th, x1 - bw * 0.03, y1, false);          // legs
      const hb = d.style === 'minimal' ? bh * 0.22 : bh * 0.42;
      rect(x0, top - hb, x0 + bw * 0.06, top + th, true);                       // headboard
      if (d.style === 'classic') rect(x0 - bw * 0.012, top - hb - bh * 0.05, x0 + bw * 0.072, top - hb, true); // crown
    }
    if (d.type === 'desk' || d.type === 'bench') {
      const seatY = d.type === 'bench' ? y0 + bh * .68 : y0 + bh * .16, th = bh * .08, leg = bw * .035;
      rect(x0, seatY, x1, seatY + th, true);
      rect(x0 + bw * .06, seatY + th, x0 + bw * .06 + leg, y1, false);
      rect(x1 - bw * .06 - leg, seatY + th, x1 - bw * .06, y1, false);
      if (d.type === 'desk') { rect(x0 + bw*.18, seatY+th, x1-bw*.18, seatY+th+bh*.16, false); line(x0+bw*.5,seatY+th,x0+bw*.5,seatY+th+bh*.16); }
    }
    if (d.type === 'sofa') {
      const seatY=y0+bh*.48, baseY=y0+bh*.67, arm=bw*.12;
      rect(x0+arm,seatY,x1-arm,baseY,true); rect(x0,y0+bh*.24,x0+arm,baseY,true); rect(x1-arm,y0+bh*.24,x1,baseY,true);
      rect(x0+arm,y0+bh*.20,x1-arm,seatY,false);
      const cushions=3; for(let i=1;i<cushions;i++){const x=x0+arm+(x1-x0-2*arm)*i/cushions;line(x,seatY,x,baseY);}
      rect(x0+bw*.08,baseY,x0+bw*.18,y1,false); rect(x1-bw*.18,baseY,x1-bw*.08,y1,false);
    }
    return S;
  }

  // ---------------- draw on canvas ----------------
  function renderStrokes(S) {
    ctx.fillStyle = '#fdfaf5'; ctx.fillRect(0, 0, CW, CH);
    // soft grid
    ctx.fillStyle = '#eee';
    for (let x = 20; x < CW; x += 40) for (let y = 20; y < CH; y += 40) ctx.fillRect(x, y, 2, 2);
    S.forEach(o => {
      ctx.save();
      ctx.lineWidth = o.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = o.color;
      ctx.beginPath();
      o.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (o.closed) ctx.closePath();
      if (o.closed && o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      ctx.stroke();
      ctx.restore();
    });
  }

  // ---------------- 3D preview (same rules as the studio) ----------------
  const viewer = $('#viewerAi');
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

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bbox = p => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(q => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };

  function build3D(S, d) {
    if (model) { scene.remove(model); model.traverse(o => { if (o.geometry) o.geometry.dispose(); }); model = null; }
    if (window.FurnitureAI.isStorage(d)) { model = window.FurnitureAI.buildStorageModel(d, THREE); scene.add(model); camDist = Math.max(d.w * 1.45, d.d, d.h) * 2.25 + 80; updateCam(); return; }
    const items = S.filter(s => s.pts && s.pts.length > 1);
    if (!items.length) return;
    const B = bbox(items.flatMap(s => s.pts));
    const W3 = d.w, H3 = d.h, D = d.d, T = d.style === 'classic' ? 6 : d.style === 'industrial' ? 4 : 5;
    const sx = W3 / Math.max(B.w, 1), sy = H3 / Math.max(B.h, 1), cx = (B.x0 + B.x1) / 2;
    const X = p => (p.x - cx) * sx, Y = p => (B.y1 - p.y) * sy;
    const panelMode = d.type === 'shelf';
    const mat = MATERIALS[d.material];
    const m = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.rough, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const bar = (x1, y1, x2, y2, thick, depth, z) => {
      const len = Math.hypot(x2 - x1, y2 - y1) + thick * 0.6, ang = Math.atan2(y2 - y1, x2 - x1);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, thick, depth), m);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
      mesh.rotation.z = ang; g.add(mesh);
    };
    const seg = (p, q) => {
      const x1 = X(p), y1 = Y(p), x2 = X(q), y2 = Y(q), dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
      if (dy <= dx * 0.2) bar(x1, y1, x2, y2, T, D, 0);
      else if (panelMode && dx <= dy * 0.2) bar(x1, y1, x2, y2, T, D, 0);
      else { const z = Math.max(0, D / 2 - T / 2); bar(x1, y1, x2, y2, T, T, z); if (z > 0) bar(x1, y1, x2, y2, T, T, -z); }
    };
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
      if (post) { const dd = Math.max(pw, T), z = Math.max(0, D / 2 - dd / 2); make(dd, z); if (z > 0) make(dd, -z); }
      else make(D, 0);
    };
    items.forEach(o => {
      if (o.closed && o.pts.length >= 3) {
        const bb = bbox(o.pts);
        if (bb.w > 2 && bb.h > 2) { solid(o.pts); return; }
      }
      for (let i = 0; i < o.pts.length - 1; i++) seg(o.pts[i], o.pts[i + 1]);
    });
    const box = new THREE.Box3().setFromObject(g);
    g.position.y = -box.min.y;
    model = g; scene.add(g);
    camDist = Math.max(W3, D, H3) * 2.2 + 80;
    updateCam();
  }

  function updateCam() {
    const H3 = current ? current.h : 90;
    const target = new THREE.Vector3(0, H3 * 0.4, 0);
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

  // ---------------- meta chips + reply ----------------
  function showMeta(d) {
    meta.innerHTML =
      '<span class="mchip">🛋 ' + TYPES[d.type].label + '</span>' +
      '<span class="mchip">🎨 ' + STYLES[d.style] + '</span>' +
      '<span class="mchip">🪵 ' + MATERIALS[d.material].label + '</span>' +
      '<span class="mchip">📏 ' + d.w + ' × ' + d.d + ' × ' + d.h + ' cm</span>' +
      (window.FurnitureAI.isStorage(d) ? '<span class="mchip">🚪 ' + d.doors + ' doors · ' + d.drawers + ' drawers · ' + d.shelves + ' shelves' + (d.corner ? ' · corner return' : '') + '</span>' : '');
  }

  function replyFor(d, p, aiPowered) {
    let r = 'Designed a <b>' + STYLES[d.style].toLowerCase() + ' ' + MATERIALS[d.material].label.toLowerCase() + ' ' + TYPES[d.type].label.toLowerCase() + '</b> (' + d.w + ' × ' + d.d + ' × ' + d.h + ' cm).';
    if (window.FurnitureAI.isStorage(d)) r += '<br><b>Front layout:</b> ' + d.doors + ' doors, ' + d.drawers + ' drawers, ' + d.shelves + ' shelves' + (d.corner ? ', plus a corner return unit' : '') + '.';
    if (d.notes) { const safeNote=String(d.notes).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); r += '<br><small>' + safeNote + '</small>'; }
    r += '<br><br>' + (aiPowered ? 'AI interpreted the request into a structured design.' : 'Built-in designer generated this locally; configure OPENAI_API_KEY on the server for free-form AI interpretation.') + ' The drawing and rotatable 3D model are on the right. You can refine it with another prompt.';
    return r;
  }

  function makeIt(rawText, aiSpec) {
    const p = aiSpec || parse(rawText || '');
    const d = design(p);
    current = d;
    const S = genStrokes(d);
    renderStrokes(S);
    build3D(S, d);
    showMeta(d);
    return { d, p, S };
  }

  async function requestAI(text) {
    try {
      const response = await fetch('/api/design', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:text,currentDesign:current}) });
      const data = await response.json();
      if (response.ok && data && data.ok && data.design) return data.design;
    } catch (e) { /* static-only hosting falls back to the local furniture parser */ }
    return null;
  }

  async function handleUser(text) {
    if (!text.trim()) return;
    bubble('me', text.replace(/</g, '&lt;'), true);
    input.value = '';
    const think = thinking();
    const aiSpec = await requestAI(text);
    const { d, p } = makeIt(text, aiSpec);
    think.remove();
    bubble('ai', replyFor(d, p, !!aiSpec));
  }

  $('#aiSend').onclick = () => handleUser(input.value);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleUser(input.value); });

  const mic = $('#aiMic');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (mic && SpeechRecognition) {
    const recognition = new SpeechRecognition(); recognition.interimResults = true; recognition.maxAlternatives = 1; recognition.continuous = false;
    let finalTranscript = '';
    mic.addEventListener('click', () => {
      finalTranscript = ''; recognition.lang = document.documentElement.lang === 'ur' ? 'ur-PK' : 'en-US';
      mic.classList.add('listening'); mic.setAttribute('aria-pressed','true'); mic.textContent = '⏹ Listening';
      try { recognition.start(); } catch (e) { mic.classList.remove('listening'); mic.setAttribute('aria-pressed','false'); }
    });
    recognition.onresult = e => {
      let interim = ''; for (let i=e.resultIndex; i<e.results.length; i++) { const part=e.results[i][0].transcript; if(e.results[i].isFinal) finalTranscript += part; else interim += part; }
      input.value = (finalTranscript + ' ' + interim).trim();
    };
    recognition.onend = () => { mic.classList.remove('listening'); mic.setAttribute('aria-pressed','false'); mic.textContent = '🎙 Speak'; if(finalTranscript.trim()) handleUser(finalTranscript.trim()); };
    recognition.onerror = () => { mic.classList.remove('listening'); mic.setAttribute('aria-pressed','false'); mic.textContent = '🎙 Speak'; };
  } else if (mic) { mic.disabled = true; mic.title = 'Voice input is not supported by this browser. Try Chrome or Edge over HTTPS.'; }
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => handleUser(c.dataset.prompt || c.textContent));
  $('#aiRedo').onclick = () => {
    const S = genStrokes(current);
    renderStrokes(S); build3D(S, current);
    bubble('ai', 'Regenerated the same design — drawing and 3D refreshed.');
  };

  $('#openStudio').onclick = () => {
    if (!current) return;
    const S = genStrokes(current).map(o => ({ ...o, fill: undefined }));
    try { localStorage.setItem('woodcraft_handoff', JSON.stringify({ strokes: S, type: window.FurnitureAI.isStorage(current) ? 'shelf' : current.type, material: current.material })); } catch (e) {}
    location.href = 'studio.html';
  };

  // greeting
  makeIt('walnut dining table 180x80x75');
  bubble('ai', 'Assalam-o-Alaikum! 👋 I am your AI design assistant. Tell me what furniture you want — for example <i>“modern pine bookshelf with 5 shelves”</i> or <i>“steel chair, industrial style”</i> — and I will draw it and build a 3D model.');
})();
