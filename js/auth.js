'use strict';
/* Welcome, phone + OTP, role choice, onboarding, DigiLocker / ID verification, and App boot. */

const App = {
  async boot() {
    API.init(); applyTheme(); Layers.el = $('#layers');
    document.documentElement.lang = LANG === 'ta' ? 'ta' : 'en';
    // DigiLocker (web) returns with ?dl_session=...
    const q = new URLSearchParams(location.search);
    if (q.get('dl_session')) { LS.set('dlReturn', q.get('dl_session')); history.replaceState(null, '', location.pathname); }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !Bridge.has()) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!API.token) { S.me = null; Nav.reset('welcome'); return; }
    try {
      const [m, me] = await Promise.all([API.get('/api/meta'), API.get('/api/me', { quiet401: true })]);
      S.meta = m; LS.set('meta', m); S.me = me.me; S.unread = me.unread; LS.set('me', me.me);
    } catch (e) {
      if (e.status === 401) { API.setToken(''); Nav.reset('welcome'); return; }
      S.meta = LS.get('meta', null); S.me = LS.get('me', null);                       // offline: open what we know
      if (!S.me || !S.meta) { Nav.reset('welcome'); toast(e.message); return; }
      toast('You are offline. Showing saved data.');
    }
    this.enter(false, true);
  },
  async enter(fresh, restore) {
    if (!S.meta) { try { S.meta = await API.get('/api/meta'); LS.set('meta', S.meta); } catch (e) { S.meta = LS.get('meta', null); } }
    const me = S.me; if (!me) return Nav.reset('welcome');
    LANG = me.lang === 'ta' ? 'ta' : LANG;
    if (!me.role) return Nav.reset('role');
    if (!me.onboarded && !me.name) return Nav.reset('onboard');
    Live.start(); this.pushToken(); this.syncCounts();
    getPos().then(p => { API.put('/api/me/location', { lat: p.lat, lng: p.lng }).catch(() => {}); });
    const home = TABS[me.role][0];
    if (restore) {                                                                   // killed and reopened: land on the same screen
      const nav = LS.get('nav', null), allowed = new Set(Object.keys(SCREENS).filter(k => !SCREENS[k].auth));
      if (nav && nav.stack && nav.stack.length && TABS[me.role].includes(nav.tab) && nav.stack.every(f => allowed.has(f.name))) {
        S.tab = nav.tab; S.stack = nav.stack.map(f => ({ name: f.name, params: f.params || {} })); Nav.open(true);
        const dl = LS.get('dlReturn', null); if (dl) this.finishDL(dl); return;
      }
    }
    Nav.reset(home);
    const dl = LS.get('dlReturn', null); if (dl) this.finishDL(dl);
    if (fresh && me.role === 'lawyer') Nav.go('lcredentials', {});
    else if (fresh && me.role === 'client' && !(me.verify && me.verify.status === 'verified')) Nav.go('verify', { first: true });
  },
  async syncCounts() {
    try { const c = await API.get('/api/conversations'); S.convUnread = c.unread; const n = await API.get('/api/me'); S.unread = n.unread; S.me = n.me; LS.set('me', n.me); renderTabs(SCREENS[Nav.top().name]); } catch (e) { /* offline */ }
  },
  signedOut() {
    if (!API.token) return; API.setToken(''); Live.stop(); S.me = null; LS.del('nav'); LS.del('me'); Layers.el && S.layers.slice().forEach(l => l.close());
    Nav.reset('welcome'); toast('Please sign in again');
  },
  async logout() {
    const ok = await confirmBox({ title: 'Log out?', text: 'You can sign back in with an OTP any time.', ok: 'Log out' }); if (!ok) return;
    API.setToken(''); Live.stop(); S.me = null; LS.del('nav'); LS.del('me'); Nav.reset('welcome');
  },
  pushToken() {
    window.__onPushToken = tok => { API.post('/api/me/devices', { token: tok, platform: 'android' }).catch(() => {}); };
    if (window.AndroidBridge && AndroidBridge.requestPushToken) { try { AndroidBridge.requestPushToken(); } catch (e) { /* no firebase */ } }
  },
  async startDL() {
    const ok = await confirmBox({ title: 'Continue to DigiLocker?', text: 'You will sign in on DigiLocker\'s own site and approve sharing your Aadhaar details. We never see your DigiLocker password or OTP, and we keep only the last 4 digits.', ok: 'Yes, continue' });
    if (!ok) return;
    const r = await API.post('/api/digilocker/start', Bridge.has() ? { platform: 'android' } : { platform: 'web', returnUrl: location.origin + '/' });
    LS.set('dlSession', r.session);
    if (Bridge.has() && AndroidBridge.openAuth) AndroidBridge.openAuth(r.authUrl); else location.href = r.authUrl;
  },
  async finishDL(session) {
    LS.del('dlReturn'); LS.del('dlSession');
    try {
      let r; for (let i = 0; i < 6; i++) { r = await API.get('/api/digilocker/result?session=' + encodeURIComponent(session)); if (!r.pending) break; await new Promise(x => setTimeout(x, 800)); }
      if (r.me) { S.me = r.me; LS.set('me', r.me); }
      if (r.ok) { Bridge.vibrate(20); toast(r.mismatch ? 'Verified. Your profile name differs from your Aadhaar, we flagged it for review.' : 'Identity verified'); }
      else toast({ aadhaar_required: 'Aadhaar was not shared. Please approve Aadhaar on DigiLocker.', id_in_use: 'This Aadhaar is already linked to another account.', denied: 'You declined access on DigiLocker.', exchange_failed: 'DigiLocker could not complete. Please try again.' }[r.error] || 'Verification did not complete', { ms: 5000 });
      Nav.refresh(false);
    } catch (e) { fail(e); }
  }
};
// Android: savrogyl://digilocker/done?session=...&status=ok
window.__onDeepLink = url => { try { const u = new URL(url); const s = u.searchParams.get('session'); if (s && u.host === 'digilocker') App.finishDL(s); } catch (e) { /* ignore */ } };

