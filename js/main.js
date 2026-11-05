'use strict';
/* Boot. The last screen is restored when the app is killed and reopened (see Nav.save / App.enter). */
(function () {
  $('#botfab').innerHTML = I('bot');
  // Bring the app back to the foreground: refresh what the user is looking at and re-open the live stream
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !S.me) return;
    if (!Live.alive) Live.start(); App.syncCounts();
    const f = Nav.top(); if (f && SCREENS[f.name] && SCREENS[f.name].load && f.name !== 'thread' && f.name !== 'lawyers') Nav.refresh(true);
  });
  window.addEventListener('online', () => { if (S.me) { Live.start(); Nav.refresh(true); } });
  // keep the keyboard from hiding the focused field on small screens
  document.addEventListener('focusin', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250); });
  App.boot().catch(e => { console.error(e); Nav.reset('welcome'); toast('Something went wrong starting the app'); });
})();
