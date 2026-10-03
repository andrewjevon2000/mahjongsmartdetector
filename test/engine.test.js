// node test/engine.test.js
const MJ = require('../src/engine.js');
let fail = 0, pass = 0;
function eq(name, got, want) {
  if (got === want) { pass++; return; }
  fail++; console.log('FAIL', name, 'got', got, 'want', want);
}
const H = (s) => MJ.toCounts(MJ.parseHand(s));
const cfg4 = { sets: 4, openMelds: 0, sevenPairs: true, thirteenOrphans: true };
const cfgStd = { sets: 4, openMelds: 0, sevenPairs: false, thirteenOrphans: false };

// --- kasus tangan yang diketahui ---
eq('complete 14', MJ.shanten(H('123m456p789s11222z'), cfgStd), -1);
eq('shanpon tenpai', MJ.shanten(H('123m456p789s1122z'), cfgStd), 0);
eq('kokushi 13-wait', MJ.shanten(H('19m19p19s1234567z'), cfg4), 0);
eq('kokushi complete', MJ.shanten(H('19m19p19s12345677z'), cfg4), -1);
eq('chiitoi tenpai', MJ.shanten(H('1122m3344p5566s7z'), cfg4), 0);
eq('chiitoi std only', MJ.shanten(H('1122m3344p5566s7z'), cfgStd), 3);
eq('worst std', MJ.shanten(H('147m258p369s1234z'), cfgStd), 8);
eq('worst with 7 pairs', MJ.shanten(H('147m258p369s1234z'), cfg4), 6);
eq('1-shanten no pair', MJ.shanten(H('123456789m45p78s'), cfgStd), 1);
eq('nine gates tenpai', MJ.shanten(H('1112345678999m'), cfgStd), 0);
eq('open 2 melds, 7 tiles tenpai', MJ.shanten(H('123m55p67s'), { sets: 4, openMelds: 2 }), 0);
eq('open 4 melds tanki', MJ.shanten(H('5z'), { sets: 4, openMelds: 4 }), 0);
eq('16-tile complete', MJ.shanten(H('123m456m789m123p456p99s'), { sets: 5 }), -1);
eq('16-tile tenpai', MJ.shanten(H('123m456m789m123p45p99s'), { sets: 5 }), 0);
eq('parse honors', MJ.parseTile('東'), 27);
eq('parse red five', MJ.parseTile('0p'), 13);
eq('parse word', MJ.parseTile('Red'), 33);
eq('handString', MJ.handString(MJ.parseHand('321m11z9s')), '123m9s11z');

// --- pembanding independen: definisi shanten lewat penukaran tile ---
function isComplete(c, S) {
  // S set + 1 pasangan, cek rekursif murni
  const a = c.slice();
  function melds(i, left) {
    while (i < 34 && a[i] === 0) i++;
    if (i >= 34) return left === 0;
    if (left === 0) return false;
    if (a[i] >= 3) { a[i] -= 3; const ok = melds(i, left - 1); a[i] += 3; if (ok) return true; }
    if (i < 27 && i % 9 <= 6 && a[i + 1] && a[i + 2]) {
      a[i]--; a[i + 1]--; a[i + 2]--;
      const ok = melds(i, left - 1);
      a[i]++; a[i + 1]++; a[i + 2]++;
      if (ok) return true;
    }
    return false;
  }
  for (let p = 0; p < 34; p++) {
    if (a[p] >= 2) {
      a[p] -= 2;
      const ok = melds(0, S);
      a[p] += 2;
      if (ok) return true;
    }
  }
  return false;
}
function tenpaiBrute(c, S) {
  for (let t = 0; t < 34; t++) {
    if (c[t] >= 4) continue;
    c[t]++;
    const ok = isComplete(c, S);
    c[t]--;
    if (ok) return true;
  }
  return false;
}
// shanten <= n ? (n = 0,1) lewat definisi: tukar satu tile lalu cek
function withinBrute(c, S, n) {
  if (tenpaiBrute(c, S)) return true;
  if (n === 0) return false;
  for (let d = 0; d < 34; d++) {
    if (!c[d]) continue;
    c[d]--;
    for (let t = 0; t < 34; t++) {
      if (t === d || c[t] >= 4) continue;
      c[t]++;
      const ok = withinBrute(c, S, n - 1);
      c[t]--;
      if (ok) { c[d]++; return true; }
    }
    c[d]++;
  }
  return false;
}