/* ---------- welcome ---------- */
SCREENS.welcome = {
  auth: true, bare: true,
  render() {
    return '<div class="welcome"><div class="logo">' + I('scale') + '</div><div class="sp"></div>' +
      '<h1>Find the right lawyer.<br>Follow every hearing.</h1><p style="opacity:.7;margin:14px 0 26px;font-size:16px">Verified advocates near you. Book a consultation, track your case, chat and pay, all in one place.</p>' +
      '<button class="btn block" data-act="start">' + esc(t('Get started')) + '</button>' +
      '<div class="row mt" style="justify-content:center"><button class="btn ghost sm" data-act="lang" data-v="en" style="' + (LANG === 'en' ? 'font-weight:900' : 'opacity:.6') + '">English</button><button class="btn ghost sm" data-act="lang" data-v="ta" style="' + (LANG === 'ta' ? 'font-weight:900' : 'opacity:.6') + '">தமிழ்</button></div>' +
      '<p class="tiny c" style="opacity:.5;margin-top:16px">Not a law firm and does not give legal advice.</p></div>';
  }
};
ACT.start = () => Nav.go('phone', {});
ACT.lang = el => { LANG = el.dataset.v; LS.set('lang', LANG); document.documentElement.lang = LANG === 'ta' ? 'ta' : 'en'; Nav.refresh(true); if (S.me && API.token) API.put('/api/me', { lang: LANG }).catch(() => {}); };

