'use strict';
/* Profile, edit profile, settings, notifications, payments, saved lawyers, help, about. Shared by both roles where possible. */

function openNotice(n) {
  const d = n.data || {};
  if (d.bookingId) Nav.go('booking', { id: d.bookingId });
  else if (d.caseId) Nav.go('case', { id: d.caseId });
  else if (d.requestId) { if (isLawyer()) { Nav.tab('lcases'); Nav.top().params.seg = 'requests'; Nav.refresh(false); } else { Nav.tab('cases'); Nav.top().params.seg = 'requests'; Nav.refresh(false); } }
  else if (d.from) Nav.go('thread', { id: d.from });
  else if (n.type === 'verified' || n.type === 'lawyer_review') Nav.go(isLawyer() ? 'lcredentials' : 'verify', {});
  else if (n.type === 'payout') Nav.go('learnings');
}
const NOTE_ICON = { booking_confirmed: 'calendar', booking_request: 'calendar', booking_cancelled: 'x', booking_reminder: 'clock', hearing_reminder: 'gavel', case_request: 'briefcase', case_accepted: 'checkc', case_update: 'file', message: 'chat', invoice: 'card', invoice_paid: 'card', review: 'star', verified: 'shield', lawyer_review: 'shield', payout: 'wallet', broadcast: 'bell' };

SCREENS.notifications = {
  title: 'Notifications',
  async load() { const r = await API.get('/api/notifications'); if (r.unread) { API.post('/api/notifications/read', { all: true }).then(x => { S.unread = x.unread; }).catch(() => {}); } return r; },
  render(p, d) {
    let h = topbar('Notifications') + '<div class="page">';
    if (!d) return h + skel(4) + '</div>';
    if (!d.items.length) return h + empty('bell', 'All caught up', 'Booking updates, hearing reminders and messages appear here.') + '</div>';
    return h + '<div class="card" style="padding:2px 14px">' + d.items.map((n, i) => '<div class="item" data-act="note" data-i="' + i + '" style="' + (n.read ? 'opacity:.65' : '') + '"><div class="av sm">' + I(NOTE_ICON[n.type] || 'bell') + '</div><div class="sp" style="min-width:0"><div class="t">' + esc(n.title) + '</div><div class="s">' + esc(n.body) + '</div></div><span class="tiny muted">' + ago(n.t) + '</span></div>').join('') + '</div></div>';
  }
};
ACT.note = el => openNotice(Nav.top().data.items[+el.dataset.i]);

/* ================= PROFILE (client) ================= */
const menuItem = (icon, label, act, id, extra) => '<div class="item" data-act="' + act + '"' + (id ? ' data-id="' + id + '"' : '') + '><div class="av sm" style="background:var(--soft);color:var(--fg)">' + I(icon) + '</div><div class="sp t">' + esc(label) + '</div>' + (extra || '') + I('chev', 'chev') + '</div>';
SCREENS.profile = {
  title: 'Profile',
  render() {
    const me = S.me;
    return '<div class="bar big"><h1>' + esc(t('Profile')) + '</h1><button class="iconbtn" data-act="bell" aria-label="Notifications">' + I('bell') + (S.unread ? '<span class="badge">' + (S.unread > 9 ? '9+' : S.unread) + '</span>' : '') + '</button></div><div class="page">' +
      '<div class="card"><div class="row">' + avatar(me, 'lg') + '<div class="sp"><div class="h2">' + esc(me.name || 'Add your name') + '</div><div class="small muted">+91 ' + esc(String(me.phone).slice(3)) + '</div><div class="small muted">' + esc(me.city || '') + '</div></div><button class="iconbtn" data-act="go" data-v="editprofile" aria-label="Edit">' + I('edit') + '</button></div></div>' +
      '<div class="mt">' + (me.verify && me.verify.status === 'verified' ? verifyStatusCard() : '<div class="card inv tap" data-act="go" data-v="verify"><div class="row"><div class="av" style="background:var(--inv-fg);color:var(--inv-bg)">' + I('shield') + '</div><div class="sp"><div class="b">Verify your identity</div><div class="small muted">' + (me.verify && me.verify.status === 'pending' ? 'Your ID is under review' : 'Needed to book lawyers and register cases') + '</div></div>' + I('chev', 'chev') + '</div></div>') + '</div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('calendar', t('My bookings'), 'go', 'bookings') + menuItem('briefcase', t('My cases'), 'tabcases') + menuItem('card', t('Payments'), 'go', 'payments') + menuItem('heart', t('Saved lawyers'), 'go', 'saved') + menuItem('bell', t('Notifications'), 'bell', '', S.unread ? '<span class="pill fill">' + S.unread + '</span>' : '') + '</div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('help', t('Help & support'), 'go', 'help') + menuItem('gear', t('Settings'), 'go', 'settings') + menuItem('scale', 'About & legal', 'go', 'about') + '</div>' +
      '<button class="btn ghost block mt2" data-act="logout">' + I('logout') + ' ' + esc(t('Log out')) + '</button></div>';
  }
};
ACT.tabcases = () => Nav.tab('cases');
ACT.logout = () => App.logout();

