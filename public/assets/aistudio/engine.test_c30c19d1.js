// Run with: node tests/engine.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { globalThis: null, console, Math, Date, Set, Array, Object };
ctx.globalThis = ctx;
vm.createContext(ctx);
['config', 'maps', 'engine'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f });
});
const DL = ctx.DL;
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
check(JSON.stringify(Object.keys(DL.config.playerPalettes)) === JSON.stringify(['teal', 'orange', 'violet']), 'Playground Appearance must offer exactly teal, orange and violet as alternatives');
check(DL.config.players[0].main === '#4F83E8' && DL.config.players[1].main === '#E56F98', 'Default player colours must remain blue and pink');

check(JSON.stringify(DL.Maps.list.map((m) => m.id)) === JSON.stringify(['orbit', 'citadel', 'infinity']), 'Only the three final maps should be available');

for (const m of DL.Maps.list) {
  for (const portrait of [false, true]) {
    const M = DL.Maps.build(m.id, portrait);
    // All map designs preserve their intended geometric constraints.
    if (!portrait && m.id === 'orbit') {
      const radii = M.dense.map((q) => Math.hypot(q.x, q.y));
      check(Math.max(...radii) - Math.min(...radii) < 0.01, 'Orbit must be a true circle, not an oval');
    }
    if (!portrait && m.id === 'citadel') {
      const pts = [M.dense[0], M.dense[400], M.dense[800], M.dense[1200]];
      const ds = pts.map((q, i) => Math.hypot(q.x - pts[(i + 1) % 4].x, q.y - pts[(i + 1) % 4].y));
      const diag = Math.hypot(pts[0].x - pts[2].x, pts[0].y - pts[2].y);
      check(Math.max(...ds) - Math.min(...ds) < 0.01 && Math.abs(diag - Math.SQRT2 * ds[0]) < 0.1, 'Citadel must remain a true square');
    }
    if (!portrait && m.id === 'infinity') {
      const d = 150 * 1.176 / 2;
      const first = M.dense.slice(0, 2000).map((q) => Math.hypot(q.x + d, q.y));
      const second = M.dense.slice(2000).map((q) => Math.hypot(q.x - d, q.y));
      check(Math.max(...first) - Math.min(...first) < 0.01, 'Infinity left loop must be circular');
      check(Math.max(...second) - Math.min(...second) < 0.01, 'Infinity right loop must be circular');
    }
    // spacing between distinct tiles must leave room for tiles
    let min = Infinity;
    for (let i = 0; i < M.n; i++) for (let j = i + 1; j < M.n; j++) {
      if (M.tileId[i] === M.tileId[j]) continue;
      min = Math.min(min, Math.hypot(M.pts[i].x - M.pts[j].x, M.pts[i].y - M.pts[j].y));
    }
    check(min > M.tileR * 1.9, `${m.id} tiles too close: ${min.toFixed(1)} vs ${M.tileR.toFixed(1)}`);
    // special tiles never overlap
    for (const b of M.boost) { check(!M.safe.has(b), `${m.id} boost on safe ${b}`); check(!M.junction.has(b), `${m.id} boost on junction`); check(!M.entry.includes(b), `${m.id} boost on gate`); }
    for (const s of M.safe) { check(!M.junction.has(s), `${m.id} safe on junction`); }
    // The start tile is the home-lane gate, reached again after the full outer lap.
    check(M.entry[0] === M.start[0] && M.entry[1] === M.start[1], `${m.id} start must equal home gate`);
    check(M.rl === M.n + 1, `${m.id} must contain one complete outer lap plus the return-to-gate position`);
    // lanes do not cross each other and stay clear of the centre
    const h0 = M.lanes[0][M.lane - 1], h1 = M.lanes[1][M.lane - 1];
    check(Math.hypot(h0.x - h1.x, h0.y - h1.y) > M.tileR * 3, `${m.id} homes too close`);
    // symmetry: player two is the 180deg image of player one
    const a = M.pts[M.start[0]], b = M.pts[M.start[1]];
    const sym = (u, v) => (Math.abs(u.x + v.x) < 1.5 && Math.abs(u.y + v.y) < 1.5) || (m.id === 'infinity' && (portrait ? Math.abs(u.y + v.y) < 1.5 && Math.abs(u.x - v.x) < 1.5 : Math.abs(u.x + v.x) < 1.5 && Math.abs(u.y - v.y) < 1.5));
    check(sym(a, b), `${m.id} starts not symmetric`);
    const e0 = M.pts[M.entry[0]], e1 = M.pts[M.entry[1]];
    check(sym(e0, e1), `${m.id} gates not symmetric`);
    if (!portrait) console.log(m.id.padEnd(9), 'n', M.n, 'ringLen', M.rl, 'pathLen', M.len, 'spacing', M.spacing.toFixed(1), 'minGap', min.toFixed(1), 'gate0', JSON.stringify(e0, (k, v) => typeof v === 'number' ? Math.round(v) : v));
  }
}