/* ---------- phone ---------- */
SCREENS.phone = {
  auth: true, bare: true, title: 'Sign in',
  render(p) {
    return topbar('Sign in') + '<div class="page"><div class="h2">' + esc(t('Mobile number')) + '</div><p class="muted mts">We will text you a 6-digit code to sign in or create your account.</p>' +
      '<div class="field mt"><div class="row"><div class="in" style="width:72px;flex:none;display:grid;place-items:center;font-weight:700">+91</div><input id="ph" class="in" inputmode="numeric" maxlength="10" placeholder="98765 43210" autocomplete="tel-national" value="' + esc(p.phone || '') + '"></div></div>' +
      '<div id="err"></div><button class="btn block" data-act="sendotp">' + esc(t('Continue')) + '</button>' +
      '<p class="tiny muted c mt">By continuing you agree to our <a href="' + esc(API.base) + '/terms" target="_blank">Terms</a> and <a href="' + esc(API.base) + '/privacy" target="_blank">Privacy Policy</a>.</p></div>';
  },
  mount() { const i = $('#ph'); if (i) { i.focus(); i.onkeydown = e => { if (e.key === 'Enter') ACT.sendotp($('[data-act=sendotp]')); }; } }
};
ACT.sendotp = el => busy(el, async () => {
  const phone = val('#ph').replace(/\D/g, ''); $('#err').innerHTML = '';
  if (!/^[6-9]\d{9}$/.test(phone)) { $('#err').innerHTML = '<div class="err-msg">Enter a valid 10-digit mobile number</div>'; return; }
  const r = await API.post('/api/auth/otp/request', { phone });
  Nav.go('otp', { phone, devOtp: r.devOtp || '', demo: !!r.demo });
});

/* ---------- OTP ---------- */
SCREENS.otp = {
  auth: true, bare: true, title: 'Verify',
  render(p) {
    return topbar('Enter OTP') + '<div class="page"><p class="muted">Code sent to <b>+91 ' + esc(p.phone) + '</b></p>' +
      (p.devOtp ? '<div class="card soft mt small"><b>' + (p.demo ? 'Demo mode:' : 'Test mode:') + '</b> ' + (p.demo ? 'use code' : 'your code is') + ' <b style="letter-spacing:2px">' + esc(p.devOtp) + '</b> <a class="link" data-act="fillotp" data-v="' + esc(p.devOtp) + '">Fill it</a></div>' : '') +
      '<div class="otp mt2">' + [0, 1, 2, 3, 4, 5].map(i => '<input inputmode="numeric" maxlength="1" data-i="' + i + '" aria-label="digit ' + (i + 1) + '">').join('') + '</div><div id="err"></div>' +
      '<button class="btn block mt2" data-act="verifyotp">' + esc(t('Verify')) + '</button>' +
      '<p class="c muted small mt"><span id="rs">Resend code in 30s</span></p></div>';
  },
  mount(el, p) {
    const boxes = $$('.otp input', el);
    boxes.forEach((b, i) => {
      b.oninput = () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every(x => x.value)) ACT.verifyotp($('[data-act=verifyotp]')); };
      b.onkeydown = e => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ''; } };
      b.onpaste = e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (d.length > 1) { e.preventDefault(); d.split('').forEach((c, k) => { if (boxes[k]) boxes[k].value = c; }); ACT.verifyotp($('[data-act=verifyotp]')); } };
    });
    boxes[0].focus(); let s = 30; clearInterval(App._rs);
    App._rs = setInterval(() => { const r = $('#rs'); if (!r) return clearInterval(App._rs); s--; r.innerHTML = s > 0 ? 'Resend code in ' + s + 's' : '<a class="link" data-act="resend">Resend code</a>'; if (s <= 0) clearInterval(App._rs); }, 1000);
  }
};
ACT.fillotp = el => { $$('.otp input').forEach((b, i) => { b.value = el.dataset.v[i] || ''; }); ACT.verifyotp($('[data-act=verifyotp]')); };
ACT.resend = el => busy(el, async () => { const p = Nav.top().params; const r = await API.post('/api/auth/otp/request', { phone: p.phone }); toast('Code sent again'); Nav.replace('otp', { phone: p.phone, devOtp: r.devOtp || '', demo: !!r.demo }); });
ACT.verifyotp = el => busy(el, async () => {
  const otp = $$('.otp input').map(b => b.value).join(''), p = Nav.top().params; $('#err').innerHTML = '';
  if (otp.length !== 6) { $('#err').innerHTML = '<div class="err-msg">Enter all 6 digits</div>'; return; }
  try {
    const r = await API.post('/api/auth/otp/verify', { phone: p.phone, otp, lang: LANG });
    API.setToken(r.token); S.me = r.user; LS.set('me', r.user); LS.del('nav'); clearInterval(App._rs); Bridge.vibrate(15);
    await App.enter(r.isNew || !r.user.role || !r.user.name, false);
  } catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; $$('.otp input').forEach(b => { b.value = ''; }); $$('.otp input')[0].focus(); }
});