SCREENS.editprofile = {
  title: 'Edit profile', bare: true,
  render() {
    const m = S.me;
    return topbar('Edit profile') + '<div class="page"><div class="field"><label>Full name</label><input id="pn" class="in" value="' + esc(m.name) + '" maxlength="80"></div><div class="field"><label>Email</label><input id="pe" class="in" type="email" value="' + esc(m.email) + '"></div>' +
      '<div class="row"><div class="field sp"><label>Date of birth</label><input id="pd" class="in" type="date" value="' + esc(m.dob) + '" max="' + addDays(todayStr(), -18 * 365) + '"></div><div class="field sp"><label>Gender</label><select id="pg" class="in"><option value="">-</option><option value="F" ' + (m.gender === 'F' ? 'selected' : '') + '>Female</option><option value="M" ' + (m.gender === 'M' ? 'selected' : '') + '>Male</option><option value="O" ' + (m.gender === 'O' ? 'selected' : '') + '>Other</option></select></div></div>' +
      '<div class="row"><div class="field sp"><label>City</label><input id="pc" class="in" value="' + esc(m.city) + '"></div><div class="field sp"><label>Pincode</label><input id="pp" class="in" inputmode="numeric" maxlength="6" value="' + esc(m.pincode) + '"></div></div>' +
      '<div class="field"><label>State</label><input id="ps" class="in" value="' + esc(m.state || 'Tamil Nadu') + '"></div>' +
      (m.verify && m.verify.status === 'verified' ? '<p class="tiny muted">Your name and date of birth should match your Aadhaar so lawyers can trust your profile.</p>' : '') +
      '<div id="err"></div><button class="btn block mt" data-act="saveprofile">' + esc(t('Save')) + '</button></div>';
  }
};
ACT.saveprofile = el => busy(el, async () => {
  if (val('#pn').length < 3) { $('#err').innerHTML = '<div class="err-msg">Enter your full name</div>'; return; }
  try { const r = await API.put('/api/me', { name: val('#pn'), email: val('#pe'), dob: val('#pd'), gender: val('#pg'), city: val('#pc'), pincode: val('#pp'), state: val('#ps') }); S.me = r.me; LS.set('me', r.me); toast('Profile saved'); Nav.back(); }
  catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; }
});

