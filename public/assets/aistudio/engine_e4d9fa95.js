(function (DL) {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function mulberry32(seed) {
    let state = seed >>> 0;
    const next = function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.getState = () => state >>> 0;
    next.setState = (value) => { state = value >>> 0; };
    return next;
  }

  const ringIdx = (M, p, prog) => (M.start[p] + prog) % M.n;
  const posOf = (M, p, prog) => (prog < M.rl ? M.pts[ringIdx(M, p, prog)] : M.lanes[p][prog - M.rl]);
  const tileKey = (M, p, prog) => (prog < M.rl ? 'r' + M.tileId[ringIdx(M, p, prog)] : 'l' + p + '_' + (prog - M.rl));

  function create(o) {
    const mk = (name, bot) => ({
      name, bot,
      tokens: Array(o.tokens).fill(-1),
      rolls: [], misses: 0, homeMisses: 0,
      stats: { rolls: 0, sixes: 0, captures: 0, extra: 0, moves: 0, lost: 0 }
    });
    return {
      map: DL.Maps.build(o.map, !!o.portrait),
      portrait: !!o.portrait,
      n: o.tokens,
      level: o.level || 'normal',
      diceMode: o.diceMode === 'drama' ? 'drama' : 'classic',
      requireOneToEnter: o.requireOneToEnter !== false,
      colors: Array.isArray(o.colors) && o.colors.length === 2 ? o.colors : DL.config.players,
      boardTheme: o.boardTheme || 'soft',
      turn: 0,
      moves: 0,
      rng: mulberry32(o.seed == null ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : o.seed),
      players: [mk(o.names[0], false), mk(o.names[1], !!o.bot)]
    };
  }

  function legalMoves(st, p, v) {
    const M = st.map;
    const out = [];
    st.players[p].tokens.forEach((t, i) => {
      if (t === M.home) return;
      if (t < 0) { if (st.requireOneToEnter && v !== 1) return; }
      else if (t + v > M.home) return;
      // Keep every token index, including tokens sharing a tile, independently selectable.
      out.push(i);
    });
    return out;
  }

  function oppOnTile(st, p, prog) {
    const M = st.map;
    const o = 1 - p;
    const tid = M.tileId[ringIdx(M, p, prog)];
    const res = [];
    st.players[o].tokens.forEach((t, i) => {
      if (t >= 0 && t < M.rl && M.tileId[ringIdx(M, o, t)] === tid) res.push(i);
    });
    return res;
  }

  function resolveCapture(st, p, q, caps, idx) {
    const M = st.map;
    if (q >= M.rl) return;
    if (M.safe.has(ringIdx(M, p, q))) return;
    const list = oppOnTile(st, p, q);
    if (list.length !== 1) return;
    const o = 1 - p;
    const ti = list[0];
    caps.push({ p: o, ti, prog: st.players[o].tokens[ti], idx });
    st.players[o].tokens[ti] = -1;
    st.players[p].stats.captures++;
    st.players[o].stats.lost++;
  }

  function doMove(st, p, ti, v) {
    const M = st.map;
    const pl = st.players[p];
    const from = pl.tokens[ti];
    let q = from < 0 ? 0 : from + v;
    const seq = [];
    if (from < 0) seq.push(0);
    else for (let k = from + 1; k <= q; k++) seq.push(k);
    pl.tokens[ti] = q;

    const caps = [];
    resolveCapture(st, p, q, caps, seq.length - 1);

    let boosted = false;
    if (q < M.rl && M.boost.has(ringIdx(M, p, q)) && q + 3 <= M.rl - 1) {
      boosted = true;
      for (let k = q + 1; k <= q + 3; k++) seq.push(k);
      q += 3;
      pl.tokens[ti] = q;
      resolveCapture(st, p, q, caps, seq.length - 1);
    }
    if (q === M.home) pl.homeMisses = 0;
    pl.stats.moves++;
    st.moves++;
    return { p, ti, from, to: q, seq, caps, boosted, entered: from < 0, reachedHome: q === M.home, captured: caps.length > 0 };
  }

  const isWin = (st, p) => st.players[p].tokens.every((t) => t === st.map.home);

  /* Dice modes: Classic is uniform; Modern (stored internally as drama) is disclosed and adaptive. */
  function rollDice(st, p) {
    const M = st.map;
    const me = st.players[p];
    const op = st.players[1 - p];
    const w = [0, 1, 1, 1, 1, 1, 1];
    const reasons = [];

    if (st.diceMode === 'drama') {
      if (me.tokens.every((t) => t < 0) && me.misses > 0) {
        w[1] *= 1 + 0.22 * Math.min(me.misses, 6);
        reasons.push('Helping you leave base');
      }

      let need = 0;
      for (const t of me.tokens) {
        if (t >= 0 && t < M.home && M.home - t <= 6) {
          const n = M.home - t;
          if (!need || n < need) need = n;
        }
      }
      if (need) {
        if (me.homeMisses >= 3) { w[need] *= 1 + 0.15 * Math.min(me.homeMisses - 2, 4); reasons.push('Home stretch nudge'); }
        else if (me.homeMisses <= 1) w[need] *= 0.9;
      }

      const prog = (s) => s.tokens.reduce((a, t) => a + (t < 0 ? 0 : t + 1), 0) / (st.n * M.len);
      const balance = clamp((prog(op) - prog(me)) * 5, -1, 1);
      for (let k = 1; k <= 6; k++) w[k] *= k >= 4 ? 1 + 0.3 * balance : 1 - 0.15 * balance;
      if (balance > 0.35) reasons.push('Catch-up boost');
      else if (balance < -0.35) reasons.push('Leader balance');

      const recent = me.rolls;
      if (recent.length >= 2 && recent[recent.length - 1] === recent[recent.length - 2]) {
        w[recent[recent.length - 1]] *= 0.5;
        reasons.push('Streak breaker');
      }
      for (let k = 1; k <= 6; k++) {
        w[k] *= 0.9 + 0.2 * st.rng();
        w[k] = clamp(w[k], 0.5, 1.7);
      }
    } else {
      reasons.push('Classic mode: all six faces have equal 16.67% odds');
    }

    const total = w.slice(1).reduce((a, b) => a + b, 0);
    const probabilities = w.slice(1).map((weight) => weight / total);
    let x = st.rng() * total;
    let v = 6;
    for (let k = 1; k <= 6; k++) { x -= w[k]; if (x <= 0) { v = k; break; } }

    me.rolls.push(v);
    if (me.rolls.length > 6) me.rolls.shift();
    me.stats.rolls++;
    if (v === 6) me.stats.sixes++;

    const legal = legalMoves(st, p, v);
    me.misses = legal.length === 0 ? me.misses + 1 : 0;
    const needNow = me.tokens.some((t) => t >= 0 && t < M.home && M.home - t <= 6);
    if (needNow) {
      if (legal.some((i) => me.tokens[i] >= 0 && me.tokens[i] + v === M.home)) me.homeMisses = 0;
      else me.homeMisses++;
    }
    return { v, w: w.slice(1), probabilities, reasons, legal, mode: st.diceMode };
  }

  /* ---- robo: evaluate the complete result of each move, including boosts and captures ---- */
  function dangerAt(st, p, prog) {
    const M = st.map;
    if (prog < 0 || prog >= M.rl) return 0;
    const r = ringIdx(M, p, prog);
    if (M.safe.has(r)) return 0;
    const tid = M.tileId[r];
    const o = 1 - p;
    let d = 0;
    for (const t of st.players[o].tokens) {
      if (t < 0 || t >= M.rl) continue;
      for (let k = 1; k <= 6; k++) {
        if (t + k <= M.rl - 1 && M.tileId[ringIdx(M, o, t + k)] === tid) { d++; break; }
      }
    }
    return d;
  }

  function cloneForSearch(st) {
    return {
      map: st.map, n: st.n, turn: st.turn, moves: st.moves, level: st.level, diceMode: st.diceMode,
      requireOneToEnter: st.requireOneToEnter,
      rng: st.rng,
      players: st.players.map((pl) => ({
        name: pl.name, bot: pl.bot, tokens: pl.tokens.slice(), rolls: pl.rolls.slice(), misses: pl.misses,
        homeMisses: pl.homeMisses, stats: Object.assign({}, pl.stats)
      }))
    };
  }

  function evaluatePosition(st, perspective) {
    const M = st.map;
    let score = 0;
    for (let p = 0; p < 2; p++) {
      const sign = p === perspective ? 1 : -1;
      const pl = st.players[p];
      let value = 0;
      for (const t of pl.tokens) {
        if (t === M.home) { value += 145; continue; }
        if (t < 0) continue;
        if (t >= M.rl) value += 42 + (t - M.rl) * 5;
        else {
          value += (t + 1) * 0.72;
          const r = ringIdx(M, p, t);
          if (M.safe.has(r)) value += 19;
          value -= dangerAt(st, p, t) * 24;
          const targets = oppOnTile(st, p, t);
          if (targets.length === 1) value += 8;
        }
      }
      value += pl.stats.captures * 7;
      value -= pl.stats.lost * 5;
      score += sign * value;
    }
    return score;
  }

  function simulate(st, p, ti, v) {
    const next = cloneForSearch(st);
    const plan = doMove(next, p, ti, v);
    return { state: next, plan };
  }

  function scoreMove(st, p, ti, v) {
    const simulated = simulate(st, p, ti, v);
    let score = evaluatePosition(simulated.state, p);
    const plan = simulated.plan;
    if (plan.entered) score += 16;
    if (plan.captured) score += plan.caps.length * 18;
    if (plan.reachedHome) score += 65;
    if (plan.boosted) score += 7;
    return score;
  }

  function bestOpponentReply(st, opponent) {
    let worstForCurrent = -Infinity;
    for (let face = 1; face <= 6; face++) {
      const legal = legalMoves(st, opponent, face);
      if (!legal.length) continue;
      let best = -Infinity;
      for (const ti of legal) {
        const result = simulate(st, opponent, ti, face);
        const val = -evaluatePosition(result.state, opponent);
        if (val > best) best = val;
      }
      if (best > worstForCurrent) worstForCurrent = best;
    }
    return worstForCurrent === -Infinity ? 0 : worstForCurrent;
  }

  function botChoose(st, p, v, legal) {
    if (!legal.length) return -1;
    const lv = DL.config.levels[st.level] || DL.config.levels.normal;
    if (lv.random) return legal[Math.floor(st.rng() * legal.length)];
    let best = legal[0];
    let bestScore = -Infinity;
    for (const ti of legal) {
      const result = simulate(st, p, ti, v);
      let score = evaluatePosition(result.state, p);
      if (result.plan.entered) score += 16;
      if (result.plan.captured) score += result.plan.caps.length * 18;
      if (result.plan.reachedHome) score += 65;
      if (result.plan.boosted) score += 7;
      if (st.level === 'hard') {
        // Genius assumes the opponent may find a strong reply on their next roll.
        score -= bestOpponentReply(result.state, 1 - p) * 0.62;
      }
      score += st.rng() * lv.noise;
      if (score > bestScore) { bestScore = score; best = ti; }
    }
    return best;
  }

  DL.Engine = { create, legalMoves, doMove, rollDice, botChoose, isWin, ringIdx, posOf, tileKey };
})(globalThis.DL = globalThis.DL || {});