/* ---------- role ---------- */
SCREENS.role = {
  auth: true, bare: true, title: 'Your role',
  render(p) {
    const sel = p.role || '';
    const card = (r, ic, h, s) => '<div class="rolecard ' + (sel === r ? 'on' : '') + '" data-act="pickrole" data-v="' + r + '">' + I(ic) + '<div><div class="h3">' + h + '</div><div class="muted small">' + s + '</div></div></div>';
    return '<div class="page" style="padding-top:calc(var(--sat) + 28px)"><div class="h2" style="font-size:28px;letter-spacing:-.8px">How will you use GetYourLawyer?</div><p class="muted mts">Choose once. A mobile number can only be one role.</p>' +
      '<div class="gap mt2">' + card('client', 'user', t('I am a client'), 'Find verified lawyers, book consultations and follow my cases') + card('lawyer', 'scale', t('I am a lawyer'), 'List my practice, manage cases, hearings, clients and earnings') + '</div>' +
      '<div id="err"></div><button class="btn block mt2" data-act="saverole" ' + (sel ? '' : 'disabled') + '>' + esc(t('Continue')) + '</button></div>';
  }
};
ACT.pickrole = el => { const f = Nav.top(); f.params.role = el.dataset.v; Nav.paint(f, true); };
ACT.saverole = el => busy(el, async () => {
  const role = Nav.top().params.role;
  const ok = await confirmBox({ title: 'Continue as a ' + role + '?', text: 'This number will be registered as a ' + role + '. You cannot change this later.', ok: 'Yes, continue' }); if (!ok) return;
  const r = await API.post('/api/me/role', { role }); S.me = r.me; LS.set('me', r.me); await App.enter(true, false);
});

/* ---------- onboarding ---------- */
SCREENS.onboard = {
  auth: true, bare: true, title: 'About you',
  render() {
    const l = isLawyer();
    return '<div class="page" style="padding-top:calc(var(--sat) + 24px)"><div class="h2" style="font-size:26px">Tell us about you</div><p class="muted mts">' + (l ? 'Use the name on your Bar Council enrolment.' : 'This helps lawyers address you properly.') + '</p>' +
      '<div class="field mt2"><label>Full name</label><input id="nm" class="in" placeholder="' + (l ? 'Adv. Priya Sharma' : 'Priya Sharma') + '" autocomplete="name"></div>' +
      '<div class="field"><label>City</label><input id="ct" class="in" value="Chennai"></div>' +
      '<div class="field"><label>Email <span class="muted">(optional)</span></label><input id="em" class="in" type="email" placeholder="you@example.com"></div>' +
      '<div id="err"></div><button class="btn block" data-act="saveonboard">' + esc(t('Continue')) + '</button></div>';
  }
};
ACT.saveonboard = el => busy(el, async () => {
  const name = val('#nm'); if (name.length < 3) { $('#err').innerHTML = '<div class="err-msg">Enter your full name</div>'; return; }
  const r = await API.put('/api/me', { name, city: val('#ct'), email: val('#em'), lang: LANG }); S.me = r.me; LS.set('me', r.me); await App.enter(true, false);
});