/* ================= SETTINGS ================= */
SCREENS.settings = {
  title: 'Settings', bare: true,
  render() {
    const me = S.me, th = LS.get('theme', 'light'), prefs = me.prefs || {};
    return topbar('Settings') + '<div class="page"><div class="sec" style="margin-top:6px"><h2>' + esc(t('Language')) + '</h2></div><div class="seg"><button data-act="lang" data-v="en" class="' + (LANG === 'en' ? 'on' : '') + '">English</button><button data-act="lang" data-v="ta" class="' + (LANG === 'ta' ? 'on' : '') + '">தமிழ்</button></div>' +
      '<div class="sec"><h2>' + esc(t('Appearance')) + '</h2></div><div class="seg"><button data-act="theme" data-v="light" class="' + (th === 'light' ? 'on' : '') + '">White</button><button data-act="theme" data-v="dark" class="' + (th === 'dark' ? 'on' : '') + '">Black</button></div>' +
      '<div class="sec"><h2>Alerts</h2></div><div class="card"><div class="row"><div class="sp"><div class="b">Push notifications</div><div class="small muted">Bookings, hearings, messages</div></div><button class="switch ' + (prefs.push !== false ? 'on' : '') + '" data-act="pref" data-v="push" aria-label="Push"></button></div></div>' +
      '<div class="sec"><h2>Privacy & data</h2></div><div class="card" style="padding:2px 14px">' + menuItem('download', 'Download my data', 'exportdata') + menuItem('lock', 'Log out of all devices', 'logoutall') + menuItem('trash', 'Delete my account', 'delacct') + '</div>' +
      '<div class="sec"><h2>Legal</h2></div><div class="card" style="padding:2px 14px">' + menuItem('file', 'Terms of use', 'ext', '', '').replace('data-act="ext"', 'data-act="ext" data-v="' + API.base + '/terms"') + menuItem('shield', 'Privacy policy', 'ext', '').replace('data-act="ext"', 'data-act="ext" data-v="' + API.base + '/privacy"') + '</div>' +
      '<p class="tiny muted c mt2">GetYourLawyer 1.0 · ' + esc(me.phone) + '</p></div>';
  }
};
ACT.theme = el => { LS.set('theme', el.dataset.v); applyTheme(); Nav.paint(Nav.top(), true); };
ACT.pref = el => busy(el, async () => { const prefs = Object.assign({}, S.me.prefs); prefs[el.dataset.v] = prefs[el.dataset.v] === false; const r = await API.put('/api/me', { prefs }); S.me = r.me; LS.set('me', r.me); Nav.paint(Nav.top(), true); });
ACT.exportdata = el => busy(el, async () => { const r = await API.get('/api/me/export'); await Bridge.save('getyourlawyer-my-data.json', new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })); });
ACT.logoutall = async el => { if (await confirmBox({ title: 'Log out everywhere?', text: 'Every device, including this one, will need to sign in again.', ok: 'Log out all' })) busy(el, async () => { await API.post('/api/auth/logout-all'); API.setToken(''); Live.stop(); S.me = null; LS.del('nav'); Nav.reset('welcome'); }); };
ACT.delacct = () => {
  sheet('<div class="h2">Delete your account?</div><p class="muted small mts">Your profile, messages and saved data are erased. Case and payment records are kept without your identity where the law requires. This cannot be undone.</p><div class="field mt"><label>Type DELETE to confirm</label><input id="dconf" class="in" autocapitalize="characters"></div><div id="err"></div><button class="btn block" data-act="delgo">Delete my account</button>');
};
ACT.delgo = el => busy(el, async () => {
  if (val('#dconf') !== 'DELETE') { $('#err').innerHTML = '<div class="err-msg">Type DELETE to confirm</div>'; return; }
  try { await API.del('/api/me'); Layers.closeTop(); API.setToken(''); Live.stop(); S.me = null; LS.del('nav'); LS.del('me'); Nav.reset('welcome'); toast('Account deleted'); }
  catch (e) { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div>'; }
});

/* ================= PAYMENTS ================= */
SCREENS.payments = {
  title: 'Payments',
  load() { return API.get('/api/payments'); },
  render(p, d) {
    let h = topbar('Payments') + '<div class="page">'; if (!d) return h + skel(3) + '</div>';
    if (!d.items.length) return h + empty('card', 'No payments yet', 'Receipts for consultations and invoices appear here.') + '</div>';
    return h + '<div class="card" style="padding:2px 14px">' + d.items.map(x => '<div class="item" data-act="sharepay" data-i="' + d.items.indexOf(x) + '"><div class="av sm">' + I(x.kind === 'invoice' ? 'file' : 'calendar') + '</div><div class="sp"><div class="t">' + esc(x.other || '-') + '</div><div class="s">' + (x.kind === 'invoice' ? 'Invoice' : 'Consultation') + ' · ' + fmtTs(x.paidAt || x.t) + (x.receipt ? ' · ' + esc(x.receipt) : '') + '</div></div><div class="c"><b>' + rupee(x.amount) + '</b><div>' + statusPill(x.status) + '</div></div></div>').join('') + '</div></div>';
  }
};
ACT.sharepay = el => { const x = Nav.top().data.items[+el.dataset.i]; Bridge.share('GetYourLawyer receipt ' + (x.receipt || '') + '\n' + (x.kind === 'invoice' ? 'Invoice' : 'Consultation') + ' · ' + x.other + '\n' + rupee(x.amount) + ' · ' + x.status); };

/* ================= SAVED ================= */
SCREENS.saved = {
  title: 'Saved lawyers',
  async load() { const p = await getPos(); return API.get('/api/lawyers?fav=1&lat=' + p.lat + '&lng=' + p.lng); },
  render(p, d) { let h = topbar('Saved lawyers') + '<div class="page">'; if (!d) return h + skel(3) + '</div>'; return h + (d.items.length ? '<div class="list">' + d.items.map(l => lawyerCardHTML(l)).join('') + '</div>' : empty('heart', 'Nothing saved', 'Tap the heart on a lawyer\'s profile to save them here.')) + '</div>'; }
};

/* ================= HELP + ABOUT ================= */
const FAQ_C = [['How do I book a lawyer?', 'Open a lawyer, choose a consultation type, pick a date and time, then pay. You will see phone or video details once it is confirmed.'], ['How do refunds work?', 'Cancel at least 2 hours before the slot for a full refund. If a lawyer cancels or declines, you are always refunded.'], ['What does the verified badge mean?', 'Lawyers verify their identity through DigiLocker and upload their Bar Council certificate, which our team checks before they are listed.'], ['How do I follow my case?', 'Once a lawyer accepts your case request, open Cases to see the stage, every hearing date, documents, updates and invoices.'], ['Is my information private?', 'Your phone number is shared only after a booking is confirmed or a case is accepted. Documents are visible only to you and your lawyer.'], ['Is this legal advice?', 'No. GetYourLawyer connects you with independent advocates. The assistant gives general information only.']];
const FAQ_L = [['How do I get listed?', 'Verify with DigiLocker, add your Bar Council enrolment number and certificate, complete your profile, then submit for review.'], ['How do payouts work?', 'Earnings are credited when a consultation is marked complete or an invoice is paid, minus the platform commission. Add bank or UPI details and request a payout.'], ['How do I appear on the map?', 'Once approved, switch Online on your dashboard. Clients see you live. You can also share your live location.'], ['How do I add a case?', 'Cases → Add case with your client\'s registered mobile number, or accept a client\'s case request.']];
SCREENS.help = {
  title: 'Help & support', bare: true,
  render() {
    const faq = isLawyer() ? FAQ_L.concat(FAQ_C.slice(1, 3)) : FAQ_C, c = S.meta.config;
    return topbar('Help & support') + '<div class="page"><div class="card inv tap" data-act="bot"><div class="row"><div class="av" style="background:var(--inv-fg);color:var(--inv-bg)">' + I('bot') + '</div><div class="sp"><div class="b">Ask the assistant</div><div class="small muted">Instant answers, in the app</div></div>' + I('chev', 'chev') + '</div></div>' +
      '<div class="sec"><h2>Common questions</h2></div><div class="card" style="padding:2px 14px">' + faq.map((f, i) => '<div class="item" style="display:block" data-act="faq" data-i="' + i + '"><div class="row"><span class="sp t">' + esc(f[0]) + '</span>' + I('down', 'chev') + '</div><div class="s hide" id="fq' + i + '" style="margin-top:6px">' + esc(f[1]) + '</div></div>').join('') + '</div>' +
      '<div class="sec"><h2>Contact us</h2></div><div class="field"><textarea id="stext" class="in" maxlength="1000" placeholder="Describe the problem…"></textarea></div><button class="btn block" data-act="sendsupport">Send to support</button>' + (c.supportEmail ? '<p class="small muted c mt">or email <a href="mailto:' + esc(c.supportEmail) + '">' + esc(c.supportEmail) + '</a></p>' : '') + '</div>';
  }
};
ACT.faq = el => { const e = $('#fq' + el.dataset.i); e.classList.toggle('hide'); };
ACT.sendsupport = el => busy(el, async () => { await API.post('/api/support', { text: val('#stext') }); $('#stext').value = ''; toast('Sent. We will get back to you.'); });
SCREENS.about = {
  title: 'About', bare: true,
  render() {
    return topbar('About & legal') + '<div class="page"><div class="c"><div class="av xl" style="margin:0 auto;border-radius:28px">' + I('scale').replace('<svg', '<svg style="width:50px;height:50px"') + '</div><div class="h2 mts">GetYourLawyer</div><div class="muted small">Version 1.0 · by SAVRO</div></div>' +
      '<div class="card mt2 small"><p><b>What we are.</b> A platform that helps you find verified advocates, book consultations, and follow your cases with your lawyer.</p><p class="mts"><b>What we are not.</b> We are not a law firm and do not provide legal advice. Lawyers on the platform are independent professionals responsible for their own advice and conduct.</p><p class="mts"><b>Emergencies.</b> Call 112. Women helpline 181 · Child helpline 1098 · Cyber crime 1930 · Free legal aid (NALSA) 15100.</p></div>' +
      '<div class="card mt" style="padding:2px 14px">' + menuItem('file', 'Terms of use', 'ext').replace('data-act="ext"', 'data-act="ext" data-v="' + API.base + '/terms"') + menuItem('shield', 'Privacy policy', 'ext').replace('data-act="ext"', 'data-act="ext" data-v="' + API.base + '/privacy"') + '</div></div>';
  }
};