let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randomHand(n, suitBias) {
  const wall = [];
  for (let t = 0; t < 34; t++) for (let k = 0; k < 4; k++) wall.push(t);
  const c = new Array(34).fill(0);
  let got = 0;
  while (got < n) {
    const t = suitBias ? Math.floor(rnd() * 9) + 9 * Math.floor(rnd() * 2) : wall[Math.floor(rnd() * wall.length)];
    if (c[t] >= 4) continue;
    c[t]++; got++;
  }
  return c;
}
let checked = { 0: 0, 1: 0, other: 0 };
for (let i = 0; i < 400; i++) {
  const c = randomHand(13, i % 2 === 0);
  const s = MJ.shanten(c, cfgStd);
  const b0 = tenpaiBrute(c, 4);
  eq('tenpai agrees #' + i + ' ' + MJ.handString(MJ.countsToList(c)), s <= 0, b0);
  if (!b0 && s <= 2) {
    const b1 = withinBrute(c, 4, 1);
    eq('1-shanten agrees #' + i + ' ' + MJ.handString(MJ.countsToList(c)), s <= 1, b1);
    checked[s === 1 ? 1 : 'other']++;
  } else if (b0) checked[0]++;
}
console.log('brute-checked', checked);

// ukeire harus sama dengan tile yang membuat tenpai (untuk tangan 1-shanten) / menang (tenpai)
const tenpaiHand = H('123m456p789s23m55z');
const u = MJ.ukeire(tenpaiHand, cfgStd, new Array(34).fill(4));
eq('waits 1m/4m', u.tiles.map(x => MJ.tileStr(x.t)).join(','), '1m,4m');

// hipergeometrik
eq('p1 draw', MJ.pAtLeastOne(100, 10, 1).toFixed(4), '0.1000');
eq('p none left', MJ.pAtLeastOne(100, 0, 5), 0);
eq('p certain', MJ.pAtLeastOne(10, 10, 1), 1);

// analisis contoh
const an = MJ.analyze({
  hand: MJ.parseHand('234m67m345p79p23s55s'),
  visible: new Array(34).fill(0),
  ponds: { right: [], across: [], left: [] },
  cfg: cfg4, drawsLeft: 10
});
eq('example phase', an.phase, 'discard');
console.log('example best discard:', MJ.tileStr(an.best.t), 'shanten', an.best.shanten, 'ukeire', an.best.ukeire);
console.log('top options:', an.options.slice(0, 5).map(o => MJ.tileStr(o.t) + ':' + o.shanten + '/' + o.ukeire).join('  '));

// benchmark simulasi
const hand13 = H('234m67m345p7p23s55s');
const unseen = MJ.unseenCounts(hand13, new Array(34).fill(0)).unseen;
let t0 = Date.now();
const sim = MJ.simulate(hand13, cfg4, unseen, 15, 400, 7);
console.log('sim 400x15 ms', Date.now() - t0, 'win any', sim.any[15].toFixed(3), 'tsumo', sim.tsumo[15].toFixed(3), 'tenpai', sim.tenpai[15].toFixed(3));


// --- Hong Kong scoring ---
const HK = { sets: 4, melds: [], sevenPairs: true, thirteenOrphans: true, scoring: true, minPoints: 3,
  seatWind: 1, roundWind: 1, flowers: 1, flowerMatch: 0 }; // kursi & ronde Selatan, 1 bunga tidak cocok
