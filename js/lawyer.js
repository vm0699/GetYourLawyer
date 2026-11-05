'use strict';
/* Lawyer side: dashboard, calendar, profile, fees + availability, credentials, earnings, reports, reviews. */

const APPROVAL_TXT = { draft: ['Complete your profile', 'Finish the steps below and submit for review. Clients can see you once approved.'], submitted: ['Under review', 'Our team is checking your credentials. This usually takes up to 24 hours.'], rejected: ['Changes needed', ''], approved: ['You are live', 'Clients can find and book you.'] };

/* ================= DASHBOARD ================= */
SCREENS.ldash = {
  title: 'Dashboard',
  load() { return API.get('/api/lawyer/dashboard'); },
  render(p, d) {
    const me = S.me;
    let h = '<div class="bar big"><div class="sp"><div class="small muted">Welcome back</div><h1 style="font-size:23px">' + esc(me.name || 'Counsel') + '</h1></div><button class="iconbtn" data-act="bell" aria-label="Notifications">' + I('bell') + (S.unread ? '<span class="badge">' + (S.unread > 9 ? '9+' : S.unread) + '</span>' : '') + '</button></div><div class="page">';
    if (!d) return h + skel(4) + '</div>';
    const ap = APPROVAL_TXT[d.status] || APPROVAL_TXT.draft;
    if (d.status !== 'approved' || !d.listed) {
      h += '<div class="card inv"><div class="b" style="font-size:17px">' + ap[0] + '</div><div class="small muted mts">' + esc(d.status === 'rejected' ? d.note : ap[1]) + '</div>' + (d.status === 'submitted' ? '' : '<div class="steps mt">' + (d.todo.length ? d.todo.slice(0, 4).map((x, i) => '<div class="step" style="background:var(--bg);color:var(--fg)" data-act="go" data-v="lcredentials"><span class="n">' + (i + 1) + '</span><div class="sp small">' + esc(x) + '</div>' + I('chev') + '</div>').join('') : '<button class="btn block" style="background:var(--inv-fg);color:var(--inv-bg)" data-act="go" data-v="lcredentials">Submit for review</button>') + '</div>') + '</div>';
    } else {
      h += '<div class="card"><div class="row"><div class="sp"><div class="b">' + (d.online ? '<span class="live">You are online</span>' : 'You are offline') + '</div><div class="small muted">' + (d.online ? 'Visible on the live map. You receive urgent requests nearby.' : 'Go online to appear on the clients\' live map.') + '</div></div><button class="switch ' + (d.online ? 'on' : '') + '" data-act="gonline" aria-label="Online"></button></div>' +
        (d.online ? '<div class="row mt"><div class="sp small">Share my live location on the map</div><button class="switch ' + (LS.get('shareLoc', false) ? 'on' : '') + '" data-act="shareloc" aria-label="Share location"></button></div>' : '') + '</div>';
    }
    const k = d.kpi;
    h += '<div class="kpis mt"><div class="kpi" data-act="tabcases2"><b>' + k.openCases + '</b><span>Open cases</span></div><div class="kpi" data-act="tabcal"><b>' + k.todayCount + '</b><span>Appointments today</span></div><div class="kpi" data-act="reqs"><b>' + (k.pendingRequests + k.pendingBookings) + '</b><span>Pending requests</span></div><div class="kpi" data-act="go" data-v="learnings"><b>' + rupee(k.monthEarnings) + '</b><span>This month</span></div></div>';
    h += '<div class="sec"><h2>Today</h2><a data-act="tabcal">Calendar</a></div>' + (d.today.length ? '<div class="list">' + d.today.map(b => '<div class="card tap" data-act="booking" data-id="' + b.id + '"><div class="row"><div class="av sm">' + I(MODE_ICON[b.mode]) + '</div><div class="sp"><div class="b">' + esc(b.client) + '</div><div class="small muted">' + fmtTime(b.time) + ' · ' + esc(b.modeName) + '</div></div>' + statusPill(b.status) + '</div></div>').join('') + '</div>' : '<div class="card soft small muted">No appointments today.</div>');
    h += '<div class="sec"><h2>Upcoming hearings</h2></div>' + (d.hearings.length ? '<div class="list">' + d.hearings.map(x => '<div class="card tap" data-act="case" data-id="' + x.caseId + '"><div class="row"><div class="av sm">' + I('gavel') + '</div><div class="sp" style="min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.caseTitle) + '</div><div class="small muted">' + fmtDate(x.date) + (x.time ? ' · ' + fmtTime(x.time) : '') + ' · ' + esc(x.court || '') + '</div><div class="small muted">' + esc(x.client) + '</div></div></div></div>').join('') + '</div>' : '<div class="card soft small muted">No hearings in the next 7 days.</div>');
    h += '<div class="sec"><h2>Quick actions</h2></div><div class="grid4"><div class="cat" data-act="addcase"><i>' + I('plus') + '</i>Add case</div><div class="cat" data-act="go" data-v="lfees"><i>' + I('clock') + '</i>Fees & hours</div><div class="cat" data-act="go" data-v="lreports"><i>' + I('chart') + '</i>Reports</div><div class="cat" data-act="go" data-v="learnings"><i>' + I('wallet') + '</i>Earnings</div></div>';
    h += '<div class="row mt2 small muted"><span class="sp">Rating ' + (k.rating || '-') + ' (' + k.ratingCount + ')</span><span>Balance ' + rupee(k.balance) + '</span></div>';
    return h + '</div>';
  }
};
ACT.tabcases2 = () => Nav.tab('lcases');
ACT.tabcal = () => Nav.tab('lcalendar');
ACT.reqs = () => { Nav.tab('lcases'); Nav.top().params.seg = 'requests'; Nav.refresh(false); };
ACT.gonline = el => busy(el, async () => {
  const f = Nav.top(), on = !f.data.online, share = on && LS.get('shareLoc', false); let pos = null;
  if (share) pos = await getPos();
  const r = await API.post('/api/lawyer/presence', { online: on, share: share ? true : undefined, lat: pos && pos.lat, lng: pos && pos.lng });
  f.data.online = r.online; if (S.me.lawyer) S.me.lawyer.online = r.online; Nav.paint(f, true); toast(on ? 'You are online' : 'You are offline'); Bridge.vibrate(15);
  if (on && !r.listed) toast('You will appear on the map once approved.');
});
ACT.shareloc = el => busy(el, async () => { const on = !LS.get('shareLoc', false); LS.set('shareLoc', on); let pos = null; if (on) pos = await getPos(true); await API.post('/api/lawyer/presence', { online: true, share: on, lat: pos && pos.lat, lng: pos && pos.lng }); Nav.paint(Nav.top(), true); });
// keep the lawyer "online" while the app is open
setInterval(async () => {
  if (!isLawyer() || !S.me.lawyer || !S.me.lawyer.online || document.hidden) return;
  try { const share = LS.get('shareLoc', false); const pos = share ? await getPos(true) : null; await API.post('/api/lawyer/presence', { share: share ? true : undefined, lat: pos && pos.lat, lng: pos && pos.lng }); } catch (e) { /* offline */ }
}, 4 * 60e3);
Live.sub('notice', () => { if (Nav.is('ldash')) Nav.refresh(true); });

/* ================= CALENDAR ================= */
SCREENS.lcalendar = {
  title: 'Calendar',
  load(p) { return API.get('/api/calendar?from=' + addDays(todayStr(), -2) + '&to=' + addDays(todayStr(), 45)); },
  render(p, d) {
    const sel = p.date || todayStr();
    let h = '<div class="bar big"><h1>' + esc(t('Calendar')) + '</h1><button class="iconbtn" data-act="go" data-v="lfees" aria-label="Availability">' + I('clock') + '</button></div><div class="page" style="padding-top:6px">';
    if (!d) return h + skel(3) + '</div>';
    const days = []; for (let i = -2; i < 45; i++) days.push(addDays(todayStr(), i));
    const count = ds => d.events.filter(e => e.date === ds).length;
    h += '<div class="days" id="calstrip">' + days.map(ds => { const dp = dparts(ds), n = count(ds); return '<div class="day ' + (ds === sel ? 'on' : '') + '" data-act="caldate" data-v="' + ds + '"><small>' + dp.dow + '</small><b>' + dp.day + '</b><small>' + (n ? '● ' + n : dp.mon) + '</small></div>'; }).join('') + '</div>';
    const ev = d.events.filter(e => e.date === sel);
    h += '<div class="sec"><h2>' + fmtDate(sel) + '</h2></div>' + (ev.length ? '<div class="list">' + ev.map(e => e.kind === 'booking' ? '<div class="card tap" data-act="booking" data-id="' + e.id + '"><div class="row"><div class="av sm">' + I('calendar') + '</div><div class="sp"><div class="b">' + fmtTime(e.time) + ' · ' + esc(e.title) + '</div><div class="small muted">' + esc(e.sub) + '</div></div>' + statusPill(e.status) + '</div></div>' : '<div class="card tap" data-act="case" data-id="' + e.caseId + '"><div class="row"><div class="av sm">' + I('gavel') + '</div><div class="sp"><div class="b">' + (e.time ? fmtTime(e.time) + ' · ' : '') + esc(e.title) + '</div><div class="small muted">Hearing · ' + esc(e.court || '') + ' ' + esc(e.sub) + '</div></div>' + statusPill(e.status) + '</div></div>').join('') + '</div>' : empty('calendar', 'Nothing scheduled', 'Consultations and hearings on this day appear here.'));
    return h + '</div>';
  },
  mount() { const s = $('#calstrip .on'); if (s) s.scrollIntoView({ inline: 'center', block: 'nearest' }); }
};
ACT.caldate = el => { const f = Nav.top(); f.params.date = el.dataset.v; Nav.save(); const sc = $('#screen').scrollTop; Nav.paint(f, true); $('#screen').scrollTop = sc; };

/* ================= PROFILE ================= */
SCREENS.lprofile = {
  title: 'Profile',
  render() {
    const me = S.me, l = me.lawyer || {}, ap = l.approval || { status: 'draft' };
    return '<div class="bar big"><h1>' + esc(t('Profile')) + '</h1><button class="iconbtn" data-act="bell" aria-label="Notifications">' + I('bell') + (S.unread ? '<span class="badge">' + (S.unread > 9 ? '9+' : S.unread) + '</span>' : '') + '</button></div><div class="page">' +
      '<div class="card"><div class="row">' + avatar(me, 'lg') + '<div class="sp"><div class="h2">' + esc(me.name || 'Add your name') + (ap.status === 'approved' ? ' ' + tick() : '') + '</div><div class="small muted">' + esc(l.firm || '') + '</div><div class="small muted">+91 ' + esc(String(me.phone).slice(3)) + '</div></div><button class="iconbtn" data-act="go" data-v="leditprofile" aria-label="Edit">' + I('edit') + '</button></div>' +
      '<div class="row mt">' + statusPill(ap.status === 'approved' && l.listed ? 'confirmed' : ap.status) + '<span class="small muted">' + esc((APPROVAL_TXT[ap.status] || [''])[0]) + '</span></div></div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('shield', 'Credentials & verification', 'go', 'lcredentials') + menuItem('edit', 'Public profile', 'go', 'leditprofile') + menuItem('clock', 'Fees & availability', 'go', 'lfees') + menuItem('eye', 'Preview as client', 'previewme') + '</div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('wallet', 'Earnings & payouts', 'go', 'learnings') + menuItem('chart', t('Reports'), 'go', 'lreports') + menuItem('star', 'Reviews', 'go', 'lreviews') + menuItem('calendar', 'Bookings', 'go', 'bookings') + menuItem('card', 'Payment history', 'go', 'payments') + '</div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('help', t('Help & support'), 'go', 'help') + menuItem('gear', t('Settings'), 'go', 'settings') + menuItem('scale', 'About & legal', 'go', 'about') + '</div>' +
      '<button class="btn ghost block mt2" data-act="logout">' + I('logout') + ' ' + esc(t('Log out')) + '</button></div>';
  }
};
ACT.previewme = () => Nav.go('lawyer', { id: S.me.id });

/* ----- edit public profile ----- */
let PICK = null;
SCREENS.leditprofile = {
  title: 'Public profile', bare: true,
  render() {
    const l = S.me.lawyer, M = S.meta, sel = (list, cur, act) => '<div class="chips" style="flex-wrap:wrap;margin:0;padding:0">' + list.map(x => '<button class="chip ' + (cur.includes(x.id) ? 'on' : '') + '" data-act="' + act + '" data-v="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '</div>';
    return topbar('Public profile') + '<div class="page"><div class="c">' + avatar(S.me, 'xl').replace('class="av xl"', 'class="av xl" style="margin:0 auto"') + '<div class="row mts" style="justify-content:center"><button class="btn ghost sm" data-act="setphoto">' + I('camera') + ' Change photo</button></div></div>' +
      '<div class="field mt"><label>Firm / chamber name <span class="muted">optional</span></label><input id="lfirm" class="in" maxlength="80" value="' + esc(l.firm) + '"></div>' +
      '<div class="field"><label>About you</label><textarea id="lbio" class="in" maxlength="800" placeholder="Your practice, approach and the kind of matters you handle.">' + esc(l.bio) + '</textarea></div>' +
      '<div class="field"><label>Years of experience</label><input id="lexp" class="in" inputmode="numeric" maxlength="2" value="' + (l.experience || '') + '"></div>' +
      '<div class="field"><label>Practice areas <span class="muted">(up to 6)</span></label>' + sel(M.areas, l.areas, 'larea') + '</div>' +
      '<div class="field"><label>Languages</label>' + sel(M.langs.map(x => ({ id: x, name: x })), l.languages, 'llang') + '</div>' +
      '<div class="field"><label>Courts you appear in</label>' + sel(M.courts.map(x => ({ id: x, name: x })), l.courts, 'lcourt') + '</div>' +
      '<div class="sec"><h2>Chamber location</h2></div><div class="field"><input id="laddr" class="in" maxlength="200" placeholder="Street, area, landmark" value="' + esc(l.office.address) + '"></div><div class="field"><input id="lcity" class="in" maxlength="60" placeholder="Area / city" value="' + esc(l.office.city) + '"></div>' +
      '<div class="row"><button class="btn ghost sm" data-act="usemyloc">' + I('locate') + ' Use my location</button><span class="small muted sp" id="lcoord">' + (l.office.lat != null ? l.office.lat.toFixed(4) + ', ' + l.office.lng.toFixed(4) : 'Tap the map to set your pin') + '</span></div>' +
      '<div class="mapwrap mts" style="height:240px;min-height:240px"><div id="pickmap"></div></div><div id="err"></div><button class="btn block mt" data-act="savelprofile">' + esc(t('Save')) + '</button></div>';
  },
  mount(el) {
    const l = S.me.lawyer; PICK = { areas: l.areas.slice(), languages: l.languages.slice(), courts: l.courts.slice(), lat: l.office.lat, lng: l.office.lng };
    if (typeof L === 'undefined') return; const c = $('#pickmap', el); c.id = 'pickmap'; c.style.cssText = 'position:absolute;inset:0';
    const at = PICK.lat != null ? [PICK.lat, PICK.lng] : [(S.pos || CHENNAI).lat, (S.pos || CHENNAI).lng];
    const map = L.map('pickmap', { zoomControl: true }).setView(at, PICK.lat != null ? 15 : 12); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const mk = L.marker(at, { draggable: true, icon: L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 38], html: '<div class="pin on"><span>' + esc(initials(S.me.name)) + '</span></div>' }), opacity: PICK.lat != null ? 1 : 0 }).addTo(map);
    const set = ll => { PICK.lat = ll.lat; PICK.lng = ll.lng; mk.setLatLng(ll); mk.setOpacity(1); $('#lcoord').textContent = ll.lat.toFixed(4) + ', ' + ll.lng.toFixed(4); };
    map.on('click', e => set(e.latlng)); mk.on('dragend', () => set(mk.getLatLng())); PICK.set = ll => { set(ll); map.setView(ll, 16); }; setTimeout(() => map.invalidateSize(), 200);
  }
};
const toggleIn = (arr, v, max) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else if (!max || arr.length < max) arr.push(v); else toast('You can choose up to ' + max); };
ACT.larea = el => { toggleIn(PICK.areas, el.dataset.v, 6); el.classList.toggle('on', PICK.areas.includes(el.dataset.v)); };
ACT.llang = el => { toggleIn(PICK.languages, el.dataset.v); el.classList.toggle('on', PICK.languages.includes(el.dataset.v)); };
ACT.lcourt = el => { toggleIn(PICK.courts, el.dataset.v); el.classList.toggle('on', PICK.courts.includes(el.dataset.v)); };
ACT.usemyloc = async () => { const p = await getPos(true); if (p.approx) toast('Could not read your location. Tap the map instead.'); else PICK.set({ lat: p.lat, lng: p.lng }); };
ACT.setphoto = async () => {
  try { const f = await pickFile('image/*'); if (!f) return; const d = await fileToDataURL(f, { maxDim: 360, maxBytes: 150e3 }); await API.put('/api/me/photo', { photo: d }); const r = await API.get('/api/me'); S.me = r.me; LS.set('me', r.me); toast('Photo updated'); Nav.paint(Nav.top(), true); } catch (e) { fail(e); }
};
ACT.savelprofile = el => busy(el, async () => {
  const err = m => { $('#err').innerHTML = '<div class="err-msg">' + m + '</div>'; };
  if (!PICK.areas.length) return err('Choose at least one practice area'); if (val('#lbio').length < 20) return err('Write at least 20 characters about yourself'); if (PICK.lat == null) return err('Set your chamber location on the map');
  const r = await API.put('/api/lawyer/profile', { firm: val('#lfirm'), bio: val('#lbio'), experience: val('#lexp') || 0, areas: PICK.areas, languages: PICK.languages, courts: PICK.courts, office: { address: val('#laddr'), city: val('#lcity'), lat: PICK.lat, lng: PICK.lng } });
  S.me = r.me; LS.set('me', r.me); toast('Profile saved'); Nav.back();
});