// Dice distributions, selectable stacked tokens and RNG save/restore.
const classic = DL.Engine.create({ map: 'orbit', tokens: 4, names: ['A', 'B'], seed: 123, diceMode: 'classic' });
for (let i = 0; i < 100; i++) {
  const roll = DL.Engine.rollDice(classic, 0);
  check(roll.probabilities.every((v) => Math.abs(v - 1 / 6) < 1e-12), 'Classic dice must always use exactly 1/6 probability');
  check(roll.mode === 'classic', 'Classic roll should declare its mode');
}
const drama = DL.Engine.create({ map: 'orbit', tokens: 4, names: ['A', 'B'], seed: 123, diceMode: 'drama' });
for (let i = 0; i < 100; i++) {
  const roll = DL.Engine.rollDice(drama, 0);
  check(Math.abs(roll.probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'Drama probabilities must normalize to 100%');
  check(roll.mode === 'drama', 'Drama roll should declare its mode');
  if (i === 0) check(roll.probabilities.some((v) => Math.abs(v - 1 / 6) > 1e-5), 'Modern/Drama should visibly differ from equal Classic odds');
}
const stacked = DL.Engine.create({ map: 'orbit', tokens: 4, names: ['A', 'B'], seed: 123 });
const requireOne = DL.Engine.create({ map: 'orbit', tokens: 2, names: ['A', 'B'], requireOneToEnter: true });
const anyEntry = DL.Engine.create({ map: 'orbit', tokens: 2, names: ['A', 'B'], requireOneToEnter: false });
check(DL.Engine.legalMoves(requireOne, 0, 2).length === 0, 'When entry rule is on, only a 1 can open a token');
check(DL.Engine.legalMoves(anyEntry, 0, 2).length === 2, 'When entry rule is off, any dice number can open a token');
check(JSON.stringify(DL.Engine.legalMoves(stacked, 0, 1)) === JSON.stringify([0, 1, 2, 3]), 'Every stacked base token should remain individually selectable');
// A full-lap token must return to the exact same gate tile before it can enter home.
const lap = DL.Engine.create({ map: 'orbit', tokens: 1, names: ['A', 'B'], seed: 77, requireOneToEnter: true });
lap.map.boost = new Set(); // isolate route progression from optional boost tiles
const entryMove = DL.Engine.doMove(lap, 0, 0, 1);
check(entryMove.entered && lap.players[0].tokens[0] === 0, 'A 1 should place the token on its gate/start tile');
const gateBeforeLap = DL.Engine.posOf(lap.map, 0, 0);
DL.Engine.doMove(lap, 0, 0, lap.map.n);
const gateAfterLap = DL.Engine.posOf(lap.map, 0, lap.players[0].tokens[0]);
check(lap.players[0].tokens[0] === lap.map.n, 'A token must travel n outer steps and return to the gate');
check(Math.hypot(gateBeforeLap.x - gateAfterLap.x, gateBeforeLap.y - gateAfterLap.y) < 1e-9, 'Full lap must end at the exact same gate coordinate');
DL.Engine.doMove(lap, 0, 0, 1);
check(lap.players[0].tokens[0] === lap.map.rl, 'Only after returning to the gate does the token enter its home lane');
const rngA = DL.Engine.create({ map: 'orbit', tokens: 1, names: ['A', 'B'], seed: 4321 });
const rngSaved = rngA.rng.getState(); const expectedNext = rngA.rng();
const rngB = DL.Engine.create({ map: 'orbit', tokens: 1, names: ['A', 'B'], seed: 1 }); rngB.rng.setState(rngSaved);
check(rngB.rng() === expectedNext, 'RNG state should restore exactly');

// full games
const levels = ['easy', 'normal', 'hard'];
check(JSON.stringify(DL.Maps.list.map((m) => m.id)) === JSON.stringify(['orbit', 'citadel', 'infinity']), 'Only the three final maps should be available');

for (const m of DL.Maps.list) {
  const res = { wins: [0, 0], stuck: 0, rolls: 0, caps: 0, boosts: 0, games: 0 };
  for (let g = 0; g < 360; g++) {
    const tokens = 1 + (g % 6);
    const st = DL.Engine.create({ map: m.id, tokens, bot: true, level: levels[g % 3], names: ['A', 'B'], seed: g * 7 + 1, portrait: g % 2 === 0 });
    // Alternate the first player so map statistics do not confuse player-one start advantage with map balance.
    st.turn = g % 2;
    let done = false;
    for (let step = 0; step < 30000; step++) {
      const p = st.turn;
      const r = DL.Engine.rollDice(st, p);
      let extra = false;
      if (r.legal.length) {
        const ti = DL.Engine.botChoose(st, p, r.v, r.legal);
        const plan = DL.Engine.doMove(st, p, ti, r.v);
        if (plan.boosted) res.boosts++;
        // invariant: no token past home
        check(st.players[p].tokens.every((t) => t <= st.map.home), 'token beyond home');
        if (DL.Engine.isWin(st, p)) { res.wins[p]++; done = true; break; }
        extra = r.v === 6 || plan.captured || plan.reachedHome;
      }
      if (!extra) st.turn = 1 - st.turn;
    }
    if (!done) res.stuck++;
    res.games++;
    res.rolls += st.players[0].stats.rolls + st.players[1].stats.rolls;
    res.caps += st.players[0].stats.captures + st.players[1].stats.captures;
  }
  console.log(m.id.padEnd(9), 'wins', res.wins.join('/'), 'stuck', res.stuck, 'avgRolls', Math.round(res.rolls / res.games), 'avgCaps', (res.caps / res.games).toFixed(1), 'boosts', res.boosts);
  check(res.stuck === 0, m.id + ' has stuck games');
}
console.log(failed ? `\n${failed} FAILURES` : '\nall engine checks passed');
process.exit(failed ? 1 : 0);