const T = (list) => list.map(MJ.parseTile);
function pts(hand, cfgOver, selfDraw) {
  const cfg = Object.assign({}, HK, cfgOver || {});
  const sc = MJ.scoreHand(H(hand), cfg, !!selfDraw);
  return sc.points + ' ' + sc.patterns.map(p => p[0] + ':' + p[1]).join(',');
}
eq('chicken open ron', pts('456p789s111z55p', { melds: [T(['1m','2m','3m'])] }), '0 Chicken Hand:0');
eq('chicken open tsumo', pts('456p789s111z55p', { melds: [T(['1m','2m','3m'])] }, true), '1 Chicken Hand:0,Self Draw:1');
eq('half flush concealed', pts('123555789s22266z'), '6 Half Flush:3,Seat Wind:1,Round Wind:1,Concealed Hand:1');
eq('half flush, East seat', pts('123555789s22266z', { seatWind: 0, roundWind: 0 }), '4 Half Flush:3,Concealed Hand:1');
eq('full flush', pts('12334567899922p'), '8 Full Flush:7,Concealed Hand:1');
eq('all pongs + dragon', pts('555p222m999s77711z'), '5 All Pongs:3,Dragon:1,Concealed Hand:1');
eq('sequence + simples', pts('234567m345p67855s'), '3 All Chow:1,No Orphan:1,Concealed Hand:1');
eq('seven pairs', pts('1144p22m88s55m66p77z'), '5 7 Pairs:4,Concealed Hand:1');
eq('little dragon', pts('123456m55577766z'), '9 Little Dragon:5,Half Flush:3,Concealed Hand:1');
eq('great dragon', pts('123m555666777z99p'), '12 Great Dragon:8,Mix Orphans:3,Concealed Hand:1');
eq('seat+round south pong', pts('123m456p789s22233z'), '3 Seat Wind:1,Round Wind:1,Pure Straight:0'.replace(',Pure Straight:0','') + ',Concealed Hand:1');
eq('pure straight', pts('123456789m11p567s'), '4 Pure Straight:3,Concealed Hand:1');
eq('mix orphans', pts('123p123s789p11155z'), '5 Mix Orphans:3,Concealed Hand:1'.replace('5 ', '4 ') );
eq('13 orphans', pts('19m19p19s12345677z'), '14 13 Orphans:13,Concealed Hand:1');
eq('nine gates', pts('11123456789995m'), '16 Heavenly Gates:15,Concealed Hand:1');
eq('no flower + suitable flower', pts('234567m345p67855s', { flowers: 0 }), '4 All Chow:1,No Orphan:1,Concealed Hand:1,No Flower:1');
eq('suitable flower x1', pts('234567m345p67855s', { flowers: 2, flowerMatch: 1 }), '4 All Chow:1,No Orphan:1,Concealed Hand:1,Suitable Flower:1');

// versi besar menggantikan versi kecil; jenis berbeda tetap dijumlah
eq('great wind replaces seat/round, all pongs stays', pts('11122233344455p'.replace('11122233344455p','111222333444z55p')), '20 Great Wind:13,All Pongs:3,Half Flush:3,Concealed Hand:1');
eq('little wind replaces winds', pts('111222333z44z123m'), '17 Little Wind:10,Mix Orphans:3,Half Flush:3,Concealed Hand:1');
eq('full flush replaces half flush', pts('11122233344455p').includes('Half Flush'), false);
eq('kong hand replaces all pongs', pts('55p', { melds: [T(['1m','1m','1m','1m']), T(['2p','2p','2p','2p']), T(['7z','7z','7z','7z']), T(['9s','9s','9s','9s'])] }, true), '14 Kong Hand:12,Dragon:1,Self Draw:1');
eq('little dragon + half flush summed', pts('123456m55577766z').startsWith('9 '), true);

