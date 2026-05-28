/* celebrate.js · part of the @dustin-riley/design fitness overlay
   - celebrate(burstEl, popEl?) → block-burst + optional number-pop
   - popNumber(el)              → just the scale pop
   Palette read from CSS custom properties so the overlay tokens drive
   the colors. Restraint: 14 blocks max, palette-only, sub-1s. */

(function () {
  function tok(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function celebrate(burstEl, popEl) {
    if (!burstEl) return;
    burstEl.querySelectorAll('.burst-block').forEach(b => b.remove());
    burstEl.classList.remove('is-bursting');

    const colors = [
      tok('--cat-push'),
      tok('--cat-legs'),
      tok('--cat-pull'),
      tok('--cat-core'),
      tok('--cat-cardio'),
      tok('--readiness-depleted'),
      tok('--cat-accessory'),
    ].filter(Boolean);

    for (let i = 0; i < 14; i++) {
      const b = document.createElement('div');
      b.className = 'burst-block';
      const angle = (i / 14) * Math.PI * 2;
      const r = 100 + Math.random() * 60;
      const dx = Math.cos(angle) * r;
      const dy = Math.sin(angle) * r;
      const rot = (Math.random() * 720 - 360) + 'deg';
      const sz = 8 + Math.random() * 12;
      b.style.cssText =
        '--dx:' + dx + 'px; --dy:' + dy + 'px; --rot:' + rot + '; ' +
        'background:' + colors[i % colors.length] + '; ' +
        'width:' + sz + 'px; height:' + sz + 'px;';
      burstEl.appendChild(b);
    }
    requestAnimationFrame(() => burstEl.classList.add('is-bursting'));
    if (popEl) popNumber(popEl);
  }

  function popNumber(el) {
    if (!el) return;
    el.classList.add('pop');            // ensure base class so the keyframe rule matches
    el.classList.remove('is-popping');
    void el.offsetWidth;
    el.classList.add('is-popping');
  }

  window.celebrate = celebrate;
  window.popNumber = popNumber;
})();
