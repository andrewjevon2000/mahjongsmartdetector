/* Sempoa Mahjong — scan hand.
 * A YOLO tile detector (ONNX) runs in the phone browser via onnxruntime-web.
 * The scanner lives inside the "Your hand" panel: one short strip, a countdown, a Lock button.
 * Needs a normal HTTPS page (e.g. GitHub Pages); camera is blocked inside claude.ai Artifacts.
 */
(function () {
  'use strict';
  var API = window.Sempoa, MJ = window.MJ;
  if (!API || !MJ) return;
  var $ = function (id) { return document.getElementById(id); };
  var ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.js';
  var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var CONF = 0.45, IOU = 0.45, MIN_INTERVAL = 220;
  var COUNTDOWN_MS = 3000, STABLE_FRAMES = 3;
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!$('liveStart')) return;
  var inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  var canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  var st = {
    running: false, stream: null, session: null, meta: null, busy: false, wake: null,
    modelState: 'idle', // idle | loading | ready | missing | error
    frames: [], countStart: 0, lastSeen: 0, done: false, shots: []
  };

  function msg(text, work) {
    var el = $('liveMsg');
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'photo-msg' + (work ? ' work' : '');
  }

  if (inArtifact || !canCamera) {
    $('liveStart').disabled = true;
    msg(inArtifact
      ? 'Live scanning is not available inside Claude. Open the GitHub Pages version to scan.'
      : 'This browser does not allow camera access (HTTPS required).');
  }

  /* ---------- library & model ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function classToTile(name) {
    var code = st.meta.map && st.meta.map[name];
    if (!code) return null;
    if (/^f[1-8]$/.test(code)) return { flower: (+code.slice(1) - 1) % 4 + 1 };
    var t = MJ.parseTile(code);
    return t >= 0 ? { tile: t } : null;
  }
  function loadModel() {
    if (st.modelState === 'ready') return Promise.resolve();
    if (st.loading) return st.loading;
    st.modelState = 'loading';
    msg('Loading tile model…', true);
    st.loading = fetch('model/meta.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw { missing: true };
      return r.json();
    }).then(function (meta) {
      st.meta = meta;
      return window.ort ? null : loadScript(ORT_URL);
    }).then(function () {
      var ort = window.ort;
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      // iPhone: WebGPU in WebKit can still kill the page; WASM is steadier.
      var providers = (!IOS && navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];
      return ort.InferenceSession.create(st.meta.model || 'model/mahjong.onnx', { executionProviders: providers, graphOptimizationLevel: 'all' })
        .catch(function () { return ort.InferenceSession.create(st.meta.model || 'model/mahjong.onnx', { executionProviders: ['wasm'] }); });
    }).then(function (session) {
      st.session = session;
      st.modelState = 'ready';
      msg('');
    }).catch(function (e) {
      st.modelState = e && e.missing ? 'missing' : 'error';
      msg(e && e.missing ? 'Tile model not installed yet.' : 'Could not load the tile model. Check your connection and reload.');
    }).then(function () { st.loading = null; });
    return st.loading;
  }

  /* ---------- camera ---------- */
  function showScanner(on) {
    $('liveStage').hidden = !on;
    $('scanCtl').hidden = !on;
    $('scanBar').hidden = on || API.state().cur.hand.length > 0;
    if (!on) { $('scanCount').hidden = true; $('liveFps').textContent = ''; }
  }
  function start() {
    if (st.running) return;
    API.closeView && API.closeView();
    st.done = false; st.frames = []; st.countStart = 0; st.lastSeen = 0;
    $('liveImage').hidden = true; $('liveVideo').hidden = false;
    clearCanvas();
    showScanner(true);
    msg('Fit one row of tiles inside the frame.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 540 } }, audio: false
    }).then(function (stream) {
      st.stream = stream;
      var v = $('liveVideo');
      v.srcObject = stream;
      return v.play();
    }).then(function () {
      st.running = true;
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { st.wake = w; }).catch(function () {}); } catch (e) { /* optional */ }
      return loadModel();
    }).then(function () {
      if (st.running && st.modelState === 'ready') loop();
    }).catch(function (e) {
      stop();
      msg(e && e.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow the camera for this site in your browser settings, then try again.'
        : 'Could not open the camera: ' + (e && e.message ? e.message : 'unknown error'));
    });
  }
  function stop() {
    st.running = false;
    if (st.stream) st.stream.getTracks().forEach(function (t) { t.stop(); });
    st.stream = null;
    if (st.wake) { try { st.wake.release(); } catch (e) { /* ignore */ } st.wake = null; }
    showScanner(false);
  }

  /* ---------- detection ---------- */
  function dims(el) { return el.tagName === 'VIDEO' ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight]; }
  // The part of the source the user actually sees (object-fit: cover crop).
  function visibleRect(el) {
    var d = dims(el), box = $('liveStage').getBoundingClientRect();
    var bw = box.width || d[0], bh = box.height || d[1];
    var s = Math.max(bw / d[0], bh / d[1]);
    var w = bw / s, h = bh / s;
    return { x: (d[0] - w) / 2, y: (d[1] - h) / 2, w: w, h: h };
  }
  var prepBuf = null;
  var prep = document.createElement('canvas');
  var prepCtx = prep.getContext('2d', { willReadFrequently: true });
  function preprocess(el, size) {
    var r = visibleRect(el);
    var scale = Math.min(size / r.w, size / r.h);
    var w = Math.round(r.w * scale), h = Math.round(r.h * scale);
    var dx = Math.floor((size - w) / 2), dy = Math.floor((size - h) / 2);
    prep.width = size; prep.height = size;
    prepCtx.fillStyle = 'rgb(114,114,114)';
    prepCtx.fillRect(0, 0, size, size);
    prepCtx.drawImage(el, r.x, r.y, r.w, r.h, dx, dy, w, h);
    var px = prepCtx.getImageData(0, 0, size, size).data;
    var n = size * size;
    if (!prepBuf || prepBuf.length !== 3 * n) prepBuf = new Float32Array(3 * n);
    var data = prepBuf;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      data[i] = px[j] / 255; data[i + n] = px[j + 1] / 255; data[i + 2 * n] = px[j + 2] / 255;
    }
    return { data: data, scale: scale, dx: dx, dy: dy, ox: r.x, oy: r.y };
  }
  function iou(a, b) {
    var x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1), x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
    var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    var u = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return u > 0 ? inter / u : 0;
  }
  // Standard YOLOv8/YOLO11 output: [1, 4 + classes, N] (cx, cy, w, h, class scores...)
  function decode(out, pre, nc) {
    var dims2 = out.dims, d = out.data;
    var N = dims2[2], C = dims2[1], boxes = [];
    for (var i = 0; i < N; i++) {
      var best = 0, cls = -1;
      for (var c = 4; c < C; c++) {
        var s = d[c * N + i];
        if (s > best) { best = s; cls = c - 4; }
      }
      if (best < CONF || cls < 0 || cls >= nc) continue;
      var cx = d[i], cy = d[N + i], w = d[2 * N + i], h = d[3 * N + i];
      boxes.push({
        x1: (cx - w / 2 - pre.dx) / pre.scale + pre.ox, y1: (cy - h / 2 - pre.dy) / pre.scale + pre.oy,
        x2: (cx + w / 2 - pre.dx) / pre.scale + pre.ox, y2: (cy + h / 2 - pre.dy) / pre.scale + pre.oy,
        score: best, cls: cls
      });
    }
    boxes.sort(function (a, b) { return b.score - a.score; });
    var keep = [];
    for (var k = 0; k < boxes.length; k++) {
      var ok = true;
      for (var m = 0; m < keep.length; m++) if (iou(boxes[k], keep[m]) > IOU) { ok = false; break; }
      if (ok) keep.push(boxes[k]);
    }
    return keep;
  }
  function shortLabel(t) {
    if (t >= 27) return ['E', 'S', 'W', 'N', 'Wh', 'G', 'R'][t - 27];
    return (t % 9 + 1) + 'CDB'[Math.floor(t / 9)];
  }
  function clearCanvas() {
    var cv = $('liveCanvas');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
  function draw(dets, v) {
    var cv = $('liveCanvas'), dd = dims(v);
    if (!dd[0] || !dd[1]) return;
    cv.width = dd[0]; cv.height = dd[1];
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    var u = Math.max(1, dd[0] / 400);
    ctx.lineWidth = 2 * u;
    ctx.font = '600 ' + Math.round(11 * u) + 'px "Spline Sans Mono", monospace';
    dets.forEach(function (b) {
      var x = b.x1, y = b.y1, w = b.x2 - b.x1, h = b.y2 - b.y1;
      ctx.strokeStyle = '#dcb45a';
      ctx.strokeRect(x, y, w, h);
      var label = b.tile != null ? shortLabel(b.tile) : 'F' + b.flower;
      var tw = ctx.measureText(label).width + 8 * u, th = 15 * u;
      var ly = y - th < 0 ? y : y - th;
      ctx.fillStyle = '#dcb45a';
      ctx.fillRect(x, ly, tw, th);
      ctx.fillStyle = '#2a1f06';
      ctx.fillText(label, x + 4 * u, ly + th - 4 * u);
    });
  }
  function frameResult(dets) {
    var tiles = [], flowers = [];
    dets.slice().sort(function (a, b) { return a.x1 - b.x1; })
      .forEach(function (b) { if (b.tile != null) tiles.push(b.tile); else if (b.flower != null) flowers.push(b.flower); });
    var key = tiles.slice().sort(function (a, b) { return a - b; }).join(',') + '|' + flowers.slice().sort().join(',');
    return { tiles: tiles, flowers: flowers, key: key };
  }
  function detect(el) {
    var size = st.meta.imgsz || 640, pre = preprocess(el, size), ort = window.ort, feeds = {};
    feeds[st.session.inputNames[0]] = new ort.Tensor('float32', pre.data, [1, 3, size, size]);
    return st.session.run(feeds).then(function (res) {
      var dets = decode(res[st.session.outputNames[0]], pre, st.meta.classes.length);
      dets.forEach(function (b) {
        var m = classToTile(st.meta.classes[b.cls]);
        if (m) { b.tile = m.tile; b.flower = m.flower; }
      });
      return dets.filter(function (b) { return b.tile != null || b.flower != null; });
    });
  }

  /* ---------- countdown & capture ---------- */
  function need() { return API.handNeed(); }
  // Best reading among the frames seen so far: the most frequent reading, preferring full hands.
  function bestReading() {
    var counts = {}, byKey = {};
    st.frames.forEach(function (f) { counts[f.key] = (counts[f.key] || 0) + 1; byKey[f.key] = f; });
    var n = need(), best = null, bestScore = -1;
    Object.keys(counts).forEach(function (k) {
      var f = byKey[k], len = f.tiles.length;
      var score = counts[k] + (len === n || len === n + 1 ? 3 : 0) + len * 0.01;
      if (score > bestScore) { bestScore = score; best = f; }
    });
    return best;
  }
  function onFrame(r) {
    var now = performance.now(), n = need();
    if (r.tiles.length) st.lastSeen = now;
    if (r.tiles.length >= 3) {
      if (!st.countStart) st.countStart = now;
      st.frames.push(r);
      if (st.frames.length > 40) st.frames.shift();
    } else if (st.countStart && now - st.lastSeen > 1200) {
      st.countStart = 0; st.frames = [];           // tiles left the frame: start over
    }
    // finish early when the same full hand shows up a few frames in a row
    var tail = st.frames.slice(-STABLE_FRAMES);
    if (tail.length === STABLE_FRAMES && tail.every(function (f) { return f.key === tail[0].key; }) &&
        (tail[0].tiles.length === n || tail[0].tiles.length === n + 1)) {
      return capture(tail[0]);
    }
    var badge = $('scanCount');
    if (st.countStart) {
      var left = Math.max(0, COUNTDOWN_MS - (now - st.countStart));
      badge.hidden = false;
      badge.textContent = Math.ceil(left / 1000) || '✓';
      if (left <= 0) return capture(bestReading());
      msg(r.tiles.length + ' of ' + n + ' tiles · hold still');
    } else {
      badge.hidden = true;
      msg('Fit one row of tiles inside the frame.');
    }
  }
  function lock() {
    var r = bestReading();
    if (!r || !r.tiles.length) { API.toast('No tiles read yet. Point the camera at your hand.'); return; }
    capture(r);
  }
  function capture(r) {
    if (st.done || !r) return;
    st.done = true;
    if ($('liveKeep').checked) keepShot($('liveVideo'));
    stop();
    API.scanned(r.tiles, r.flowers);
  }

  function loop() {
    if (!st.running || st.done) return;
    var v = $('liveVideo');
    if (st.modelState !== 'ready' || !v.videoWidth || st.busy) { requestAnimationFrame(loop); return; }
    st.busy = true;
    var t0 = performance.now();
    detect(v).then(function (dets) {
      if (!st.running) return;
      draw(dets, v);
      $('liveFps').textContent = dets.length + ' tiles';
      onFrame(frameResult(dets));
    }).catch(function (e) {
      msg('Detection failed: ' + (e && e.message ? e.message : e));
    }).then(function () {
      st.busy = false;
      var wait = Math.max(0, MIN_INTERVAL - (performance.now() - t0));
      if (st.running && !st.done) setTimeout(function () { requestAnimationFrame(loop); }, wait);
    });
  }

  // One-shot detection on a picked photo (no Claude, works offline once the model is loaded).
  function detectFile(file) {
    if (!file) return;
    if (st.running) stop();
    loadModel().then(function () {
      if (st.modelState !== 'ready') return;
      var img = $('liveImage'), url = URL.createObjectURL(file);
      img.onload = function () {
        $('liveVideo').hidden = true; img.hidden = false;
        $('liveStage').hidden = false; $('scanBar').hidden = true;
        msg('Reading photo…', true);
        detect(img).then(function (dets) {
          draw(dets, img);
          if ($('liveKeep').checked) keepShot(img);
          var r = frameResult(dets);
          setTimeout(function () {
            $('liveStage').hidden = true; $('scanBar').hidden = API.state().cur.hand.length > 0;
            if (!dets.length) { msg('No tiles found. Try a closer, brighter photo.'); return; }
            msg('');
            API.scanned(r.tiles, r.flowers);
          }, 900);
        }).catch(function (e) { msg('Detection failed: ' + (e && e.message ? e.message : e)); });
      };
      img.src = url;
    });
  }

  /* ---------- training photos (optional, from Settings) ---------- */
  function keepShot(el) {
    var d = dims(el), cv = document.createElement('canvas');
    cv.width = d[0]; cv.height = d[1];
    cv.getContext('2d').drawImage(el, 0, 0);
    cv.toBlob(function (b) {
      if (!b) return;
      if (st.shots.length >= 120) st.shots.shift();
      st.shots.push({ blob: b, name: 'hand-' + Date.now() });
      $('liveZip').disabled = false;
      $('liveZip').textContent = 'Download training photos (' + st.shots.length + ')';
    }, 'image/jpeg', 0.9);
  }
  function downloadZip() {
    if (!st.shots.length) return;
    (window.JSZip ? Promise.resolve() : loadScript(JSZIP_URL)).then(function () {
      var zip = new window.JSZip();
      st.shots.forEach(function (s) { zip.file('images/' + s.name + '.jpg', s.blob); });
      zip.file('README.txt', 'Mahjong hand photos for retraining the Sempoa Mahjong tile model.\nSend this zip to Claude to label and train on.\n');
      return zip.generateAsync({ type: 'blob' });
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sempoa-training-photos-' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }).catch(function () { API.toast('Could not create the zip. Try again.'); });
  }

  /* ---------- buttons ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    switch (el.id) {
      case 'liveStart': case 'dockCam': if (!$('liveStart').disabled) start(); else API.toast($('liveMsg').textContent); return;
      case 'liveStop': stop(); msg(''); return;
      case 'liveLock': lock(); return;
      case 'liveFromPhoto': $('liveFile').click(); return;
      case 'liveZip': downloadZip(); return;
    }
  });
  $('liveFile').addEventListener('change', function (e) { detectFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  document.addEventListener('visibilitychange', function () { if (document.hidden && st.running) stop(); });
  window.SempoaScan = { start: start };
})();
