(function (DL) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SFX = DL.Audio.sfx;
  const DEFAULTS = {
    mode: 'robo', level: 'normal', tokens: 4, map: 'orbit', names: ['', ''],
    diceMode: 'classic', playerColors: ['blue', 'rose'], boardTheme: 'soft',
    uiTheme: 'light', uiAccent: '#5E83E6', uiBackground: '', uiSurface: '', cardOpacity: 88, musicVolume: 45, sfxVolume: 80,
    vibration: true, motion: 'full', muted: false, requireOneToEnter: true
  };
  let settings = Object.assign({}, DEFAULTS);
  let history = [];
  let current = 'screen-splash';
  let mapIdx = 0;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (ms) => { const s = Math.round(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  function validHex(value) { return /^#[0-9a-f]{6}$/i.test(value || ''); }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hexOf(r, g, b) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  function mixHex(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return hexOf(x[0] * (1 - t) + y[0] * t, x[1] * (1 - t) + y[1] * t, x[2] * (1 - t) + y[2] * t);
  }
  function colorDistance(a, b) {
    if (!validHex(a) || !validHex(b)) return 999;
    const x = rgb(a), y = rgb(b);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }
  function playerColor(p) {
    const key = settings.playerColors[p];
    return DL.config.playerPalettes[key] || DL.config.players[p];
  }
  function getPlayerColors() { return [playerColor(0), playerColor(1)]; }

  function load() {
    try {
      const raw = localStorage.getItem(DL.config.storageKey) || localStorage.getItem('duoludo.settings.v1');
      if (raw) settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { settings = Object.assign({}, DEFAULTS); }
    if (!Array.isArray(settings.names)) settings.names = ['', ''];
    if (!Array.isArray(settings.playerColors)) settings.playerColors = ['blue', 'rose'];
    settings.tokens = clamp(Number(settings.tokens) || 4, 1, 6);
    if (!DL.Maps.list.some((m) => m.id === settings.map)) settings.map = DEFAULTS.map;
    if (!DL.config.playerPalettes[settings.playerColors[0]]) settings.playerColors[0] = 'blue';
    if (!DL.config.playerPalettes[settings.playerColors[1]]) settings.playerColors[1] = 'rose';
    if (settings.playerColors[0] === settings.playerColors[1] || colorDistance(playerColor(0).main, playerColor(1).main) < 65) {
      settings.playerColors[1] = settings.playerColors[0] === 'rose' ? 'blue' : 'rose';
    }
    if (!DL.config.boardThemes[settings.boardTheme]) settings.boardTheme = 'soft';
    if (!['light', 'warm', 'lavender', 'dark'].includes(settings.uiTheme)) settings.uiTheme = 'light';
    if (!['classic', 'drama'].includes(settings.diceMode)) settings.diceMode = 'classic';
    settings.cardOpacity = clamp(Number(settings.cardOpacity) || 88, 65, 100);
    settings.musicVolume = clamp(Number(settings.musicVolume) || 0, 0, 100);
    settings.sfxVolume = clamp(Number(settings.sfxVolume) || 0, 0, 100);
    if (!validHex(settings.uiAccent)) settings.uiAccent = DEFAULTS.uiAccent;
    settings.requireOneToEnter = settings.requireOneToEnter !== false;
    // Remove any legacy saved match. Match recovery is intentionally not supported.
    try { localStorage.removeItem('duoludo.savedMatch.v1'); } catch (e) { /* storage may be unavailable */ }
    try { history = JSON.parse(localStorage.getItem(DL.config.historyKey) || '[]'); if (!Array.isArray(history)) history = []; }
    catch (e) { history = []; }
  }
  function save() {
    try { localStorage.setItem(DL.config.storageKey, JSON.stringify(settings)); } catch (e) { /* storage can be disabled */ }
  }
  function saveHistory() {
    try { localStorage.setItem(DL.config.historyKey, JSON.stringify(history.slice(0, 40))); } catch (e) { /* storage can be disabled */ }
  }

  function applyGlobalSettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.uiTheme;
    root.dataset.motion = settings.motion === 'reduced' ? 'reduced' : 'full';
    root.style.setProperty('--accent', settings.uiAccent);
    root.style.setProperty('--accent-dark', mixHex(settings.uiAccent, '#111827', 0.22));
    root.style.setProperty('--card-opacity', (settings.cardOpacity / 100).toFixed(2));
    if (validHex(settings.uiBackground)) root.style.setProperty('--page-bg', settings.uiBackground);
    else root.style.removeProperty('--page-bg');
    if (validHex(settings.uiSurface)) {
      const [r, g, b] = rgb(settings.uiSurface);
      root.style.setProperty('--surface', settings.uiSurface);
      root.style.setProperty('--card', `rgba(${r},${g},${b},${(settings.cardOpacity / 100).toFixed(2)})`);
    } else {
      root.style.removeProperty('--surface');
      root.style.removeProperty('--card');
    }
    DL.Audio.setVolumes(settings.sfxVolume / 100, settings.musicVolume / 100);
    DL.Audio.setMuted(!!settings.muted);
  }

  function presetUiColors(theme) {
    return ({
      light: ['#F5F7FC', '#FFFFFF'], warm: ['#FAF7F1', '#FFFEFA'],
      lavender: ['#F7F5FC', '#FFFFFF'], dark: ['#171E2B', '#242E40']
    })[theme] || ['#F5F7FC', '#FFFFFF'];
  }


  function show(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
    current = id;
    if (id === 'screen-setup') requestAnimationFrame(() => drawMap(false));
  }
  function openModal(id) { const el = $(id); if (el) el.hidden = false; }
  function closeModal(id) { const el = $(id); if (el) el.hidden = true; }
  function toast(text, cls) {
    const box = $('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1500);
  }

  function drawMap(animate) {
    const cvs = $('mapCanvas');
    const m = DL.Maps.list[mapIdx];
    DL.Renderer.drawPreview(cvs, m.id, { colors: getPlayerColors(), boardTheme: settings.boardTheme });
    if (animate) {
      cvs.classList.remove('swap'); void cvs.offsetWidth; cvs.classList.add('swap');
    }
    $('mapName').textContent = m.name;
    $('mapBlurb').textContent = m.blurb;
    $('mapCount').textContent = (mapIdx + 1) + ' / ' + DL.Maps.list.length;
    document.querySelectorAll('#mapChips button').forEach((b, i) => b.classList.toggle('on', i === mapIdx));
  }
  function pickMap(i, animate) {
    const n = DL.Maps.list.length;
    mapIdx = (i + n) % n;
    settings.map = DL.Maps.list[mapIdx].id;
    drawMap(animate !== false); save();
  }

  function syncMode() {
    const robo = settings.mode === 'robo';
    $('fieldLevel').hidden = !robo;
    const n0 = $('name0');
    const n1 = $('name1');
    n0.placeholder = 'Humo';
    if (settings.names[0]) n0.value = settings.names[0];
    else if (!n0.value.trim()) n0.value = 'Humo';
    n1.disabled = robo;
    n1.placeholder = robo ? 'Robo' : 'Humo';
    n1.value = robo ? 'Robo' : (settings.names[1] || 'Humo');
    document.querySelectorAll('#segMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.mode));
    document.querySelectorAll('#segLevel button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.level));
    requestAnimationFrame(() => drawMap(false));
  }
  function syncTokens() {
    document.querySelectorAll('#segTokens button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === settings.tokens));
  }
  function syncDiceMode() {
    document.querySelectorAll('#segDiceMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.diceMode));
  }

  function renderSwatches() {
    [0, 1].forEach((p) => {
      const host = $('player' + p + 'Colors');
      host.innerHTML = '';
      Object.keys(DL.config.playerPalettes).forEach((key) => {
        const palette = DL.config.playerPalettes[key];
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'color-chip'; btn.dataset.player = p; btn.dataset.color = key;
        btn.style.setProperty('--swatch', palette.main);
        btn.title = palette.name; btn.setAttribute('aria-label', palette.name + ' for Player ' + (p + 1));
        host.appendChild(btn);
      });
    });
    syncColorUI();
  }
  function syncColorUI() {
    [0, 1].forEach((p) => {
      const key = settings.playerColors[p];
      document.querySelectorAll('#player' + p + 'Colors .color-chip').forEach((b) => b.classList.toggle('on', b.dataset.color === key));
      const chosen = key === 'blue' ? 'Default · Blue' : key === 'rose' ? 'Default · Pink' : 'Selected · ' + (DL.config.playerPalettes[key]?.name || 'Blue');
      const headingNote = $('player' + p + 'Colors').closest('.color-pick-row').querySelector('.color-pick-heading span');
      if (headingNote) headingNote.textContent = chosen;
      const c = playerColor(p);
      $('nameDot' + p).style.background = c.main;
      const name = $('name' + p).closest('.name');
      name.style.borderColor = c.main;
      name.style.setProperty('--player-color', c.main);
    });
    $('colorHint').textContent = 'Default colours are blue and pink. Choose from three alternatives: teal, orange or violet.';
    $('boardTheme').value = settings.boardTheme;
  }
  function setPlayerPalette(p, key) {
    const other = 1 - p;
    const next = DL.config.playerPalettes[key];
    if (!next) return;
    const otherColor = playerColor(other).main;
    if (settings.playerColors[other] === key || colorDistance(next.main, otherColor) < 65) {
      $('colorHint').textContent = 'Choose a more distinct colour for each player.';
      return;
    }
    settings.playerColors[p] = key;
    syncColorUI(); drawMap(false); save(); SFX.click();
  }

  function renderSettingsControls() {
    $('uiTheme').value = settings.uiTheme;
    $('uiAccent').value = settings.uiAccent;
    const uiColors = presetUiColors(settings.uiTheme);
    $('uiBackground').value = settings.uiBackground || uiColors[0];
    $('uiSurface').value = settings.uiSurface || uiColors[1];
    $('cardOpacity').value = settings.cardOpacity;
    $('opacityValue').textContent = settings.cardOpacity + '%';
    $('sfxVolume').value = settings.sfxVolume;
    $('sfxValue').textContent = settings.sfxVolume + '%';
    $('musicVolume').value = settings.musicVolume;
    $('musicValue').textContent = settings.musicVolume + '%';
    $('motionSetting').value = settings.motion;
    $('vibrationSetting').value = settings.vibration ? 'on' : 'off';
    $('muteSetting').value = settings.muted ? 'on' : 'off';
    $('entryRuleSetting').value = settings.requireOneToEnter ? 'on' : 'off';
  }
  function openSettings() { renderSettingsControls(); syncColorUI(); openModal('modalSettings'); }
  function changeSetting(key, value) {
    settings[key] = value;
    if (key === 'uiTheme') { settings.uiBackground = ''; settings.uiSurface = ''; renderSettingsControls(); }
    applyGlobalSettings(); save();
  }
  function resetGlobalSettings() {
    ['uiTheme', 'uiAccent', 'uiBackground', 'uiSurface', 'cardOpacity', 'musicVolume', 'sfxVolume', 'motion', 'vibration', 'muted', 'requireOneToEnter', 'boardTheme'].forEach((k) => settings[k] = DEFAULTS[k]);
    settings.playerColors = DEFAULTS.playerColors.slice();
    applyGlobalSettings(); renderSettingsControls(); syncColorUI(); drawMap(false); save();
  }

  const tutorialSteps = [
    ['1. Enter the board', 'The entry rule is configurable in Application Settings. When it is on, roll a 1 to leave base; when it is off, any number opens a token. Entering always places the token on your start tile.'],
    ['2. Move around the route', 'Tap the dice on your turn, then choose a highlighted token. The number rolled moves it forward along the selected map.'],
    ['3. Capture carefully', 'Land on a lone opponent token on an unprotected tile to send it back to base. Safe star tiles and protected pairs cannot be captured.'],
    ['4. Use boosts and extra turns', 'Lightning tiles may move you three extra spaces. Rolling a 6, capturing an opponent or reaching home earns another turn.'],
    ['5. Complete the full lap', 'Your token starts on its own home-lane gate, travels the entire outer loop, and must return to that same gate before it can enter the home lane. You then need the exact number to reach home.']
  ];
  let tutorialIndex = 0;
  function renderTutorial() {
    const [title, copy] = tutorialSteps[tutorialIndex];
    $('tutorialTitle').textContent = title;
    $('tutorialCopy').textContent = copy;
    $('tutorialRulesList').innerHTML = [
      (settings.requireOneToEnter ? 'Roll a 1 to leave base.' : 'Any dice number can open a token from base.') + ' Entry places the token on its start gate.',
      'Complete the full outer loop and return to that same gate before entering the home lane.',
      'Capture a lone opponent on an unprotected tile; safe stars and protected pairs cannot be captured.',
      'A boost moves a token three additional spaces. A 6, capture or home arrival earns an extra turn.',
      '<b>Classic Dice</b> uses equal odds. <b>Modern Dice</b> adapts its odds and uses a player-coloured die.'
    ].map((line) => '<li>' + line + '</li>').join('');
    $('tutorialProgress').querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i <= tutorialIndex));
    $('btnTutorialBack').disabled = tutorialIndex === 0;
    $('btnTutorialNext').textContent = tutorialIndex === tutorialSteps.length - 1 ? 'Finish' : 'Next';
  }
  function openTutorial() { tutorialIndex = 0; renderTutorial(); openModal('modalTutorial'); }

  function initSetup(onPlay) {
    load(); applyGlobalSettings();
    if ($('btnSound')) {
      $('btnSound').classList.toggle('off', !!settings.muted);
      $('btnSound').querySelector('use').setAttribute('href', settings.muted ? '#i-mute' : '#i-sound');
    }
    const seg = $('segTokens');
    if (!seg.children.length) for (let i = 1; i <= 6; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = i; b.textContent = i; seg.appendChild(b);
    }
    const chips = $('mapChips');
    if (!chips.children.length) DL.Maps.list.forEach((m, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = m.name;
      b.addEventListener('click', () => { SFX.click(); pickMap(i); }); chips.appendChild(b);
    });
    mapIdx = Math.max(0, DL.Maps.list.findIndex((m) => m.id === settings.map));

    $('segMode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.click(); settings.mode = b.dataset.v; save(); syncMode();
    });
    $('segLevel').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.click(); settings.level = b.dataset.v; save(); syncMode();
    });
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.click(); settings.tokens = Number(b.dataset.v); save(); syncTokens();
    });
    $('segDiceMode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      settings.diceMode = b.dataset.v; save(); syncDiceMode(); SFX.click();
    });
    $('mapPrev').addEventListener('click', () => { SFX.click(); pickMap(mapIdx - 1); });
    $('mapNext').addEventListener('click', () => { SFX.click(); pickMap(mapIdx + 1); });
    ['name0', 'name1'].forEach((id, i) => {
      const el = $(id); el.value = settings.names[i] || '';
      el.addEventListener('input', () => { settings.names[i] = el.value.trim(); save(); });
    });
    renderSwatches();
    [0, 1].forEach((p) => {
      $('player' + p + 'Colors').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-color]'); if (btn) setPlayerPalette(p, btn.dataset.color);
      });
    });
    $('boardTheme').addEventListener('change', (e) => { settings.boardTheme = e.target.value; drawMap(false); save(); });

    $('btnRules').addEventListener('click', () => { SFX.click(); openTutorial(); });
    $('btnTutorialClose').addEventListener('click', () => closeModal('modalTutorial'));
    $('modalTutorial').addEventListener('pointerdown', (e) => { if (e.target.id === 'modalTutorial') closeModal('modalTutorial'); });
    $('btnTutorialBack').addEventListener('click', () => { tutorialIndex = Math.max(0, tutorialIndex - 1); renderTutorial(); });
    $('btnTutorialNext').addEventListener('click', () => { if (tutorialIndex >= tutorialSteps.length - 1) closeModal('modalTutorial'); else tutorialIndex++; renderTutorial(); });
    $('btnSettings').addEventListener('click', () => { SFX.click(); openSettings(); });
    $('btnSettingsClose').addEventListener('click', () => closeModal('modalSettings'));
    $('btnSettingsDone').addEventListener('click', () => closeModal('modalSettings'));
    $('btnSettingsReset').addEventListener('click', resetGlobalSettings);
    $('uiTheme').addEventListener('change', (e) => changeSetting('uiTheme', e.target.value));
    $('uiAccent').addEventListener('input', (e) => changeSetting('uiAccent', e.target.value));
    $('uiBackground').addEventListener('input', (e) => changeSetting('uiBackground', e.target.value));
    $('uiSurface').addEventListener('input', (e) => changeSetting('uiSurface', e.target.value));
    $('cardOpacity').addEventListener('input', (e) => { settings.cardOpacity = Number(e.target.value); $('opacityValue').textContent = settings.cardOpacity + '%'; applyGlobalSettings(); save(); });
    $('sfxVolume').addEventListener('input', (e) => { settings.sfxVolume = Number(e.target.value); $('sfxValue').textContent = settings.sfxVolume + '%'; applyGlobalSettings(); save(); });
    $('musicVolume').addEventListener('input', (e) => { settings.musicVolume = Number(e.target.value); $('musicValue').textContent = settings.musicVolume + '%'; applyGlobalSettings(); save(); });
    $('motionSetting').addEventListener('change', (e) => changeSetting('motion', e.target.value));
    $('vibrationSetting').addEventListener('change', (e) => changeSetting('vibration', e.target.value === 'on'));
    $('muteSetting').addEventListener('change', (e) => changeSetting('muted', e.target.value === 'on'));
    $('entryRuleSetting').addEventListener('change', (e) => changeSetting('requireOneToEnter', e.target.value === 'on'));
    $('btnSettings').setAttribute('aria-haspopup', 'dialog');
    $('modalSettings').addEventListener('pointerdown', (e) => { if (e.target.id === 'modalSettings') closeModal('modalSettings'); });

    $('btnHistory').addEventListener('click', () => { SFX.click(); renderHistory(); openModal('modalHistory'); });
    $('btnHistoryClose').addEventListener('click', () => closeModal('modalHistory'));
    $('btnHistoryDone').addEventListener('click', () => closeModal('modalHistory'));
    $('btnHistoryClear').addEventListener('click', () => {
      history = []; saveHistory(); renderHistory();
    });
    $('modalHistory').addEventListener('pointerdown', (e) => { if (e.target.id === 'modalHistory') closeModal('modalHistory'); });

    $('btnPlay').addEventListener('click', () => {
      SFX.click();
      const robo = settings.mode === 'robo';
      const n0 = ($('name0').value.trim() || 'Humo').slice(0, 14);
      const n1 = robo ? 'Robo' : ($('name1').value.trim() || 'Humo').slice(0, 14);
      const colors = getPlayerColors();
      onPlay({
        mode: settings.mode, level: settings.level, tokens: settings.tokens, map: settings.map,
        names: [n0, n1], diceMode: settings.diceMode, colors, boardTheme: settings.boardTheme,
        playerColorKeys: settings.playerColors.slice(), requireOneToEnter: settings.requireOneToEnter
      });
    });

    syncMode(); syncTokens(); syncDiceMode(); syncColorUI();
    if (globalThis.ResizeObserver) new ResizeObserver(() => { if (current === 'screen-setup') drawMap(false); }).observe($('mapCanvas').parentElement);
  }

  function insight(p, st, roll) {
    const el = $('insight');
    if (el.hidden || !roll) return;
    const probabilities = roll.probabilities || roll.w.map((w) => w / roll.w.reduce((a, b) => a + b, 0));
    const bars = probabilities.map((prob, i) => '<div class="' + (i + 1 === roll.v ? 'hit' : '') + '" style="height:' + Math.max(5, Math.round(prob * 100)) + '%"><span>' + (i + 1) + '</span><b>' + (prob * 100).toFixed(1) + '%</b></div>').join('');
    const modeLabel = roll.mode === 'classic' ? 'Classic Dice — equal probability and ivory die' : 'Modern Dice — adaptive probability and player-coloured die';
    el.innerHTML = '<div class="row"><h4><i style="background:' + (st.colors?.[p]?.main || '#4F83E8') + '"></i>' + esc(st.players[p].name) + ' rolled ' + roll.v + '</h4><div class="dice-mode-caption">' + modeLabel + '</div>' +
      '<div class="bars probability-bars">' + bars + '</div>' +
      '<div class="why">' + (roll.reasons.length ? roll.reasons.map(esc).join(' / ') : 'No probability adjustment.') + '</div></div>' +
      '<div class="why">Percentages are the normalized probabilities used for this roll, not relative weight scores.</div>';
  }

  function renderHistory() {
    const wins = history.filter((m) => m.winner === 0).length;
    const winsVsRobo = history.filter((m) => m.mode === 'robo' && m.winner === 0).length;
    const avg = history.length ? Math.round(history.reduce((a, m) => a + (m.duration || 0), 0) / history.length / 1000) : 0;
    const captures = history.reduce((a, m) => a + (m.captures || []).reduce((x, y) => x + y, 0), 0);
    const sixes = history.reduce((a, m) => a + (m.sixes || []).reduce((x, y) => x + y, 0), 0);
    const maps = new Set(history.map((m) => m.map)).size;
    $('historyStats').innerHTML = [
      ['Matches', history.length], ['Player 1 wins', wins], ['Avg. time', fmt(avg * 1000)]
    ].map(([name, value]) => '<div class="history-stat"><b>' + value + '</b><span>' + name + '</span></div>').join('');
    const achievements = [
      ['First match', history.length >= 1, 'Complete your first match'],
      ['Regular player', history.length >= 10, 'Complete 10 matches'],
      ['Sharp shooter', captures >= 10, 'Make 10 captures'],
      ['Six sense', sixes >= 25, 'Roll 25 sixes'],
      ['Map explorer', maps >= 5, 'Play on all five maps'],
      ['Robo challenger', winsVsRobo >= 5, 'Win five matches against Robo']
    ];
    $('achievementList').innerHTML = achievements.map(([name, unlocked, desc]) => '<div class="achievement-card ' + (unlocked ? 'unlocked' : '') + '"><b>' + (unlocked ? '✓ ' : '○ ') + esc(name) + '</b><small>' + esc(desc) + '</small></div>').join('');
    $('historyList').innerHTML = history.length ? history.slice(0, 25).map((m) => {
      const date = m.date ? new Date(m.date).toLocaleDateString() : 'Recent';
      return '<li><span><b>' + esc(m.names?.[m.winner] || 'Winner') + '</b> won · ' + esc(m.map || 'Map') + '<br><small>' + date + ' · ' + fmt(m.duration || 0) + ' · ' + (m.moves || 0) + ' moves</small></span><small>' + (m.mode === 'robo' ? 'Robo' : 'Humo') + '</small></li>';
    }).join('') : '<li><span>No completed matches yet. Play a game to start your history.</span></li>';
  }

  function recordMatch(st, winner, ms, mode) {
    const match = {
      id: Date.now(), date: new Date().toISOString(), winner,
      names: st.players.map((p) => p.name), map: st.map.name, mode,
      duration: ms, moves: st.moves, captures: st.players.map((p) => p.stats.captures),
      sixes: st.players.map((p) => p.stats.sixes), tokens: st.n
    };
    history.unshift(match); history = history.slice(0, 40); saveHistory();
  }

  function showResult(st, winner, ms, mode) {
    const w = st.players[winner], l = st.players[1 - winner];
    const colors = st.colors || DL.config.players;
    recordMatch(st, winner, ms, mode);
    const humanLost = mode === 'robo' && winner === 1;
    $('resTitle').textContent = humanLost ? 'Robo wins this one' : w.name + ' wins';
    $('resTitle').style.color = colors[winner].deep;
    $('resSub').textContent = humanLost ? l.name + ', the robot was quicker this time.' : (l.name + ' fought hard. Rematch?');
    $('resMeta').innerHTML = '<span class="pill">Time <b>' + fmt(ms) + '</b></span>' +
      '<span class="pill">Moves <b>' + st.moves + '</b></span>' + '<span class="pill">Map <b>' + esc(st.map.name) + '</b></span>';
    const col = (p) => {
      const pl = st.players[p];
      const home = pl.tokens.filter((t) => t === st.map.home).length;
      const c = colors[p];
      return '<div class="pcol' + (p === winner ? ' win' : '') + '" style="--c:' + c.main + ';--cd:' + c.ink + ';--cs:' + c.soft + '">' +
        '<h5><i></i>' + esc(pl.name) + '<em>' + (p === winner ? 'Winner' : 'Runner-up') + '</em></h5>' +
        '<dl><dt>Home</dt><dd>' + home + '/' + st.n + '</dd><dt>Captures</dt><dd>' + pl.stats.captures + '</dd><dt>Tokens lost</dt><dd>' + pl.stats.lost + '</dd><dt>Sixes</dt><dd>' + pl.stats.sixes + '</dd><dt>Rolls</dt><dd>' + pl.stats.rolls + '</dd></dl></div>';
    };
    $('resVersus').innerHTML = col(0) + col(1);
    show('screen-result'); startConfetti(winner, colors);
  }

  let confettiRun = 0;
  function startConfetti(winner, colors) {
    if (document.documentElement.dataset.motion === 'reduced' || (globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const cv = $('confetti');
    const run = ++confettiRun;
    const r = cv.getBoundingClientRect();
    const d = Math.min(globalThis.devicePixelRatio || 1, 2);
    cv.width = r.width * d; cv.height = r.height * d;
    const c = cv.getContext('2d');
    const cols = [colors[winner].main, colors[winner].deep, colors[1 - winner].main, '#EDB54A', '#8E7CF0', '#FFFFFF'];
    const bits = Array.from({ length: 110 }, () => ({
      x: Math.random() * r.width, y: -Math.random() * r.height * 0.9, vx: (Math.random() - 0.5) * 60,
      vy: 80 + Math.random() * 140, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
      a: Math.random() * 6, va: (Math.random() - 0.5) * 8, c: cols[(Math.random() * cols.length) | 0]
    }));
    let last = performance.now();
    (function loop(now) {
      if (run !== confettiRun) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height);
      let alive = 0;
      bits.forEach((b) => {
        b.x += (b.vx + Math.sin(b.a) * 30) * dt; b.y += b.vy * dt; b.a += b.va * dt;
        if (b.y < r.height + 20) alive++;
        c.save(); c.translate(b.x, b.y); c.rotate(b.a); c.scale(1, Math.abs(Math.cos(b.a * 1.3)) * 0.8 + 0.2);
        c.fillStyle = b.c; c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); c.restore();
      });
      if (alive) requestAnimationFrame(loop); else c.clearRect(0, 0, r.width, r.height);
    })(last);
  }
  function stopConfetti() { confettiRun++; }

  function addMoveHistory(line) {
    const list = $('moveHistoryList');
    if (!list) return;
    const item = document.createElement('li'); item.textContent = line;
    list.prepend(item);
    while (list.children.length > 50) list.lastElementChild.remove();
  }
  function clearMoveHistory() { if ($('moveHistoryList')) $('moveHistoryList').innerHTML = ''; }

  function setMuted(value) { settings.muted = !!value; applyGlobalSettings(); save(); if ($('muteSetting')) $('muteSetting').value = settings.muted ? 'on' : 'off'; }

  DL.UI = {
    $, show, openModal, closeModal, toast, initSetup, insight, showResult, stopConfetti, setMuted,
    fmt, settings: () => settings, addMoveHistory, clearMoveHistory, applyGlobalSettings,
    playerColors: getPlayerColors, renderHistory
  };
})(globalThis.DL = globalThis.DL || {});
