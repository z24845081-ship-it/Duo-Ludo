(function (DL) {
  'use strict';

  const UI = DL.UI;
  const $ = UI.$;

  function boot() {
    DL.Game.init();
    UI.initSetup((cfg) => DL.Game.start(cfg));

    // unlock audio on first interaction (browsers require a gesture)
    const unlock = () => { DL.Audio.unlock(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // The branded splash fades in without translating upward; tap to skip.
    const DUR = 1250;
    let done = false;
    const t0 = performance.now();
    const go = () => {
      if (done) return;
      done = true;
      DL.Audio.sfx.pop();
      UI.show('screen-setup');
    };
    (function tick(now) {
      if (done) return;
      if (now - t0 < DUR) requestAnimationFrame(tick);
      else go();
    })(t0);
    $('screen-splash').addEventListener('pointerdown', go);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.DL = globalThis.DL || {});
