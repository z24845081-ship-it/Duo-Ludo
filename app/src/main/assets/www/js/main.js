(function (DL) {
  'use strict';

  const UI = DL.UI;
  const $ = UI.$;
  let splashDone = false;
  let skipSplashFn = null;

  function boot() {
    DL.Game.init();
    UI.initSetup((cfg) => DL.Game.start(cfg));

    // unlock audio on first interaction (browsers require a gesture)
    const unlock = () => { DL.Audio.unlock(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // The branded splash fades in without translating upward; tap to skip.
    const DUR = 1250;
    const t0 = performance.now();
    const go = () => {
      if (splashDone) return;
      splashDone = true;
      DL.Audio.sfx.pop();
      UI.show('screen-setup');
    };
    skipSplashFn = go;
    (function tick(now) {
      if (splashDone) return;
      if (now - t0 < DUR) requestAnimationFrame(tick);
      else go();
    })(t0);
    $('screen-splash').addEventListener('pointerdown', go);
  }

  DL.handleAndroidBack = function () {
    const isVisible = (id) => {
      const el = $(id);
      return !!(el && !el.hidden);
    };
    if (isVisible('modalSettings')) { UI.closeModal('modalSettings'); return 'handled'; }
    if (isVisible('modalTutorial')) { UI.closeModal('modalTutorial'); return 'handled'; }
    if (isVisible('modalHistory')) { UI.closeModal('modalHistory'); return 'handled'; }
    if (isVisible('modalPause')) { DL.Game.resume(); return 'handled'; }
    if (isVisible('moveHistory')) { $('moveHistory').hidden = true; return 'handled'; }
    if (isVisible('insight')) { $('insight').hidden = true; return 'handled'; }

    const screen = UI.currentScreen();
    if (screen === 'screen-splash') {
      if (skipSplashFn) skipSplashFn();
      return 'handled';
    }
    if (screen === 'screen-game') {
      DL.Game.pause();
      return 'handled';
    }
    if (screen === 'screen-result') {
      DL.Game.toMenu();
      return 'handled';
    }
    return 'confirm_exit';
  };

  DL.onAppPause = function () {
    if (DL.Game.isActive() && !DL.Game.isPaused()) DL.Game.pause();
    DL.Audio.stopMusic();
    DL.Audio.suspend();
  };

  DL.onAppResume = function () {
    DL.Audio.resumeIfNeeded();
    if (DL.Renderer && typeof DL.Renderer.refresh === 'function') DL.Renderer.refresh();
  };

  DL.setSafeAreaInsets = function (topPx, rightPx, bottomPx, leftPx) {
    const root = document.documentElement.style;
    root.setProperty('--sat', Math.max(0, Number(topPx) || 0) + 'px');
    root.setProperty('--sar', Math.max(0, Number(rightPx) || 0) + 'px');
    root.setProperty('--sab', Math.max(0, Number(bottomPx) || 0) + 'px');
    root.setProperty('--sal', Math.max(0, Number(leftPx) || 0) + 'px');
    if (DL.Renderer && typeof DL.Renderer.refresh === 'function') DL.Renderer.refresh();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.DL = globalThis.DL || {});