// --- baca lawan & bertahan ---
const P = (list) => list.map(MJ.parseTile);
const known0 = new Array(34).fill(0), unseen0 = new Array(34).fill(4);
const ctx0 = { roundWind: 0, known: known0, unseen: unseen0, minPoints: 3 };
const flushOpp = MJ.readOpponent({ pond: P(['9m','2p','7m','1z','3p','8m','5p']), melds: [P(['1s','1s','1s']), P(['4s','5s','6s'])], seatWind: 1 }, ctx0);
eq('reads half flush bamboo', flushOpp.reads[0] && flushOpp.reads[0].name, 'Half Flush Bamboo');
eq('bamboo more dangerous than characters vs flush', flushOpp.wait[MJ.parseTile('5s')] > 3 * flushOpp.wait[MJ.parseTile('5m')], true);
eq('threat grows with melds', MJ.tenpaiChance(8, 0) < MJ.tenpaiChance(8, 2) && MJ.tenpaiChance(8, 2) < MJ.tenpaiChance(8, 3), true);
eq('4 melds = surely ready', MJ.tenpaiChance(3, 4), 1);
const dragOpp = MJ.readOpponent({ pond: P(['9m','2p']), melds: [P(['7z','7z','7z']), P(['6z','6z','6z'])], seatWind: 2 }, ctx0);
eq('two dragon pongs -> third dragon hot', dragOpp.wait[MJ.parseTile('5z')] > 0.1, true);
const weakOpp = MJ.readOpponent({ pond: P(['1z','2z','9m','1p','9s','3z','4z','8m']), melds: [P(['4m','5m','6m']), P(['5p','5p','5p'])], seatWind: 3 }, ctx0);
const sameShape = MJ.tenpaiChance(8, 2);
eq('weak open hand: lower threat', weakOpp.threat < sameShape, true);
eq('weak open hand: note explains', weakOpp.notes.join(' ').includes('hard to reach'), true);
// keputusan: tangan masih jauh, lawan sangat siap -> bertahan, buang yang paling aman
const anFold = MJ.analyze({
  hand: MJ.parseHand('147m258p369s1234z5s'), visible: new Array(34).fill(0), cfg: HK, drawsLeft: 8,
  opps: { right: { pond: P(['9m','2p','7m','1z','3p','8m','5p','4m','9p','2z','6m']), melds: [P(['1s','1s','1s']), P(['4s','5s','6s']), P(['7s','8s','9s'])], alert: true, seatWind: 1 },
          across: { pond: [], melds: [] }, left: { pond: [], melds: [] } }
});
eq('far hand vs ready opponent -> fold', anFold.mode, 'fold');
eq('fold picks the lowest-risk tile', anFold.rec.risk <= Math.min(...anFold.options.map(o => o.risk)) + 1e-9, true);
eq('fold avoids bamboo', MJ.tileStr(anFold.rec.t).endsWith('s'), false);
console.log('fold rec', MJ.tileStr(anFold.rec.t), 'risk', anFold.rec.risk.toFixed(3), 'vs attack', MJ.tileStr(anFold.best.t), anFold.best.risk.toFixed(3));
// tidak ada ancaman -> serang
const anAtk = MJ.analyze({ hand: MJ.parseHand('234m67m345p79p23s55s'), visible: new Array(34).fill(0), cfg: HK, drawsLeft: 12,
  opps: { right: { pond: P(['1z','9m']), melds: [] }, across: { pond: P(['2z']), melds: [] }, left: { pond: P(['3z']), melds: [] } } });
eq('early game -> attack', anAtk.mode, 'attack');

const oneChi = MJ.readOpponent({ pond: P(['4z','1m','8s','5z']), melds: [P(['4p','5p','6p'])], seatWind: 3 }, ctx0);
eq('one chi + 4 discards is not a flush read', oneChi.reads.length, 0);