/* ----- fees + availability ----- */
const WD = [1, 2, 3, 4, 5, 6, 0], WDN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
SCREENS.lfees = {
  title: 'Fees & availability', bare: true,
  render() {
    const l = S.me.lawyer, f = l.fees, av = l.avail;
    const feeRow = (k, label, icon) => '<div class="row" style="margin-bottom:10px"><div class="av sm">' + I(icon) + '</div><div class="sp b">' + label + '</div><input class="in fee" data-k="' + k + '" inputmode="numeric" placeholder="Not offered" style="width:120px" value="' + (f[k] == null ? '' : f[k]) + '"></div>';
    return topbar('Fees & availability') + '<div class="page"><div class="sec" style="margin-top:6px"><h2>Consultation fees (₹)</h2></div><p class="small muted">Leave a field empty to stop offering it. Enter 0 for a free consultation. The platform keeps ' + '10% (set by admin)' + ' of each paid consultation.</p><div class="mt">' +
      feeRow('chat', 'Chat consult', 'chat') + feeRow('call', 'Phone call', 'phone') + feeRow('video', 'Video call', 'video') + feeRow('in_person', 'In person', 'building') + feeRow('hearing', 'Per hearing (info)', 'gavel') + '</div>' +
      '<div class="row mt"><div class="sp"><div class="b">Auto-confirm bookings</div><div class="small muted">Off = you approve each request</div></div><button class="switch ' + (l.autoConfirm ? 'on' : '') + '" id="autoc" data-act="sw" aria-label="Auto confirm"></button></div>' +
      '<div class="sec"><h2>Weekly hours</h2></div><div class="field"><label>Slot length</label><select id="slotmin" class="in">' + [15, 20, 30, 45, 60].map(n => '<option value="' + n + '" ' + (av.slotMin === n ? 'selected' : '') + '>' + n + ' minutes</option>').join('') + '</select></div>' +
      WD.map(d => { const w = av.days[d] || []; return '<div class="card mts" data-day="' + d + '"><div class="b">' + WDN[d] + '</div>' + [0, 1].map(i => '<div class="row mts"><input class="in wf" type="time" value="' + (w[i] ? w[i].from : '') + '"><span class="muted">to</span><input class="in wt" type="time" value="' + (w[i] ? w[i].to : '') + '"></div>').join('') + '</div>'; }).join('') +
      '<div class="sec"><h2>Days off</h2></div><div class="row"><input id="offd" class="in" type="date" min="' + todayStr() + '"><button class="btn sm" data-act="addoff">Add</button></div><div class="row wrap mts" id="offs">' + (av.off || []).filter(x => x >= todayStr()).map(x => '<button class="chip on" data-act="deloff" data-v="' + x + '">' + fmtDate(x) + ' ✕</button>').join('') + '</div>' +
      '<div id="err"></div><button class="btn block mt2" data-act="savefees">' + esc(t('Save')) + '</button></div>';
  },
  mount() { App._off = (S.me.lawyer.avail.off || []).filter(x => x >= todayStr()); }
};
ACT.addoff = () => { const v = val('#offd'); if (!v) return; if (!App._off.includes(v)) App._off.push(v); $('#offs').innerHTML = App._off.sort().map(x => '<button class="chip on" data-act="deloff" data-v="' + x + '">' + fmtDate(x) + ' ✕</button>').join(''); $('#offd').value = ''; };
ACT.deloff = el => { App._off = App._off.filter(x => x !== el.dataset.v); el.remove(); };
ACT.savefees = el => busy(el, async () => {
  const fees = {}; $$('.fee').forEach(i => { fees[i.dataset.k] = i.value.trim() === '' ? null : i.value.trim(); });
  const days = {}; $$('[data-day]').forEach(c => { const w = []; $$('.row', c).forEach(r => { const a = r.querySelector('.wf').value, b = r.querySelector('.wt').value; if (a && b) w.push({ from: a, to: b }); }); if (w.length) days[c.dataset.day] = w; });
  try {
    const r1 = await API.put('/api/lawyer/profile', { fees, autoConfirm: $('#autoc').classList.contains('on') });
    const r2 = await API.put('/api/lawyer/availability', { slotMin: +$('#slotmin').value, days, off: App._off }); S.me = r2.me; LS.set('me', r2.me); toast('Saved'); Nav.back();
  } catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; }
});

