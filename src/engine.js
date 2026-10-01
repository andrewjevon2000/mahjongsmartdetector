/* Sempoa Mahjong — mesin hitung.
 * Tile id 0..33: 0-8 = 1m-9m (wan), 9-17 = 1p-9p (tong), 18-26 = 1s-9s (tiao),
 * 27-33 = 1z-7z (East, South, West, North, White, Green, Red Dragon). Nama mengikuti buku Majé.
 * Poin mengikuti Majé House Rules (Hong Kong). Semua fungsi murni; dipakai di halaman dan di tes node.
 */
(function (root) {
  'use strict';

  var SUITS = ['m', 'p', 's', 'z'];
  var SUIT_NAMES = ['Characters', 'Dots', 'Bamboo'];
  var SUIT_ONE = ['Character', 'Dot', 'Bamboo'];
  var HONOR_NAMES = ['East', 'South', 'West', 'North', 'White Dragon', 'Green Dragon', 'Red Dragon'];
  var DRAGON_SHORT = ['White', 'Green', 'Red'];
  var HONOR_GLYPHS = ['東', '南', '西', '北', '白', '發', '中'];
  var INF = 99;

  function tileStr(i) {
    return i < 27 ? (i % 9 + 1) + SUITS[Math.floor(i / 9)] : (i - 26) + 'z';
  }

  function tileName(i) {
    if (i >= 27) return HONOR_NAMES[i - 27];
    var n = i % 9 + 1, s = Math.floor(i / 9);
    return n + ' ' + (n === 1 ? SUIT_ONE[s] : SUIT_NAMES[s]);
  }

  var ALIASES = {
    east: 27, timur: 27, '東': 27, 'e': 27,
    south: 28, selatan: 28, '南': 28,
    west: 29, barat: 29, '西': 29, 'w': 29,
    north: 30, utara: 30, '北': 30, 'n': 30,
    white: 31, putih: 31, haku: 31, '白': 31, 'wd': 31,
    green: 32, hijau: 32, hatsu: 32, '發': 32, '发': 32, 'gd': 32,
    red: 33, merah: 33, chun: 33, '中': 33, 'rd': 33
  };

  // "3p", "0m" (lima merah), "東", "east" -> id, atau -1 kalau tidak dikenal
  function parseTile(s) {
    if (typeof s === 'number') return s >= 0 && s < 34 ? Math.floor(s) : -1;
    if (s == null) return -1;
    var t = String(s).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ALIASES, t)) return ALIASES[t];
    var m = /^([0-9])\s*([mpsz])/.exec(t);
    if (!m) return -1;
    var n = +m[1], suit = m[2];
    if (suit === 'z') return n >= 1 && n <= 7 ? 26 + n : -1;
    if (n === 0) n = 5;
    return SUITS.indexOf(suit) * 9 + n - 1;
  }

  // "123m456p11z" -> [0,1,2,12,13,14,27,27]
  function parseHand(str) {
    var out = [], digits = [];
    for (var k = 0; k < str.length; k++) {
      var ch = str[k];
      if (ch >= '0' && ch <= '9') digits.push(+ch);
      else if ('mpsz'.indexOf(ch) >= 0) {
        for (var d = 0; d < digits.length; d++) {
          var id = parseTile(digits[d] + ch);
          if (id >= 0) out.push(id);
        }
        digits = [];
      }
    }
    return out;
  }

  function toCounts(list) {
    var c = new Array(34).fill(0);
    for (var i = 0; i < list.length; i++) if (list[i] >= 0) c[list[i]]++;
    return c;
  }

  function countsToList(c) {
    var out = [];
    for (var i = 0; i < 34; i++) for (var k = 0; k < c[i]; k++) out.push(i);
    return out;
  }

  function handString(list) {
    var groups = { m: [], p: [], s: [], z: [] };
    list.slice().sort(function (a, b) { return a - b; }).forEach(function (i) {
      var s = tileStr(i);
      groups[s[1]].push(s[0]);
    });
    return ['m', 'p', 's', 'z'].map(function (k) {
      return groups[k].length ? groups[k].join('') + k : '';
    }).join('');
  }

  function isHonor(t) { return t >= 27; }
  function isTermOrHonor(t) { return t >= 27 || t % 9 === 0 || t % 9 === 8; }
  function isSimple(t) { return t < 27 && t % 9 >= 1 && t % 9 <= 7; }
  function suitOf(t) { return t < 27 ? Math.floor(t / 9) : 3; }

  /* ---------- Shanten ---------- */

  // Opsi dekomposisi satu kelompok: [set, calon-set, pasangan-kepala].
  // Hanya opsi yang tidak kalah di semua komponen (dengan kepala yang sama) yang disimpan.
  var suitMemo = new Map();
  var honorMemo = new Map();

  function pareto(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i], dominated = false;
      for (var j = 0; j < list.length; j++) {
        if (i === j) continue;
        var b = list[j];
        if (b[2] === a[2] && b[0] >= a[0] && b[1] >= a[1] &&
            (b[0] > a[0] || b[1] > a[1] || j < i)) { dominated = true; break; }
      }
      if (!dominated) out.push(a);
    }
    return out;
  }

  function suitOptions(c, off) {
    var key = 0;
    for (var i = 0; i < 9; i++) key = key * 5 + c[off + i];
    var hit = suitMemo.get(key);
    if (hit) return hit;
    var a = c.slice(off, off + 9);
    var seen = {}, res = [];
    function rec(i, m, t, p) {
      while (i < 9 && a[i] === 0) i++;
      if (i >= 9) {
        var k = m * 100 + t * 10 + p;
        if (!seen[k]) { seen[k] = 1; res.push([m, t, p]); }
        return;
      }
      if (a[i] >= 3) { a[i] -= 3; rec(i, m + 1, t, p); a[i] += 3; }
      if (i <= 6 && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--; rec(i, m + 1, t, p); a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (a[i] >= 2) {
        a[i] -= 2;
        if (p === 0) rec(i, m, t, 1);
        rec(i, m, t + 1, p);
        a[i] += 2;
      }
      if (i <= 7 && a[i + 1]) { a[i]--; a[i + 1]--; rec(i, m, t + 1, p); a[i]++; a[i + 1]++; }
      if (i <= 6 && a[i + 2]) { a[i]--; a[i + 2]--; rec(i, m, t + 1, p); a[i]++; a[i + 2]++; }
      a[i]--; rec(i, m, t, p); a[i]++;
    }
    rec(0, 0, 0, 0);
    res = pareto(res);
    suitMemo.set(key, res);
    return res;
  }

  function honorOptions(c) {
    var key = 0;
    for (var i = 27; i < 34; i++) key = key * 5 + c[i];
    var hit = honorMemo.get(key);
    if (hit) return hit;
    var res = [[0, 0, 0]];
    for (var h = 27; h < 34; h++) {
      var n = c[h];
      if (n < 2) continue;
      var opts = n === 2 ? [[0, 1, 0], [0, 0, 1], [0, 0, 0]]
        : n === 3 ? [[1, 0, 0], [0, 0, 1], [0, 1, 0]]
        : [[1, 0, 0], [0, 1, 1], [1, 0, 0]];
      var next = [];
      for (var x = 0; x < res.length; x++) {
        for (var y = 0; y < opts.length; y++) {
          var p = res[x][2] + opts[y][2];
          if (p > 1) continue;
          next.push([res[x][0] + opts[y][0], res[x][1] + opts[y][1], p]);
        }
      }
      res = pareto(next);
    }
    honorMemo.set(key, res);
    return res;
  }

  // DP gabungan kelompok -> shanten untuk S set + 1 pasangan.
  function shantenFromGroups(groups, S) {
    var W = 2 * (S + 1);
    var dp = [0];
    for (var z = 1; z < W; z++) dp.push(-1);
    for (var g = 0; g < groups.length; g++) {
      var opts = groups[g];
      var nd = [];
      for (var q = 0; q < W; q++) nd.push(-1);
      for (var idx = 0; idx < W; idx++) {
        var cur = dp[idx];
        if (cur < 0) continue;
        var M = idx >> 1, P = idx & 1;
        for (var o = 0; o < opts.length; o++) {
          var op = opts[o];
          if (P + op[2] > 1) continue;
          var nm = M + op[0]; if (nm > S) nm = S;
          var ni = nm * 2 + P + op[2];
          var nt = cur + op[1]; if (nt > S) nt = S;
          if (nt > nd[ni]) nd[ni] = nt;
        }
      }
      dp = nd;
    }
    var best = INF;
    for (var i2 = 0; i2 < W; i2++) {
      if (dp[i2] < 0) continue;
      var m2 = i2 >> 1, p2 = i2 & 1;
      var t2 = Math.min(dp[i2], S - m2);
      var v = 2 * S - 2 * m2 - t2 - p2;
      if (v < best) best = v;
    }
    return best;
  }

  // Shanten bentuk standar: S set + 1 pasangan dari tile tertutup.
  function shantenStd(c, S) {
    return shantenFromGroups([suitOptions(c, 0), suitOptions(c, 9), suitOptions(c, 18), honorOptions(c)], S);
  }

  function shantenChiitoi(c) {
    var pairs = 0, kinds = 0;
    for (var i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  var ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function shantenKokushi(c) {
    var kinds = 0, pair = 0;
    for (var k = 0; k < ORPHANS.length; k++) {
      var n = c[ORPHANS[k]];
      if (n >= 1) kinds++;
      if (n >= 2) pair = 1;
    }
    return 13 - kinds - pair;
  }

  // cfg: { sets, melds:[[ids]] (set terbuka saya), sevenPairs, thirteenOrphans,
  //        scoring, minPoints, seatWind, roundWind, flowers, flowerMatch }
  function openCount(cfg) { return cfg.melds ? cfg.melds.length : (cfg.openMelds || 0); }
  function setsNeeded(cfg) { return Math.max(0, (cfg.sets || 4) - openCount(cfg)); }
  function minPts(cfg) { return cfg.scoring ? (cfg.minPoints || 0) : 0; }

  function shanten(c, cfg) {
    var S = setsNeeded(cfg);
    var best = shantenStd(c, S);
    var closed13 = (cfg.sets || 4) === 4 && openCount(cfg) === 0;
    if (closed13 && cfg.sevenPairs) best = Math.min(best, shantenChiitoi(c));
    if (closed13 && cfg.thirteenOrphans) best = Math.min(best, shantenKokushi(c));
    return best;
  }

  function handSize(c) {
    var n = 0;
    for (var i = 0; i < 34; i++) n += c[i];
    return n;
  }

  // 'draw' = sedang menunggu tarikan (3S+1), 'discard' = harus buang (3S+2), 'bad' = jumlah tidak pas
  function handPhase(c, cfg) {
    var n = handSize(c), S = setsNeeded(cfg);
    if (n === 3 * S + 1) return 'draw';
    if (n === 3 * S + 2) return 'discard';
    return 'bad';
  }

  /* ---------- Dekomposisi dengan batasan pola ---------- */

  var RULES = {};
  var ruleSeq = 0;
  function defRule(name, spec) { spec.id = ++ruleSeq; spec.name = name; RULES[name] = spec; return spec; }
  function yes() { return true; }
  function no() { return false; }
  defRule('allChows', { tileOk: function (t) { return t < 27; }, chowOk: yes, pongOk: no, pairOk: isSimple });
  defRule('allSimples', { tileOk: isSimple, chowOk: function (t) { return t % 9 >= 1 && t % 9 <= 5; }, pongOk: isSimple, pairOk: isSimple });
  defRule('chowsSimples', { tileOk: isSimple, chowOk: function (t) { return t % 9 >= 1 && t % 9 <= 5; }, pongOk: no, pairOk: isSimple });
  defRule('allPongs', { tileOk: yes, chowOk: no, pongOk: yes, pairOk: yes });
  [0, 1, 2].forEach(function (s) {
    defRule('flush' + s, { tileOk: function (t) { return t >= 27 || suitOf(t) === s; }, chowOk: yes, pongOk: yes, pairOk: yes });
  });
  defRule('outside', { tileOk: yes, chowOk: function (t) { return t % 9 === 0 || t % 9 === 6; }, pongOk: isTermOrHonor, pairOk: isTermOrHonor });

  var ruleMemo = new Map();
  function ruleOptions(c, g, rule) {
    var off = g * 9, n = g < 3 ? 9 : 7, key = 0, a = new Array(n);
    for (var i = 0; i < n; i++) {
      var v = rule.tileOk(off + i) ? c[off + i] : 0;
      a[i] = v; key = key * 5 + v;
    }
    var mk = (rule.id * 4 + g) * 1953125 + key;
    var hit = ruleMemo.get(mk);
    if (hit) return hit;
    var suit = g < 3, seen = {}, res = [];
    function chowAt(i) { return suit && i >= 0 && i <= 6 && rule.chowOk(off + i); }
    function rec(i, m, t, p) {
      while (i < n && a[i] === 0) i++;
      if (i >= n) {
        var k = m * 100 + t * 10 + p;
        if (!seen[k]) { seen[k] = 1; res.push([m, t, p]); }
        return;
      }
      var tile = off + i;
      if (a[i] >= 3 && rule.pongOk(tile)) { a[i] -= 3; rec(i, m + 1, t, p); a[i] += 3; }
      if (chowAt(i) && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--; rec(i, m + 1, t, p); a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (a[i] >= 2) {
        a[i] -= 2;
        if (p === 0 && rule.pairOk(tile)) rec(i, m, t, 1);
        if (rule.pongOk(tile)) rec(i, m, t + 1, p);
        a[i] += 2;
      }
      if (suit && i <= 7 && a[i + 1] && (chowAt(i) || chowAt(i - 1))) { a[i]--; a[i + 1]--; rec(i, m, t + 1, p); a[i]++; a[i + 1]++; }
      if (suit && i <= 6 && a[i + 2] && chowAt(i)) { a[i]--; a[i + 2]--; rec(i, m, t + 1, p); a[i]++; a[i + 2]++; }
      a[i]--; rec(i, m, t, p); a[i]++;
    }
    rec(0, 0, 0, 0);
    res = pareto(res);
    ruleMemo.set(mk, res);
    return res;
  }

  function shantenRule(c, S, rule) {
    return shantenFromGroups([ruleOptions(c, 0, rule), ruleOptions(c, 1, rule), ruleOptions(c, 2, rule), ruleOptions(c, 3, rule)], S);
  }

  function meldType(m) {
    if (m.length === 4) return 'kong';
    if (m[0] === m[1]) return 'pong';
    return 'chow';
  }
  function meldMin(m) { return Math.min.apply(null, m); }
  function meldFitsRule(rule, m) {
    for (var i = 0; i < m.length; i++) if (!rule.tileOk(m[i])) return false;
    return meldType(m) === 'chow' ? rule.chowOk(meldMin(m)) : rule.pongOk(m[0]);
  }

  /* ---------- Jalur pola yang cukup poin ---------- */

  // Nilai poin pong honor: naga 1, angin kursi 1, angin ronde 1 (bisa 2 kalau sama).
  function honorValue(t, cfg) {
    var v = 0;
    if (t >= 31) v += 1;
    if (t === 27 + (cfg.seatWind || 0)) v += 1;
    if (t === 27 + (cfg.roundWind || 0)) v += 1;
    return v;
  }

  // Nama pola untuk pong honor, pakai istilah Majé: Dragon, Seat Wind, Round Wind.
  function honorRouteName(t, cfg) {
    if (t >= 31) return 'Dragon (' + DRAGON_SHORT[t - 31] + ')';
    var seat = t === 27 + (cfg.seatWind || 0), round = t === 27 + (cfg.roundWind || 0);
    var w = HONOR_NAMES[t - 27];
    if (seat && round) return 'Seat + Round Wind (' + w + ')';
    return (seat ? 'Seat Wind (' : 'Round Wind (') + w + ')';
  }

  var RULE_ROUTES = [
    { rule: 'allChows', name: 'Sequence Hand', pts: 1 },
    { rule: 'allSimples', name: 'All Simples', pts: 1 },
    { rule: 'chowsSimples', name: 'Sequence Hand + All Simples', pts: 2 },
    { rule: 'allPongs', name: 'All Pongs', pts: 3 },
    { rule: 'flush0', name: 'Half Flush Characters', pts: 3 },
    { rule: 'flush1', name: 'Half Flush Dots', pts: 3 },
    { rule: 'flush2', name: 'Half Flush Bamboo', pts: 3 },
    { rule: 'outside', name: 'Mix Orphans', pts: 3 }
  ];

  var routeCache = new Map();
  // Daftar jalur yang, kalau selesai, pasti mencapai poin minimum.
  // g = poin minimal yang dijamin (pola + poin yang sudah pasti: tertutup, bunga, pong honor terbuka).
  function buildRoutes(cfg) {
    var melds = cfg.melds || [];
    var key = JSON.stringify([cfg.scoring, cfg.minPoints, cfg.sets, melds, cfg.openMelds, cfg.sevenPairs, cfg.thirteenOrphans,
      cfg.seatWind, cfg.roundWind, cfg.flowers, cfg.flowerMatch]);
    var hit = routeCache.get(key);
    if (hit) return hit;
    var open = openCount(cfg) > 0, four = (cfg.sets || 4) === 4, S = setsNeeded(cfg), list = [];
    if (!cfg.scoring) {
      list.push({ kind: 'std', name: 'Tangan lengkap', pts: 0, g: 0 });
      if (!open && four && cfg.sevenPairs) list.push({ kind: 'chiitoi', name: '7 Pairs', pts: 0, g: 0 });
      if (!open && four && cfg.thirteenOrphans) list.push({ kind: 'kokushi', name: '13 Orphans', pts: 0, g: 0 });
      routeCache.set(key, list);
      return list;
    }
    var M = cfg.minPoints || 0;
    var banked = 0, bankedHon = {};
    melds.forEach(function (m) {
      if (meldType(m) !== 'chow' && m[0] >= 27) { banked += honorValue(m[0], cfg); bankedHon[m[0]] = 1; }
    });
    var base = (open ? 0 : 1) + (cfg.flowerMatch || 0) + ((cfg.flowers || 0) === 0 ? 1 : 0) + banked;
    function push(r) { r.g = r.pts + base; if (r.g >= M) list.push(r); }
    push({ kind: 'std', name: 'Chicken Hand + Additional Point', pts: 0 });
    RULE_ROUTES.forEach(function (rr) {
      var rule = RULES[rr.rule];
      for (var i = 0; i < melds.length; i++) if (!meldFitsRule(rule, melds[i])) return;
      push({ kind: 'rule', rule: rule, name: rr.name, pts: rr.pts });
    });
    if (!open) {
      [0, 1, 2].forEach(function (s) { push({ kind: 'straight', suit: s, name: 'Pure Straight ' + SUIT_NAMES[s], pts: 3 }); });
      if (four && cfg.sevenPairs) push({ kind: 'chiitoi', name: '7 Pairs', pts: 4 });
      if (four && cfg.thirteenOrphans) push({ kind: 'kokushi', name: '13 Orphans', pts: 13 });
    }
    var R = M - base;
    if (R > 0) {
      var hon = [];
      for (var h = 27; h < 34; h++) {
        var v = honorValue(h, cfg);
        if (v > 0 && !bankedHon[h]) hon.push({ t: h, v: v });
      }
      (function rec(i, pick, sum) {
        if (sum >= R) {
          push({
            kind: 'honor', honors: pick.map(function (x) { return x.t; }),
            name: pick.map(function (x) { return honorRouteName(x.t, cfg); }).join(' + '),
            pts: sum
          });
          return;
        }
        if (pick.length >= S) return;
        for (var j = i; j < hon.length; j++) { pick.push(hon[j]); rec(j + 1, pick, sum + hon[j].v); pick.pop(); }
      })(0, [], 0);
    }
    routeCache.set(key, list);
    return list;
  }

  function routeDist(c, S, r, unseen) {
    var cc, need, i;
    switch (r.kind) {
      case 'std': return shantenStd(c, S);
      case 'rule': return shantenRule(c, S, r.rule);
      case 'chiitoi': return shantenChiitoi(c);
      case 'kokushi': return shantenKokushi(c);
      case 'honor':
        if (r.honors.length > S) return INF;
        cc = c.slice(); need = 0;
        for (i = 0; i < r.honors.length; i++) {
          var h = r.honors[i], have = Math.min(3, cc[h]);
          if (unseen && unseen[h] < 3 - have) return INF;
          need += 3 - have; cc[h] -= have;
        }
        return need + shantenStd(cc, S - r.honors.length);
      case 'straight':
        if (S < 3) return INF;
        cc = c.slice(); need = 0;
        var b = r.suit * 9;
        for (i = 0; i < 9; i++) {
          if (cc[b + i] > 0) cc[b + i]--;
          else { if (unseen && !unseen[b + i]) return INF; need++; }
        }
        return need + shantenStd(cc, S - 3);
    }
    return INF;
  }

  // Jarak ke tangan menang yang SAH (cukup poin). Sama dengan shanten kalau poin tidak dihitung.
  function validDistance(c, cfg, unseen, routes) {
    routes = routes || buildRoutes(cfg);
    var S = setsNeeded(cfg), best = INF;
    for (var i = 0; i < routes.length; i++) {
      var d = routeDist(c, S, routes[i], unseen);
      if (d < best) best = d;
    }
    return best;
  }

  /* ---------- Hitung poin (Majé House Rules) ---------- */

  var EXTRA = { 'Self Draw': 1, 'Concealed Hand': 1, 'No Flower': 1, 'Suitable Flower': 1 };

  function decompositions(c, S) {
    var out = [], a = c.slice(), sets = [];
    function rec(i, pair) {
      while (i < 34 && a[i] === 0) i++;
      if (i === 34) { if (sets.length === S) out.push({ pair: pair, sets: sets.slice() }); return; }
      if (sets.length >= S) return;
      if (a[i] >= 3) { a[i] -= 3; sets.push({ type: 'pong', t: i }); rec(i, pair); sets.pop(); a[i] += 3; }
      if (i < 27 && i % 9 <= 6 && a[i + 1] && a[i + 2]) {
        a[i]--; a[i + 1]--; a[i + 2]--; sets.push({ type: 'chow', t: i });
        rec(i, pair);
        sets.pop(); a[i]++; a[i + 1]++; a[i + 2]++;
      }
    }
    for (var p = 0; p < 34; p++) {
      if (a[p] >= 2) { a[p] -= 2; rec(0, p); a[p] += 2; }
    }
    return out;
  }

  function setTiles(s) {
    if (s.type === 'chow') return [s.t, s.t + 1, s.t + 2];
    if (s.type === 'kong') return [s.t, s.t, s.t, s.t];
    return [s.t, s.t, s.t];
  }

  function addExtras(p, cfg, selfDraw, concealed, opts) {
    if (selfDraw) p.push(['Self Draw', 1]);
    else if (concealed) p.push(['Concealed Hand', 1]);
    if ((cfg.flowers || 0) === 0) p.push(['No Flower', 1]);
    for (var f = 0; f < (cfg.flowerMatch || 0); f++) p.push(['Suitable Flower', 1]);
    if (opts && opts.lastTile) p.push(['Last Tile', 1]);
    if (opts && opts.robKong) p.push(['Robbing a Kong', 1]);
  }

  function flushOf(tiles) {
    var suits = {}, honors = 0, nums = 0;
    tiles.forEach(function (t) { if (t >= 27) honors++; else { suits[suitOf(t)] = 1; nums++; } });
    var ns = Object.keys(suits).length;
    return { allHonor: nums === 0, one: ns === 1, hasHonor: honors > 0 };
  }

  function scoreStd(sets, pair, cfg, selfDraw, concealed, opts) {
    var p = [], tiles = [pair, pair];
    sets.forEach(function (s) { tiles = tiles.concat(setTiles(s)); });
    var dragonP = 0, windP = 0, pongs = 0, kongs = 0, chows = 0;
    var seatT = 27 + (cfg.seatWind || 0), roundT = 27 + (cfg.roundWind || 0), seatP = false, roundP = false;
    sets.forEach(function (s) {
      if (s.type === 'chow') { chows++; return; }
      pongs++; if (s.type === 'kong') kongs++;
      if (s.t >= 31) dragonP++;
      else if (s.t >= 27) { windP++; if (s.t === seatT) seatP = true; if (s.t === roundT) roundP = true; }
    });
    var dragonPair = pair >= 31, windPair = pair >= 27 && pair < 31;
    if (dragonP === 3) p.push(['Great Dragon', 8]);
    else if (dragonP === 2 && dragonPair) p.push(['Little Dragon', 5]);
    else for (var d = 0; d < dragonP; d++) p.push(['Dragon', 1]);
    if (windP === 4) p.push(['Great Wind', 13]);
    else if (windP === 3 && windPair) p.push(['Little Wind', 10]);
    else {
      if (seatP) p.push(['Seat Wind', 1]);
      if (roundP) p.push(['Round Wind', 1]);
    }
    var fl = flushOf(tiles);
    if (chows === sets.length && isSimple(pair)) p.push(['Sequence Hand', 1]);
    if (tiles.every(isSimple)) p.push(['All Simples', 1]);
    for (var su = 0; su < 3; su++) {
      var b = su * 9, has = [false, false, false];
      sets.forEach(function (s) { if (s.type === 'chow' && s.t >= b && s.t < b + 9 && (s.t - b) % 3 === 0) has[(s.t - b) / 3] = true; });
      if (has[0] && has[1] && has[2]) { p.push(['Pure Straight', 3]); break; }
    }
    if (fl.allHonor) {
      p.push(['All Honor', 10]);
    } else {
      if (kongs === 4) p.push(['Kong Hand', 12]);
      else if (pongs === sets.length) p.push(['All Pongs', 3]);
      var outside = isTermOrHonor(pair) && sets.every(function (s) { return setTiles(s).some(isTermOrHonor); });
      if (outside) p.push(fl.hasHonor ? ['Mix Orphans', 3] : ['Pure Orphans', 5]);
      if (fl.one) p.push(fl.hasHonor ? ['Half Flush', 3] : ['Full Flush', 7]);
    }
    if (kongs === 4 && fl.allHonor) p.push(['Kong Hand', 12]);
    addExtras(p, cfg, selfDraw, concealed, opts);
    return p;
  }

  function total(p) { return p.reduce(function (a, x) { return a + x[1]; }, 0); }

  // c = tile tertutup lengkap (3S+2) termasuk tile menang. Hasil: poin terbaik dan rinciannya.
  function scoreHand(c, cfg, selfDraw, opts) {
    var melds = (cfg.melds || []).map(function (m) { return { type: meldType(m), t: meldMin(m), open: true }; });
    var concealed = melds.length === 0 && !(cfg.openMelds > 0);
    var S = setsNeeded(cfg), best = null;
    function consider(p) {
      var pts = total(p);
      if (!best || pts > best.points) best = { points: pts, patterns: p };
    }
    decompositions(c, S).forEach(function (d) {
      consider(scoreStd(d.sets.concat(melds), d.pair, cfg, selfDraw, concealed, opts));
    });
    if (concealed && (cfg.sets || 4) === 4) {
      var tiles = countsToList(c);
      // 7 Pairs
      var pairs = 0;
      for (var i = 0; i < 34; i++) if (c[i] === 2) pairs++;
      if (cfg.sevenPairs && pairs === 7) {
        var p7 = [['7 Pairs', 4]], fl = flushOf(tiles);
        if (fl.allHonor) p7.push(['All Honor', 10]);
        else {
          if (fl.one) p7.push(fl.hasHonor ? ['Half Flush', 3] : ['Full Flush', 7]);
          if (tiles.every(isTermOrHonor)) p7.push(fl.hasHonor ? ['Mix Orphans', 3] : ['Pure Orphans', 5]);
          if (tiles.every(isSimple)) p7.push(['All Simples', 1]);
        }
        addExtras(p7, cfg, selfDraw, true, opts);
        consider(p7);
      }
      if (cfg.thirteenOrphans && shantenKokushi(c) === -1) {
        var pk = [['13 Orphans', 13]];
        addExtras(pk, cfg, selfDraw, true, opts);
        consider(pk);
      }
      // Heavenly Gates: 1112345678999 satu suit + satu tile suit itu
      for (var su = 0; su < 3; su++) {
        var b = su * 9, inSuit = 0;
        for (var k = 0; k < 9; k++) inSuit += c[b + k];
        if (inSuit !== 14) continue;
        var ok = c[b] >= 3 && c[b + 8] >= 3;
        for (var k2 = 1; k2 < 8 && ok; k2++) if (c[b + k2] < 1) ok = false;
        if (ok) {
          var pg = [['Heavenly Gates', 15]];
          addExtras(pg, cfg, selfDraw, true, opts);
          consider(pg);
        }
      }
    }
    if (!best) return { points: 0, patterns: [], complete: false };
    if (!best.patterns.some(function (x) { return !EXTRA[x[0]]; })) best.patterns.unshift(['Chicken Hand', 0]);
    best.complete = true;
    return best;
  }

  function mainPattern(sc) {
    var top = null;
    sc.patterns.forEach(function (x) { if (!EXTRA[x[0]] && (!top || x[1] > top[1])) top = x; });
    return top ? top[0] : 'Chicken Hand';
  }

  /* ---------- Hitungan tile ---------- */

  // unseen[t] = 4 - di tangan - terlihat. Tile yang belum terlihat ada di dinding
  // atau tangan lawan; dari sudut pandang kita, tarikan berikutnya acak di antara mereka.
  function unseenCounts(handCounts, visibleCounts) {
    var u = new Array(34), over = [];
    for (var i = 0; i < 34; i++) {
      var r = 4 - handCounts[i] - visibleCounts[i];
      if (r < 0) { over.push(i); r = 0; }
      u[i] = r;
    }
    return { unseen: u, over: over };
  }

  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }

  // Tile yang menurunkan shanten kalau ditarik (hand 3S+1), tanpa memperhitungkan poin.
  function ukeire(c, cfg, unseen, base) {
    if (base == null) base = shanten(c, cfg);
    var tiles = [], tot = 0;
    for (var t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      var s = shanten(c, cfg);
      c[t]--;
      if (s < base) { tiles.push({ t: t, n: unseen[t] }); tot += unseen[t]; }
    }
    return { shanten: base, tiles: tiles, total: tot };
  }

  // Tile yang melengkapi tangan 3S+1, dengan poin kalau menang tarik sendiri / dari buangan.
  function winningTiles(c, cfg, unseen) {
    var out = [];
    for (var t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      if (shanten(c, cfg) === -1) {
        var ts = scoreHand(c, cfg, true), rn = scoreHand(c, cfg, false);
        out.push({ t: t, n: unseen[t], tsumo: ts.points, ron: rn.points, ronPatterns: rn.patterns, tsumoPatterns: ts.patterns });
      }
      c[t]--;
    }
    return out;
  }

  // Tile berguna menuju menang SAH.
  function validUkeire(c, cfg, unseen, routes, vd) {
    var M = minPts(cfg), tiles = [], tot = 0;
    if (vd === 0) {
      winningTiles(c, cfg, unseen).forEach(function (w) {
        if (w.tsumo >= M) { tiles.push({ t: w.t, n: w.n, tsumo: w.tsumo, ron: w.ron }); tot += w.n; }
      });
      return { tiles: tiles, total: tot };
    }
    if (vd >= INF) return { tiles: tiles, total: 0 };
    for (var t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      c[t]++;
      var d = validDistance(c, cfg, unseen, routes);
      c[t]--;
      if (d < vd) { tiles.push({ t: t, n: unseen[t] }); tot += unseen[t]; }
    }
    return { tiles: tiles, total: tot };
  }

  // Ringkasan jalur untuk tangan 3S+1: jarak tiap jalur dan tile yang mendekatkannya.
  function routeSummary(c, cfg, unseen, routes) {
    var S = setsNeeded(cfg), rows = [], seenName = {};
    routes.forEach(function (r) {
      var d = routeDist(c, S, r, unseen);
      if (d >= INF || d > 6) return;
      var n = 0;
      for (var t = 0; t < 34; t++) {
        if (c[t] >= 4 || !unseen[t]) continue;
        c[t]++;
        if (routeDist(c, S, r, unseen) < d) n += unseen[t];
        c[t]--;
      }
      rows.push({ name: r.name, g: r.g, d: d, uk: n, kind: r.kind });
    });
    rows.sort(function (a, b) { return a.d - b.d || b.uk - a.uk || b.g - a.g; });
    return rows.filter(function (r) { if (seenName[r.name]) return false; seenName[r.name] = 1; return true; });
  }

  // P(minimal satu sukses dalam k tarikan) — hipergeometrik tanpa pengembalian.
  function pAtLeastOne(U, K, k) {
    if (K <= 0 || k <= 0 || U <= 0) return 0;
    if (k > U) k = U;
    var miss = 1;
    for (var i = 0; i < k; i++) {
      var num = U - K - i;
      if (num <= 0) return 1;
      miss *= num / (U - i);
    }
    return 1 - miss;
  }

  /* ---------- Baca lawan & risiko buangan ---------- */

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function meldFeasible(ruleName, melds) {
    var rule = RULES[ruleName];
    for (var i = 0; i < melds.length; i++) if (!meldFitsRule(rule, melds[i])) return false;
    return true;
  }

  // Perkiraan peluang lawan sudah siap (tenpai) dari jumlah buangan dan set terbukanya.
  function tenpaiChance(nDiscards, nMelds, alert) {
    if (nMelds >= 4) return 1;
    var base = 0.75 / (1 + Math.exp(-(nDiscards - 10) / 2));
    var mp = [0, 0.15, 0.4, 0.7][nMelds] || 0;
    var p = 1 - (1 - base) * (1 - mp);
    if (alert) p = Math.max(p, 0.95);
    return clamp(p, 0.02, 0.99);
  }

  // Peluang tile t jadi tile penentu Hu lawan, kalau lawan sudah siap (sebelum membaca polanya).
  // Aturan HK tidak punya furiten, jadi tile yang sudah dia buang tidak 100% aman.
  function baseWait(t, pond, melds, known) {
    if (pond.indexOf(t) >= 0) return { w: 0.012, why: 'sudah dibuang lawan ini' };
    for (var i = 0; i < melds.length; i++) {
      if (meldType(melds[i]) === 'pong' && melds[i][0] === t) return { w: 0.004, why: 'sudah dia Pong' };
    }
    if (t >= 27) {
      var k = known[t];
      if (k >= 4) return { w: 0, why: 'semua salinan terlihat' };
      if (k === 3) return { w: 0.01, why: '3 salinan terlihat' };
      if (k === 2) return { w: 0.03, why: '2 salinan terlihat' };
      return { w: 0.05, why: 'honor yang belum banyak terlihat' };
    }
    var n = t % 9 + 1, b = t - (n - 1);
    var w = (n === 1 || n === 9) ? 0.06 : (n === 2 || n === 8) ? 0.09 : 0.12;
    var why = [];
    function inPond(x) { return x >= 1 && x <= 9 && pond.indexOf(b + x - 1) >= 0; }
    if (n <= 3) { if (inPond(n + 3)) { w *= 0.75; why.push('suji ' + (n + 3)); } }
    else if (n >= 7) { if (inPond(n - 3)) { w *= 0.75; why.push('suji ' + (n - 3)); } }
    else {
      var lo = inPond(n - 3), hi = inPond(n + 3);
      if (lo && hi) { w *= 0.75; why.push('suji ' + (n - 3) + '-' + (n + 3)); }
      else if (lo || hi) { w *= 0.88; why.push('setengah suji'); }
    }
    function gone(x) { return x < 1 || x > 9 || known[b + x - 1] >= 4; }
    if ((gone(n + 1) || gone(n + 2)) && (gone(n - 1) || gone(n - 2))) { w *= 0.5; why.push('tetangganya sudah habis'); }
    if (known[t] >= 3) { w *= 0.7; why.push('3 salinan terlihat'); }
    return { w: w, why: why.join(', ') || 'tile tengah, belum ada petunjuk' };
  }

  // opp: { pond:[ids], melds:[[ids]], alert, seatWind }; ctx: { roundWind, known, unseen, minPoints }
  function readOpponent(opp, ctx) {
    var pond = opp.pond || [], melds = opp.melds || [];
    var reads = [], suitCount = [0, 0, 0], honorD = 0;
    pond.forEach(function (t) { if (t < 27) suitCount[suitOf(t)]++; else honorD++; });
    var late = pond.slice(-4);
    var honorMelds = melds.filter(function (m) { return m[0] >= 27; }).length;
    for (var s = 0; s < 3; s++) {
      if (!meldFeasible('flush' + s, melds)) continue;
      var conf = 0;
      var meldIn = melds.filter(function (m) { return m.some(function (t) { return t < 27 && suitOf(t) === s; }); }).length;
      // satu set terbuka saja bukti lemah; makin banyak set satu jenis, makin kuat
      if (melds.length) conf += meldIn ? [0, 0.2, 0.4, 0.55, 0.6][Math.min(4, meldIn)] : (honorMelds ? 0.1 : 0);
      if (pond.length >= 5) {
        var others = pond.length - suitCount[s] - honorD;
        if (suitCount[s] === 0 && others >= 4) conf += 0.35;
        else if (suitCount[s] === 1 && others >= 5) conf += 0.15;
        else if (suitCount[s] >= 3) conf -= 0.3;
      }
      if (late.some(function (t) { return t < 27 && suitOf(t) === s; })) conf -= 0.25;
      conf = clamp(conf, 0, 0.9);
      if (conf >= 0.25) {
        var full = !honorMelds && honorD >= 2 && conf >= 0.5;
        reads.push({ kind: 'flush', suit: s, conf: conf, name: (full ? 'Full Flush ' : 'Half Flush ') + SUIT_NAMES[s],
          avoid: SUIT_NAMES[s] + (full ? '' : ' & Honors') });
      }
    }
    var pongs = melds.filter(function (m) { return meldType(m) !== 'chow'; }).length;
    if (pongs >= 2 && pongs === melds.length) {
      reads.push({ kind: 'pongs', conf: Math.min(0.85, 0.35 + 0.15 * pongs), name: 'All Pongs', avoid: 'tile yang masih banyak sisa (bisa jadi pair/pong)' });
    }
    var dragonP = melds.filter(function (m) { return meldType(m) !== 'chow' && m[0] >= 31; }).map(function (m) { return m[0]; });
    if (dragonP.length >= 2) {
      var dleft = [31, 32, 33].filter(function (t) { return dragonP.indexOf(t) < 0; });
      reads.push({ kind: 'honors', conf: 0.8, name: dragonP.length === 3 ? 'Great Dragon' : 'Little/Great Dragon', tiles: dleft,
        avoid: dleft.map(function (t) { return HONOR_NAMES[t - 27]; }).join(', ') || 'Dragon' });
    }
    var windP = melds.filter(function (m) { return meldType(m) !== 'chow' && m[0] >= 27 && m[0] < 31; }).map(function (m) { return m[0]; });
    if (windP.length >= 2) {
      var wleft = [27, 28, 29, 30].filter(function (t) { return windP.indexOf(t) < 0; });
      reads.push({ kind: 'honors', conf: windP.length >= 3 ? 0.8 : 0.45, name: windP.length >= 3 ? 'Little/Great Wind' : 'Wind', tiles: wleft,
        avoid: wleft.map(function (t) { return HONOR_NAMES[t - 27]; }).join(', ') });
    }
    if (melds.length >= 2 && meldFeasible('outside', melds) && pond.length >= 4) {
      var mid = pond.filter(function (t) { return t < 27 && t % 9 >= 2 && t % 9 <= 6; }).length;
      if (mid / pond.length >= 0.6) reads.push({ kind: 'outside', conf: 0.45, name: 'Mix Orphans', avoid: '1, 9 & Honors' });
    }
    var oppCfg = { seatWind: opp.seatWind || 0, roundWind: ctx.roundWind || 0 };
    var banked = 0;
    melds.forEach(function (m) { if (meldType(m) !== 'chow' && m[0] >= 27) banked += honorValue(m[0], oppCfg); });
    var threat = tenpaiChance(pond.length, melds.length, opp.alert);
    var notes = [];
    // Set terbuka tanpa poin dan tidak cocok pola besar: susah capai poin minimum lewat buangan.
    if (melds.length && (ctx.minPoints || 0) >= 3 && banked === 0 && !opp.alert) {
      var anyBig = [0, 1, 2].some(function (x) { return meldFeasible('flush' + x, melds); }) ||
        meldFeasible('allPongs', melds) || meldFeasible('outside', melds);
      if (!anyBig) { threat *= 0.6; notes.push('set terbukanya tidak cocok pola besar, susah capai ' + ctx.minPoints + ' poin'); }
    }
    if (banked) notes.push('sudah punya ' + banked + ' poin dari Pong honor');
    var wait = new Array(34), why = new Array(34);
    for (var t = 0; t < 34; t++) {
      var r = baseWait(t, pond, melds, ctx.known), w = r.w, ww = r.why;
      for (var q = 0; q < reads.length; q++) {
        var rd = reads[q], cf = rd.conf;
        if (rd.kind === 'flush') {
          if (t < 27 && suitOf(t) !== rd.suit) w *= 1 - 0.85 * cf;
          else { w *= 1 + (t < 27 ? 0.9 : 0.6) * cf; ww = 'cocok dengan tebakan ' + rd.name; }
        } else if (rd.kind === 'pongs') {
          if (ctx.unseen[t] >= 2) { w *= 1 + 0.5 * cf; } else w *= 1 - 0.5 * cf;
        } else if (rd.kind === 'honors') {
          if (rd.tiles.indexOf(t) >= 0) { w *= 1 + 2.5 * cf; ww = 'bisa melengkapi ' + rd.name; }
        } else if (rd.kind === 'outside') {
          if (t < 27 && t % 9 >= 3 && t % 9 <= 5) w *= 1 - 0.8 * cf;
          else if (isTermOrHonor(t)) { w *= 1 + 0.6 * cf; ww = 'cocok dengan tebakan Mix Orphans'; }
        }
      }
      wait[t] = clamp(w, 0, 0.5);
      why[t] = ww;
    }
    reads.sort(function (a, b) { return b.conf - a.conf; });
    return { threat: threat, reads: reads, wait: wait, why: why, banked: banked, notes: notes, nDiscards: pond.length };
  }

  // Peluang membuang t langsung membuat salah satu lawan Hu.
  function discardRisk(t, reads) {
    var safe = 1, worst = null, worstV = -1;
    Object.keys(reads).forEach(function (o) {
      var p = reads[o].threat * reads[o].wait[t];
      safe *= 1 - p;
      if (p > worstV) { worstV = p; worst = o; }
    });
    return { risk: 1 - safe, vs: worst, why: worst ? reads[worst].why[t] : '' };
  }

  // Kompatibilitas: skor bahaya lama (0..1) untuk satu lawan.
  function dangerVs(t, pond, known) {
    var r = baseWait(t, pond, [], known);
    return { d: r.w / 0.12 * 0.65, why: r.why };
  }

  /* ---------- Analisis ---------- */

  // state: { hand:[ids], visible:[34 counts], opps:{right,across,left: {pond, melds, alert, seatWind}},
  //          cfg, drawsLeft, selfDraw }  (ponds/alert lama masih diterima)
  function analyze(state) {
    var cfg = state.cfg;
    var c = toCounts(state.hand);
    var phase = handPhase(c, cfg);
    var uc = unseenCounts(c, state.visible);
    var unseen = uc.unseen, U = sum(unseen);
    var known = new Array(34);
    for (var i = 0; i < 34; i++) known[i] = c[i] + state.visible[i];
    var k = Math.max(1, state.drawsLeft | 0);
    var routes = buildRoutes(cfg), M = minPts(cfg);
    var out = { phase: phase, unseen: unseen, U: U, over: uc.over, drawsLeft: k, known: known, M: M, scoring: !!cfg.scoring, routesAll: routes };

    var oppNames = ['right', 'across', 'left'];
    var opps = state.opps || {};
    var reads = {}, T = 0, Twho = null;
    oppNames.forEach(function (o) {
      var src = opps[o] || { pond: (state.ponds && state.ponds[o]) || [], melds: [], alert: state.alert && state.alert[o] };
      reads[o] = readOpponent(src, { roundWind: cfg.roundWind, known: known, unseen: unseen, minPoints: M });
      if (reads[o].threat > T) { T = reads[o].threat; Twho = o; }
    });
    out.reads = reads; out.threat = T; out.threatWho = Twho;
    if (phase === 'bad') return out;

    if (phase === 'draw') {
      var sh = shanten(c, cfg);
      var vd = validDistance(c, cfg, unseen, routes);
      out.shanten = sh; out.vd = vd;
      if (sh === 0) out.waits = winningTiles(c, cfg, unseen);
      out.ukeire = validUkeire(c, cfg, unseen, routes, vd);
      out.pNext = U ? out.ukeire.total / U : 0;
      out.pWithin = pAtLeastOne(U, out.ukeire.total, k);
      out.routeList = routeSummary(c, cfg, unseen, routes);
      return out;
    }

    var sh14 = shanten(c, cfg);
    out.shantenNow = sh14;
    if (sh14 === -1) {
      out.complete = true;
      out.score = scoreHand(c, cfg, !!state.selfDraw);
      out.validWin = out.score.points >= M;
      if (out.validWin) return out;
    }
    out.vdNow = validDistance(c, cfg, unseen, routes);
    var opts = [];
    for (var t = 0; t < 34; t++) {
      if (!c[t]) continue;
      c[t]--;
      var s = shanten(c, cfg);
      var v = validDistance(c, cfg, unseen, routes);
      var uk = validUkeire(c, cfg, unseen, routes, v);
      var plain = ukeire(c, cfg, unseen, s);
      c[t]++;
      var rk = discardRisk(t, reads);
      opts.push({
        t: t, shanten: s, vd: v, ukeire: uk.total, tiles: uk.tiles, plainUkeire: plain.total,
        pNext: U ? uk.total / U : 0, pWithin: pAtLeastOne(U, uk.total, k),
        risk: rk.risk, riskVs: rk.vs, riskWhy: rk.why
      });
    }
    opts.sort(function (a, b) {
      return a.vd - b.vd || b.ukeire - a.ukeire || a.shanten - b.shanten || b.plainUkeire - a.plainUkeire || a.risk - b.risk || a.t - b.t;
    });
    function minRisk(list) {
      return list.slice().sort(function (a, b) { return a.risk - b.risk || a.vd - b.vd || b.ukeire - a.ukeire; })[0];
    }
    var atk = opts[0], mode = 'attack', rec = atk;
    if (T >= 0.3) {
      if (atk.vd <= 0) {
        // sudah siap menang sah: tetap siap, tapi pilih tunggu yang lebih aman kalau ada
        var keep0 = opts.filter(function (o) { return o.vd === atk.vd && o.ukeire >= atk.ukeire * 0.5; });
        var s0 = minRisk(keep0);
        if (atk.risk > 0.08 && s0.risk < atk.risk - 0.02) { mode = 'careful'; rec = s0; }
      } else if ((atk.vd >= 2 && T >= 0.5) || (atk.vd === 1 && T >= 0.7)) {
        mode = 'fold'; rec = minRisk(opts);
      } else {
        var keep1 = opts.filter(function (o) { return o.vd === atk.vd && o.ukeire >= atk.ukeire * 0.7; });
        var s1 = minRisk(keep1);
        if (s1.risk < atk.risk - 0.01) { mode = 'careful'; rec = s1; }
      }
    }
    out.options = opts;
    out.best = atk;
    out.rec = rec;
    out.mode = mode;
    out.safest = minRisk(opts);
    c[rec.t]--;
    out.routeList = routeSummary(c, cfg, unseen, routes);
    if (rec.vd === 0 || rec.shanten === 0) out.waits = winningTiles(c, cfg, unseen);
    c[rec.t]++;
    return out;
  }

  // Saran klaim untuk buangan lawan t (tangan kita 3S+1). from = 'right'|'across'|'left'.
  function claimOptions(state, t, from) {
    var cfg = state.cfg, c = toCounts(state.hand);
    if (handPhase(c, cfg) !== 'draw') return [];
    var unseen = unseenCounts(c, state.visible).unseen;
    var M = minPts(cfg), cur = validDistance(c, cfg, unseen), res = [];
    c[t]++;
    if (shanten(c, cfg) === -1) {
      var sc = scoreHand(c, cfg, false);
      res.push({ type: 'hu', tiles: [t], points: sc.points, patterns: sc.patterns, valid: sc.points >= M });
    }
    c[t]--;
    function withMeld(tiles) {
      return Object.assign({}, cfg, { melds: (cfg.melds || []).concat([tiles]), openMelds: undefined });
    }
    function bestAfter(c2, cfg2) {
      var best = { vd: INF, t: -1 };
      var r2 = buildRoutes(cfg2);
      for (var x = 0; x < 34; x++) {
        if (!c2[x]) continue;
        c2[x]--;
        var v = validDistance(c2, cfg2, unseen, r2);
        c2[x]++;
        if (v < best.vd) best = { vd: v, t: x };
      }
      return best;
    }
    if (c[t] >= 2) {
      var cp = c.slice(); cp[t] -= 2;
      var mp = [t, t, t], bp = bestAfter(cp, withMeld(mp));
      res.push({ type: 'pong', tiles: mp, vd: bp.vd, discard: bp.t, cur: cur, better: bp.vd < cur });
    }
    if (c[t] >= 3) {
      var ck = c.slice(); ck[t] -= 3;
      var mk = [t, t, t, t], cfgK = withMeld(mk);
      var vk = validDistance(ck, cfgK, unseen);
      res.push({ type: 'kong', tiles: mk, vd: vk, cur: cur, better: vk <= cur });
    }
    if (from === 'left' && t < 27) {
      var r = t % 9, b = t - r;
      [[-2, -1], [-1, 1], [1, 2]].forEach(function (pr) {
        var a1 = r + pr[0], a2 = r + pr[1];
        if (a1 < 0 || a2 > 8 || a1 > 8 || a2 < 0) return;
        var x1 = b + a1, x2 = b + a2;
        if (!c[x1] || !c[x2]) return;
        var cc = c.slice(); cc[x1]--; cc[x2]--;
        var tiles = [x1, x2, t].sort(function (m, n) { return m - n; });
        var bc = bestAfter(cc, withMeld(tiles));
        res.push({ type: 'chi', tiles: tiles, vd: bc.vd, discard: bc.t, cur: cur, better: bc.vd < cur });
      });
    }
    return res;
  }

  /* ---------- Simulasi Monte Carlo ---------- */

  function rngFrom(seed) {
    var x = (seed >>> 0) || 0x9e3779b9;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  function relevantTiles(c) {
    var rel = [];
    for (var t = 0; t < 34; t++) {
      if (c[t] >= 4) continue;
      if (c[t] > 0) { rel.push(t); continue; }
      if (t >= 27) continue;
      var n = t % 9, b = t - n, hit = false;
      for (var d = -2; d <= 2 && !hit; d++) {
        var x = n + d;
        if (d !== 0 && x >= 0 && x <= 8 && c[b + x] > 0) hit = true;
      }
      if (hit) rel.push(t);
    }
    return rel;
  }

  function quickUkeire(c, cfg, belief, base) {
    var rel = relevantTiles(c), tot = 0;
    for (var i = 0; i < rel.length; i++) {
      var t = rel[i];
      if (!belief[t]) continue;
      c[t]++;
      if (shanten(c, cfg) < base) tot += belief[t];
      c[t]--;
    }
    return tot;
  }

  // Simulasi dari tangan 3S+1. Tiap putaran: kita tarik 1 tile lalu buang dengan strategi
  // rakus menuju menang sah; 3 lawan masing-masing membuang 1 tile acak dari tile tak terlihat
  // (hanya bisa kita pakai untuk menang). Menang dihitung hanya kalau poinnya cukup.
  function simulate(hand13, cfg, unseen, draws, sims, seed) {
    var M = minPts(cfg), S = setsNeeded(cfg);
    var routes = buildRoutes(cfg);
    var d0 = routes.map(function (r) { return routeDist(hand13, S, r, unseen); });
    var mn = Math.min.apply(null, d0.concat([INF]));
    var active = routes.filter(function (r, i) { return d0[i] < INF && d0[i] <= mn + 2; });
    var pool0 = [];
    for (var t = 0; t < 34; t++) for (var k = 0; k < unseen[t]; k++) pool0.push(t);
    var rnd = rngFrom(seed || 1);
    var tsumo = new Array(draws + 1).fill(0), any = new Array(draws + 1).fill(0), tenpai = new Array(draws + 1).fill(0);
    var patterns = {}, ptsSum = 0, wins = 0;
    var pool = pool0.slice(), L = pool.length, perRound = 4;
    var maxDraws = Math.min(draws, Math.floor(L / perRound));
    function vdist(c, belief) {
      var b = INF, n = 0;
      for (var i = 0; i < active.length; i++) {
        var d = routeDist(c, S, active[i], belief);
        if (d < b) { b = d; n = 1; } else if (d === b) n++;
      }
      // lebih kecil = lebih baik; >> 4 memberi jarak, 4 bit bawah = sedikit jalur alternatif
      return b * 16 + (15 - Math.min(n, 15));
    }
    function scoreOk(c, selfDraw) {
      var sc = scoreHand(c, cfg, selfDraw);
      return sc.points >= M ? sc : null;
    }
    function record(sc) {
      var name = sc ? mainPattern(sc) : 'Tangan lengkap';
      patterns[name] = (patterns[name] || 0) + 1;
      ptsSum += sc ? sc.points : 0; wins++;
    }
    if (active.length) {
      for (var sIdx = 0; sIdx < sims; sIdx++) {
        var need = Math.min(L, maxDraws * perRound);
        for (var i = 0; i < need; i++) {
          var j = i + Math.floor(rnd() * (L - i));
          var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        var c = hand13.slice(), belief = unseen.slice();
        var cur = vdist(c, belief);
        var tenpaiAt = (cur >> 4) === 0 ? 0 : -1;
        var wonTsumo = -1, wonAny = -1;
        for (var r = 0; r < maxDraws; r++) {
          var d = pool[r * perRound];
          belief[d]--;
          c[d]++;
          if (shanten(c, cfg) === -1) {
            var sc = scoreOk(c, true);
            if (sc) { wonTsumo = r + 1; if (wonAny < 0) { wonAny = r + 1; record(sc); } break; }
          }
          var bestKey = 1e9, cands = [];
          for (var x = 0; x < 34; x++) {
            if (!c[x]) continue;
            c[x]--;
            var key = vdist(c, belief) * 16 + Math.min(15, shanten(c, cfg));
            c[x]++;
            if (key < bestKey) { bestKey = key; cands = [x]; }
            else if (key === bestKey) cands.push(x);
          }
          var pick = cands[0];
          if (cands.length > 1) {
            var bestU = -1, base = bestKey % 16;
            for (var q = 0; q < cands.length; q++) {
              c[cands[q]]--;
              var uk = quickUkeire(c, cfg, belief, base);
              c[cands[q]]++;
              if (uk > bestU) { bestU = uk; pick = cands[q]; }
            }
          }
          c[pick]--;
          cur = Math.floor(bestKey / 16);
          var validTenpai = (cur >> 4) === 0;
          if (tenpaiAt < 0 && validTenpai) tenpaiAt = r + 1;
          if (validTenpai && wonAny < 0) {
            for (var o = 1; o < perRound; o++) {
              var od = pool[r * perRound + o];
              c[od]++;
              var win = shanten(c, cfg) === -1 ? scoreOk(c, false) : null;
              c[od]--;
              if (win) { wonAny = r + 1; record(win); break; }
            }
          }
          for (var o2 = 1; o2 < perRound; o2++) belief[pool[r * perRound + o2]]--;
        }
        if (wonTsumo > 0) tsumo[wonTsumo]++;
        if (wonAny > 0) any[wonAny]++;
        if (tenpaiAt >= 0) tenpai[tenpaiAt]++;
      }
    }
    function cumulative(a) {
      var out = [], run = 0;
      for (var i2 = 0; i2 <= draws; i2++) { run += a[i2] || 0; out.push(run / sims); }
      return out;
    }
    var pat = {};
    Object.keys(patterns).forEach(function (n) { pat[n] = patterns[n] / sims; });
    return {
      sims: sims, draws: maxDraws, tsumo: cumulative(tsumo), any: cumulative(any), tenpai: cumulative(tenpai),
      patterns: pat, avgPoints: wins ? ptsSum / wins : 0
    };
  }

  var MJ = {
    tileStr: tileStr, tileName: tileName, parseTile: parseTile, parseHand: parseHand,
    toCounts: toCounts, countsToList: countsToList, handString: handString,
    shanten: shanten, shantenStd: shantenStd, shantenChiitoi: shantenChiitoi,
    shantenKokushi: shantenKokushi, handPhase: handPhase, handSize: handSize,
    setsNeeded: setsNeeded, unseenCounts: unseenCounts, ukeire: ukeire,
    pAtLeastOne: pAtLeastOne, dangerVs: dangerVs, readOpponent: readOpponent, discardRisk: discardRisk, tenpaiChance: tenpaiChance, analyze: analyze, simulate: simulate,
    buildRoutes: buildRoutes, validDistance: validDistance, scoreHand: scoreHand,
    winningTiles: winningTiles, claimOptions: claimOptions, meldType: meldType, minPts: minPts,
    HONOR_GLYPHS: HONOR_GLYPHS, HONOR_NAMES: HONOR_NAMES, SUIT_NAMES: SUIT_NAMES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MJ;
  else root.MJ = MJ;
})(typeof self !== 'undefined' ? self : this);