/* ---------- verification (DigiLocker, or upload an ID for review) ---------- */
function verifyStatusCard() {
  const v = (S.me && S.me.verify) || { status: 'none' };
  if (v.status === 'verified') return '<div class="card"><div class="row"><div class="av sm">' + I('shield') + '</div><div><div class="b">Identity verified ' + tick() + '</div><div class="small muted">' + (v.method === 'digilocker' ? 'via DigiLocker' + (v.last4 ? ' · Aadhaar ending ' + esc(v.last4) : '') : 'ID reviewed by our team') + '</div></div></div>' +
    (v.consentUntil ? '<div class="tiny muted mts">DigiLocker consent valid until ' + fmtTs(v.consentUntil) + '</div>' : '') + (v.mismatch ? '<div class="err-msg tiny">Your profile name or date of birth differs from your Aadhaar. Please update your profile to match.</div>' : '') + '</div>';
  if (v.status === 'pending') return '<div class="card soft"><div class="b">ID under review</div><div class="small muted">We are checking your document. This usually takes a few hours.</div></div>';
  if (v.status === 'rejected') return '<div class="card"><div class="b">ID not accepted</div><div class="small muted">' + esc(v.note || 'Please try DigiLocker or upload a clearer photo.') + '</div></div>';
  return '';
}
SCREENS.verify = {
  title: 'Verify identity', bare: false,
  render(p) {
    const v = (S.me.verify || {}).status, ok = v === 'verified';
    return topbar('Verify identity', { back: !p.first }) + '<div class="page">' + (ok ? verifyStatusCard() + '<button class="btn block mt" data-act="back">Done</button>' :
      '<div class="hero"><div style="width:48px;height:48px;border-radius:14px;background:var(--inv-fg);color:var(--inv-bg);display:grid;place-items:center;margin-bottom:12px">' + I('shield') + '</div><h2>Verify with DigiLocker</h2><p>' + (isLawyer() ? 'Verified lawyers get a badge and are listed to clients.' : 'Verified clients can book lawyers and register cases. It protects lawyers and you.') + '</p><button class="btn block" data-act="startdl">' + esc(t('Verify with DigiLocker')) + '</button></div>' +
      '<div class="steps mt2"><div class="step"><span class="n">1</span><div class="small">Sign in on DigiLocker\'s own site</div></div><div class="step"><span class="n">2</span><div class="small">Approve sharing your Aadhaar details</div></div><div class="step"><span class="n">3</span><div class="small">Come back here, you are verified</div></div></div>' +
      verifyStatusCard() + '<div class="mt2 c"><a class="link" data-act="uploadid">Upload an ID instead</a></div>' + (p.first ? '<div class="mt c"><a class="link muted" data-act="skipverify">Skip for now</a></div>' : '') +
      '<p class="tiny muted c mt2">We store only the last 4 digits of your Aadhaar. We never see your DigiLocker password or OTP.</p>') + '</div>';
  }
};
ACT.startdl = el => busy(el, () => App.startDL());
ACT.skipverify = () => { Nav.reset(TABS[S.me.role][0]); };
ACT.uploadid = () => {
  const l = sheet('<div class="h2">Upload an ID</div><p class="muted small mts">A clear photo of your Aadhaar, PAN, driving licence, voter ID or passport. Our team reviews it manually.</p>' +
    '<div class="field mt"><label>Document type</label><select id="idt" class="in"><option value="aadhaar">Aadhaar</option><option value="pan">PAN</option><option value="dl">Driving licence</option><option value="voter">Voter ID</option><option value="passport">Passport</option></select></div>' +
    '<button class="btn ghost block" data-act="pickid">' + I('upload') + ' <span id="fn">Choose photo or PDF</span></button><div id="err"></div><button class="btn block mt" data-act="sendid">Submit for review</button>');
  l._file = null; App._idLayer = l;
};
ACT.pickid = async () => { try { const f = await pickFile(); if (!f) return; App._idData = await fileToDataURL(f); $('#fn').textContent = f.name; } catch (e) { fail(e); } };
ACT.sendid = el => busy(el, async () => {
  if (!App._idData) { toast('Choose a photo or PDF first'); return; }
  const r = await API.post('/api/verify/id', { type: $('#idt').value, file: App._idData }); App._idData = null; S.me = r.me; LS.set('me', r.me);
  if (App._idLayer) App._idLayer.close(); toast('Submitted for review'); Nav.refresh(false);
});
