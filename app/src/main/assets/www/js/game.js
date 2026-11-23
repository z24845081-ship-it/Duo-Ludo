(function (DL) {
  'use strict';

  const E = DL.Engine;
  const R = DL.Renderer;
  const UI = DL.UI;
  const A = DL.Audio;
  const $ = UI.$;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let st = null;
  let cfg = null;
  let sid = 0;
  let busy = false;
  let paused = false;
  let waiters = [];
  let elapsed = 0;
  let tickStart = 0;
  let timerId = null;
  let lastRoll = null;
  let pendingRoll = null;
  let undoSnapshot = null;
  let canUndo = false;
  let handoverResolve = null;

  const gate = () => (paused ? new Promise((r) => waiters.push(r)) : Promise.resolve());
  const alive = (id) => id === sid;
  const now = () => elapsed + (tickStart ? performance.now() - tickStart : 0);

  function startClock() {
    if (tickStart) return;
    tickStart = performance.now();
    clearInterval(timerId);
    timerId = setInterval(() => { $('timer').textContent = UI.fmt(now()); }, 400);
  }
  function stopClock() {
    if (tickStart) elapsed += performance.now() - tickStart;
    tickStart = 0;
    clearInterval(timerId);
    $('timer').textContent = UI.fmt(elapsed);
  }
  function setPause(value) {
    paused = !!value;
    R.setPaused(paused);
    if (paused) { stopClock(); UI.openModal('modalPause'); }
    else {
      UI.closeModal('modalPause'); startClock();
      const pending = waiters; waiters = [];
      pending.forEach((resolve) => resolve());
    }
  }
  function cancelHandover() {
    UI.closeModal('modalHandover');
    if (handoverResolve) { const resolve = handoverResolve; handoverResolve = null; resolve(); }
  }
  function waitForHandover(id, player) {
    if (cfg.mode !== 'humo' || !alive(id)) return Promise.resolve();
    stopClock();
    $('handoverTitle').textContent = 'Pass to ' + st.players[player].name;
    UI.openModal('modalHandover');
    return new Promise((resolve) => { handoverResolve = () => { startClock(); resolve(); }; });
  }

  function snapshotGame() {
    return {
      turn: st.turn, moves: st.moves, elapsed: now(), rngState: st.rng.getState(),
      players: st.players.map((pl) => ({
        tokens: pl.tokens.slice(), rolls: pl.rolls.slice(), misses: pl.misses, homeMisses: pl.homeMisses,
        stats: Object.assign({}, pl.stats)
      }))
    };
  }
  function updateUndoButton() {
    const btn = $('btnUndo');
    btn.disabled = !(cfg && cfg.mode === 'humo' && canUndo && !busy);
  }
  function restoreSnapshot(snapshot) {
    st.turn = snapshot.turn; st.moves = snapshot.moves;
    if (Number.isFinite(snapshot.rngState) && typeof st.rng.setState === 'function') st.rng.setState(snapshot.rngState);
    snapshot.players.forEach((saved, p) => {
      const pl = st.players[p];
      pl.tokens = saved.tokens.slice(); pl.rolls = saved.rolls.slice();
      pl.misses = saved.misses; pl.homeMisses = saved.homeMisses;
      pl.stats = Object.assign({}, saved.stats);
    });
    elapsed = snapshot.elapsed; tickStart = 0;
    $('moves').textContent = String(st.moves);
    $('timer').textContent = UI.fmt(elapsed);
    R.setState(st);
    R.setUI({ turn: st.turn, phase: 'roll', legal: null, v: 0, hint: 'Tap the dice', canRoll: !st.players[st.turn].bot });
    pendingRoll = null; busy = false; canUndo = false; undoSnapshot = null;
    UI.addMoveHistory('Last move undone.');
    updateUndoButton();
    startClock();
  }
  function undoLastMove() {
    if (!st || !cfg || cfg.mode !== 'humo' || !canUndo || busy || !undoSnapshot) return;
    A.sfx.click();
    restoreSnapshot(undoSnapshot);
    UI.toast('Move undone', 'soft');
  }

  function start(c) {
    sid++;
    cancelHandover();
    cfg = c;
    busy = false; paused = false; waiters = []; elapsed = 0; lastRoll = null; pendingRoll = null;
    undoSnapshot = null; canUndo = false;
    R.setPaused(false); R.cancelAnimations();
    updateUndoButton();
    UI.closeModal('modalPause'); UI.stopConfetti(); A.stopMusic();
    UI.clearMoveHistory();
    UI.show('screen-game');
    const stage = $('stage').getBoundingClientRect();
    st = E.create({
      map: c.map, tokens: c.tokens, bot: c.mode === 'robo', level: c.level,
      names: c.names, portrait: stage.height > stage.width, diceMode: c.diceMode,
      colors: c.colors, boardTheme: c.boardTheme, requireOneToEnter: c.requireOneToEnter
    });
    $('mapPill').textContent = st.map.name;
    $('diceModePill').textContent = c.diceMode === 'drama' ? 'Modern' : 'Classic';
    $('moves').textContent = '0'; $('timer').textContent = '00:00';
    $('insight').hidden = true; $('moveHistory').hidden = true;
    R.setUI({ turn: 0, phase: 'idle', legal: null, v: 0, hint: '', canRoll: false });
    R.setState(st);
    st.turn = st.rng() < 0.5 ? 0 : 1;
    R.moveDiceTo(st.turn, true);
    startClock();
    const id = sid;
    sleep(400).then(() => {
      if (alive(id)) { UI.toast(st.players[st.turn].name + ' starts', 'soft'); beginTurn(id); }
    });
  }

  async function beginTurn(id) {
    await gate();
    if (!alive(id)) return;
    const p = st.turn;
    const bot = st.players[p].bot;
    busy = false;
    R.setUI({ turn: p, phase: 'roll', legal: null, v: 0, canRoll: !bot, hint: bot ? 'Thinking...' : 'Tap the dice' });
    updateUndoButton();
    if (bot) {
      await sleep(650); await gate();
      if (!alive(id)) return;
      doRoll(id);
    }
  }

  async function doRoll(id) {
    if (busy || !alive(id)) return;
    busy = true;
    const p = st.turn;
    if (cfg.mode === 'humo') { undoSnapshot = snapshotGame(); canUndo = false; updateUndoButton(); }
    R.setUI({ phase: 'rolling', canRoll: false, hint: 'Rolling...' });
    const r = E.rollDice(st, p);
    lastRoll = { p, r };
    await R.rollDice(r.v, 950);
    if (!alive(id)) return;
    UI.insight(p, st, r);

    if (!r.legal.length) {
      A.sfx.nomove(); UI.toast('No move for ' + r.v, 'soft');
      UI.addMoveHistory(st.players[p].name + ' rolled ' + r.v + ' — no legal move');
      R.setUI({ hint: 'No move' });
      await sleep(700); await gate();
      if (!alive(id)) return;
      canUndo = false; undoSnapshot = null; updateUndoButton();
      return endTurn(id, false);
    }

    const bot = st.players[p].bot;
    if (r.legal.length === 1 || bot) {
      R.setUI({ phase: 'moving', legal: null, hint: '' });
      await sleep(bot ? 520 : 220); await gate();
      if (!alive(id)) return;
      const ti = r.legal.length === 1 ? r.legal[0] : E.botChoose(st, p, r.v, r.legal);
      return move(id, ti, r.v);
    }
    pendingRoll = r; busy = false;
    R.setUI({ phase: 'pick', legal: r.legal, v: r.v, hint: 'Pick a token' });
  }

  async function move(id, ti, v) {
    if (!alive(id)) return;
    busy = true;
    const p = st.turn;
    R.setUI({ phase: 'moving', legal: null, hint: '' });
    const plan = E.doMove(st, p, ti, v);
    $('moves').textContent = String(st.moves);
    await R.playMove(plan);
    if (!alive(id)) return;
    UI.addMoveHistory(st.players[p].name + ' rolled ' + v + ' and moved token ' + (ti + 1) + (plan.captured ? ' — capture' : '') + (plan.boosted ? ' — boost +3' : '') + (plan.reachedHome ? ' — home' : ''));
    if (E.isWin(st, p)) return finish(id, p);

    const extra = v === 6 || plan.captured || plan.reachedHome;
    if (plan.captured) UI.toast('Captured!', 'hit');
    else if (plan.reachedHome) UI.toast('Home!', 'gold');
    else if (plan.boosted) UI.toast('Boost +3', '');
    if (extra) {
      st.players[p].stats.extra++;
      if (!plan.captured && !plan.reachedHome) UI.toast('Roll again', 'soft');
      A.sfx.extra();
    }
    canUndo = cfg.mode === 'humo'; updateUndoButton();
    await sleep(extra ? 550 : 300); await gate();
    if (!alive(id)) return;
    endTurn(id, extra);
  }

  async function endTurn(id, extra) {
    if (!extra) {
      st.turn = 1 - st.turn;
      R.setUI({ turn: st.turn, phase: 'idle', canRoll: false, hint: '' });
      await R.moveDiceTo(st.turn, false);
      if (!alive(id)) return;
    }
    beginTurn(id);
  }

  function finish(id, winner) {
    stopClock();
    R.setUI({ phase: 'over', canRoll: false, legal: null, hint: '' });
    pendingRoll = null; busy = false; canUndo = false; updateUndoButton();
    A.sfx.win();
    setTimeout(() => {
      if (!alive(id)) return;
      UI.showResult(st, winner, elapsed, cfg.mode);
      setTimeout(() => { if (alive(id) && !UI.settings().muted) A.startMusic(); }, 1000);
    }, 850);
  }

  function onTap(h) {
    if (paused || !st) return;
    const id = sid;
    if (h.type === 'dice') {
      if (st.players[st.turn].bot || busy) return;
      doRoll(id);
    } else if (h.type === 'token') {
      if (busy || !pendingRoll) return;
      const r = pendingRoll;
      if (!r.legal.includes(h.ti)) return;
      pendingRoll = null; A.sfx.click(); move(id, h.ti, r.v);
    }
  }

  function toMenu() {
    sid++; cancelHandover(); paused = false; R.setPaused(false); R.cancelAnimations();
    waiters.forEach((resolve) => resolve()); waiters = [];
    pendingRoll = null; busy = false; canUndo = false; undoSnapshot = null; updateUndoButton();
    stopClock(); A.stopMusic(); UI.stopConfetti();
    UI.closeModal('modalPause'); UI.show('screen-setup');
  }

  function isMatchActive() {
    return !!(st && $('screen-game').classList.contains('active') && !E.isWin(st, 0) && !E.isWin(st, 1));
  }

  function pauseGame() {
    if (isMatchActive() && !paused) setPause(true);
  }

  function resumeGame() {
    if (paused) setPause(false);
  }

  function init() {
    R.init($('cv'), { onTap });
    $('btnPause').addEventListener('click', () => { A.sfx.click(); pauseGame(); });
    $('btnResume').addEventListener('click', () => { A.sfx.click(); resumeGame(); });
    $('btnRestart').addEventListener('click', () => { A.sfx.click(); if (cfg) start(cfg); });
    $('btnQuit').addEventListener('click', () => { A.sfx.click(); toMenu(); });
    $('btnRematch').addEventListener('click', () => { A.sfx.click(); if (cfg) start(cfg); });
    $('btnNewSetup').addEventListener('click', () => { A.sfx.click(); toMenu(); });
    $('btnHandoverReady').addEventListener('click', () => { A.sfx.click(); cancelHandover(); });
    $('btnUndo').addEventListener('click', undoLastMove);
    $('btnMoveHistory').addEventListener('click', () => {
      const panel = $('moveHistory'); panel.hidden = !panel.hidden;
    });
    $('btnMoveHistoryClose').addEventListener('click', () => { $('moveHistory').hidden = true; });
    $('btnInsight').addEventListener('click', () => {
      A.sfx.click(); const el = $('insight'); el.hidden = !el.hidden;
      if (!el.hidden) {
        if (lastRoll) UI.insight(lastRoll.p, st, lastRoll.r);
        else el.innerHTML = '<div class="why">Roll the dice to see the actual probability distribution.</div>';
      }
    });
    $('btnSound').addEventListener('click', () => {
      const m = !A.isMuted(); UI.setMuted(m);
      $('btnSound').classList.toggle('off', m);
      $('btnSound').querySelector('use').setAttribute('href', m ? '#i-mute' : '#i-sound');
      if (!m) A.sfx.click();
    });
    $('btnMusic').addEventListener('click', () => {
      const btn = $('btnMusic'); btn.classList.toggle('off');
      if (btn.classList.contains('off')) A.stopMusic(); else { if (!A.isMuted()) A.startMusic(); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isMatchActive() && !paused) setPause(true);
    });
  }

  DL.Game = {
    init,
    start,
    undoLastMove,
    pause: pauseGame,
    resume: resumeGame,
    toMenu,
    isPaused: () => paused,
    isActive: isMatchActive
  };
})(globalThis.DL = globalThis.DL || {});
