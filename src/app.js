(function () {
  'use strict';
  var MJ = window.MJ;
  var SEATS = ['me', 'right', 'across', 'left'];
  var OPPS = ['right', 'across', 'left'];
  var LBL = { me: 'You', right: 'Right', across: 'Across', left: 'Left' };
  var SEAT_OFFSET = { me: 0, right: 1, across: 2, left: 3 };
  var BEFORE = { me: 'left', right: 'me', across: 'right', left: 'across' }; // player before X (to X's left)
  var WIND_NAMES = ['East · Tong 東', 'South · Nan 南', 'West · Si 西', 'North · Pei 北'];
  var WIND_EN = ['East', 'South', 'West', 'North'], WIND_PY = ['Tong', 'Nan', 'Si', 'Pei'];
  var FLOWERS = [{ n: 1, g: '梅' }, { n: 2, g: '蘭' }, { n: 3, g: '菊' }, { n: 4, g: '竹' }];
  var PRESETS = {
    maje: { sets: 4, sevenPairs: true, thirteenOrphans: true, wallStart: 83, scoring: true, minPoints: 3 },
    riichi: { sets: 4, sevenPairs: true, thirteenOrphans: true, wallStart: 70, scoring: false, minPoints: 0 },
    tw: { sets: 5, sevenPairs: false, thirteenOrphans: false, wallStart: 55, scoring: false, minPoints: 0 }
  };
  var STORE = 'sempoa-mahjong-v1';
  var SIMS = 300;
  var CHUNK = 50;
  var NEAR = 5;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pct(x) {
    if (x == null || isNaN(x)) return '—';
    if (x >= 0.995 && x < 1) return '>99%';
    if (x > 0 && x < 0.005) return '<1%';
    return Math.round(x * 100) + '%';
  }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function name(t) { return MJ.tileName(t); }
  function removeOne(arr, t) { var i = arr.indexOf(t); if (i >= 0) arr.splice(i, 1); return i >= 0; }
  function removeLast(arr, t) { var i = arr.lastIndexOf(t); if (i >= 0) arr.splice(i, 1); return i >= 0; }
  function multisetDiff(a, b) { // a - b
    var c = b.slice(), out = [];
    a.forEach(function (t) { if (!removeOne(c, t)) out.push(t); });
    return out;
  }
  function tilesCode(list) { return list.map(MJ.tileStr).join(' '); }
  // "2 3 4 Characters · 5 Dots · Red Dragon ×2" — tile names as in the Majé book
  function tilesText(list) {
    var by = [[], [], []], hon = {}, parts = [];
    list.slice().sort(function (a, b) { return a - b; }).forEach(function (t) {
      if (t < 27) by[Math.floor(t / 9)].push(t % 9 + 1); else hon[t] = (hon[t] || 0) + 1;
    });
    by.forEach(function (nums, s) { if (nums.length) parts.push(nums.join(' ') + ' ' + (nums.length === 1 && nums[0] === 1 ? ['Character', 'Dot', 'Bamboo'][s] : MJ.SUIT_NAMES[s])); });
    Object.keys(hon).forEach(function (t) { parts.push(MJ.HONOR_NAMES[t - 27] + (hon[t] > 1 ? ' ×' + hon[t] : '')); });
    return parts.join(' · ');
  }
  function meldText(m) {
    var s = m.slice().sort(function (a, b) { return a - b; });
    if (s[0] !== s[s.length - 1]) return s.map(function (t) { return t % 9 + 1; }).join('-') + ' ' + MJ.SUIT_NAMES[Math.floor(s[0] / 9)];
    return name(s[0]) + ' ×' + s.length;
  }

  /* ---------- tile faces (SVG, modeled on real mahjong tiles) ---------- */
  var COL = { b: '#1d4f9c', g: '#1b7a47', r: '#a3302a', ink: '#1a1c1a', face: '#f6f1e2', dg: '#12573a' };
  var GLYPH_FONT = ' font-family="Noto Serif TC, Songti TC, PingFang TC, Hiragino Mincho ProN, serif" font-weight="700"';
  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function dot(x, y, r, c) {
    var col = COL[c];
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.62).toFixed(2) + '" fill="' + COL.face + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.34).toFixed(2) + '" fill="' + col + '"/>';
  }
  function stick(x, y, h, c, rot) {
    var col = COL[c], half = h / 2;
    return '<g transform="translate(' + x + ' ' + y + ')' + (rot ? ' rotate(' + rot + ')' : '') + '">' +
      '<rect x="-1.9" y="' + (-half) + '" width="3.8" height="' + h + '" rx="1.9" fill="' + col + '"/>' +
      '<rect x="-0.45" y="' + (-half + 1.4) + '" width="0.9" height="' + (h - 2.8) + '" rx="0.45" fill="' + COL.face + '" opacity="0.6"/>' +
      '<rect x="-2.5" y="-0.75" width="5" height="1.5" rx="0.75" fill="' + col + '"/>' +
      '</g>';
  }
  var DOT_LAYOUT = {
    2: [[15, 11, 5.6, 'g'], [15, 29, 5.6, 'b']],
    3: [[8, 9, 5, 'b'], [15, 20, 5, 'r'], [22, 31, 5, 'g']],
    4: [[9, 12, 5, 'b'], [21, 12, 5, 'g'], [9, 28, 5, 'g'], [21, 28, 5, 'b']],
    5: [[8.5, 10, 4.6, 'b'], [21.5, 10, 4.6, 'g'], [15, 20, 4.6, 'r'], [8.5, 30, 4.6, 'g'], [21.5, 30, 4.6, 'b']],
    6: [[9.5, 8.5, 4.3, 'g'], [20.5, 8.5, 4.3, 'g'], [9.5, 22, 4.3, 'r'], [20.5, 22, 4.3, 'r'], [9.5, 31.5, 4.3, 'r'], [20.5, 31.5, 4.3, 'r']],
    7: [[7.5, 6.8, 3.5, 'g'], [15, 10.4, 3.5, 'g'], [22.5, 14, 3.5, 'g'], [10, 24.5, 4, 'r'], [20, 24.5, 4, 'r'], [10, 33.2, 4, 'r'], [20, 33.2, 4, 'r']],
    8: [[9.5, 7, 3.9, 'b'], [20.5, 7, 3.9, 'b'], [9.5, 15.7, 3.9, 'b'], [20.5, 15.7, 3.9, 'b'], [9.5, 24.3, 3.9, 'b'], [20.5, 24.3, 3.9, 'b'], [9.5, 33, 3.9, 'b'], [20.5, 33, 3.9, 'b']],
    9: [[6.5, 9, 3.7, 'b'], [15, 9, 3.7, 'b'], [23.5, 9, 3.7, 'b'], [6.5, 20, 3.7, 'r'], [15, 20, 3.7, 'r'], [23.5, 20, 3.7, 'r'], [6.5, 31, 3.7, 'g'], [15, 31, 3.7, 'g'], [23.5, 31, 3.7, 'g']]
  };
  var STICK_LAYOUT = {
    2: [[15, 11, 14, 'g'], [15, 29, 14, 'b']],
    3: [[15, 11, 13, 'g'], [9.5, 29, 13, 'b'], [20.5, 29, 13, 'b']],
    4: [[9.5, 11, 13, 'g'], [20.5, 11, 13, 'b'], [9.5, 29, 13, 'b'], [20.5, 29, 13, 'g']],
    5: [[8, 11, 13, 'g'], [22, 11, 13, 'b'], [15, 20, 13, 'r'], [8, 29, 13, 'b'], [22, 29, 13, 'g']],
    6: [[7.5, 11, 13, 'g'], [15, 11, 13, 'g'], [22.5, 11, 13, 'g'], [7.5, 29, 13, 'b'], [15, 29, 13, 'b'], [22.5, 29, 13, 'b']],
    7: [[15, 7.5, 10, 'r'], [7.5, 20, 10, 'g'], [15, 20, 10, 'g'], [22.5, 20, 10, 'g'], [7.5, 32, 10, 'b'], [15, 32, 10, 'b'], [22.5, 32, 10, 'b']],
    8: [[6, 11, 13, 'g'], [11.5, 11, 13, 'b', 14], [18.5, 11, 13, 'b', -14], [24, 11, 13, 'g'],
        [6, 29, 13, 'g'], [11.5, 29, 13, 'b', -14], [18.5, 29, 13, 'b', 14], [24, 29, 13, 'g']],
    9: [[7.5, 8, 10, 'g'], [15, 8, 10, 'r'], [22.5, 8, 10, 'g'], [7.5, 20, 10, 'g'], [15, 20, 10, 'r'], [22.5, 20, 10, 'g'], [7.5, 32, 10, 'g'], [15, 32, 10, 'r'], [22.5, 32, 10, 'g']]
  };
  var BIRD = '<ellipse cx="8.5" cy="27" rx="2.6" ry="8" transform="rotate(-38 8.5 27)" fill="' + COL.b + '"/>' +
    '<ellipse cx="10.5" cy="31" rx="2.3" ry="7" transform="rotate(-68 10.5 31)" fill="' + COL.g + '"/>' +
    '<circle cx="5.6" cy="21.6" r="1.1" fill="' + COL.r + '"/><circle cx="5" cy="29.4" r="1" fill="' + COL.r + '"/>' +
    '<path d="M13 30 C 11 22, 14 14, 19 13 C 23 13, 24.5 19, 22 24.5 C 20 29, 16 31, 13 30 Z" fill="' + COL.g + '"/>' +
    '<path d="M15 26.5 C 15 21.5, 18 18.5, 21.5 19.5 C 20.5 23.5, 18.5 26, 15 26.5 Z" fill="' + COL.dg + '"/>' +
    '<circle cx="20" cy="10.5" r="3.4" fill="' + COL.g + '"/>' +
    '<circle cx="21" cy="9.8" r="0.9" fill="' + COL.face + '"/>' +
    '<path d="M23.1 10 L26.6 11.1 L23.1 12.1 Z" fill="' + COL.r + '"/>' +
    '<path d="M18.6 7.4 L17.4 4.4 M20 7 L20 3.8 M21.4 7.4 L22.8 4.6" stroke="' + COL.r + '" stroke-width="0.9" stroke-linecap="round"/>' +
    '<path d="M17 30.5 L16 36 M19.5 29.6 L20.2 36" stroke="' + COL.r + '" stroke-width="1.1" stroke-linecap="round"/>';
  function faceInner(t) {
    if (t >= 27) {
      var h = t - 27;
      if (h === 4) {
        return '<rect x="5.5" y="6.5" width="19" height="27" rx="2.5" fill="none" stroke="' + COL.b + '" stroke-width="2"/>' +
          '<rect x="8.3" y="9.3" width="13.4" height="21.4" rx="1.2" fill="none" stroke="' + COL.b + '" stroke-width="0.8"/>';
      }
      var col = h === 5 ? COL.g : h === 6 ? COL.r : COL.ink;
      return '<text x="15" y="21" font-size="21" text-anchor="middle" dominant-baseline="central" fill="' + col + '"' + GLYPH_FONT + '>' + MJ.HONOR_GLYPHS[h] + '</text>';
    }
    var suit = Math.floor(t / 9), n = t % 9 + 1, out = '';
    if (suit === 0) {
      return '<text x="15" y="11" font-size="13.5" text-anchor="middle" dominant-baseline="central" fill="' + COL.ink + '"' + GLYPH_FONT + '>' + CN_NUM[n - 1] + '</text>' +
        '<text x="15" y="28" font-size="16" text-anchor="middle" dominant-baseline="central" fill="' + COL.r + '"' + GLYPH_FONT + '>萬</text>';
    }
    if (suit === 1) {
      if (n === 1) {
        return '<circle cx="15" cy="20" r="11.5" fill="' + COL.g + '"/><circle cx="15" cy="20" r="9.6" fill="' + COL.face + '"/>' +
          '<circle cx="15" cy="20" r="8" fill="none" stroke="' + COL.b + '" stroke-width="2.2" stroke-dasharray="2.1 1.4"/>' +
          '<circle cx="15" cy="20" r="5" fill="' + COL.r + '"/><circle cx="15" cy="20" r="2.6" fill="' + COL.face + '"/><circle cx="15" cy="20" r="1.2" fill="' + COL.r + '"/>';
      }
      DOT_LAYOUT[n].forEach(function (d) { out += dot(d[0], d[1], d[2], d[3]); });
      return out;
    }
    if (n === 1) return BIRD;
    STICK_LAYOUT[n].forEach(function (d) { out += stick(d[0], d[1], d[2], d[3], d[4]); });
    return out;
  }
  (function installSprite() {
    var sym = '';
    for (var t = 0; t < 34; t++) sym += '<symbol id="tf' + t + '" viewBox="0 0 30 40">' + faceInner(t) + '</symbol>';
    var holder = document.createElement('div');
    holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>' + sym + '</defs></svg>';
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  })();
  function tileHTML(t, size, extra) {
    var cls = 't' + (size ? ' ' + size : '') + (extra ? ' ' + extra : '');
    return '<span class="' + cls + '" role="img" aria-label="' + esc(name(t)) + '"><span class="tile">' +
      '<svg viewBox="0 0 30 40" aria-hidden="true" focusable="false"><use href="#tf' + t + '"/></svg></span></span>';
  }
  var FLOWER_ICON = {
    1: '<g fill="#d9749b"><circle cx="10" cy="5" r="3.2"/><circle cx="14.8" cy="8.5" r="3.2"/><circle cx="13" cy="14" r="3.2"/><circle cx="7" cy="14" r="3.2"/><circle cx="5.2" cy="8.5" r="3.2"/></g><circle cx="10" cy="10" r="2.2" fill="#e6bd5c"/>',
    2: '<g fill="#8c5bb8"><ellipse cx="10" cy="6" rx="2.6" ry="5"/><ellipse cx="6" cy="12" rx="2.4" ry="4.6" transform="rotate(-55 6 12)"/><ellipse cx="14" cy="12" rx="2.4" ry="4.6" transform="rotate(55 14 12)"/></g><circle cx="10" cy="11" r="1.8" fill="#e6bd5c"/><path d="M10 13 L10 19" stroke="#1b7a47" stroke-width="1.4" stroke-linecap="round"/>',
    3: (function () {
      var g = '';
      for (var i = 0; i < 12; i++) g += '<ellipse cx="10" cy="4.2" rx="1.5" ry="4" transform="rotate(' + (i * 30) + ' 10 10)"/>';
      return '<g fill="#e0a82e">' + g + '</g><circle cx="10" cy="10" r="2.4" fill="#c7771c"/>';
    })(),
    4: '<path d="M8 19 L8 2" stroke="#1b7a47" stroke-width="2" stroke-linecap="round"/><g fill="#2e9a5c"><ellipse cx="13" cy="6" rx="5" ry="1.8" transform="rotate(-25 13 6)"/><ellipse cx="13.5" cy="12" rx="5" ry="1.8" transform="rotate(-15 13.5 12)"/><ellipse cx="4" cy="10" rx="4" ry="1.6" transform="rotate(30 4 10)"/></g>'
  };
  function flowerSVG(n) {
    return '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' + FLOWER_ICON[n] + '</svg>';
  }
  var FLOWER_NAME = { 1: 'Flower 1', 2: 'Flower 2', 3: 'Flower 3', 4: 'Flower 4' };

  /* ---------- state ---------- */
  function emptyCur() {
    return {
      hand: [], drawn: null, lastIn: null,
      melds: { me: [], right: [], across: [], left: [] },
      ponds: { me: [], right: [], across: [], left: [] },
      extra: [], myFlowers: [],
      alert: { right: false, across: false, left: false },
      wallAdjust: 0
    };
  }
  function defaultCfg() {
    return Object.assign({ preset: 'maje', tier: 'default', seatWind: 0, roundWind: 0 }, PRESETS.maje);
  }
  function normalize(st) {
    var c = st.cfg || {};
    if (c.preset === 'hk' || c.scoring == null) {
      c = Object.assign(defaultCfg(), { tier: c.tier || 'default' });
    }
    if (c.seatWind == null) c.seatWind = 0;
    if (c.roundWind == null) c.roundWind = 0;
    st.cfg = c;
    if (!st.cur.myFlowers) st.cur.myFlowers = [];
    if (!st.undo) st.undo = [];
    return st;
  }
  function newRound(cfg) {
    return { v: 1, example: false, cfg: cfg || defaultCfg(), cur: emptyCur(), turn: 1, events: [], undo: [], seq: 0 };
  }
  function exampleRound() {
    var st = newRound(defaultCfg());
    st.example = true;
    st.cfg.seatWind = 1; // Seat Wind South, Round Wind East
    var T = function (list) { return list.map(MJ.parseTile); };
    var order = {
      me: T(['1z', '9m', '4z', '1p']),
      right: T(['2z', '9s', '1m', '8p', '3z']),
      across: T(['7z', '1s', '9p', '2p', '6z']),
      left: T(['4z', '1m', '8s', '5z'])
    };
    for (var i = 0; i < 5; i++) {
      SEATS.forEach(function (seat) {
        var t = order[seat][i];
        if (t == null) return;
        st.events.push({ id: ++st.seq, turn: i + 1, type: 'discard', who: seat, tile: t, label: LBL[seat] + ' discards ' + MJ.tileName(t), at: 0 });
      });
      if (i === 2) st.events.push({ id: ++st.seq, turn: 3, type: 'meld', who: 'left', label: 'Left chi 4-5-6 Dots', at: 0 });
    }
    st.events.push({ id: ++st.seq, turn: 5, type: 'draw', who: 'me', label: 'Draw 9 Dots', at: 0 });
    st.cur.hand = MJ.parseHand('234m67m345p79p23s55s');
    st.cur.drawn = MJ.parseTile('9p');
    st.cur.lastIn = { from: 'wall' };
    st.cur.myFlowers = [3];
    st.cur.ponds = order;
    st.cur.melds.left = [T(['4p', '5p', '6p'])];
    st.turn = 5;
    return st;
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || st.v !== 1 || !st.cur) return null;
      return normalize(st);
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); }
    catch (e) {
      try {
        S.events.forEach(function (ev) { delete ev.thumb; });
        S.undo = S.undo.slice(-15);
        localStorage.setItem(STORE, JSON.stringify(S));
      } catch (e2) { /* browser storage unavailable: keep running in memory */ }
    }
  }

  var S = load() || exampleRound();
  var ui = {
    selHand: null, selPond: null, selMeld: null, openOpt: null, showAllOpts: false,
    zone: 'hand', meldWho: 'right', draft: [], scope: 'table', confirmReset: false, skipClaim: null, view: null, pending: false, win: null, setup: null, scanning: false
  };

  function act(label, type, fn, extra) {
    var snap = { cur: clone(S.cur), turn: S.turn, evLen: S.events.length };
    var turnAt = S.turn;
    var res = fn(S.cur);
    if (res === false) return false;
    S.undo.push(snap);
    if (S.undo.length > 60) S.undo.shift();
    S.events.push(Object.assign({ id: ++S.seq, turn: turnAt, type: type, label: label, at: Date.now() }, extra || {}));
    save();
    render();
    return true;
  }
  function undo() {
    var u = S.undo.pop();
    if (!u) { toast('Nothing to undo yet'); return; }
    S.cur = u.cur; S.turn = u.turn; S.events.length = u.evLen;
    ui.selHand = ui.selPond = ui.selMeld = null;
    save(); render();
    toast('Last move undone');
  }

  /* ---------- derived ---------- */
  function flowerMatch() {
    var mine = S.cfg.seatWind + 1;
    return S.cur.myFlowers.filter(function (n) { return n === mine; }).length;
  }
  function cfgNow() {
    return {
      sets: S.cfg.sets, melds: S.cur.melds.me, sevenPairs: S.cfg.sevenPairs, thirteenOrphans: S.cfg.thirteenOrphans,
      scoring: !!S.cfg.scoring, minPoints: S.cfg.minPoints, seatWind: S.cfg.seatWind, roundWind: S.cfg.roundWind,
      flowers: S.cur.myFlowers.length, flowerMatch: flowerMatch()
    };
  }
  function windOf(seat) { return (S.cfg.seatWind + SEAT_OFFSET[seat]) % 4; }
  function visibleCounts() {
    var v = new Array(34).fill(0);
    SEATS.forEach(function (s) {
      S.cur.ponds[s].forEach(function (t) { v[t]++; });
      S.cur.melds[s].forEach(function (m) { m.forEach(function (t) { v[t]++; }); });
    });
    S.cur.extra.forEach(function (t) { v[t]++; });
    return v;
  }
  function kongCount() {
    var k = 0;
    SEATS.forEach(function (s) { S.cur.melds[s].forEach(function (m) { if (m.length === 4) k++; }); });
    return k;
  }
  function rawWallEstimate(phase) {
    var pondN = SEATS.reduce(function (a, s) { return a + S.cur.ponds[s].length; }, 0);
    return S.cfg.wallStart - pondN - kongCount() - (phase === 'discard' ? 1 : 0);
  }
  function wallLeft(phase) { return Math.max(0, rawWallEstimate(phase) + (S.cur.wallAdjust || 0)); }
  function drawsFromWall(w) { return Math.max(1, Math.round(w / 4)); }
  function lastDiscard() {
    for (var i = S.events.length - 1; i >= 0; i--) {
      var ev = S.events[i];
      if (ev.type === 'discard') return ev;
      if (ev.type !== 'edit') return null;
    }
    return null;
  }

  function analysis() {
    var cfg = cfgNow();
    var c = MJ.toCounts(S.cur.hand);
    var phase = MJ.handPhase(c, cfg);
    var wl = wallLeft(phase);
    var state = {
      hand: S.cur.hand, visible: visibleCounts(),
      opps: {
        right: { pond: S.cur.ponds.right, melds: S.cur.melds.right, alert: S.cur.alert.right, seatWind: windOf('right') },
        across: { pond: S.cur.ponds.across, melds: S.cur.melds.across, alert: S.cur.alert.across, seatWind: windOf('across') },
        left: { pond: S.cur.ponds.left, melds: S.cur.melds.left, alert: S.cur.alert.left, seatWind: windOf('left') }
      },
      cfg: cfg, drawsLeft: drawsFromWall(wl),
      selfDraw: !S.cur.lastIn || S.cur.lastIn.from === 'wall'
    };
    var an = MJ.analyze(state);
    an.cfg = cfg; an.counts = c; an.wall = wl; an.state = state;
    // claim suggestion for the last opponent discard
    var ld = lastDiscard();
    if (phase === 'draw' && ld && ld.who !== 'me' && ld.tile != null) {
      var pond = S.cur.ponds[ld.who];
      if (pond[pond.length - 1] === ld.tile) {
        an.claim = { from: ld.who, t: ld.tile, options: MJ.claimOptions(state, ld.tile, ld.who) };
      }
    }
    return an;
  }

  /* ---------- simulation queue ---------- */
  var simCache = new Map();
  var simGen = 0, simProgress = 0;
  function simKeyFor(counts13, an) {
    return counts13.join('') + '|' + an.unseen.join('') + '|' + an.drawsLeft + '|' + JSON.stringify(an.cfg);
  }
  function simJobs(an) {
    var jobs = [];
    if (an.phase === 'draw' && an.shanten >= 0) {
      jobs.push({ key: simKeyFor(an.counts, an), counts: an.counts.slice() });
    } else if (an.phase === 'discard' && an.options) {
      var seen = {};
      var picks = an.options.slice(0, 3);
      if (an.rec) picks.push(an.rec);
      if (an.safest && an.threat >= 0.3) picks.push(an.safest);
      picks.forEach(function (o) {
        if (seen[o.t]) return; seen[o.t] = 1;
        var c = an.counts.slice(); c[o.t]--;
        jobs.push({ key: simKeyFor(c, an), counts: c, t: o.t });
      });
    }
    jobs.forEach(function (j) { j.cfg = an.cfg; j.unseen = an.unseen; j.draws = an.drawsLeft; });
    return jobs;
  }
  function mergeSim(a, b, na, nb) {
    function mix(x, y) { return x.map(function (v, i) { return (v * na + (y[i] || 0) * nb) / (na + nb); }); }
    var pat = {}, rts = {};
    Object.keys(a.patterns).concat(Object.keys(b.patterns)).forEach(function (k) {
      pat[k] = ((a.patterns[k] || 0) * na + (b.patterns[k] || 0) * nb) / (na + nb);
    });
    Object.keys(a.routes || {}).concat(Object.keys(b.routes || {})).forEach(function (k) {
      rts[k] = (((a.routes || {})[k] || 0) * na + ((b.routes || {})[k] || 0) * nb) / (na + nb);
    });
    var wa = a.any[a.draws] * na, wb = b.any[b.draws] * nb;
    return {
      sims: na + nb, draws: a.draws, tsumo: mix(a.tsumo, b.tsumo), any: mix(a.any, b.any), tenpai: mix(a.tenpai, b.tenpai),
      patterns: pat, routes: rts, avgPoints: (wa + wb) ? (a.avgPoints * wa + b.avgPoints * wb) / (wa + wb) : 0
    };
  }
  function runSims(jobs) {
    var gen = ++simGen;
    var todo = jobs.filter(function (j) { return !simCache.has(j.key); });
    if (!todo.length) return;
    var ji = 0, done = 0, acc = null;
    function step() {
      if (gen !== simGen) return;
      var j = todo[ji];
      var n = Math.min(CHUNK, SIMS - done);
      var r = MJ.simulate(j.counts.slice(), j.cfg, j.unseen, j.draws, n, hash(j.key) + done);
      acc = acc ? mergeSim(acc, r, done, n) : r;
      done += n;
      simProgress = (ji + done / SIMS) / todo.length;
      if (done >= SIMS) {
        simCache.set(j.key, acc);
        acc = null; done = 0; ji++;
        renderAdvice(lastAn);
        renderHero(lastAn);
      } else {
        var bar = document.querySelector('#simBar i');
        if (bar) bar.style.width = Math.round(simProgress * 100) + '%';
      }
      if (ji < todo.length) setTimeout(step, 0);
    }
    setTimeout(step, 40);
  }
  function simFor(an, t) {
    var c = an.counts.slice();
    if (t != null) c[t]--;
    return simCache.get(simKeyFor(c, an)) || null;
  }

  /* ---------- labels ---------- */
  function shantenLabel(s) {
    if (s < 0) return 'Hand complete';
    if (s === 0) return 'Ready to win';
    return s + ' steps to ready';
  }
  function scoringOn(an) { return an && an.scoring && an.M > 0; }
  function vdLabel(v, an) {
    if (!scoringOn(an)) return shantenLabel(v);
    if (v >= 99) return 'No route to ' + an.M + ' points yet';
    if (v < 0) return 'Valid win';
    if (v === 0) return 'Ready for a valid win';
    return v + ' steps to a valid win';
  }
  function vdShort(v, an) {
    if (v >= 99) return 'dead end';
    if (v < 0) return 'complete';
    if (v === 0) return 'ready';
    return v + (v === 1 ? ' step' : ' steps');
  }
  function riskPill(r) {
    var cls = r < 0.02 ? 'safe' : r < 0.05 ? 'ok' : r < 0.1 ? 'mid' : 'risk';
    return '<span class="pill ' + cls + '">risk ' + pct(r) + '</span>';
  }
  function needChips(tiles) {
    if (!tiles.length) return '<span class="muted small">No tile brings you directly closer to a valid win.</span>';
    return '<div class="need">' + tiles.map(function (x) {
      return '<span class="n' + (x.n ? '' : ' zero') + '">' + tileHTML(x.t, 'sm') + '<span class="num">×' + x.n + '</span></span>';
    }).join('') + '</div>';
  }
  function patternList(patterns) {
    return patterns.map(function (p) { return p[0] + ' ' + p[1]; }).join(' · ');
  }

  /* ---------- render: rack ---------- */
  function rackOrder(an) {
    var hand = S.cur.hand.slice();
    var drawn = (S.cur.drawn != null && an.phase === 'discard' && hand.indexOf(S.cur.drawn) >= 0) ? S.cur.drawn : null;
    if (drawn != null) removeOne(hand, drawn);
    hand.sort(function (a, b) { return a - b; });
    return { list: drawn != null ? hand.concat([drawn]) : hand, drawnIdx: drawn != null ? hand.length : -1 };
  }
  function renderRoundRow(an) {
    $('roundRow').hidden = !S.cfg.scoring;
    $('roundWind').value = String(S.cfg.roundWind);
    $('seatWind').value = String(S.cfg.seatWind);
    var mine = S.cfg.seatWind + 1;
    $('flowers').innerHTML = FLOWERS.map(function (f) {
      var on = S.cur.myFlowers.indexOf(f.n) >= 0;
      return '<button type="button" class="flower' + (f.n === mine ? ' match' : '') + '" data-flower="' + f.n + '" aria-pressed="' + on + '" aria-label="' + FLOWER_NAME[f.n] + (f.n === mine ? ', matches your Seat Wind (Suitable Flower)' : '') + '" title="' + FLOWER_NAME[f.n] + '">' + flowerSVG(f.n) + '<small>' + f.n + '</small></button>';
    }).join('');
  }
  function renderRack(an) {
    var ord = rackOrder(an);
    var n = ord.list.length;
    var wide = window.innerWidth >= 640;
    var cols = wide ? Math.max(n, 10) : Math.max(7, Math.ceil(n / 2));
    var rack = $('rack');
    rack.style.setProperty('--cols', cols);
    rack.style.setProperty('--cols-c', Math.max(n, 13));
    var optMap = {};
    if (an.options) an.options.forEach(function (o) { optMap[o.t] = o; });
    var best = an.best, recT = an.rec ? an.rec.t : null;
    rack.innerHTML = n ? ord.list.map(function (t, i) {
      var cls = 'slot', q = '';
      var o = optMap[t];
      if (o && best) {
        var val = o.vd > best.vd ? 0.08 : (best.ukeire ? o.ukeire / best.ukeire : 1);
        q = ' style="--q:' + Math.max(0.08, Math.min(1, val)).toFixed(2) + '"';
        if (t === recT) cls += ' best';
        else if (o.vd > best.vd) cls += ' worse';
      }
      if (ui.selHand === t) cls += ' sel';
      var label = name(t) + (o ? ', if discarded: ' + vdLabel(o.vd, an) + ', ' + o.ukeire + ' useful tiles' : '');
      return '<button type="button" class="' + cls + '" data-t="' + t + '" aria-label="' + esc(label) + '">' +
        tileHTML(t) + (an.phase === 'discard' ? '<span class="q"' + q + '></span>' : '') + '</button>';
    }).join('') : '';
    // faint "+" slots for the tiles still missing; tap one to add a tile by hand
    var needSlots = 3 * MJ.setsNeeded(an.cfg) + 1;
    if (n < needSlots && !ui.scanning) {
      var ghost = '';
      for (var gi = n; gi < needSlots; gi++) ghost += '<button type="button" class="slot ghost" data-act="pad-hand" aria-label="Add a tile"><span class="t"><span class="tile ghost-tile">+</span></span></button>';
      rack.insertAdjacentHTML('beforeend', ghost);
      rack.style.setProperty('--cols', wide ? Math.max(needSlots, 10) : Math.max(7, Math.ceil(needSlots / 2)));
    }

    var cb = $('confirmBar'), needN = 3 * MJ.setsNeeded(an.cfg) + 1;
    rack.classList.toggle('pending', !!ui.pending);
    if (ui.pending && n) {
      var okCount = n === needN || n === needN + 1;
      var dbt = ui.doubt || [];
      cb.innerHTML = '<span><b>' + n + ' tiles scanned</b>' + (okCount ? ' · correct?' : ' · need ' + needN) + '</span>' +
        (dbt.length ? '<span class="small" style="flex-basis:100%;color:var(--mid)">Unclear: ' + esc(dbt.map(name).join(', ')) + ' — a set has only 4 of each tile. Check these.</span>' : '') +
        '<span class="small muted" style="flex-basis:100%">Tap a wrong tile to take it out.</span>' +
        '';
      cb.hidden = false;
    } else { cb.hidden = true; cb.innerHTML = ''; }
    var myMelds = S.cur.melds.me;
    $('myMelds').innerHTML = myMelds.map(function (m) {
      return '<span class="meld" title="Open set">' + m.map(function (t) { return tileHTML(t, 'md'); }).join('') + '</span>';
    }).join('');
    $('myMelds').hidden = !myMelds.length;

    var S0 = MJ.setsNeeded(an.cfg);
    var need13 = 3 * S0 + 1;
    $('handCount').textContent = n + (n === 1 ? ' tile' : ' tiles') + (myMelds.length ? ' + ' + myMelds.length + (myMelds.length === 1 ? ' set' : ' sets') : '');


    var ra = $('rackActions');
    if (ui.selHand != null && S.cur.hand.indexOf(ui.selHand) >= 0) {
      var t = ui.selHand, oo = optMap[t];
      var info = oo ? '<span class="small muted" style="flex-basis:100%">' + esc(name(t)) + ': ' + (oo.vd === 0 ? 'ready to win' : oo.vd >= 99 ? 'dead end' : oo.vd + ' steps') + ' · ' + oo.ukeire + ' useful tiles · risk ' + pct(oo.risk) + '</span>' : '';
      ra.innerHTML = info + (an.phase === 'discard' ? '<button class="btn primary" type="button" data-act="discard">Discard ' + esc(name(t)) + '</button>' : '') +
        '<button class="btn' + (ui.pending ? ' primary' : '') + '" type="button" data-act="remove">Remove from hand</button>' +
        '<button class="btn ghost" type="button" data-act="cancel">Cancel</button>';
      ra.hidden = false;
    } else {
      ra.hidden = true; ra.innerHTML = '';
    }
  }

  /* ---------- render: advice ---------- */
  function chartSVG(sim) {
    var n = sim.draws;
    if (!n) return '';
    var W = 320, H = 132, L = 32, R = 40, T = 10, B = 22;
    var x = function (i) { return L + (i / n) * (W - L - R); };
    var y = function (p) { return T + (1 - p) * (H - T - B); };
    var g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '" stroke="rgba(214,232,220,' + (p === 0 ? 0.3 : 0.1) + ')" stroke-width="1"/>';
      if (p === 0 || p === 0.5 || p === 1) g += '<text x="' + (L - 6) + '" y="' + (y(p) + 3.5) + '" text-anchor="end">' + (p * 100) + '%</text>';
    });
    [1, Math.max(1, Math.round(n / 2)), n].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (tk) {
      g += '<text x="' + x(tk) + '" y="' + (H - 6) + '" text-anchor="middle">' + tk + '</text>';
    });
    function path(arr) {
      var d = '';
      for (var i = 0; i <= n; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arr[i] || 0).toFixed(1);
      return d;
    }
    var area = path(sim.any) + 'L' + x(n) + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z';
    var endAny = sim.any[n] || 0, endTs = sim.tsumo[n] || 0;
    var ya = y(endAny), yt = y(endTs);
    if (Math.abs(ya - yt) < 12) { if (ya <= yt) yt = ya + 12; else ya = yt + 12; }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Valid-win chance per draw">' +
      g +
      '<path d="' + area + '" fill="rgba(220,180,90,0.16)"/>' +
      '<path d="' + path(sim.any) + '" fill="none" stroke="#dcb45a" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="' + path(sim.tsumo) + '" fill="none" stroke="#f1ead6" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>' +
      '<circle cx="' + x(n) + '" cy="' + y(endAny) + '" r="3.2" fill="#dcb45a"/>' +
      '<circle cx="' + x(n) + '" cy="' + y(endTs) + '" r="2.6" fill="#f1ead6"/>' +
      '<text x="' + (x(n) + 7) + '" y="' + (ya + 3.5) + '" style="fill:#f0cf7e;font-weight:600">' + pct(endAny) + '</text>' +
      '<text x="' + (x(n) + 7) + '" y="' + (yt + 3.5) + '" style="fill:#f1ead6">' + pct(endTs) + '</text>' +
      '</svg>' +
      '<div class="legend"><span style="--c:#dcb45a">including opponent discards</span><span style="--c:#f1ead6">self-draw</span></div>' +
      '<div class="note-line">Bottom axis: your draws from now. Only wins with enough points count. Assumes the game runs until the wall is empty and opponent discards are random.</div>';
  }
  function simBlock(sim) {
    if (sim) return chartSVG(sim);
    return '<div class="small muted">Running ' + SIMS + ' game simulations…</div><div class="progress" id="simBar"><i style="width:' + Math.round(simProgress * 100) + '%"></i></div>';
  }
  function endOf(sim, k) { return sim ? sim[k][sim.draws] : null; }
  function atOf(sim, k, n) { return sim ? sim[k][Math.min(n, sim.draws)] : null; }

  function routesBlock(an, sim) {
    if (!scoringOn(an) || !an.routeList) return '';
    var rows = an.routeList.slice(0, 4);
    var h = '<div><div class="sec-head" style="margin-bottom:4px"><span class="eyebrow">Target patterns · minimum ' + an.M + ' points</span></div>';
    if (!rows.length) {
      h += '<p class="small muted" style="margin:0">No pattern can reach ' + an.M + ' points with the tiles left.</p></div>';
      return h;
    }
    h += '<div class="routes">' + rows.map(function (r, i) {
      return '<div class="route' + (i === 0 ? ' top' : '') + '"><div><div class="nm">' + esc(r.name) + '</div>' +
        '<div class="sub">guaranteed ' + r.g + ' points · <span class="num">' + r.uk + '</span> tiles bring it closer</div></div>' +
        '<div class="d">' + vdShort(r.d, an) + '<small>to finish</small></div></div>';
    }).join('') + '</div>';
    if (sim && sim.patterns) {
      var pats = Object.keys(sim.patterns).map(function (k) { return [k, sim.patterns[k]]; })
        .filter(function (x) { return x[1] >= 0.005; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
      if (pats.length) {
        h += '<div style="margin-top:8px"><div class="eyebrow" style="margin-bottom:6px">Win chance by pattern (simulated)</div><div class="chips">' +
          pats.map(function (p) { return '<span class="pill">' + esc(p[0]) + ' <span class="num">' + pct(p[1]) + '</span></span>'; }).join('') +
          (sim.avgPoints ? '<span class="pill">average <span class="num">' + sim.avgPoints.toFixed(1) + '</span> points</span>' : '') +
          '</div></div>';
      }
    }
    return h + '</div>';
  }

  function waitsBlock(an, waits) {
    if (!waits || !waits.length) return '';
    var M = an.M, sc = scoringOn(an);
    return '<div><div class="eyebrow" style="margin-bottom:6px">Winning tiles' + (sc ? ' and their points' : '') + '</div><div class="waits">' +
      waits.map(function (w) {
        var tag = '';
        if (sc) {
          if (w.tsumo < M) tag = '<span class="pill risk">not enough points</span>';
          else if (w.ron < M) tag = '<span class="pill mid">valid only on self-draw</span>';
          else tag = '<span class="pill safe">valid</span>';
        }
        return '<div class="wait">' + tileHTML(w.t, 'sm') + '<span class="num">×' + w.n + '</span>' +
          (sc ? '<span>self-draw <b class="num">' + w.tsumo + '</b> · from a discard <b class="num">' + w.ron + '</b> points</span>' : '') + tag + '</div>';
      }).join('') + '</div></div>';
  }

  function claimBlock(an) {
    var cl = an.claim;
    if (!cl || !cl.options.length) return '';
    var h = '<div class="claim"><div class="eyebrow">' + LBL[cl.from] + ' discard · you can claim it</div>';
    cl.options.forEach(function (o, i) {
      var txt, btn;
      if (o.type === 'hu') {
        txt = o.valid ? '<b>HU! Win ' + o.points + ' points</b> · ' + esc(patternList(o.patterns))
          : 'Hand is complete, but only ' + o.points + ' points (minimum ' + an.M + ') — not valid yet.';
        btn = o.valid ? '<button class="btn primary small" type="button" data-claim="' + i + '">Declare HU</button>' : '';
      } else {
        var label = { pong: 'Pong', kong: 'Kong', chi: 'Chi' }[o.type] + ' ' + meldText(o.tiles);
        var after = o.type === 'kong' ? ', then draw a replacement tile' : (o.discard >= 0 ? ', then discard ' + esc(name(o.discard)) : '');
        txt = o.better
          ? '<b>' + label + ' recommended</b>: distance to a valid win ' + vdShort(o.cur, an) + ' → ' + vdShort(o.vd, an) + after + '.'
          : label + ' not recommended: distance ' + vdShort(o.cur, an) + ' → ' + vdShort(o.vd, an) + (scoringOn(an) ? ', and your hand becomes open (loses Concealed Hand).' : '.');
        btn = '<button class="btn small' + (o.better ? ' primary' : '') + '" type="button" data-claim="' + i + '">' + label.split(' ')[0] + '</button>';
      }
      h += '<div class="copt"><p>' + txt + '</p>' + btn + '</div>';
    });
    h += '<div class="note-line">Claim priority: Hu &gt; Kong/Pong &gt; Chi. Chi only from the player on your left.</div></div>';
    return h;
  }

  var lastAn = null;
  function renderAdvice(an) {
    if (!an) return;
    var box = $('advice');
    var k = an.drawsLeft;
    $('drawsInfo').textContent = an.phase === 'bad' ? '' : '≈ ' + an.wall + ' tiles in the wall · ' + k + ' more draws for you';
    var h = '';

    if (an.phase === 'bad') {
      var S0 = MJ.setsNeeded(an.cfg), need = 3 * S0 + 1, have = S.cur.hand.length;
      h += '<div class="rec"><div class="what" style="grid-column:1/-1"><span class="eyebrow">Start tracking</span>' +
        '<strong>' + (have < need ? 'Enter ' + (need - have) + (need - have === 1 ? ' more tile' : ' more tiles') : (have - need - 1) + ' tiles too many') + '</strong>' +
        '<span class="muted small">Your hand has ' + have + ' tiles recorded. Analysis runs at ' + need + ' tiles (waiting to draw) or ' + (need + 1) + ' tiles (just drew). Photograph your hand, or type tiles one by one.</span></div></div>' +
        '<div class="row"><button class="btn primary" type="button" data-act="pad-hand">+ Type hand tiles</button></div>';
      box.innerHTML = h;
      return;
    }

    var wr = S.cur.winResult;
    if (wr) {
      h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">' + (wr.from === 'wall' ? 'Self-draw' : 'From ' + LBL[wr.from] + ' discard') + '</span>' +
        '<div class="hero-title">HU! ' + wr.points + ' points</div>' +
        '<div class="chips">' + wr.patterns.map(function (p) { return '<span class="pill" style="border-color:rgba(42,31,6,.35);color:inherit">' + esc(p[0]) + ' ' + p[1] + '</span>'; }).join('') + '</div>' +
        '<div class="small">' + (wr.from === 'wall' ? 'All three opponents pay.' : 'Only ' + LBL[wr.from] + ' pays.') + '</div>' +
        '<div class="hero-actions"><button class="btn big" type="button" data-act="new-game">New game</button></div></div>';
      box.innerHTML = h;
      return;
    }
    if (an.complete) {
      var from0 = S.cur.lastIn && S.cur.lastIn.from ? S.cur.lastIn.from : 'wall';
      h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">Your hand is complete</span>' +
        '<div class="hero-title">HU?</div>' +
        '<div class="small">Answer a few questions to get the real score.</div>' +
        '<div class="hero-actions"><button class="btn big" type="button" data-act="win-check" data-from="' + from0 + '">Check score</button></div></div>';
      box.innerHTML = h;
      return;
    }
    if (false) {
      var selfDraw = !S.cur.lastIn || S.cur.lastIn.from === 'wall';
      h += '<div class="win"><span class="eyebrow" style="color:inherit">Valid win · ' + (selfDraw ? 'self-draw' : 'from ' + LBL[S.cur.lastIn.from] + ' discard') + '</span>' +
        '<strong>Declare HU — ' + an.score.points + ' points</strong><ul>' +
        an.score.patterns.map(function (p) { return '<li>' + esc(p[0]) + ' · ' + p[1] + '</li>'; }).join('') + '</ul>' +
        '<span class="small">' + (selfDraw ? 'All three opponents pay you.' : 'Only ' + LBL[S.cur.lastIn.from] + ' (the discarder) pays.') + '</span></div>';
      h += '<p class="note-line">When the game is over, start a new game in Settings. If you are the dealer and win, you stay dealer.</p>';
      box.innerHTML = h;
      return;
    }

    if (an.phase === 'draw') {
      var sim = simFor(an, null);
      var tenpai = an.vd === 0;
      var waits = an.ukeire.tiles;
      h += claimBlock(an);
      h += '<div class="rec"><div class="what" style="grid-column:1/-1">' +
        '<span class="eyebrow">' + (tenpai ? 'Ready to win' : 'Waiting to draw') + '</span>' +
        '<strong>' + (tenpai && waits.length ? 'Wait for ' + waits.map(function (x) { return name(x.t); }).join(' or ') : vdLabel(an.vd, an)) + '</strong>' +
        '<span class="muted small">' + (tenpai
          ? an.ukeire.total + ' winning tiles (enough points) still out there' + (an.ukeire.total === 0 ? ' — your wait is dead, consider reshaping.' : '.')
          : an.ukeire.total + ' useful tiles still out there, of ' + an.U + ' unseen tiles.') + '</span></div></div>';
      var near = Math.min(NEAR, k);
      h += '<div class="stats">' +
        '<div class="stat"><span class="v num">' + pct(an.pNext) + '</span><span class="k">next draw ' + (tenpai ? 'wins' : 'is useful') + '</span></div>' +
        (tenpai
          ? '<div class="stat"><span class="v num">' + pct(an.pWithin) + '</span><span class="k">self-draw win within ' + k + ' draws</span></div>'
          : '<div class="stat"><span class="v num">' + pct(atOf(sim, 'any', near)) + '</span><span class="k">valid win ≈ within ' + near + ' draws</span></div>') +
        '<div class="stat"><span class="v num gold">' + pct(endOf(sim, 'any')) + '</span><span class="k">valid win ≈ before the wall runs out (self-draw ' + pct(endOf(sim, 'tsumo')) + ')</span></div>' +
        '</div>';
      h += an.waits ? waitsBlock(an, an.waits) : needChips(waits);
      h += threatLine(an);
      h += routesBlock(an, sim);
      h += simBlock(sim);
      h += '<div class="row"><button class="btn primary" type="button" data-act="pad-hand">+ Enter the tile you drew</button></div>';
      box.innerHTML = h;
      return;
    }

    // phase discard
    var best = an.best, rec = an.rec || best;
    var bsim = simFor(an, rec.t), asim = simFor(an, best.t);
    if (an.complete && !an.validWin) {
      h += '<div class="readout"><div class="eyebrow">Hand complete, not valid yet</div><div>Only ' + an.score.points + ' points (' + esc(patternList(an.score.patterns)) + '). Minimum is ' + an.M + ' points, so keep building a pattern.</div></div>';
    }
    var mode = an.mode || 'attack';
    var who = an.threatWho, rd = who ? an.reads[who] : null;
    var readName = rd && rd.reads[0] ? rd.reads[0].name : '';
    var modeLabel = { attack: 'Attack', careful: 'Careful', fold: 'Defend' }[mode];
    var why;
    if (mode === 'fold') {
      why = 'Your hand is still ' + vdShort(best.vd, an) + ' away, while ' + LBL[who] + ' is probably ready (≈ ' + pct(an.threat) + ')' +
        (readName ? ' and seems to be going for ' + esc(readName) : '') + '. Discard the safest tile first, attack again if things improve.';
    } else if (mode === 'careful') {
      why = LBL[who] + ' may be ready (≈ ' + pct(an.threat) + ')' + (readName ? ', seems to be going for ' + esc(readName) : '') +
        '. This tile keeps your distance to a valid win the same, with lower risk (' + pct(rec.risk) + ' vs ' + pct(best.risk) + ').';
    } else {
      var keeps = rec.vd === an.vdNow;
      why = (keeps ? 'Stays ' : 'Becomes ') + vdLabel(rec.vd, an).toLowerCase() + ' · ' + rec.ukeire + (rec.vd === 0 ? ' winning' : ' useful') + ' tiles still out there' +
        (an.threat >= 0.3 ? '. Low risk of dealing into a Hu (' + pct(rec.risk) + ').' : '.');
    }
    h += '<div class="rec">' + tileHTML(rec.t, 'lg') +
      '<div class="what"><span class="eyebrow">Suggested discard · <span class="mode mode-' + mode + '">' + modeLabel + '</span></span><strong>' + esc(name(rec.t)) + '</strong>' +
      '<span class="muted small">' + why + '</span></div></div>';
    var nearD = Math.min(NEAR, k);
    h += '<div class="stats">' +
      '<div class="stat"><span class="v num">' + pct(rec.pNext) + '</span><span class="k">next draw ' + (rec.vd === 0 ? 'wins' : 'is useful') + '</span></div>' +
      (rec.vd === 0
        ? '<div class="stat"><span class="v num">' + pct(rec.pWithin) + '</span><span class="k">self-draw win within ' + k + ' draws</span></div>'
        : '<div class="stat"><span class="v num">' + pct(atOf(bsim, 'any', nearD)) + '</span><span class="k">valid win ≈ within ' + nearD + ' draws</span></div>') +
      '<div class="stat"><span class="v num gold">' + pct(endOf(bsim, 'any')) + '</span><span class="k">valid win ≈ before the wall runs out (self-draw ' + pct(endOf(bsim, 'tsumo')) + ')</span></div>' +
      '<div class="stat"><span class="v num">' + pct(rec.risk) + '</span><span class="k">risk this discard gives an opponent Hu</span></div>' +
      '</div>';
    if (an.waits && (rec.vd === 0 || rec.shanten === 0)) h += waitsBlock(an, an.waits);
    else h += '<div><div class="eyebrow" style="margin-bottom:6px">Tiles you want</div>' + needChips(rec.tiles) + '</div>';
    h += '<div class="row"><button class="btn primary" type="button" data-act="discard-best" data-t="' + rec.t + '">Discard ' + esc(name(rec.t)) + '</button>' +
      '<span class="small muted">or tap another tile on the rack</span></div>';
    if (rec.t !== best.t) {
      h += '<div class="readout"><div class="eyebrow">If you still want to attack</div><div class="row">' + tileHTML(best.t, 'md') +
        '<div><b>Discard ' + esc(name(best.t)) + '</b> ' + riskPill(best.risk) +
        '<div class="small muted">' + vdLabel(best.vd, an) + ' · ' + best.ukeire + ' useful tiles · valid win ≈ ' + pct(endOf(asim, 'any')) +
        (best.riskVs ? ' · dangerous against ' + LBL[best.riskVs] + ': ' + esc(best.riskWhy) : '') + '</div></div></div>' +
        '<div class="row"><button class="btn small" type="button" data-act="discard-best" data-t="' + best.t + '">Discard ' + esc(name(best.t)) + '</button></div></div>';
    }
    h += threatLine(an);
    h += routesBlock(an, bsim);
    h += simBlock(bsim);

    var opts = an.options;
    var shown = ui.showAllOpts ? opts : opts.slice(0, 5);
    if (!ui.showAllOpts && shown.indexOf(rec) < 0) shown = shown.slice(0, 4).concat([rec]);
    h += '<div class="sec-head" style="margin-top:4px"><span class="eyebrow">All discard options</span><span class="spacer"></span><span class="small muted">right: win ≈ · risk of dealing in</span></div>';
    h += '<div class="opts">' + shown.map(function (o) {
      var osim = simFor(an, o.t);
      var open = ui.openOpt === o.t;
      return '<button class="opt" type="button" data-opt="' + o.t + '" aria-expanded="' + open + '">' + tileHTML(o.t, 'md') +
        '<div><div class="l1">' + vdShort(o.vd, an) + ' · <span class="num">' + o.ukeire + '</span> ' + (o.vd === 0 ? 'winning' : 'useful') + (o === rec ? ' · <span class="mode mode-' + mode + '">suggested</span>' : '') + '</div>' +
        '<div class="l2"><span class="num">' + pct(o.pNext) + '</span> next draw</div></div>' +
        '<div class="r"><span class="num">' + (osim ? pct(endOf(osim, 'any')) : '—') + '</span>' + riskPill(o.risk) + '</div></button>' +
        (open ? '<div class="opt-detail">' + needChips(o.tiles) + '<div class="muted">Risk of dealing in ' + pct(o.risk) +
          (o.riskVs ? ', most dangerous against ' + LBL[o.riskVs] + ' (' + esc(o.riskWhy) + ')' : '') + '.</div>' +
          '<div><button class="btn small" type="button" data-act="discard-best" data-t="' + o.t + '">Discard ' + esc(name(o.t)) + '</button></div></div>' : '');
    }).join('') + '</div>';
    if (opts.length > 5) {
      h += '<div><button class="btn small ghost" type="button" data-act="toggle-opts">' + (ui.showAllOpts ? 'Show top 5' : 'See all ' + opts.length + ' options') + '</button></div>';
    }
    h += '<p class="note-line">Risk = estimated chance that discard gives an opponent Hu, based on their discards, open sets, and the pattern they seem to be going for. If an opponent looks ready, mark "Ready?" in Table memory for a sharper estimate.</p>';
    box.innerHTML = h;
  }

  function threatClass(p) { return p >= 0.5 ? 'risk' : p >= 0.25 ? 'mid' : ''; }
  function threatLine(an) {
    if (!an.reads || an.threat < 0.15) return '';
    return '<div><div class="eyebrow" style="margin-bottom:6px">Opponent threats</div><div class="chips">' + OPPS.map(function (o) {
      var r = an.reads[o];
      return '<span class="pill ' + threatClass(r.threat) + '">' + LBL[o] + ' ready ≈ <span class="num">' + pct(r.threat) + '</span>' +
        (r.reads[0] ? ' · ' + esc(r.reads[0].name) : '') + '</span>';
    }).join('') + '</div></div>';
  }

  /* ---------- render: seats ---------- */
  function renderSeats() {
    $('seats').innerHTML = SEATS.map(function (seat) {
      var pond = S.cur.ponds[seat], melds = S.cur.melds[seat];
      var alert = seat !== 'me' && S.cur.alert[seat];
      var selP = ui.selPond && ui.selPond.seat === seat ? ui.selPond.idx : -1;
      var selM = ui.selMeld && ui.selMeld.seat === seat ? ui.selMeld.idx : -1;
      var w = windOf(seat);
      var h = '<div class="seat' + (alert ? ' alert' : '') + '">';
      h += '<div class="hd"><strong>' + LBL[seat] + '</strong><span class="muted small wind" title="Seat Wind">' + tileHTML(27 + w, 'xs') + WIND_NAMES[w] + '</span>' +
        '<span class="muted small num" title="discard count">' + pond.length + ' discards</span><span class="spacer"></span>' +
        (seat === 'me' ? '' : '<button class="toggle" type="button" data-alert="' + seat + '" aria-pressed="' + alert + '">' + (alert ? 'Ready!' : 'Ready?') + '</button>') + '</div>';
      var rdo = seat !== 'me' && lastAn && lastAn.reads ? lastAn.reads[seat] : null;
      if (rdo) {
        var top = rdo.reads[0];
        h += '<div class="opp-read"><span class="pill ' + threatClass(rdo.threat) + '">ready ≈ <span class="num">' + pct(rdo.threat) + '</span></span>' +
          (top ? '<span class="small">Likely: <b>' + esc(top.name) + '</b></span>' : '') + '</div>';
        if (top && top.avoid) h += '<div class="small muted">Avoid: ' + esc(top.avoid) + '</div>';
        if (rdo.notes.length) h += '<div class="small muted">' + esc(rdo.notes.join('; ')) + '</div>';
        if (rdo.threat >= 0.3 && S.cur.hand.length) {
          var mine = S.cur.hand.filter(function (t, i, a) { return a.indexOf(t) === i; })
            .sort(function (a, b) { return rdo.wait[a] - rdo.wait[b]; }).slice(0, 3);
          h += '<div class="opp-safe small muted">Safe from your hand: ' + mine.map(function (t) { return tileHTML(t, 'xs'); }).join('') + '</div>';
        }
      }
      if (melds.length) {
        h += '<div class="melds">' + melds.map(function (m, i) {
          return '<button type="button" class="meld" data-meld="' + seat + ':' + i + '" aria-label="Set ' + esc(meldText(m)) + '" style="border:0;' + (selM === i ? 'box-shadow:0 0 0 2px var(--brass-2);' : '') + '">' +
            m.map(function (t) { return tileHTML(t, 'xs'); }).join('') + '</button>';
        }).join('') + '</div>';
      }
      h += '<div class="pond">' + (pond.length ? pond.map(function (t, i) {
        return '<button type="button" data-pond="' + seat + ':' + i + '" class="' + (selP === i ? 'sel' : '') + '">' + tileHTML(t, 'sm') + '</button>';
      }).join('') : '<span class="muted small">No discards yet</span>') + '</div>';
      if (selP >= 0) {
        h += '<div class="row"><button class="btn small" type="button" data-act="pond-remove">Remove ' + esc(name(pond[selP])) + '</button><button class="btn small ghost" type="button" data-act="pond-cancel">Cancel</button></div>';
      }
      if (selM >= 0) {
        h += '<div class="row"><button class="btn small" type="button" data-act="meld-remove">Remove this set</button><button class="btn small ghost" type="button" data-act="meld-cancel">Cancel</button></div>';
      }
      return h + '</div>';
    }).join('');
  }

  /* ---------- render: abacus ---------- */
  function renderAbacus(an) {
    var vis = visibleCounts();
    var c = MJ.toCounts(S.cur.hand);
    var h = '';
    for (var row = 0; row < 4; row++) {
      var n = row < 3 ? 9 : 7;
      for (var i = 0; i < 9; i++) {
        if (i >= n) { h += '<span></span>'; continue; }
        var t = row * 9 + i;
        var inHand = c[t], seen = vis[t], left = Math.max(0, 4 - inHand - seen);
        var beads = '';
        for (var b = 0; b < 4; b++) beads += '<i class="' + (b < inHand ? 'h' : b < inHand + seen ? 'v' : '') + '"></i>';
        var over = inHand + seen > 4;
        h += '<div class="bead-cell' + (over ? ' over' : '') + (left === 0 ? ' zero' : '') + '" title="' + esc(name(t)) + ': ' + left + ' unseen">' +
          tileHTML(t) + '<span class="beads">' + beads + '</span><span class="num">' + (over ? '!' + (inHand + seen) : left) + '</span></div>';
      }
    }
    $('abacus').innerHTML = h;
    $('unseenTotal').textContent = (an ? an.U : 0) + ' tiles unseen';
  }

  /* ---------- render: history ---------- */
  function renderHistory() {
    var byTurn = {};
    S.events.forEach(function (ev) { (byTurn[ev.turn] = byTurn[ev.turn] || []).push(ev); });
    var turns = Object.keys(byTurn).map(Number).sort(function (a, b) { return b - a; });
    $('hist').innerHTML = turns.length ? turns.map(function (tn) {
      return '<div class="hturn"><span class="tn">Turn ' + tn + '</span><div class="hevents">' + byTurn[tn].map(function (ev) {
        return '<span class="hev' + (ev.who === 'me' ? ' me' : '') + '">' + (ev.thumb ? '<img src="' + ev.thumb + '" alt="">' : '') + esc(ev.label) + '</span>';
      }).join('') + '</div></div>';
    }).join('') : '<p class="muted small" style="margin:0">No moves recorded yet. Every draw, discard, open set (Chi/Pong/Kong), Flower, and photo will show up here.</p>';
    $('undoTop').disabled = !S.undo.length;
    $('sheetUndo').disabled = !S.undo.length;
  }

  /* ---------- render: settings ---------- */
  function renderSettings(an) {
    $('preset').value = S.cfg.preset || 'custom';
    $('sets').value = String(S.cfg.sets);
    $('scoring').checked = !!S.cfg.scoring;
    $('minPoints').value = String(S.cfg.minPoints || 0);
    $('minPoints').disabled = !S.cfg.scoring;
    $('sevenPairs').checked = !!S.cfg.sevenPairs;
    $('orphans').checked = !!S.cfg.thirteenOrphans;
    if (document.activeElement !== $('wallStart')) $('wallStart').value = S.cfg.wallStart;
    if (document.activeElement !== $('wallLeft')) {
      $('wallLeft').value = S.cur.wallAdjust ? an.wall : '';
      $('wallLeft').placeholder = 'auto: ' + an.wall;
    }
    $('tier').value = S.cfg.tier || 'default';
    $('resetRow').innerHTML = ui.confirmReset
      ? '<span class="small">Clear this game record?</span><button class="btn small primary" type="button" id="resetYes">Yes, start fresh</button><button class="btn small ghost" type="button" id="resetNo">Cancel</button>'
      : '<button class="btn" type="button" id="resetBtn">Start a new game</button>';
  }

  function render() {
    var an = analysis();
    lastAn = an;
    $('turnChip').textContent = 'Turn ' + S.turn;
    $('exampleBanner').hidden = !S.example;
    renderRoundRow(an);
    renderTopChips();
    renderRack(an);
    renderHero(an);
    renderOppStrip(an);
    renderAdvice(an);
    renderSeats();
    renderAbacus(an);
    renderHistory();
    renderSettings(an);
    if (!$('sheet').hidden) renderSheet(an);
    renderDock(an);
    document.body.classList.toggle('in-turn', !ui.pending && !ui.scanning && (an.phase === 'draw' || an.phase === 'discard') && !S.cur.winResult);
    runSims(simJobs(an));
  }

  /* ---------- actions ---------- */
  function discardFromHand(t) {
    closeView();
    act('Discard ' + name(t), 'discard', function (cur) {
      if (!removeOne(cur.hand, t)) return false;
      cur.ponds.me.push(t);
      cur.drawn = null; cur.lastIn = null;
      S.turn++;
    }, { who: 'me', tile: t });
    ui.selHand = null;
    ui.zone = 'pond:right';
    render();
    toast('Discarded ' + name(t) + '. Next: record Right’s discard.');
  }
  function addTile(zone, t) {
    var an = lastAn;
    if (zone !== 'meld') {
      var have = (an && an.known) ? an.known[t] : 0;
      if (have >= 4) { toast('All 4 ' + name(t) + ' are already recorded'); return; }
    }
    if (zone === 'hand') {
      var isDraw = an && an.phase === 'draw';
      act((isDraw ? 'Draw ' : 'Hand + ') + name(t), isDraw ? 'draw' : 'edit', function (cur) {
        cur.hand.push(t);
        cur.drawn = isDraw ? t : null;
        cur.lastIn = { from: 'wall' };
      }, { who: 'me', tile: t });
      if (isDraw) { closeSheet(); toast('Drew ' + name(t) + '. See the discard suggestion.'); }
      return;
    }
    if (zone.indexOf('pond:') === 0) {
      var seat = zone.slice(5);
      act(LBL[seat] + ' discards ' + name(t), 'discard', function (cur) { cur.ponds[seat].push(t); }, { who: seat, tile: t });
      var next = { right: 'pond:across', across: 'pond:left', left: 'hand' }[seat];
      var cl = lastAn && lastAn.claim;
      var hu = cl && cl.options.some(function (o) { return o.type === 'hu' && o.valid; });
      var better = cl && cl.options.some(function (o) { return o.type !== 'hu' && o.better; });
      if (hu || better) {
        closeSheet();
        toast(hu ? 'HU! ' + LBL[seat] + '’s discard wins your hand' : 'You can claim ' + LBL[seat] + '’s discard — see the suggestion');
        return;
      }
      if (next) { ui.zone = next; renderSheet(lastAn); toast(LBL[seat] + ' discards ' + name(t) + ' · next: ' + zoneLabel(next)); }
      return;
    }
    if (zone === 'extra') {
      act('Open tile + ' + name(t), 'edit', function (cur) { cur.extra.push(t); });
      return;
    }
    if (zone === 'meld') {
      if (ui.draft.length >= 4) { toast('A set has at most 4 tiles'); return; }
      ui.draft.push(t);
      renderSheet(lastAn);
    }
  }
  function meldKind(m) {
    var same = m.every(function (x) { return x === m[0]; });
    if (same) return m.length === 4 ? 'kong' : 'pong';
    var s = m.slice().sort(function (a, b) { return a - b; });
    if (m.length === 3 && s[0] < 27 && Math.floor(s[0] / 9) === Math.floor(s[2] / 9) && s[1] === s[0] + 1 && s[2] === s[0] + 2) return 'chi';
    return 'set';
  }
  // Record an open set. claimed = {from, t} when the tile was taken from a discard.
  function recordMeld(who, m, claimed, closed) {
    var kind = meldKind(m);
    var sorted = kind === 'chi' ? m.slice().sort(function (a, b) { return a - b; }) : m.slice();
    if (kind === 'chi' && claimed && BEFORE[who] !== claimed.from) {
      toast('Majé rule: chi only from the player on your left. Recorded anyway, double-check if wrong.');
    }
    act(LBL[who] + ' ' + kind + ' ' + meldText(sorted) + (claimed ? ' (from ' + LBL[claimed.from] + ')' : '') + (closed ? ' concealed' : ''), 'meld', function (cur) {
      if (claimed) removeLast(cur.ponds[claimed.from], claimed.t);
      if (who === 'me') {
        var toRemove = m.slice();
        if (claimed) removeOne(toRemove, claimed.t);
        else if (!closed) toRemove.pop();
        toRemove.forEach(function (t) { removeOne(cur.hand, t); });
        cur.drawn = null; cur.lastIn = null;
      }
      cur.melds[who].push(sorted);
    }, { who: who });
    return kind;
  }
  function saveMeld() {
    var m = ui.draft.slice(), who = ui.meldWho, closed = $('closedKong').checked;
    if (m.length < 3) return;
    var last = lastDiscard(), claimed = null;
    if (!closed && last && last.who !== who) {
      var lt = S.cur.ponds[last.who][S.cur.ponds[last.who].length - 1];
      if (lt != null && m.indexOf(lt) >= 0) claimed = { from: last.who, t: lt };
    }
    var kind = recordMeld(who, m, claimed, closed);
    ui.draft = [];
    $('closedKong').checked = false;
    if (who === 'me') {
      if (kind === 'kong') { ui.zone = 'hand'; renderSheet(lastAn); toast('Kong recorded. Enter the replacement tile you drew.'); }
      else { closeSheet(); toast('Set recorded. Now discard a tile from the rack.'); }
    } else {
      ui.zone = 'pond:' + who;
      renderSheet(lastAn);
      toast(LBL[who] + ' set recorded · next: ' + LBL[who] + ' discard');
    }
  }
  function doClaim(i) {
    var cl = lastAn && lastAn.claim;
    if (!cl) return;
    closeView();
    var o = cl.options[i];
    if (!o) return;
    if (o.type === 'hu') {
      act('HU from ' + LBL[cl.from] + ' (' + name(cl.t) + ') · ' + o.points + ' points', 'win', function (cur) {
        removeLast(cur.ponds[cl.from], cl.t);
        cur.hand.push(cl.t);
        cur.drawn = cl.t;
        cur.lastIn = { from: cl.from };
      }, { who: 'me', tile: cl.t });
      toast('HU! ' + o.points + ' points');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    var kind = recordMeld('me', o.tiles, { from: cl.from, t: cl.t }, false);
    toast(kind === 'kong' ? 'Kong recorded. Enter the replacement tile you drew.' : 'Recorded. Now discard: the suggestion is above.');
    if (kind === 'kong') openSheet('hand');
  }

  /* ---------- sheet ---------- */
  var ZONES = [
    ['hand', 'Hand'], ['pond:right', 'Right discards'], ['pond:across', 'Across discards'], ['pond:left', 'Left discards'],
    ['pond:me', 'My discards'], ['meld', 'Open set'], ['extra', 'Other']
  ];
  function zoneLabel(z) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0] === z) return ZONES[i][1]; return z; }
  function openSheet(zone) {
    if (zone) ui.zone = zone;
    else if (lastAn && lastAn.phase === 'bad') ui.zone = 'hand';
    $('sheet').hidden = false;
    $('dock').hidden = true;
    renderSheet(lastAn);
  }
  function closeSheet() {
    $('sheet').hidden = true;
    $('dock').hidden = false;
  }
  function renderSheet(an) {
    $('zones').innerHTML = ZONES.map(function (z) {
      return '<button type="button" class="toggle" data-zone="' + z[0] + '" aria-pressed="' + (ui.zone === z[0]) + '">' + z[1] + '</button>';
    }).join('');
    var hint = '';
    var S0 = MJ.setsNeeded(an.cfg), need = 3 * S0 + 1;
    if (ui.zone === 'hand') {
      hint = an.phase === 'draw' ? 'Tap the tile you just drew. This sheet closes automatically so you can see the discard suggestion. Got a Flower? Record it in the Flower row.'
        : an.phase === 'bad' ? 'Tap your hand tiles one by one (' + S.cur.hand.length + '/' + need + ').'
        : 'Your hand is complete and ready to discard. Discard from the rack, or tap here to fix a tile.';
    } else if (ui.zone === 'pond:me') {
      hint = 'Record your own discards without using the rack, e.g. when you start tracking mid-game.';
    } else if (ui.zone.indexOf('pond:') === 0) {
      hint = 'Tap the tile ' + LBL[ui.zone.slice(5)] + ' discarded. It then moves on to the next player automatically, unless you can claim the discard.';
    } else if (ui.zone === 'meld') {
      hint = 'Pick the set owner, tap 3–4 tiles, then Save set. A tile an opponent just discarded is moved out of their discards automatically. Chi only from the player on your left.';
    } else {
      hint = 'Other visible tiles that are not discards.';
    }
    $('zoneHint').textContent = hint;
    var mb = $('meldBox');
    mb.hidden = ui.zone !== 'meld';
    if (!mb.hidden) {
      $('meldWho').innerHTML = SEATS.map(function (s) {
        return '<button type="button" data-who="' + s + '" aria-pressed="' + (ui.meldWho === s) + '">' + LBL[s] + '</button>';
      }).join('');
      $('draft').innerHTML = ui.draft.length
        ? ui.draft.map(function (t) { return tileHTML(t, 'md'); }).join('') + '<span class="small muted">' + (ui.draft.length >= 3 ? meldKind(ui.draft) : '…') + '</span>'
        : '<span class="muted small">Tap 3 or 4 tiles below</span>';
      $('draftSave').disabled = ui.draft.length < 3;
    }
    var rows = [['Characters', 0, 9], ['Dots', 9, 9], ['Bamboo', 18, 9], ['Honors · Winds & Dragons', 27, 7]];
    var unseen = an ? an.unseen : new Array(34).fill(4);
    $('pad').innerHTML = rows.map(function (r) {
      var h = '<span class="suit-lbl">' + r[0] + '</span>';
      for (var i = 0; i < r[2]; i++) {
        var t = r[1] + i;
        h += '<button type="button" class="key" data-key="' + t + '" aria-label="' + esc(name(t)) + ', ' + unseen[t] + ' unseen">' + tileHTML(t) + '<span class="num">' + unseen[t] + '</span></button>';
      }
      return h;
    }).join('');
  }

  /* ---------- photo reading ---------- */
  var sample = null, photoReady = false, photoCtl = null, maxImages = 1;
  function setPhotoMsg(text, work) {
    var el = $('photoMsg');
    el.textContent = text;
    el.className = 'photo-msg' + (work ? ' work' : '');
  }
  function setPhotoEnabled(on) {
    photoReady = on;
    $('camBtn').disabled = !on;
    $('galBtn').disabled = !on;
  }
  (function initPhoto() {
    if (!window.claude || typeof window.claude.use !== 'function') {
      setPhotoMsg('The photo reader works when this page is opened through Claude on your phone (Artifact version). In this local file, use the Type tiles button.');
      return;
    }
    window.claude.use('sample').then(function (s) {
      if (!s) { setPhotoMsg('The photo reader is not available in this view. Use the Type tiles button.'); return; }
      sample = s;
      return s.limits().catch(function () { return null; }).then(function (lim) {
        if (!lim || !lim.images) { setPhotoMsg('This view cannot send photos yet. Use the Type tiles button.'); return; }
        maxImages = lim.images.maxCount || 1;
        if (lim.images.mediaTypes && lim.images.mediaTypes.length) {
          $('camInput').accept = lim.images.mediaTypes.join(',');
          $('galInput').accept = lim.images.mediaTypes.join(',');
        }
        setPhotoEnabled(true);
        setPhotoMsg('Photograph your hand up close for the most accurate read. Photograph the table to copy all discards. The first photo will ask permission to use Claude on your account.');
      });
    }).catch(function () { setPhotoMsg('The photo reader is not available. Use the Type tiles button.'); });
  })();

  function statePrompt() {
    var c = S.cur;
    function list(a) { return a.length ? tilesCode(a) : '(empty)'; }
    function melds(a) { return a.length ? a.map(function (m) { return '[' + tilesCode(m) + ']'; }).join(' ') : '(none)'; }
    return [
      'hand: ' + list(c.hand),
      'myMelds: ' + melds(c.melds.me),
      'myFlowers: ' + (c.myFlowers.length ? c.myFlowers.join(' ') : '(none)'),
      'ponds.me: ' + list(c.ponds.me),
      'ponds.right: ' + list(c.ponds.right),
      'ponds.across: ' + list(c.ponds.across),
      'ponds.left: ' + list(c.ponds.left),
      'melds.right: ' + melds(c.melds.right),
      'melds.across: ' + melds(c.melds.across),
      'melds.left: ' + melds(c.melds.left)
    ].join('\n');
  }
  function visionPrompt(scope, nImages) {
    var S0 = MJ.setsNeeded(cfgNow()), need = 3 * S0 + 1;
    var scopeText = scope === 'hand'
      ? 'SCOPE: close-up of the player\'s OWN hand (and possibly their own exposed melds and flowers). Fill only "hand", "myMelds" and "myFlowers". Set every other area to null.'
      : 'SCOPE: the whole table or a large part of it. Fill every area you can see. Include the player\'s own hand only if its tile faces are visible.';
    return [
      'You are the tile reader for a mahjong helper app (Hong Kong rules). The attached ' + (nImages > 1 ? nImages + ' photos were' : 'photo was') + ' taken by a player at a physical mahjong table, from their own seat.',
      'Identify every tile you can see clearly and report it as JSON.',
      '',
      'Tile codes:',
      '- 1m..9m = Characters / Wan: a Chinese numeral (一二三四五六七八九) above the character 萬.',
      '- 1p..9p = Dots / Circles / Tong: count the circles. 1p is one large circle.',
      '- 1s..9s = Bamboo / Tiao: count the sticks. 1s usually shows a bird instead of a stick.',
      '- 1z East 東, 2z South 南, 3z West 西, 4z North 北, 5z White dragon 白 (blank face or a blue frame), 6z Green dragon 發, 7z Red dragon 中.',
      '- Flower tiles never go in hand, melds or ponds. Report the player\'s own exposed flowers in "myFlowers" by number: plum 梅 = 1, orchid 蘭 = 2, chrysanthemum 菊 = 3, bamboo 竹 = 4 (seasons: spring 春 = 1, summer 夏 = 2, autumn 秋 = 3, winter 冬 = 4).',
      '',
      'Seats relative to the photographer: "me" = nearest edge (bottom of the photo), "right", "across" (far side), "left".',
      'Ponds are the face-up discards in front of each seat. Exposed melds are face-up groups of 3-4 tiles set aside at the edge of a seat.',
      scopeText,
      'The player\'s concealed hand normally has ' + need + ' tiles, or ' + (need + 1) + ' right after drawing.',
      '',
      'Previously recorded state, from earlier turns. Use it only to settle tiles that are hard to read; when the photo clearly disagrees, the photo wins:',
      statePrompt(),
      '',
      'Reply with only one JSON object in this shape:',
      '{"hand": ["1m","2m"], "myMelds": [["5p","5p","5p"]], "myFlowers": [3], "ponds": {"me": [], "right": [], "across": [], "left": []}, "melds": {"right": [], "across": [], "left": []}, "extra": [], "unsure": ["right pond, 5th tile: 3s or 2s"], "note": "one short sentence in English about photo quality or what is missing"}',
      'Use null for an area that is not visible in the photo, and [] for an area that is visible but empty. List each pond in discard order (that player\'s first discard first) when you can tell, otherwise left to right as seen.'
    ].join('\n');
  }
  function parseTiles(arr, bad) {
    if (!Array.isArray(arr)) return null;
    var out = [];
    arr.forEach(function (x) {
      var id = MJ.parseTile(x);
      if (id >= 0) out.push(id);
      else if (x != null && String(x).trim()) bad.push(String(x));
    });
    return out;
  }
  function parseMelds(arr, bad) {
    if (!Array.isArray(arr)) return null;
    return arr.map(function (m) { return parseTiles(m, bad) || []; }).filter(function (m) { return m.length >= 3 && m.length <= 4; });
  }
  var FLOWER_GLYPH = { '梅': 1, '蘭': 2, '兰': 2, '菊': 3, '竹': 4, '春': 1, '夏': 2, '秋': 3, '冬': 4 };
  function parseFlowers(arr) {
    if (!Array.isArray(arr)) return null;
    var out = [];
    arr.forEach(function (x) {
      var n = typeof x === 'number' ? x : (FLOWER_GLYPH[String(x).trim()] || parseInt(x, 10));
      if (n >= 1 && n <= 4) out.push(n);
    });
    return out.slice(0, 8);
  }
  function applyVision(data, scope, thumb) {
    if (!data || typeof data !== 'object') throw { code: 'invalid_json' };
    var bad = [], lines = [];
    var ponds = data.ponds && typeof data.ponds === 'object' ? data.ponds : {};
    var omelds = data.melds && typeof data.melds === 'object' ? data.melds : {};
    var r = {
      hand: parseTiles(data.hand, bad),
      myMelds: parseMelds(data.myMelds, bad),
      myFlowers: parseFlowers(data.myFlowers),
      ponds: {}, melds: {},
      extra: scope === 'hand' ? null : parseTiles(data.extra, bad)
    };
    SEATS.forEach(function (s) { r.ponds[s] = scope === 'hand' ? null : parseTiles(ponds[s], bad); });
    OPPS.forEach(function (s) { r.melds[s] = scope === 'hand' ? null : parseMelds(omelds[s], bad); });
    var turnBump = 0;
    var ok = act('Photo of ' + (scope === 'hand' ? 'hand' : 'table'), 'photo', function (cur) {
      if (r.hand && r.hand.length) {
        var plus = multisetDiff(r.hand, cur.hand), minus = multisetDiff(cur.hand, r.hand);
        lines.push('Hand: ' + r.hand.length + ' tiles' + (plus.length || minus.length
          ? ' (' + (plus.length ? '+' + tilesText(plus) : '') + (plus.length && minus.length ? ', ' : '') + (minus.length ? '−' + tilesText(minus) : '') + ')'
          : ', same as recorded'));
        cur.hand = r.hand;
        cur.drawn = plus.length === 1 ? plus[0] : null;
        if (plus.length === 1) cur.lastIn = { from: 'wall' };
      }
      if (r.myMelds) cur.melds.me = r.myMelds;
      if (r.myFlowers && r.myFlowers.length >= cur.myFlowers.length) {
        if (r.myFlowers.length !== cur.myFlowers.length) lines.push('Flower: ' + r.myFlowers.join(', '));
        cur.myFlowers = r.myFlowers;
      }
      SEATS.forEach(function (s) {
        var np = r.ponds[s];
        if (!np) return;
        var old = cur.ponds[s];
        if (np.length >= old.length) {
          var added = multisetDiff(np, old);
          if (added.length) lines.push(LBL[s] + ' discards: +' + added.length + ' (' + tilesText(added) + ')');
          if (s === 'me' && np.length > old.length) turnBump = np.length - old.length;
          cur.ponds[s] = np;
        } else {
          lines.push(LBL[s] + ' discards: photo shows ' + np.length + ' tiles, keeping the previous record (' + old.length + ')');
        }
      });
      OPPS.forEach(function (s) { if (r.melds[s]) cur.melds[s] = r.melds[s]; });
      if (r.extra) cur.extra = r.extra;
      S.turn += turnBump;
    }, { who: 'me', thumb: thumb || undefined });
    if (ok) S.example = false;
    save();
    var unsure = Array.isArray(data.unsure) ? data.unsure.filter(Boolean).slice(0, 6) : [];
    var h = '<div class="eyebrow">Read from photo</div>';
    h += lines.length ? '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<div>No changes from the record.</div>';
    if (unsure.length) h += '<div class="muted">Not sure about: ' + esc(unsure.join(' · ')) + '</div>';
    if (bad.length) h += '<div class="muted">Not recognized: ' + esc(bad.join(', ')) + '</div>';
    if (data.note) h += '<div class="muted">' + esc(String(data.note)) + '</div>';
    h += '<div class="small muted">Something wrong? Tap a tile on the rack or in the discards to remove it, add via Type tiles, or Undo.</div>';
    $('readout').innerHTML = h;
    $('readout').hidden = false;
    render();
  }
  function makeThumb(file) {
    return new Promise(function (resolve) {
      try {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          try {
            var w = 160, h = Math.round(img.naturalHeight / img.naturalWidth * w) || 120;
            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(cv.toDataURL('image/jpeg', 0.6));
          } catch (e) { resolve(null); }
          URL.revokeObjectURL(url);
        };
        img.onerror = function () { resolve(null); URL.revokeObjectURL(url); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }
  var ERR = {
    not_granted: 'Permission to use Claude was declined, so photos cannot be read in this view. Use Type tiles.',
    sampling_disabled: 'Claude is not available for this account. Use Type tiles.',
    images_unavailable: 'This view cannot send photos. Use Type tiles.',
    rate_limited: 'Too many requests. Wait a moment, then take the photo again.',
    session_expired: 'Claude session expired. Sign in again, then retake the photo.',
    image_rejected: 'This photo cannot be used (format or size). Try another one.',
    refused: 'This photo could not be read. Try a closer shot of the tiles.',
    empty_completion: 'No answer came back. Try a closer, brighter photo.',
    invalid_json: 'The result was not readable. Try once more.',
    upstream_error: 'Connection problem. Try the photo again.'
  };
  var PERMANENT = { not_granted: 1, sampling_disabled: 1, images_unavailable: 1, not_declared: 1, capability_disabled: 1, capability_removed: 1 };
  function readPhotos(files) {
    if (!sample || !photoReady || !files || !files.length) return;
    var list = Array.prototype.slice.call(files, 0, maxImages);
    var scope = ui.scope;
    photoCtl = new AbortController();
    setPhotoEnabled(false);
    $('stopBtn').hidden = false;
    setPhotoMsg('Reading ' + (list.length > 1 ? list.length + ' photos' : 'photo') + '… usually 10–60 seconds.', true);
    var thumbP = makeThumb(list[0]);
    sample.json(visionPrompt(scope, list.length), {
      images: list.length === 1 ? list[0] : list,
      modelTier: S.cfg.tier === 'complex' ? 'complex' : 'default',
      signal: photoCtl.signal,
      cache: false
    }).then(function (data) {
      return thumbP.then(function (thumb) {
        applyVision(data, scope, thumb);
        setPhotoMsg('Done. Check the result below.');
        toast('Photo read');
      });
    }).catch(function (e) {
      var code = e && e.code;
      if (code === 'cancelled') { setPhotoMsg('Cancelled.'); return; }
      setPhotoMsg(ERR[code] || 'Could not read the photo. Try again.');
      if (PERMANENT[code]) { sample = null; }
    }).then(function () {
      $('stopBtn').hidden = true;
      if (sample) setPhotoEnabled(true);
      photoCtl = null;
      $('camInput').value = ''; $('galInput').value = '';
    });
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------- simple view: next-move card ---------- */
  function ring(p, cls) {
    var r = 22, c = 2 * Math.PI * r, v = p == null ? 0 : Math.max(0, Math.min(1, p));
    return '<span class="ring' + (cls ? ' ' + cls : '') + '"><svg viewBox="0 0 56 56" aria-hidden="true"><circle class="bg" cx="28" cy="28" r="22"/><circle class="fg" cx="28" cy="28" r="22" stroke-dasharray="' + (v * c).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg><b>' + (p == null ? '…' : pct(p)) + '</b></span>';
  }
  function ringWrap(p, label, cls) { return '<div class="ring-wrap">' + ring(p, cls) + '<span>' + label + '</span></div>'; }
  function riskCls(r) { return r < 0.02 ? 'safe' : r < 0.1 ? 'mid' : 'risk'; }
  function modePill(mode) {
    return '<span class="mode-pill mode-' + mode + '">' + ({ attack: 'Attack', careful: 'Careful', fold: 'Defend' }[mode] || 'Attack') + '</span>';
  }
  function wantChips(tiles, max) {
    var list = tiles.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, max || 8);
    if (!list.length) return '<div class="hero-sub">No tile helps directly yet.</div>';
    return '<div class="want">' + list.map(function (x) { return tileHTML(x.t, 'sm') + '<span class="num">×' + x.n + '</span>'; }).join('') +
      (tiles.length > list.length ? '<span class="num">+' + (tiles.length - list.length) + ' more</span>' : '') + '</div>';
  }
  var PANEL_VIEW = { detailPanel: 'detail', tablePanel: 'table', gamePanel: 'game' };
  function openPanel(id) { openView(PANEL_VIEW[id] || id); }
  // Overlay view: one full screen above the main screen, closed with the back button or the phone back button.
  function openView(name) {
    var el = $('view-' + name);
    if (!el) return;
    if (ui.view) closeView();
    closeSheet();
    el.classList.add('open');
    el.scrollTop = 0;
    document.body.classList.add('view-open');
    ui.view = name;
    document.dispatchEvent(new CustomEvent('sempoa:view', { detail: { name: name, open: true } }));
  }
  function closeView() {
    if (!ui.view) return;
    var name = ui.view;
    $('view-' + name).classList.remove('open');
    document.body.classList.remove('view-open');
    ui.view = null;
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('sempoa:view', { detail: { name: name, open: false } }));
  }
  function renderTopChips() {
    var fl = S.cur.myFlowers.length;
    $('windChip').innerHTML = tileHTML(27 + S.cfg.roundWind, 'xs') + tileHTML(27 + S.cfg.seatWind, 'xs') + (fl ? '<span class="num small">✿' + fl + '</span>' : '');
    $('windChip').hidden = !S.cfg.scoring;
  }
  function renderOppStrip(an) {
    var box = $('oppStrip');
    if (!an.reads || an.phase === 'bad') { box.innerHTML = ''; return; }
    box.innerHTML = OPPS.map(function (o) {
      var r = an.reads[o], top = r.reads[0];
      var cls = r.threat >= 0.5 ? 'risk' : r.threat >= 0.25 ? 'mid' : 'safe';
      return '<button type="button" class="opp' + (S.cur.alert[o] ? ' alert' : '') + '" data-open="tablePanel" aria-label="' + LBL[o] + ', likely ready ' + pct(r.threat) + '">' +
        ring(r.threat, cls) + '<span class="nm">' + LBL[o] + '</span><span class="rd">' + (top ? esc(top.name) : (r.threat >= 0.5 ? 'may be ready' : 'not ready')) + '</span></button>';
    }).join('');
  }
  // Turn card header: Turn N · (1) Draw → (2) Discard, current step highlighted.
  function turnSteps(step) {
    function pill(n, label) {
      var cls = step === n ? 'on' : step > n ? 'done' : '';
      return '<span class="tstep ' + cls + '"><i>' + (step > n ? '✓' : n) + '</i>' + label + '</span>';
    }
    return '<div class="turn-head"><span class="eyebrow">Turn ' + S.turn + '</span>' + pill(1, 'Draw') + '<span class="tarrow">→</span>' + pill(2, 'Discard') + '</div>';
  }
  function claimKey(cl) { return cl.from + ':' + cl.t + ':' + S.events.length; }
  var ROUTE_LABEL = { 'Chicken Hand + Additional Point': 'Chicken Hand + bonus points' };
  // List of possible winning combinations, with their odds (simulated) and distance (exact).
  function combosBlock(an, sim) {
    var all = (an.routeList || []).map(function (r) {
      var p = sim && sim.routes ? (sim.routes[r.name] || 0) : null;
      return { name: ROUTE_LABEL[r.name] || r.name, g: r.g, d: r.d, uk: r.uk, p: p, kind: r.kind };
    });
    if (!all.length) return '<div class="hero-sub">No combination reaches ' + an.M + ' points with the tiles left.</div>';
    var bySort = function (a, b) { return (b.p || 0) - (a.p || 0) || a.d - b.d || b.uk - a.uk; };
    // Seat Wind / Round Wind / Dragon = bonus combinations, shown separately
    var rows = all.filter(function (r) { return r.kind !== 'honor'; }).sort(bySort);
    // bonuses shown only when the odds are real (>= 0.5%), so it does not become a list of "<1%"
    var sec = all.filter(function (r) { return r.kind === 'honor' && (r.p == null || r.p >= 0.005); }).sort(bySort);
    var secHtml = sec.length ? '<div class="combo-sec"><span class="eyebrow">Bonus</span>' + sec.slice(0, 4).map(function (r) {
      return '<span class="pill">' + esc(r.name) + ' <span class="num">' + (r.p == null ? '…' : r.p < 0.005 ? '<1%' : pct(r.p)) + '</span></span>';
    }).join('') + '</div>' : '';
    if (!rows.length) return secHtml || '<div class="hero-sub">No main combination reaches ' + an.M + ' points yet.</div>';
    // show the ones with real odds; if few, add the 2 nearest routes for context
    var shown = rows.filter(function (r) { return r.p == null || r.p >= 0.005; }).slice(0, 5);
    if (shown.length < 2) {
      rows.filter(function (r) { return shown.indexOf(r) < 0; }).sort(function (a, b) { return a.d - b.d || b.uk - a.uk; })
        .slice(0, 2 - shown.length + 1).forEach(function (r) { shown.push(r); });
    }
    return '<div class="combos">' + shown.map(function (r) {
      var w = r.p == null ? 0 : Math.max(2, Math.round(r.p * 100));
      return '<div class="combo' + (r.p != null && r.p < 0.005 ? ' faint' : '') + '">' +
        '<div class="combo-top"><b>' + esc(r.name) + '</b><span class="num">' + (r.p == null ? '…' : r.p < 0.005 ? '<1%' : pct(r.p)) + '</span></div>' +
        '<div class="combo-bar"><i style="width:' + w + '%"></i></div>' +
        '<div class="combo-sub">' + (an.scoring ? r.g + ' points · ' : '') + (r.d === 0 ? '1 tile away' : r.d + (r.d === 1 ? ' step' : ' steps')) + ' · ' + r.uk + ' helpful tiles</div></div>';
    }).join('') + (rows.length > shown.length ? '<div class="combo-sub">+' + (rows.length - shown.length) + ' more combinations, see Details</div>' : '') + secHtml + '</div>';
  }
  function renderHero(an) {
    if (!an) return;
    renderHeroInner(an);
    var box = $('hero');
    if (an.phase !== 'bad' && !S.cur.winResult && !box.querySelector('.hero-more')) box.insertAdjacentHTML('beforeend', '<button class="hero-more" type="button" data-open="detailPanel">Details</button>');
  }
  function renderHeroInner(an) {
    var box = $('hero'), h = '';
    var over = an.over && an.over.length
      ? '<div class="hero-alt"><span>More than 4 recorded: ' + esc(tilesText(an.over)) + '</span><span class="spacer"></span><button class="btn small" type="button" data-open="tablePanel">Check</button></div>' : '';

    if (an.phase === 'bad') {
      var S0 = MJ.setsNeeded(an.cfg), need = 3 * S0 + 1, have = S.cur.hand.length;
      h += '<div class="hero-head"><span class="eyebrow">Start</span></div>' +
        '<div class="hero-text"><div class="hero-title">' + (have === 0 ? 'Enter your hand tiles' : have < need ? (need - have) + (need - have === 1 ? ' more tile' : ' more tiles') : (have - need - 1) + (have - need - 1 === 1 ? ' tile too many' : ' tiles too many')) + '</div>' +
        '<div class="hero-sub num">' + have + ' / ' + need + ' tiles</div></div>' +
        '<div class="progress big"><i style="width:' + Math.min(100, Math.round(have / need * 100)) + '%"></i></div>' +
        '<div class="steps">' +
        '<div class="step' + (have >= need ? ' done' : '') + '"><i>1</i><span>Tap <b>Scan hand</b> at the bottom and point at one row of tiles</span></div>' +
        '<div class="step"><i>2</i><span>Check the scanned tiles and tap <b>Confirm</b></span></div>' +
        '<div class="step"><i>3</i><span>See the winning combinations and their odds, then follow the next move</span></div></div>' + over;
      box.innerHTML = h;
      return;
    }

    var wr = S.cur.winResult;
    if (wr) {
      h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">' + (wr.from === 'wall' ? 'Self-draw' : 'From ' + LBL[wr.from] + ' discard') + '</span>' +
        '<div class="hero-title">HU! ' + wr.points + ' points</div>' +
        '<div class="chips">' + wr.patterns.map(function (p) { return '<span class="pill" style="border-color:rgba(42,31,6,.35);color:inherit">' + esc(p[0]) + ' ' + p[1] + '</span>'; }).join('') + '</div>' +
        '<div class="small">' + (wr.from === 'wall' ? 'All three opponents pay.' : 'Only ' + LBL[wr.from] + ' pays.') + '</div>' +
        '<div class="hero-actions"><button class="btn big" type="button" data-act="new-game">New game</button></div></div>';
      box.innerHTML = h;
      return;
    }
    if (an.complete && ui.pending) {
      box.innerHTML = '<div class="hero-head"><span class="eyebrow">Your hand looks complete</span></div><div class="hero-sub">Check the tiles above and tap <b>Confirm</b> to score your HU.</div>';
      return;
    }
    if (an.complete && (an.validWin || !an.options)) {
      var from0 = S.cur.lastIn && S.cur.lastIn.from ? S.cur.lastIn.from : 'wall';
      h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">Your hand is complete</span>' +
        '<div class="hero-title">HU?</div>' +
        '<div class="small">Answer a few questions to get the real score.</div>' +
        '<div class="hero-actions"><button class="btn big" type="button" data-act="win-check" data-from="' + from0 + '">Check score</button></div></div>';
      box.innerHTML = h;
      return;
    }

    if (an.phase === 'draw') {
      var cl = an.claim, sim = simFor(an, null), tenpai = an.vd === 0;
      if (cl && cl.options.length && ui.skipClaim !== claimKey(cl)) {
        var hu = null, better = null, others = [];
        cl.options.forEach(function (o, i) {
          o._i = i;
          if (o.type === 'hu' && o.valid) hu = o;
          else if (o.type !== 'hu' && o.better && !better) better = o;
          else others.push(o);
        });
        if (hu) {
          h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">' + LBL[cl.from] + ' discard · ' + esc(name(cl.t)) + '</span><div class="hero-title">HU!</div>' +
            '<div class="small">This tile completes your hand. Check the score before declaring.</div>' +
            '<div class="hero-actions"><button class="btn big" type="button" data-act="win-check" data-from="' + cl.from + '" data-t="' + cl.t + '">Check score</button><button class="btn ghost" type="button" data-act="skip-claim">Skip</button></div></div>';
        } else if (better) {
          var lbl = { pong: 'Pong', kong: 'Kong', chi: 'Chi' }[better.type];
          h += '<div class="claim-card"><span class="eyebrow" style="color:inherit">' + LBL[cl.from] + ' discard</span><div class="hero-title">' + lbl + '!</div>' +
            '<div class="row">' + better.tiles.map(function (t) { return tileHTML(t, 'md'); }).join('') + '<span class="small">' + (better.type === 'kong' ? 'then draw a replacement tile' : better.discard >= 0 ? 'then discard ' + esc(name(better.discard)) : '') + '</span></div>' +
            '<div class="hero-actions"><button class="btn big" type="button" data-claim="' + better._i + '">Claim</button><button class="btn ghost" type="button" data-act="skip-claim">Skip</button></div></div>';
        } else if (others.length) {
          h += '<div class="hero-alt"><span>' + others.map(function (o) {
            return o.type === 'hu' ? 'HU not valid yet (' + o.points + ' points)' : { pong: 'Pong', kong: 'Kong', chi: 'Chi' }[o.type] + ' possible, but not recommended';
          }).join(' · ') + '</span><span class="spacer"></span><button class="btn small ghost" type="button" data-open="detailPanel">Details</button></div>';
        }
      }
      var pw = endOf(sim, 'any');
      h += '<div class="turn-card">' + turnSteps(1) +
        '<div class="hero-title">Draw a tile</div>' +
        '<div class="hero-sub">Then add it with the button below.' + (tenpai ? ' Any of these wins:' : ' Hoping for:') + '</div>' + wantChips(an.ukeire.tiles, 8) +
        (an.threat >= 0.5 ? '<div class="hero-sub">' + modePill('careful') + ' an opponent may be ready</div>' : '') + '</div>';
      h += '<div class="hero-head"><span class="eyebrow">Winning chances</span><span class="hero-sub">before the wall runs out</span></div>' +
        '<div class="hero-main"><div class="hero-text"><div class="hero-title num">' + (pw == null ? '…' : pct(pw)) + '</div>' +
        '<div class="hero-sub">' + (tenpai ? 'Ready to win' : an.vd >= 99 ? 'No route to ' + an.M + ' points yet' : an.vd + (an.vd === 1 ? ' step' : ' steps') + ' to go') + '</div></div>' +
        '<div class="hero-rings">' + ringWrap(an.pNext, tenpai ? 'this draw' : 'useful') + '</div></div>' +
        combosBlock(an, sim) + over;
      box.innerHTML = h;
      return;
    }

    var best = an.best, rec = an.rec || best, mode = an.mode || 'attack';
    var bsim = simFor(an, rec.t);
    if (an.complete && !an.validWin) {
      h += '<div class="hero-alt"><span>Hand complete, but about ' + an.score.points + ' of the minimum ' + an.M + ' points.</span><span class="spacer"></span><button class="btn small" type="button" data-act="win-check" data-from="' + (S.cur.lastIn && S.cur.lastIn.from || 'wall') + '">Check score</button></div>';
    }
    var pwd = endOf(bsim, 'any');
    var why = '';
    if (mode !== 'attack') {
      var who = an.threatWho, rd = who && an.reads[who] && an.reads[who].reads[0];
      why = LBL[who] + ' may be ready' + (rd ? ' · ' + esc(rd.name) : '') + (mode === 'fold' ? '. Play safe first.' : '. Picking the safer option.');
    }
    h += '<div class="turn-card">' + turnSteps(2) +
      '<div class="hero-main">' + tileHTML(rec.t, 'lg') +
      '<div class="hero-text"><div class="hero-verb">Discard ' + modePill(mode) + '</div><div class="hero-title">' + esc(name(rec.t)) + '</div>' +
      '<div class="hero-sub">' + (why || (rec.ukeire + (rec.vd === 0 ? ' winning' : ' useful') + ' tiles still out there')) + '</div></div></div></div>';
    if (rec.t !== best.t) {
      var asim0 = simFor(an, best.t);
      h += '<div class="hero-alt">' + tileHTML(best.t, 'sm') + '<span>Attack instead: ' + esc(name(best.t)) + ' · win ' + pct(endOf(asim0, 'any')) + ' · risk ' + pct(best.risk) + '</span><span class="spacer"></span><button class="btn small" type="button" data-act="discard-best" data-t="' + best.t + '">Discard</button></div>';
    }
    h += '<div class="hero-head"><span class="eyebrow">Winning chances</span><span class="hero-sub">if you discard ' + esc(name(rec.t)) + '</span></div>' +
      '<div class="hero-main"><div class="hero-text"><div class="hero-title num">' + (pwd == null ? '…' : pct(pwd)) + '</div>' +
      '<div class="hero-sub">' + (rec.vd === 0 ? 'Ready to win' : rec.vd >= 99 ? 'No route to ' + an.M + ' points yet' : rec.vd + (rec.vd === 1 ? ' step' : ' steps') + ' to go') + '</div></div>' +
      '<div class="hero-rings">' + ringWrap(rec.risk, 'risk', riskCls(rec.risk)) + '</div></div>' +
      combosBlock(an, bsim);
    h += over;
    box.innerHTML = h;
  }

  /* ---------- new game setup: winds first ---------- */
  function windButtons(sel, kind) {
    return [0, 1, 2, 3].map(function (w) {
      return '<button type="button" data-' + kind + '="' + w + '" aria-pressed="' + (sel === w) + '">' + tileHTML(27 + w, 'md') +
        '<span>' + WIND_EN[w] + '</span><small>' + WIND_PY[w] + ' ' + MJ.HONOR_GLYPHS[w] + (kind === 'seat' && w === 0 ? ' · dealer' : '') + '</small></button>';
    }).join('');
  }
  function renderSetup() {
    $('setupRound').innerHTML = windButtons(ui.setup.round, 'round');
    $('setupSeat').innerHTML = windButtons(ui.setup.seat, 'seat');
  }
  function openSetup() {
    ui.setup = { round: S.cfg.roundWind || 0, seat: S.cfg.seatWind || 0 };
    renderSetup();
    openView('setup');
  }
  /* ---------- bottom action bar ---------- */
  var ICON = {
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/></svg>',
    type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function mainBtn(label, attrs) { return '<button class="btn primary main" type="button" ' + attrs + '>' + label + '</button>'; }
  function icBtn(icon, label, attrs, disabled) {
    return '<button class="btn ic" type="button" ' + attrs + ' aria-label="' + label + '"' + (disabled ? ' disabled' : '') + '>' + ICON[icon] + '<span>' + label + '</span></button>';
  }
  // One primary action, always at the bottom; secondary actions as small icon buttons.
  function renderDock(an) {
    var h = '', undoBtn = icBtn('undo', 'Undo', 'id="dockUndo"', !S.undo.length);
    var scanBtn = icBtn('cam', 'Scan', 'id="dockCam"'), typeBtn = icBtn('type', 'Type', 'id="dockPad"'), photoBtn = icBtn('photo', 'Photo', 'id="liveFromPhoto"');
    var n = S.cur.hand.length;
    if (ui.scanning) {
      h = mainBtn('Lock', 'id="liveLock"') + icBtn('x', 'Cancel', 'id="liveStop"');
    } else if (S.cur.winResult) {
      h = mainBtn('New game', 'data-act="new-game"');
    } else if (!an || an.phase === 'bad' && n === 0) {
      h = mainBtn('Scan hand', 'id="dockCam"') + photoBtn + typeBtn;
    } else if (ui.pending) {
      h = mainBtn('Confirm ' + n + ' tiles', 'data-act="confirm-scan"') + scanBtn + typeBtn;
    } else if (an.phase === 'bad') {
      h = mainBtn('Scan hand', 'id="dockCam"') + typeBtn + undoBtn;
    } else if (an.complete && (an.validWin || !an.options)) {
      h = mainBtn('Check score', 'data-act="win-check" data-from="' + (S.cur.lastIn && S.cur.lastIn.from || 'wall') + '"') + scanBtn + undoBtn;
    } else if (an.phase === 'draw') {
      var cl = an.claim, claimBtn = '';
      if (cl && cl.options.length && ui.skipClaim !== claimKey(cl)) {
        cl.options.forEach(function (o, i) {
          if (claimBtn) return;
          if (o.type === 'hu' && o.valid) claimBtn = mainBtn('Check HU', 'data-act="win-check" data-from="' + cl.from + '" data-t="' + cl.t + '"');
          else if (o.type !== 'hu' && o.better) claimBtn = mainBtn({ pong: 'Pong', kong: 'Kong', chi: 'Chi' }[o.type] + ' ' + esc(name(cl.t)), 'data-claim="' + i + '"');
        });
      }
      h = claimBtn ? claimBtn + icBtn('x', 'Skip', 'data-act="skip-claim"') : mainBtn('Add drawn tile', 'data-act="pad-hand"') + scanBtn + undoBtn;
    } else {
      var rec = an.rec || an.best;
      h = mainBtn('Discard ' + esc(name(rec.t)), 'data-act="discard-best" data-t="' + rec.t + '"') + scanBtn + typeBtn + undoBtn;
    }
    $('dockInner').innerHTML = h;
  }

  function startNewGame() {
    S.cfg.roundWind = ui.setup.round; S.cfg.seatWind = ui.setup.seat;
    S = newRound(S.cfg);
    simCache.clear(); ui.skipClaim = null; ui.pending = false; ui.win = null; ui.confirmReset = false;
    var ro = $('readout'); if (ro) ro.hidden = true;
    save(); render(); closeView();
    toast('Round ' + WIND_EN[S.cfg.roundWind] + ' · Seat ' + WIND_EN[S.cfg.seatWind] + '. Scan your hand.');
    if (window.SempoaScan) window.SempoaScan.start();
  }

  /* ---------- HU check: ask before scoring ---------- */
  function openWin(from, claimT) {
    ui.win = {
      from: from || 'wall', claimT: claimT == null ? null : claimT,
      open: S.cur.melds.me.length, kongs: S.cur.melds.me.filter(function (m) { return m.length === 4; }).length,
      flowers: S.cur.myFlowers.length, match: flowerMatch(), lastTile: false, robKong: false
    };
    renderWin();
    openView('win');
  }
  function winScore() {
    var w = ui.win, c = MJ.toCounts(S.cur.hand);
    if (w.claimT != null) c[w.claimT]++;
    var cfg = Object.assign({}, cfgNow(), { flowers: w.flowers, flowerMatch: Math.min(w.match, w.flowers) });
    return MJ.scoreHand(c, cfg, w.from === 'wall', { concealed: w.open === 0, kongs: w.kongs, lastTile: w.lastTile, robKong: w.robKong });
  }
  function segRow(key, values, labels) {
    return '<div class="seg full" role="group">' + values.map(function (v, i) {
      return '<button type="button" data-win="' + key + '" data-v="' + v + '" aria-pressed="' + (String(ui.win[key]) === String(v)) + '">' + (labels ? labels[i] : v) + '</button>';
    }).join('') + '</div>';
  }
  function renderWin() {
    var w = ui.win, sc = winScore(), M = MJ.minPts(cfgNow()), ok = sc.complete && sc.points >= M;
    var h = '';
    h += '<div class="q-block"><div class="q">Where did the winning tile come from?</div>' +
      segRow('from', ['wall', 'right', 'across', 'left'], ['My draw', LBL.right, LBL.across, LBL.left]) + '</div>';
    h += '<div class="q-block"><div class="q">Open sets taken from others (Pong / Chi / Kong)</div>' + segRow('open', [0, 1, 2, 3, 4]) + '</div>';
    h += '<div class="q-block"><div class="q">Kongs (open or concealed)</div>' + segRow('kongs', [0, 1, 2, 3, 4]) + '</div>';
    h += '<div class="q-block"><div class="q">Flowers you collected this game</div>' + segRow('flowers', [0, 1, 2, 3, 4, 5, 6, 7, 8]) + '</div>';
    if (w.flowers > 0) h += '<div class="q-block"><div class="q">How many show your seat number (' + (S.cfg.seatWind + 1) + ')?</div>' + segRow('match', [0, 1, 2]) + '</div>';
    h += '<div class="q-block"><label class="check"><input type="checkbox" data-wincheck="lastTile"' + (w.lastTile ? ' checked' : '') + '> Won on the last tile of the wall</label>' +
      '<label class="check"><input type="checkbox" data-wincheck="robKong"' + (w.robKong ? ' checked' : '') + '> Robbed a Kong</label></div>';
    if (!sc.complete) {
      h += '<div class="win-result no"><b>This hand is not complete.</b><span class="small">Check the tiles in Your hand.</span></div>';
    } else {
      h += '<div class="win-result ' + (ok ? 'ok' : 'no') + '"><span class="eyebrow" style="color:inherit">' + (ok ? 'Valid HU' : 'Below the minimum of ' + M + ' points') + '</span>' +
        '<div class="big">' + sc.points + ' points</div><div class="chips">' + sc.patterns.map(function (p) {
          return '<span class="pill" style="color:inherit;border-color:currentColor">' + esc(p[0]) + ' ' + p[1] + '</span>';
        }).join('') + '</div>' +
        (ok ? '<div class="small">' + (w.from === 'wall' ? 'All three opponents pay.' : 'Only ' + LBL[w.from] + ' pays.') + '</div>' : '') + '</div>';
    }
    h += '<div class="hero-actions"><button class="btn primary big" type="button" data-act="win-declare"' + (ok ? '' : ' disabled') + '>Declare HU</button></div>';
    $('winBody').innerHTML = h;
  }
  function declareWin() {
    var w = ui.win, sc = winScore();
    act('HU · ' + sc.points + ' points (' + (w.from === 'wall' ? 'self-draw' : 'from ' + LBL[w.from]) + ')', 'win', function (cur) {
      if (w.claimT != null) {
        removeLast(cur.ponds[w.from], w.claimT);
        cur.hand.push(w.claimT); cur.drawn = w.claimT;
      }
      cur.lastIn = { from: w.from };
      cur.winResult = { points: sc.points, patterns: sc.patterns, from: w.from };
    }, { who: 'me', tile: w.claimT });
    ui.win = null;
    closeView();
    toast('HU! ' + sc.points + ' points');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    var d = el.dataset;
    if (el.classList.contains('slot') && !el.classList.contains('ghost')) {
      var t = +d.t;
      ui.selHand = ui.selHand === t ? null : t;
      ui.selPond = ui.selMeld = null;
      renderRack(lastAn);
      return;
    }
    if (d.act) {
      switch (d.act) {
        case 'discard': if (ui.selHand != null) discardFromHand(ui.selHand); return;
        case 'discard-best': discardFromHand(+d.t); return;
        case 'remove':
          var rt = ui.selHand;
          act('Fix: remove ' + name(rt), 'edit', function (cur) {
            if (!removeOne(cur.hand, rt)) return false;
            if (cur.drawn === rt && cur.hand.indexOf(rt) < 0) cur.drawn = null;
          }, { who: 'me' });
          ui.selHand = null; render(); return;
        case 'cancel': ui.selHand = null; renderRack(lastAn); return;
        case 'pad-hand': closeView(); openSheet('hand'); return;
        case 'menu-new-game': openSetup(); return;
        case 'confirm-scan': ui.doubt = []; ui.pending = false; ui.selHand = null; render(); toast('Hand confirmed'); return;
        case 'rescan': ui.pending = false; ui.selHand = null; if (window.SempoaScan) window.SempoaScan.start(); return;
        case 'win-check': openWin(d.from, d.t != null && d.t !== '' ? +d.t : null); return;
        case 'win-declare': declareWin(); return;
        case 'skip-claim': if (lastAn && lastAn.claim) ui.skipClaim = claimKey(lastAn.claim); renderHero(lastAn); return;
        case 'new-game': openSetup(); return;
        case 'toggle-opts': ui.showAllOpts = !ui.showAllOpts; renderAdvice(lastAn); return;
        case 'pond-remove':
          var sp = ui.selPond;
          act('Fix: remove ' + name(S.cur.ponds[sp.seat][sp.idx]) + ' from ' + LBL[sp.seat] + ' discards', 'edit', function (cur) {
            cur.ponds[sp.seat].splice(sp.idx, 1);
          });
          ui.selPond = null; render(); return;
        case 'pond-cancel': ui.selPond = null; renderSeats(); return;
        case 'meld-remove':
          var sm = ui.selMeld;
          act('Fix: remove ' + LBL[sm.seat] + ' set', 'edit', function (cur) { cur.melds[sm.seat].splice(sm.idx, 1); });
          ui.selMeld = null; render(); return;
        case 'meld-cancel': ui.selMeld = null; renderSeats(); return;
      }
    }
    if (d.open) { openPanel(d.open); return; }
    if (d.view) { openView(d.view); return; }
    if (d.round != null) { ui.setup.round = +d.round; renderSetup(); return; }
    if (d.seat != null) { ui.setup.seat = +d.seat; renderSetup(); return; }
    if (d.win) { ui.win[d.win] = d.win === 'from' ? d.v : +d.v; if (ui.win.match > ui.win.flowers) ui.win.match = ui.win.flowers; renderWin(); return; }
    if (el.hasAttribute('data-close-view')) { closeView(); return; }
    if (d.claim != null) { doClaim(+d.claim); return; }
    if (d.flower) {
      var fn = +d.flower, has = S.cur.myFlowers.indexOf(fn) >= 0;
      act((has ? 'Remove ' : 'Got ') + FLOWER_NAME[fn], 'edit', function (cur) {
        if (has) removeOne(cur.myFlowers, fn); else cur.myFlowers.push(fn);
      }, { who: 'me' });
      return;
    }
    if (d.opt != null) {
      var ot = +d.opt;
      ui.openOpt = ui.openOpt === ot ? null : ot;
      renderAdvice(lastAn);
      return;
    }
    if (d.pond) {
      var p = d.pond.split(':');
      ui.selPond = (ui.selPond && ui.selPond.seat === p[0] && ui.selPond.idx === +p[1]) ? null : { seat: p[0], idx: +p[1] };
      ui.selMeld = null;
      renderSeats();
      return;
    }
    if (d.meld) {
      var mm = d.meld.split(':');
      ui.selMeld = (ui.selMeld && ui.selMeld.seat === mm[0] && ui.selMeld.idx === +mm[1]) ? null : { seat: mm[0], idx: +mm[1] };
      ui.selPond = null;
      renderSeats();
      return;
    }
    if (d.alert) {
      var who = d.alert, on = !S.cur.alert[who];
      act(LBL[who] + (on ? ' marked ready' : ' unmarked ready'), 'edit', function (cur) { cur.alert[who] = on; }, { who: who });
      return;
    }
    if (d.zone) { ui.zone = d.zone; renderSheet(lastAn); return; }
    if (d.who) { ui.meldWho = d.who; renderSheet(lastAn); return; }
    if (d.key != null) { addTile(ui.zone, +d.key); return; }
    switch (el.id) {
      case 'dockPad': openSheet(); return;
      case 'sheetClose': closeSheet(); return;
      case 'dockUndo': case 'undoTop': case 'sheetUndo': undo(); return;
      case 'camBtn': $('camInput').click(); return;
      case 'galBtn': $('galInput').click(); return;
      case 'stopBtn': if (photoCtl) photoCtl.abort(); return;
      case 'scopeHand': ui.scope = 'hand'; $('scopeHand').setAttribute('aria-pressed', 'true'); $('scopeTable').setAttribute('aria-pressed', 'false'); return;
      case 'scopeTable': ui.scope = 'table'; $('scopeTable').setAttribute('aria-pressed', 'true'); $('scopeHand').setAttribute('aria-pressed', 'false'); return;
      case 'draftClear': ui.draft = []; renderSheet(lastAn); return;
      case 'draftSave': saveMeld(); return;
      case 'setupStart': startNewGame(); return;
      case 'exampleNew': openSetup(); return;
      case 'exampleNewOld':
        S = newRound(S.cfg);
        simCache.clear();
        save(); render(); closeView(); openSheet('hand');
        toast('New game. Set the round and seat winds, then enter your hand tiles.');
        return;
      case 'resetBtn': ui.confirmReset = true; renderSettings(lastAn); return;
      case 'resetNo': ui.confirmReset = false; renderSettings(lastAn); return;
      case 'resetYes':
        ui.confirmReset = false; openSetup(); return;
      case 'resetYesOld':
        ui.confirmReset = false;
        S = newRound(S.cfg);
        simCache.clear();
        $('readout').hidden = true;
        save(); render(); closeView(); openSheet('hand');
        toast('New game started. Check your round and seat winds.');
        return;
    }
  });
  document.addEventListener('change', function (e) {
    var k = e.target && e.target.dataset && e.target.dataset.wincheck;
    if (k && ui.win) { ui.win[k] = e.target.checked; renderWin(); }
  });
  $('camInput').addEventListener('change', function (e) { readPhotos(e.target.files); });
  $('galInput').addEventListener('change', function (e) { readPhotos(e.target.files); });

  function cfgChanged(patch) {
    Object.assign(S.cfg, patch);
    save(); render();
  }
  $('preset').addEventListener('change', function (e) {
    var p = PRESETS[e.target.value];
    if (p) cfgChanged(Object.assign({ preset: e.target.value }, p));
    else cfgChanged({ preset: 'custom' });
  });
  $('sets').addEventListener('change', function (e) { cfgChanged({ sets: +e.target.value, preset: 'custom' }); });
  $('scoring').addEventListener('change', function (e) { cfgChanged({ scoring: e.target.checked, minPoints: e.target.checked ? (S.cfg.minPoints || 3) : S.cfg.minPoints, preset: 'custom' }); });
  $('minPoints').addEventListener('change', function (e) { cfgChanged({ minPoints: +e.target.value }); });
  $('sevenPairs').addEventListener('change', function (e) { cfgChanged({ sevenPairs: e.target.checked, preset: 'custom' }); });
  $('orphans').addEventListener('change', function (e) { cfgChanged({ thirteenOrphans: e.target.checked, preset: 'custom' }); });
  $('roundWind').addEventListener('change', function (e) { cfgChanged({ roundWind: +e.target.value }); });
  $('seatWind').addEventListener('change', function (e) { cfgChanged({ seatWind: +e.target.value }); });
  $('wallStart').addEventListener('change', function (e) {
    var v = Math.max(20, Math.min(140, +e.target.value || 83));
    cfgChanged({ wallStart: v, preset: 'custom' });
  });
  $('wallLeft').addEventListener('change', function (e) {
    var raw = e.target.value.trim();
    var phase = lastAn ? lastAn.phase : 'draw';
    S.cur.wallAdjust = raw === '' ? 0 : Math.round(+raw) - rawWallEstimate(phase);
    save(); render();
  });
  $('tier').addEventListener('change', function (e) { S.cfg.tier = e.target.value; save(); });

  var resizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (lastAn) renderRack(lastAn); }, 120);
  });

  render();
  window.Sempoa = {
    state: function () { return S; },
    closeView: function () { closeView(); },
    handNeed: function () { return 3 * MJ.setsNeeded(cfgNow()) + 1; },
    lastAnalysis: function () { return lastAn; },
    tilesText: tilesText, multisetDiff: multisetDiff, toast: toast,
    label: function (seat) { return LBL[seat]; },
    recordDraw: function (t) {
      act('Draw ' + name(t) + ' (camera)', 'draw', function (cur) { cur.hand.push(t); cur.drawn = t; cur.lastIn = { from: 'wall' }; }, { who: 'me', tile: t });
    },
    discard: function (t) { discardFromHand(t); },
    setHand: function (list, label) {
      S.example = false;
      act(label, 'photo', function (cur) { cur.hand = list.slice(); cur.drawn = null; }, { who: 'me' });
    },
    setScanning: function (on) { ui.scanning = !!on; renderDock(lastAn); },
    scanned: function (tiles, flowers, doubt) {
      S.example = false;
      // never more than 4 of a tile
      var cnt = {}, clean = [];
      doubt = (doubt || []).slice();
      tiles.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; if (cnt[t] <= 4) clean.push(t); else if (doubt.indexOf(t) < 0) doubt.push(t); });
      tiles = clean;
      ui.doubt = doubt;
      act('Scan: hand (' + tiles.length + ' tiles)', 'photo', function (cur) {
        cur.hand = tiles.slice(); cur.drawn = null; cur.winResult = null; cur.lastIn = { from: 'wall' };
        if (flowers && flowers.length > cur.myFlowers.length) cur.myFlowers = flowers.slice(0, 8);
      }, { who: 'me' });
      ui.pending = true; ui.selHand = null;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(tiles.length + ' tiles scanned · check and Confirm');
    },
    setFlowers: function (list) {
      act('Camera: Flower ' + list.join(', '), 'edit', function (cur) { cur.myFlowers = list.slice(0, 8); }, { who: 'me' });
    },
    recordDiscard: function (seat, t) {
      act(LBL[seat] + ' discards ' + name(t) + ' (camera)', 'discard', function (cur) { cur.ponds[seat].push(t); if (seat === 'me') S.turn++; }, { who: seat, tile: t });
    },
    setPond: function (seat, list) {
      act('Camera: ' + LBL[seat] + ' discards', 'photo', function (cur) { cur.ponds[seat] = list.slice(); });
    }
  };
  window.__sempoa = { state: function () { return S; }, applyVision: applyVision, visionPrompt: visionPrompt, analysis: function () { return lastAn; } };
})();