/* ----- credentials: DigiLocker + Bar Council + submit ----- */
SCREENS.lcredentials = {
  title: 'Verification', bare: true,
  load() { return API.get('/api/lawyer/checklist'); },
  render(p, d) {
    const me = S.me, l = me.lawyer, v = me.verify || {}, ok = v.status === 'verified', ap = l.approval, locked = ap.status === 'approved';
    let h = topbar('Verification') + '<div class="page">';
    h += '<div class="card ' + (ap.status === 'approved' ? '' : 'inv') + '"><div class="b" style="font-size:17px">' + (APPROVAL_TXT[ap.status] || APPROVAL_TXT.draft)[0] + '</div><div class="small muted mts">' + esc(ap.status === 'rejected' ? (ap.note || 'Please fix the items below and resubmit.') : (APPROVAL_TXT[ap.status] || APPROVAL_TXT.draft)[1]) + '</div></div>';
    h += '<div class="sec"><h2>1 · Identity (DigiLocker)</h2></div>' + (ok ? verifyStatusCard() : '<div class="card"><p class="small muted">Sign in on DigiLocker and approve sharing your Aadhaar. We keep only the last 4 digits.</p><button class="btn block mt" data-act="startdl">' + esc(t('Verify with DigiLocker')) + '</button>' + (v.status === 'pending' ? '<p class="tiny muted mts">Your uploaded ID is under review.</p>' : '<div class="c mts"><a class="link" data-act="uploadid">Upload an ID instead</a></div>') + '</div>');
    h += '<div class="sec"><h2>2 · Bar Council details</h2></div><div class="card"><div class="field"><label>Enrolment number</label><input id="bno" class="in" placeholder="TN/1234/2015" maxlength="40" value="' + esc(l.barNo) + '" ' + (locked ? 'disabled' : '') + '></div><div class="field"><label>State Bar Council</label><select id="bco" class="in" ' + (locked ? 'disabled' : '') + '><option value="">Choose…</option>' + S.meta.councils.map(c => '<option ' + (l.council === c ? 'selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div><div class="field"><label>Year of enrolment</label><input id="byr" class="in" inputmode="numeric" maxlength="4" value="' + (l.enrolYear || '') + '" ' + (locked ? 'disabled' : '') + '></div>' +
      '<div class="field"><label>Bar Council certificate</label><button class="btn ghost block" data-act="pickcert" ' + (locked ? 'disabled' : '') + '>' + I('upload') + ' <span id="cfn">' + (ap.certFile ? 'Certificate uploaded · tap to replace' : 'Upload photo or PDF (up to 1.5 MB)') + '</span></button><span class="hint">Only our verification team can see this file.</span></div><div id="err"></div>' + (locked ? '' : '<button class="btn block" data-act="savecred">Save details</button>') + '</div>';
    h += '<div class="sec"><h2>3 · Public profile</h2></div><div class="card tap" data-act="go" data-v="leditprofile"><div class="row"><div class="sp small">' + (d && !d.todo.some(x => /practice|bio|location/i.test(x)) ? 'Profile complete ' + tick() : 'Add practice areas, bio and chamber location') + '</div>' + I('chev', 'chev') + '</div></div>';
    if (!locked && ap.status !== 'submitted') {
      h += '<div class="sec"><h2>4 · Submit for review</h2></div>' + (d && d.todo.length ? '<div class="card soft small"><b>Still to do:</b><ul style="margin:6px 0 0;padding-left:18px">' + d.todo.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') + '<button class="btn block mt" data-act="submitlawyer" ' + (d && !d.todo.length ? '' : 'disabled') + '>Submit for review</button>';
    }
    return h + '<p class="tiny muted c mt2">Need help? <a class="link" data-act="bot">Ask the assistant</a></p></div>';
  }
};
App._cert = null;
ACT.pickcert = async () => { try { const f = await pickFile(); if (!f) return; App._cert = await fileToDataURL(f); $('#cfn').textContent = f.name; } catch (e) { fail(e); } };
ACT.savecred = el => busy(el, async () => {
  try { const r = await API.post('/api/lawyer/credentials', { barNo: val('#bno'), council: val('#bco'), enrolYear: val('#byr'), certFile: App._cert || undefined }); App._cert = null; S.me = r.me; LS.set('me', r.me); toast('Saved'); Nav.refresh(false); }
  catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; }
});
ACT.submitlawyer = el => busy(el, async () => {
  try { const r = await API.post('/api/lawyer/submit'); S.me = r.me; LS.set('me', r.me); Bridge.vibrate(20); toast('Submitted. We will review it shortly.'); Nav.reset('ldash'); }
  catch (e) { toast(e.message); Nav.refresh(false); }
});

/* ================= EARNINGS + PAYOUTS ================= */
SCREENS.learnings = {
  title: 'Earnings', bare: true,
  load() { return API.get('/api/lawyer/earnings'); },
  render(p, d) {
    let h = topbar('Earnings & payouts') + '<div class="page">'; if (!d) return h + skel(3) + '</div>';
    h += '<div class="hero"><p>Available balance</p><h2 style="font-size:36px;letter-spacing:-1px">' + rupee(d.balance) + '</h2><button class="btn" data-act="reqpayout" ' + (d.balance >= 100 ? '' : 'disabled') + '>Request payout</button></div>' +
      '<div class="kpis mt"><div class="kpi"><b>' + rupee(d.earned) + '</b><span>Total earned</span></div><div class="kpi"><b>' + rupee(d.paidOut) + '</b><span>Paid out</span></div></div><p class="tiny muted mts">Platform commission is ' + d.commissionPct + '% of each paid consultation or invoice.</p>';
    h += '<div class="sec"><h2>Bank / UPI</h2><a data-act="editbank">' + (d.bank ? 'Edit' : 'Add') + '</a></div>' + (d.bank ? '<div class="card small"><div class="kv"><span>Account holder</span><span>' + esc(d.bank.holder) + '</span></div><div class="kv"><span>Account</span><span>•••• ' + esc(d.bank.last4) + ' · ' + esc(d.bank.ifsc) + '</span></div>' + (d.bank.upi ? '<div class="kv"><span>UPI</span><span>' + esc(d.bank.upi) + '</span></div>' : '') + '</div>' : '<div class="card soft small muted">Add your bank details to receive payouts.</div>');
    if (d.payouts.length) h += '<div class="sec"><h2>Payouts</h2></div><div class="card" style="padding:2px 14px">' + d.payouts.map(x => '<div class="item"><div class="av sm">' + I('wallet') + '</div><div class="sp"><div class="t">' + rupee(x.amount) + '</div><div class="s">' + fmtTs(x.t) + (x.ref ? ' · Ref ' + esc(x.ref) : '') + '</div></div>' + statusPill(x.status === 'requested' ? 'unpaid' : x.status) + '</div>').join('') + '</div>';
    h += '<div class="sec"><h2>Activity</h2></div>' + (d.ledger.length ? '<div class="card" style="padding:2px 14px">' + d.ledger.map(x => '<div class="item" style="cursor:default"><div class="sp"><div class="t">' + esc(x.note || cap(x.kind)) + '</div><div class="s">' + fmtTs(x.t) + '</div></div><b>' + (x.amount > 0 ? '+' : '−') + rupee(Math.abs(x.amount)) + '</b></div>').join('') + '</div>' : '<div class="card soft small muted">Earnings appear after consultations are completed or invoices are paid.</div>');
    return h + '</div>';
  }
};
ACT.editbank = async () => { const d = Nav.top().data.bank || {}; sheet('<div class="h2">Payout details</div><div class="field mt"><label>Account holder</label><input id="bh" class="in" value="' + esc(d.holder || '') + '"></div><div class="field"><label>Account number</label><input id="ba" class="in" inputmode="numeric" maxlength="18" placeholder="' + (d.last4 ? '•••• ' + d.last4 : '') + '"></div><div class="field"><label>IFSC</label><input id="bi" class="in" maxlength="11" autocapitalize="characters" value="' + esc(d.ifsc || '') + '"></div><div class="field"><label>UPI ID <span class="muted">optional</span></label><input id="bu" class="in" value="' + esc(d.upi || '') + '"></div><div id="err"></div><button class="btn block" data-act="savebank">Save</button>'); };
ACT.savebank = el => busy(el, async () => { try { await API.put('/api/lawyer/bank', { holder: val('#bh'), acc: val('#ba'), ifsc: val('#bi'), upi: val('#bu') }); Layers.closeTop(); toast('Saved'); Nav.refresh(false); } catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; } });
ACT.reqpayout = el => busy(el, async () => { const d = Nav.top().data; if (!d.bank) { toast('Add your bank or UPI details first'); return ACT.editbank(); } if (!await confirmBox({ title: 'Request payout of ' + rupee(d.balance) + '?', text: 'Sent to the account ending ' + d.bank.last4 + ' after review.', ok: 'Request' })) return; await API.post('/api/lawyer/payouts', { amount: d.balance }); toast('Payout requested'); Nav.refresh(false); });

/* ================= REPORTS ================= */
SCREENS.lreports = {
  title: 'Reports', bare: true,
  load() { return API.get('/api/lawyer/reports?months=6'); },
  render(p, d) {
    let h = topbar('Reports') + '<div class="page">'; if (!d) return h + skel(3) + '</div>';
    const max = Math.max(1, ...d.revenue.byMonth.map(m => m.amount)), stageMax = Math.max(1, ...Object.values(d.cases.byStage)), bar = (obj, label) => Object.keys(obj).length ? Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<div class="mts"><div class="row small"><span class="sp">' + esc(label(k)) + '</span><b>' + v + '</b></div><div class="hbar"><i style="width:' + Math.round(v / Math.max(1, ...Object.values(obj)) * 100) + '%"></i></div></div>').join('') : '<div class="small muted">No data yet</div>';
    h += '<div class="kpis"><div class="kpi"><b>' + d.cases.open + '</b><span>Open cases</span></div><div class="kpi"><b>' + d.cases.closed + '</b><span>Closed cases</span></div><div class="kpi"><b>' + rupee(d.revenue.total) + '</b><span>Total earned</span></div><div class="kpi"><b>' + d.requests.rate + '%</b><span>Request acceptance</span></div></div>';
    h += '<div class="sec"><h2>Earnings, last 6 months</h2></div><div class="card"><div class="bars">' + d.revenue.byMonth.map(m => '<div><span style="color:var(--fg);font-weight:700">' + (m.amount ? '₹' + (m.amount >= 1000 ? (m.amount / 1000).toFixed(1) + 'k' : m.amount) : '') + '</span><i style="height:' + Math.max(3, Math.round(m.amount / max * 80)) + '%"></i>' + MON[+m.month.slice(5) - 1] + '</div>').join('') + '</div></div>';
    h += '<div class="sec"><h2>Open cases by stage</h2></div><div class="card">' + bar(d.cases.byStage, k => STAGE_LABEL[k] || k) + '</div>';
    h += '<div class="sec"><h2>Cases by practice area</h2></div><div class="card">' + bar(d.cases.byArea, areaName) + '</div>';
    h += '<div class="sec"><h2>Outcomes</h2></div><div class="card">' + bar(d.cases.outcomes, cap) + '</div>';
    h += '<div class="sec"><h2>Consultations</h2></div><div class="card"><div class="kv"><span>Total</span><span>' + d.bookings.total + '</span></div><div class="kv"><span>Completed</span><span>' + d.bookings.completed + '</span></div><div class="kv"><span>Cancelled / declined</span><span>' + d.bookings.cancelled + '</span></div>' + bar(d.bookings.byMode, modeName) + '</div>';
    h += '<div class="sec"><h2>Invoices</h2></div><div class="card"><div class="kv"><span>Paid</span><span>' + rupee(d.invoices.paid) + '</span></div><div class="kv"><span>Outstanding</span><span>' + rupee(d.invoices.unpaid) + '</span></div></div>';
    h += '<div class="sec"><h2>Export</h2></div><div class="row"><button class="btn ghost sm block" data-act="csv" data-v="cases">Cases</button><button class="btn ghost sm block" data-act="csv" data-v="bookings">Bookings</button><button class="btn ghost sm block" data-act="csv" data-v="earnings">Earnings</button></div>';
    return h + '</div>';
  }
};
ACT.csv = el => busy(el, async () => { const b = await API.blob('/api/lawyer/reports.csv?type=' + el.dataset.v); await Bridge.save('getyourlawyer-' + el.dataset.v + '.csv', b); });

/* ================= REVIEWS ================= */
SCREENS.lreviews = {
  title: 'Reviews', bare: true,
  load() { return API.get('/api/lawyers/' + S.me.id); },
  render(p, d) {
    let h = topbar('Reviews') + '<div class="page">'; if (!d) return h + skel(3) + '</div>';
    h += '<div class="card c"><b style="font-size:34px">' + (d.rating || '-') + '</b><div>' + stars(d.rating) + '</div><div class="small muted">' + d.ratingCount + ' reviews</div></div><div class="mt"></div>';
    return h + (d.reviews.length ? '<div class="list">' + d.reviews.map(r => '<div class="card"><div class="row"><b class="sp">' + esc(r.name) + '</b>' + stars(r.rating) + '</div>' + (r.text ? '<p class="small mts">' + esc(r.text) + '</p>' : '') + (r.reply ? '<div class="card soft small mts"><b>Your reply:</b> ' + esc(r.reply) + '</div>' : '<a class="link tiny" data-act="replyrev" data-id="' + r.id + '">Reply</a>') + '</div>').join('') + '</div>' : empty('star', 'No reviews yet', 'Clients can review you after a consultation or when a case closes.')) + '</div>';
  }
};
ACT.replyrev = el => { App._rv = el.dataset.id; sheet('<div class="h2">Reply publicly</div><div class="field mt"><textarea id="rrep" class="in" maxlength="400" placeholder="Thank the client or add context. Keep it professional and never share case details."></textarea></div><button class="btn block" data-act="sendrep">Post reply</button>'); };
ACT.sendrep = el => busy(el, async () => { if (val('#rrep').length < 2) { toast('Write a reply'); return; } await API.post('/api/reviews/' + App._rv + '/reply', { text: val('#rrep') }); Layers.closeTop(); toast('Reply posted'); Nav.refresh(false); });