// jarak menang sah: tangan tenpai tanpa poin, dengan kursi Selatan dan bunga (tanpa bonus)
const openChicken = { melds: [T(['1m','2m','3m'])] };
const cfgOpen = Object.assign({}, HK, openChicken);
const hOpen = H('456p789s111z5p'); // tunggu 5p, tapi 0 poin (terbuka, dari buangan)
eq('open chicken plain tenpai', MJ.shanten(hOpen, cfgOpen), 0);
eq('open chicken not valid tenpai', MJ.validDistance(hOpen, cfgOpen, new Array(34).fill(4)) > 0, true);
const hFlush = H('123555789s2226z'); // half flush tiao, tunggu 6z / tanki
eq('half flush valid tenpai', MJ.validDistance(hFlush, HK, new Array(34).fill(4)), 0);
eq('scoring off = shanten', MJ.validDistance(hOpen, Object.assign({}, cfgOpen, { scoring: false }), new Array(34).fill(4)), 0);
// jalur pong honor: dua naga di tangan, butuh satu lagi untuk pong
const hDragon = H('123m456p789s77z4s5s');
const routes = MJ.buildRoutes(Object.assign({}, HK, { melds: [], flowers: 1 }));
console.log('routes (concealed, 1 flower):', routes.map(r => r.name + '=' + r.g).join(' | '));

// klaim: pong naga yang membuat tangan sah
const claim = MJ.claimOptions({ hand: MJ.parseHand('123m456p77z45s99s1z'), visible: new Array(34).fill(0), cfg: Object.assign({}, HK) }, 33, 'right');
console.log('claim on 7z:', JSON.stringify(claim.map(x => ({ type: x.type, vd: x.vd, cur: x.cur, better: x.better }))));

// benchmark simulasi dengan poin
const hSim = H('234m67m345p7p23s55s');
const uSim = MJ.unseenCounts(hSim, new Array(34).fill(0)).unseen;
let t1 = Date.now();
const simP = MJ.simulate(hSim, HK, uSim, 15, 300, 11);
console.log('sim hk 300x15 ms', Date.now() - t1, 'any', simP.any[15].toFixed(3), 'tsumo', simP.tsumo[15].toFixed(3), 'avg pts', simP.avgPoints.toFixed(2), 'patterns', JSON.stringify(simP.patterns));
let t2 = Date.now();
const anP = MJ.analyze({ hand: MJ.parseHand('234m67m345p79p23s55s'), visible: new Array(34).fill(0), ponds: { right: [], across: [], left: [] }, cfg: HK, drawsLeft: 12 });
console.log('analyze hk ms', Date.now() - t2, 'best', MJ.tileStr(anP.best.t), 'vd', anP.best.vd, 'uk', anP.best.ukeire, 'routes', anP.routeList.slice(0, 4).map(r => r.name + ' d' + r.d + ' g' + r.g).join(' | '));


// peluang per kombinasi: tiap jalur yang terpenuhi dicatat; yang terbesar harus <= peluang menang total
{
  const hs = H('234m67m345p7p23s55s');
  const us = MJ.unseenCounts(hs, new Array(34).fill(0)).unseen;
  const r = MJ.simulate(hs, HK, us, 12, 200, 5);
  const names = Object.keys(r.routes);
  eq('routes recorded', names.length > 0, true);
  eq('route prob <= total', Math.max(...names.map(n => r.routes[n])) <= r.any[r.draws] + 1e-9, true);
  console.log('route probs:', names.map(n => n + ' ' + (r.routes[n] * 100).toFixed(0) + '%').join(' | '), '| total', (r.any[r.draws] * 100).toFixed(0) + '%');
}


// combination guide: Half Flush Bamboo on a mostly-bamboo hand -> drop the non-bamboo tiles
{
  const cfgG = Object.assign({}, HK);
  const hg = H('123s456s789s55s3m7p6z');
  const routes = MJ.buildRoutes(cfgG);
  const hf = routes.find(r => r.name === 'Half Flush Bamboo');
  const g = MJ.routeGuide(hg, cfgG, new Array(34).fill(4), hf);
  eq('guide drops off-suit tiles', ['3m','7p'].every(s => g.drop.map(MJ.tileStr).includes(s)), true);
  eq('guide keeps bamboo', g.keep.every(x => x >= 18), true);
  eq('guide collects bamboo/honors only', g.need.every(x => x.t >= 18), true);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
