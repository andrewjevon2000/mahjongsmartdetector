/* Sempoa Mahjong — kamera live.
 * Model deteksi tile (YOLO, format ONNX) jalan langsung di browser HP lewat onnxruntime-web.
 * Butuh halaman HTTPS biasa (mis. GitHub Pages); di dalam Artifact claude.ai kamera diblokir.
 */
(function () {
  'use strict';
  var API = window.Sempoa, MJ = window.MJ;
  if (!API || !MJ) return;
  var $ = function (id) { return document.getElementById(id); };
  var ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.js';
  var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var CONF = 0.45, IOU = 0.45, WINDOW = 6, NEED = 3, MIN_INTERVAL = 220;
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  var panel = $('livePanel');
  if (!panel) return;
  var inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  var canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  var st = {
    target: 'hand', running: false, stream: null, session: null, meta: null, busy: false,
    history: [], lastKey: null, appliedKey: null, stable: null, fps: 0, shots: [], wake: null,
    modelState: 'idle' // idle | loading | ready | missing | error
  };

  function msg(text, work) {
    var el = $('liveMsg');
    el.textContent = text;
    el.className = 'photo-msg' + (work ? ' work' : '');
  }

  if (inArtifact || !canCamera) {
    $('liveControls').hidden = true;
    msg(inArtifact
      ? 'Kamera live tidak diizinkan di dalam Claude. Buka versi GitHub Pages untuk memakai kamera live; di sini tetap bisa pakai Foto.'
      : 'Browser ini tidak memberi akses kamera (butuh HTTPS). Buka lewat GitHub Pages.');
    return;
  }
  msg('Arahkan kamera ke tanganmu (tile berdiri menghadap kamera) atau ke buangan satu pemain. Mesin mencatat otomatis kalau hasilnya stabil.');

  /* ---------- target (yang sedang dilihat kamera) ---------- */
  var TARGETS = [['hand', 'Tangan saya'], ['right', 'Buangan Kanan'], ['across', 'Buangan Depan'], ['left', 'Buangan Kiri'], ['me', 'Buangan saya']];
  function renderTargets() {
    $('liveTargets').innerHTML = TARGETS.map(function (x) {
      return '<button type="button" data-live-target="' + x[0] + '" aria-pressed="' + (st.target === x[0]) + '">' + x[1] + '</button>';
    }).join('');
  }
  renderTargets();

  /* ---------- muat library & model ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = function () { reject(new Error('gagal memuat ' + src)); };
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
    if (st.modelState === 'ready' || st.modelState === 'loading') return Promise.resolve();
    st.modelState = 'loading';
    msg('Memuat model pengenal tile…', true);
    return fetch('model/meta.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw { missing: true };
      return r.json();
    }).then(function (meta) {
      st.meta = meta;
      return loadScript(ORT_URL);
    }).then(function () {
      var ort = window.ort;
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      // iPhone: WebGPU di WebKit masih rawan menghentikan halaman; WASM lebih stabil.
      var providers = (!IOS && navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];
      return ort.InferenceSession.create(st.meta.model || 'model/mahjong.onnx', { executionProviders: providers, graphOptimizationLevel: 'all' })
        .catch(function () { return ort.InferenceSession.create(st.meta.model || 'model/mahjong.onnx', { executionProviders: ['wasm'] }); });
    }).then(function (session) {
      st.session = session;
      st.modelState = 'ready';
      msg('Model siap. Tahan kamera stabil beberapa detik sampai hasilnya muncul.');
    }).catch(function (e) {
      if (e && e.missing) {
        st.modelState = 'missing';
        msg('Model pengenal tile belum dipasang. Kamera tetap bisa dipakai untuk mengumpulkan foto latihan.');
      } else {
        st.modelState = 'error';
        msg('Model gagal dimuat (' + (e && e.message ? e.message : 'koneksi') + '). Coba muat ulang halaman.');
      }
    });
  }

  /* ---------- kamera ---------- */
  function start() {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 540 } }, audio: false
    }).then(function (stream) {
      st.stream = stream;
      var v = $('liveVideo');
      v.srcObject = stream;
      return v.play();
    }).then(function () {
      st.running = true;
      $('liveImage').hidden = true; $('liveVideo').hidden = false;
      $('liveStage').hidden = false;
      $('liveStart').hidden = true;
      $('liveStop').hidden = false;
      $('liveSnap').disabled = false;
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { st.wake = w; }).catch(function () {}); } catch (e) { /* opsional */ }
      return loadModel();
    }).then(function () {
      loop();
    }).catch(function (e) {
      msg(e && e.name === 'NotAllowedError'
        ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu coba lagi.'
        : 'Kamera tidak bisa dibuka: ' + (e && e.message ? e.message : 'tidak diketahui'));
    });
  }
  function stop() {
    st.running = false;
    if (st.stream) st.stream.getTracks().forEach(function (t) { t.stop(); });
    st.stream = null;
    if (st.wake) { try { st.wake.release(); } catch (e) { /* abaikan */ } st.wake = null; }
    $('liveStage').hidden = true;
    $('liveStart').hidden = false;
    $('liveStop').hidden = true;
    $('liveFps').textContent = '';
  }

  /* ---------- deteksi ---------- */
  function dims(el) { return el.tagName === 'VIDEO' ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight]; }
  var prepBuf = null;
  var prep = document.createElement('canvas');
  var prepCtx = prep.getContext('2d', { willReadFrequently: true });
  function preprocess(video, size) {
    var dd = dims(video), vw = dd[0], vh = dd[1];
    var scale = Math.min(size / vw, size / vh);
    var w = Math.round(vw * scale), h = Math.round(vh * scale);
    var dx = Math.floor((size - w) / 2), dy = Math.floor((size - h) / 2);
    prep.width = size; prep.height = size;
    prepCtx.fillStyle = 'rgb(114,114,114)';
    prepCtx.fillRect(0, 0, size, size);
    prepCtx.drawImage(video, 0, 0, vw, vh, dx, dy, w, h);
    var px = prepCtx.getImageData(0, 0, size, size).data;
    var n = size * size;
    if (!prepBuf || prepBuf.length !== 3 * n) prepBuf = new Float32Array(3 * n);
    var data = prepBuf;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      data[i] = px[j] / 255; data[i + n] = px[j + 1] / 255; data[i + 2 * n] = px[j + 2] / 255;
    }
    return { data: data, scale: scale, dx: dx, dy: dy };
  }
  function iou(a, b) {
    var x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1), x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
    var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    var u = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return u > 0 ? inter / u : 0;
  }
  // Keluaran YOLOv8/YOLO11 standar: [1, 4 + kelas, N] (cx, cy, w, h, skor kelas...)
  function decode(out, pre, nc) {
    var dims = out.dims, d = out.data;
    var N = dims[2], C = dims[1], boxes = [];
    for (var i = 0; i < N; i++) {
      var best = 0, cls = -1;
      for (var c = 4; c < C; c++) {
        var s = d[c * N + i];
        if (s > best) { best = s; cls = c - 4; }
      }
      if (best < CONF || cls < 0 || cls >= nc) continue;
      var cx = d[i], cy = d[N + i], w = d[2 * N + i], h = d[3 * N + i];
      boxes.push({
        x1: (cx - w / 2 - pre.dx) / pre.scale, y1: (cy - h / 2 - pre.dy) / pre.scale,
        x2: (cx + w / 2 - pre.dx) / pre.scale, y2: (cy + h / 2 - pre.dy) / pre.scale,
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
  function draw(dets, v) {
    v = v || $('liveVideo');
    var cv = $('liveCanvas'), dd = dims(v);
    if (!dd[0] || !dd[1]) return;
    // kanvas memakai ukuran piksel sumber; CSS yang menskalakannya ke layar
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
      var label = b.tile != null ? shortLabel(b.tile) : b.flower != null ? 'F' + b.flower : '?';
      var tw = ctx.measureText(label).width + 8 * u, th = 15 * u;
      var ly = y - th < 0 ? y : y - th;
      ctx.fillStyle = '#dcb45a';
      ctx.fillRect(x, ly, tw, th);
      ctx.fillStyle = '#2a1f06';
      ctx.fillText(label, x + 4 * u, ly + th - 4 * u);
    });
  }

  // Satu hasil per frame: daftar tile (diurutkan kiri ke kanan) + bunga.
  function frameResult(dets) {
    var tiles = [], flowers = [];
    var hs = dets.map(function (b) { return b.y2 - b.y1; }).sort(function (a, b) { return a - b; });
    var rowH = (hs[Math.floor(hs.length / 2)] || 1) * 1.1;
    dets.slice().sort(function (a, b) {
      var ra = Math.round((a.y1 + a.y2) / 2 / rowH), rb = Math.round((b.y1 + b.y2) / 2 / rowH);
      return ra - rb || a.x1 - b.x1;
    }).forEach(function (b) { if (b.tile != null) tiles.push(b.tile); else if (b.flower != null) flowers.push(b.flower); });
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

  // Deteksi sekali dari foto (tanpa Claude, tanpa internet setelah model termuat).
  function detectFile(file) {
    if (!file) return;
    if (st.running) stop();
    loadModel().then(function () {
      if (st.modelState !== 'ready') return;
      var img = $('liveImage'), url = URL.createObjectURL(file);
      img.onload = function () {
        $('liveVideo').hidden = true; img.hidden = false; $('liveStage').hidden = false;
        msg('Mendeteksi tile di foto…', true);
        var t0 = performance.now();
        detect(img).then(function (dets) {
          draw(dets, img);
          $('liveFps').textContent = Math.round(performance.now() - t0) + ' ms · ' + dets.length + ' tile';
          msg(dets.length ? 'Selesai. Periksa kotak di foto; hasilnya di bawah.' : 'Tidak ada tile yang terdeteksi. Coba foto lebih dekat dan terang.');
          st.appliedKey = null; st.stable = null;
          if (dets.length) apply(frameResult(dets));
        }).catch(function (e) { msg('Deteksi gagal: ' + (e && e.message ? e.message : e)); });
      };
      img.src = url;
    });
  }

  function loop() {
    if (!st.running) return;
    var v = $('liveVideo');
    if (st.modelState !== 'ready' || !v.videoWidth || st.busy) {
      requestAnimationFrame(loop);
      return;
    }
    st.busy = true;
    var t0 = performance.now();
    detect(v).then(function (dets) {
      draw(dets, v);
      onFrame(frameResult(dets));
      var dt = performance.now() - t0;
      st.fps = st.fps ? st.fps * 0.8 + (1000 / dt) * 0.2 : 1000 / dt;
      $('liveFps').textContent = st.fps.toFixed(1) + ' fps · ' + dets.length + ' tile';
    }).catch(function (e) {
      msg('Deteksi gagal: ' + (e && e.message ? e.message : e));
    }).then(function () {
      st.busy = false;
      var wait = Math.max(0, MIN_INTERVAL - (performance.now() - t0));
      if (st.running) setTimeout(function () { requestAnimationFrame(loop); }, wait);
    });
  }

  /* ---------- stabilkan lalu catat ---------- */
  function onFrame(r) {
    st.history.push(r);
    if (st.history.length > WINDOW) st.history.shift();
    var counts = {};
    st.history.forEach(function (h) { counts[h.key] = (counts[h.key] || 0) + 1; });
    var bestKey = null, bestN = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; bestKey = k; } });
    if (bestN < NEED) return;
    var stable = null;
    for (var i = st.history.length - 1; i >= 0; i--) if (st.history[i].key === bestKey) { stable = st.history[i]; break; }
    if (!stable || !stable.tiles.length) return;
    if (st.stable && st.stable.key === stable.key) return;
    st.stable = stable;
    apply(stable);
  }

  function apply(r) {
    var S = API.state(), an = API.lastAnalysis();
    var auto = $('liveAuto').checked;
    var box = $('liveRead');
    var key = st.target + ':' + r.key;
    if (st.appliedKey === key) return;
    var h = '<div class="eyebrow">Kamera melihat · ' + TARGETS.filter(function (x) { return x[0] === st.target; })[0][1] + '</div>' +
      '<div>' + r.tiles.length + ' tile: ' + API.tilesText(r.tiles) + (r.flowers.length ? ' · Flower ' + r.flowers.join(', ') : '') + '</div>';
    var did = null;
    if (st.target === 'hand') {
      var plus = API.multisetDiff(r.tiles, S.cur.hand), minus = API.multisetDiff(S.cur.hand, r.tiles);
      var need = API.handNeed(), full = r.tiles.length === need || r.tiles.length === need + 1;
      if (!plus.length && !minus.length) {
        did = 'sama dengan catatan';
      } else if (auto && full && S.cur.hand.length > 0 && !(plus.length === 1 && !minus.length) && !(minus.length === 1 && !plus.length)) {
        // terbaca lengkap (13/14 tile) dan berbeda dari catatan: langsung ganti, tanpa tombol
        API.setHand(r.tiles, 'Kamera: tangan ' + r.tiles.length + ' tile');
        did = 'tersimpan otomatis (' + r.tiles.length + ' tile)';
        backToMain('Tangan ' + r.tiles.length + ' tile tersimpan');
      } else if (auto && plus.length === 1 && !minus.length && an && an.phase === 'draw') {
        API.recordDraw(plus[0]);
        did = 'tercatat: Ambil ' + MJ.tileName(plus[0]);
        backToMain('Ambil ' + MJ.tileName(plus[0]) + ' · lihat saran');
      } else if (auto && minus.length === 1 && !plus.length && an && an.phase === 'discard') {
        API.discard(minus[0]);
        did = 'tercatat: Buang ' + MJ.tileName(minus[0]);
      } else if (auto && S.cur.hand.length === 0 && full) {
        API.setHand(r.tiles, 'Kamera: tangan awal');
        did = 'tercatat sebagai tangan awal';
        backToMain('Tangan tercatat · lihat kombinasi menang');
      } else if (auto && S.cur.hand.length === 0) {
        did = 'terbaca ' + r.tiles.length + ' tile, butuh ' + need + ' — geser kamera sampai semua tile masuk';
      } else {
        h += '<div class="muted">Beda dengan catatan: ' + (plus.length ? '+' + API.tilesText(plus) : '') + (plus.length && minus.length ? ' · ' : '') + (minus.length ? '−' + API.tilesText(minus) : '') + '</div>' +
          '<div class="row"><button class="btn small primary" type="button" data-live-apply="hand">Pakai hasil kamera</button></div>';
      }
      if (r.flowers.length && r.flowers.length > S.cur.myFlowers.length) API.setFlowers(r.flowers);
    } else {
      var seat = st.target, old = S.cur.ponds[seat];
      var added = API.multisetDiff(r.tiles, old), gone = API.multisetDiff(old, r.tiles);
      if (!added.length) {
        did = gone.length ? 'tile tidak kelihatan semua, catatan lama tetap dipakai' : 'sama dengan catatan';
      } else if (auto && !gone.length) {
        added.forEach(function (t) { API.recordDiscard(seat, t); });
        did = 'tercatat: ' + API.label(seat) + ' buang ' + API.tilesText(added);
      } else {
        h += '<div class="muted">Beda dengan catatan: +' + API.tilesText(added) + (gone.length ? ' · −' + API.tilesText(gone) : '') + '</div>' +
          '<div class="row"><button class="btn small primary" type="button" data-live-apply="pond">Ganti buangan dengan hasil kamera</button></div>';
      }
    }
    if (did) { h += '<div class="muted">' + did + '</div>'; st.appliedKey = key; }
    st.pending = r;
    box.innerHTML = h;
    box.hidden = false;
  }

  // Setelah tangan tercatat dari kamera, kembali ke layar utama supaya hasilnya langsung terlihat.
  function backToMain(msg) {
    setTimeout(function () { if (API.closeView) API.closeView(); API.toast(msg); }, 600);
  }

  /* ---------- foto latihan (untuk melatih ulang dengan tile mejamu) ---------- */
  function snap() {
    var v = $('liveVideo');
    if (!v.videoWidth) return;
    var cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    cv.toBlob(function (b) {
      if (!b) return;
      if (st.shots.length >= 120) st.shots.shift();
      st.shots.push({ blob: b, w: cv.width, h: cv.height, name: 'meja-' + Date.now() });
      $('liveZip').disabled = false;
      $('liveZip').textContent = 'Unduh foto latihan (' + st.shots.length + ')';
      API.toast('Foto latihan disimpan (' + st.shots.length + ')');
    }, 'image/jpeg', 0.9);
  }
  function downloadZip() {
    if (!st.shots.length) return;
    (window.JSZip ? Promise.resolve() : loadScript(JSZIP_URL)).then(function () {
      var zip = new window.JSZip();
      st.shots.forEach(function (s) { zip.file('images/' + s.name + '.jpg', s.blob); });
      zip.file('README.txt', 'Foto tile meja mahjong untuk melatih ulang model Sempoa Mahjong.\nKirim zip ini ke Claude untuk dilabeli dan dipakai melatih model.\n');
      return zip.generateAsync({ type: 'blob' });
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sempoa-foto-latihan-' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }).catch(function () { API.toast('Gagal membuat zip. Coba lagi.'); });
  }

  /* ---------- tombol ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.liveTarget) {
      st.target = el.dataset.liveTarget;
      st.history = []; st.stable = null;
      renderTargets();
      $('liveRead').hidden = true;
      return;
    }
    if (el.dataset.liveApply && st.pending) {
      if (el.dataset.liveApply === 'hand') API.setHand(st.pending.tiles, 'Kamera: tangan');
      else API.setPond(st.target, st.pending.tiles);
      st.appliedKey = st.target + ':' + st.pending.key;
      $('liveRead').hidden = true;
      return;
    }
    switch (el.id) {
      case 'liveStart': start(); return;
      case 'liveStop': stop(); return;
      case 'liveSnap': snap(); return;
      case 'liveZip': downloadZip(); return;
      case 'liveFromPhoto': $('liveFile').click(); return;
    }
  });
  $('liveFile').addEventListener('change', function (e) { detectFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  document.addEventListener('visibilitychange', function () { if (document.hidden && st.running) stop(); });
  // Layar Kamera dibuka dari tombol: langsung nyalakan kamera; ditutup: matikan.
  document.addEventListener('sempoa:view', function (e) {
    if (!e.detail || e.detail.name !== 'camera') return;
    if (e.detail.open) { if (!st.running && st.modelState !== 'error') start(); }
    else if (st.running) stop();
  });
})();
