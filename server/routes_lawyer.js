'use strict';
// Lawyer workspace + cases (both sides): profile, credentials, availability, dashboard, cases, hearings, documents, invoices, earnings, reports.
const live = require('./lib/live');
const { newId } = require('./lib/store');
const A = require('./lib/auth');
const { HttpError, bad, str, num, isDay, oneOf } = require('./lib/http');
const { validLL } = require('./lib/geo');
const { makeCase, caseView, invoiceView, nextHearing } = require('./lib/caseutil');

module.exports = function (R, { store, core }) {
  const needLawyer = u => { if (u.role !== 'lawyer' || !u.lawyer) throw new HttpError(403, 'This is for lawyer accounts'); };
  const verified = u => !!(u.verify && u.verify.status === 'verified');
  const ok = (user) => ({ me: core.userView(user) });
  const time = (v, d) => /^\d{2}:\d{2}$/.test(v || '') ? v : d;

  /* ================= profile ================= */
  R.add('PUT', '/api/lawyer/profile', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); const l = user.lawyer;
    if ('firm' in body) l.firm = str(body.firm, 80);
    if ('bio' in body) l.bio = str(body.bio, 800);
    if (Array.isArray(body.areas)) l.areas = body.areas.filter(a => core.AREAS.some(x => x.id === a)).slice(0, 6);
    if (Array.isArray(body.languages)) l.languages = body.languages.filter(x => core.LANGS.includes(x)).slice(0, 8);
    if (Array.isArray(body.courts)) l.courts = body.courts.filter(x => core.COURTS.includes(x)).slice(0, 8);
    if ('experience' in body) { const e = num(body.experience, 0, 60); if (e == null) throw bad('Experience must be 0 to 60 years'); l.experience = Math.round(e); }
    if (body.office && typeof body.office === 'object') {
      const o = body.office, lat = +o.lat, lng = +o.lng;
      l.office = { address: str(o.address, 200), city: str(o.city, 60), lat: validLL(lat, lng) ? lat : l.office.lat, lng: validLL(lat, lng) ? lng : l.office.lng };
    }
    if (body.fees && typeof body.fees === 'object') {
      ['chat', 'call', 'video', 'in_person', 'hearing', 'retainer'].forEach(k => {
        if (!(k in body.fees)) return; const v = body.fees[k];
        if (v === null || v === '') l.fees[k] = null; else { const n = num(v, 0, 500000); if (n == null) throw bad('Fees must be between ₹0 and ₹5,00,000'); l.fees[k] = Math.round(n); }
      });
    }
    if ('autoConfirm' in body) l.autoConfirm = !!body.autoConfirm;
    if (l.approval.status === 'approved' && ('areas' in body || 'office' in body)) { /* edits stay live; admin can re-review from the audit log */ }
    store.save(); announce(user);
    return ok(user);
  });

  R.add('PUT', '/api/lawyer/availability', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); const av = user.lawyer.avail;
    if ('slotMin' in body) av.slotMin = oneOf(+body.slotMin, [15, 20, 30, 45, 60]) || 30;
    if (body.days && typeof body.days === 'object') {
      const days = {};
      for (let d = 0; d < 7; d++) {
        const w = Array.isArray(body.days[d]) ? body.days[d] : [];
        const cleaned = w.map(x => ({ from: time(x.from, '10:00'), to: time(x.to, '13:00') })).filter(x => x.from < x.to).slice(0, 4).sort((a, b) => a.from.localeCompare(b.from));
        for (let i = 1; i < cleaned.length; i++) if (cleaned[i].from < cleaned[i - 1].to) throw bad('Working hours on the same day cannot overlap');
        if (cleaned.length) days[d] = cleaned;
      }
      av.days = days;
    }
    if (Array.isArray(body.off)) av.off = body.off.filter(isDay).slice(0, 120);
    store.save(); return ok(user);
  });

  // Bar Council details + certificate. Needed for approval.
  R.add('POST', '/api/lawyer/credentials', { auth: 'user', maxBody: 2.4 * 1024 * 1024 }, ({ user, body }) => {
    needLawyer(user); const l = user.lawyer;
    if (l.approval.status === 'approved' && ('barNo' in body)) throw new HttpError(409, 'Your credentials are approved. Contact support to change them.');
    const barNo = str(body.barNo, 40).toUpperCase(), council = oneOf(body.council, core.BAR_COUNCILS), year = Math.round(+body.enrolYear);
    if (barNo.length < 4) throw bad('Enter your Bar Council enrolment number, like D/1234/2015'); if (!council) throw bad('Choose your State Bar Council');
    if (!(year >= 1960 && year <= new Date().getFullYear())) throw bad('Enter a valid enrolment year');
    const dup = store.find('users', u => u.id !== user.id && u.role === 'lawyer' && u.lawyer && u.lawyer.barNo === barNo && u.lawyer.council === council);
    if (dup) throw new HttpError(409, 'This enrolment number is already registered. Contact support if this is you.');
    if (body.certFile) {
      const f = R.parseFile(body.certFile); if (!f) throw bad('Attach the certificate as a photo or PDF under 1.5 MB');
      if (l.approval.certFile) store.remove('files', l.approval.certFile);
      l.approval.certFile = store.insert('files', { ownerId: user.id, name: 'bar-council-certificate', mime: f.mime, size: f.size, b64: f.b64, kind: 'barcert', t: Date.now() }).id;
    }
    l.barNo = barNo; l.council = council; l.enrolYear = year;
    if (l.approval.status === 'rejected') l.approval.status = 'draft';
    store.save(); return ok(user);
  });

  function submitProblems(user) {
    const c = core.cfg(), l = user.lawyer, p = [];
    if (!user.name) p.push('Add your full name');
    if (c.lawyerNeedsDL && !verified(user)) p.push('Verify your identity with DigiLocker');
    if (!l.barNo || !l.council) p.push('Add your Bar Council enrolment number');
    if (c.lawyerNeedsBarCert && !l.approval.certFile) p.push('Upload your Bar Council certificate');
    if (!l.areas.length) p.push('Choose at least one practice area');
    if (!l.bio || l.bio.length < 20) p.push('Write a short bio (at least 20 characters)');
    if (l.office.lat == null) p.push('Set your chamber location on the map');
    return p;
  }
  R.add('POST', '/api/lawyer/submit', { auth: 'user' }, ({ user }) => {
    needLawyer(user); const l = user.lawyer;
    if (l.approval.status === 'approved') throw new HttpError(409, 'You are already approved');
    const p = submitProblems(user); if (p.length) throw bad('Almost there: ' + p[0], { todo: p });
    l.approval.status = 'submitted'; l.approval.submitted = Date.now(); l.approval.note = '';
    // Demo mode (DEMO_OTP set): everything is instant so testers can dry-run the whole app. Real launch: no DEMO_OTP, admin approves.
    if (process.env.DEMO_OTP) { l.approval.status = 'approved'; l.approval.reviewed = Date.now(); l.approval.by = 'demo-auto'; core.notify(user.id, 'lawyer_review', 'You are approved (demo)', 'Demo mode approves lawyers automatically. Your profile is live.', {}); }
    store.save();
    core.audit('user:' + user.id, l.approval.status === 'approved' ? 'lawyer_auto_approved_demo' : 'lawyer_submitted', l.barNo);
    return ok(user);
  });
  R.add('GET', '/api/lawyer/checklist', { auth: 'user' }, ({ user }) => { needLawyer(user); return { todo: submitProblems(user), status: user.lawyer.approval.status, note: user.lawyer.approval.note }; });

  // Online / offline on the live map; the app pings while open
  R.add('POST', '/api/lawyer/presence', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); const l = user.lawyer;
    if ('online' in body) l.online = !!body.online;
    l.pingAt = Date.now();
    if (body.share && validLL(+body.lat, +body.lng) && l.online) l.live = { lat: +body.lat, lng: +body.lng, at: Date.now() };
    else if (body.share === false) l.live = null;
    store.save(); announce(user);
    return { online: core.isOnline(user), listed: core.listed(user) };
  });
  function announce(u) {
    if (!core.listed(u)) { live.emitAll('gone', { id: u.id }); return; }
    live.emitAll('lawyer', core.lawyerCard(u));
  }

  /* ================= dashboard ================= */
  R.add('GET', '/api/lawyer/dashboard', { auth: 'user' }, ({ user }) => {
    needLawyer(user); const t = core.ist(), l = user.lawyer, monthKey = t.date.slice(0, 7);
    const bookings = store.filter('bookings', b => b.lawyerId === user.id);
    const today = bookings.filter(b => b.date === t.date && ['requested', 'confirmed'].includes(b.status)).sort((a, b) => a.time.localeCompare(b.time));
    const hearings = []; const cases = store.filter('cases', c => c.lawyerId === user.id);
    const horizon = core.addDays(t.date, 7);
    cases.forEach(c => (c.hearings || []).forEach(h => { if (h.status === 'scheduled' && h.date >= t.date && h.date <= horizon) hearings.push({ caseId: c.id, caseTitle: c.title, caseNo: c.no, client: (core.userById(c.clientId) || {}).name || 'Client', date: h.date, time: h.time, court: h.court || c.court, purpose: h.purpose, hearingId: h.id }); }));
    hearings.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const earnings = store.filter('ledger', e => e.lawyerId === user.id && e.amount > 0);
    const inMonth = earnings.filter(e => core.ist(e.t).date.startsWith(monthKey)).reduce((s, e) => s + e.amount, 0);
    const pendingReq = store.filter('requests', r => r.status === 'open' && (r.lawyerId === user.id || (!r.lawyerId && l.areas.includes(r.area) && !(r.declinedBy || []).includes(user.id)))).length;
    return {
      status: l.approval.status, note: l.approval.note, listed: core.listed(user), online: core.isOnline(user), todo: submitProblems(user),
      kpi: { openCases: cases.filter(c => c.status === 'open').length, todayCount: today.length, pendingRequests: pendingReq, pendingBookings: bookings.filter(b => b.status === 'requested').length, monthEarnings: inMonth, balance: core.balanceOf(user.id), rating: l.rating, ratingCount: l.ratingCount },
      today: today.map(b => ({ id: b.id, time: b.time, mode: b.mode, modeName: core.modeName(b.mode), status: b.status, client: (core.userById(b.clientId) || {}).name || 'Client' })), hearings: hearings.slice(0, 12),
      unread: store.filter('notifications', n => n.userId === user.id && !n.read).length
    };
  });

  /* ================= earnings + payouts ================= */
  R.add('PUT', '/api/lawyer/bank', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); const holder = str(body.holder, 80), acc = str(body.acc, 20).replace(/\D/g, ''), ifsc = str(body.ifsc, 11).toUpperCase(), upi = str(body.upi, 60);
    if (!holder) throw bad('Enter the account holder name');
    if (!(acc.length >= 9 && acc.length <= 18)) throw bad('Enter a valid account number'); if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw bad('Enter a valid IFSC, like HDFC0001234');
    user.lawyer.bank = { holder, acc, ifsc, upi }; store.save(); return ok(user);
  });
  R.add('GET', '/api/lawyer/earnings', { auth: 'user' }, ({ user }) => {
    needLawyer(user);
    const ledger = store.filter('ledger', e => e.lawyerId === user.id).sort((a, b) => b.t - a.t);
    return { balance: core.balanceOf(user.id), earned: ledger.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0), paidOut: -ledger.filter(e => e.kind === 'payout').reduce((s, e) => s + e.amount, 0),
      commissionPct: core.cfg().commissionPct, ledger: ledger.slice(0, 100), payouts: store.filter('payouts', p => p.lawyerId === user.id).sort((a, b) => b.t - a.t), bank: core.userView(user).lawyer.bank };
  });
  R.add('POST', '/api/lawyer/payouts', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); if (!user.lawyer.bank) throw bad('Add your bank or UPI details first');
    if (store.find('payouts', p => p.lawyerId === user.id && p.status === 'requested')) throw new HttpError(409, 'You already have a payout in progress');
    const bal = core.balanceOf(user.id), amount = Math.round(+body.amount || bal);
    if (amount < 100) throw bad('Minimum payout is ₹100'); if (amount > bal) throw bad('You only have ₹' + bal + ' available');
    const p = store.insert('payouts', { lawyerId: user.id, amount, status: 'requested', t: Date.now(), bank: { holder: user.lawyer.bank.holder, ifsc: user.lawyer.bank.ifsc, last4: user.lawyer.bank.acc.slice(-4), upi: user.lawyer.bank.upi } });
    core.ledgerAdd(user.id, 'payout', p.id, -amount, 'Payout requested'); store.save();
    return { payout: p, balance: core.balanceOf(user.id) };
  });

  /* ================= cases ================= */
  const loadCase = (user, id) => { const c = store.get('cases', id); if (!c || (c.clientId !== user.id && c.lawyerId !== user.id)) throw new HttpError(404, 'Case not found'); return c; };
  const other = (user, c) => user.id === c.lawyerId ? c.clientId : c.lawyerId;
  const touch = (c, user, type, text, notifyOther) => {
    c.rev = (c.rev || 0) + 1; c.updates.push({ id: newId(), t: Date.now(), by: user.id, type, text });
    store.save(); live.emitUser(c.clientId, 'case', { id: c.id }); live.emitUser(c.lawyerId, 'case', { id: c.id });
    if (notifyOther) core.notify(other(user, c), 'case_update', c.title, text, { caseId: c.id });
  };

  R.add('GET', '/api/cases', { auth: 'user' }, ({ user, query }) => {
    let items = store.filter('cases', c => (user.role === 'lawyer' ? c.lawyerId : c.clientId) === user.id);
    if (query.status) items = items.filter(c => c.status === query.status);
    const q = str(query.q, 60).toLowerCase();
    if (q) items = items.filter(c => c.title.toLowerCase().includes(q) || c.no.toLowerCase().includes(q) || (c.courtCaseNo || '').toLowerCase().includes(q) || ((core.userById(user.role === 'lawyer' ? c.clientId : c.lawyerId) || {}).name || '').toLowerCase().includes(q));
    return { items: items.sort((a, b) => b.opened - a.opened).map(c => { const v = caseView(store, core, c, user.id); return { id: v.id, no: v.no, title: v.title, area: v.area, stage: v.stage, status: v.status, outcome: v.outcome, opened: v.opened, nextHearing: v.nextHearing, client: v.client, lawyer: v.lawyer, court: v.court, pendingInvoices: v.invoices.filter(i => i.status === 'unpaid').length }; }) };
  });
  R.add('GET', '/api/cases/:id', { auth: 'user' }, ({ user, params }) => ({ case: caseView(store, core, loadCase(user, params.id), user.id) }));

  // A lawyer opens a case for a client who is already registered (by phone)
  R.add('POST', '/api/cases', { auth: 'user' }, ({ user, body }) => {
    needLawyer(user); if (!core.listed(user)) throw new HttpError(403, 'Your profile must be approved before you can add cases');
    const phone = A.normPhone(body.clientPhone); if (!phone) throw bad("Enter the client's 10-digit mobile number");
    const cl = store.find('users', u => u.phone === phone && u.role === 'client');
    if (!cl) throw new HttpError(404, 'No client is registered with this number yet. Ask them to install GetYourLawyer, or have them send you a case request.', { code: 'client_not_found' });
    const title = str(body.title, 100); if (title.length < 4) throw bad('Give the case a title');
    const c = makeCase(store, core, { clientId: cl.id, lawyerId: user.id, title, area: oneOf(body.area, core.AREAS.map(a => a.id)) || user.lawyer.areas[0] || '', description: str(body.description, 2000), court: str(body.court, 80), courtCaseNo: str(body.courtCaseNo, 60),
      opposing: str(body.opposing, 120), stage: oneOf(body.stage, core.STAGES) || 'consultation', agreedFee: num(body.agreedFee, 0, 1e8) });
    core.notify(cl.id, 'case_added', 'A case was opened for you', user.name + ' opened "' + title + '". You can follow it in Cases.', { caseId: c.id });
    live.emitUser(cl.id, 'case', { id: c.id });
    return { case: caseView(store, core, c, user.id) };
  });

  R.add('PATCH', '/api/cases/:id', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id);
    if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can edit the case');
    if (body.rev != null && +body.rev !== c.rev) throw new HttpError(409, 'This case was changed on another device. Reloaded the latest.', { code: 'conflict', case: caseView(store, core, c, user.id) });
    const before = c.stage;
    if ('title' in body) { const t = str(body.title, 100); if (t.length >= 4) c.title = t; }
    ['court', 'courtCaseNo', 'opposing'].forEach(k => { if (k in body) c[k] = str(body[k], k === 'opposing' ? 120 : 80); });
    if ('description' in body) c.description = str(body.description, 2000);
    if ('area' in body && core.AREAS.some(a => a.id === body.area)) c.area = body.area;
    if ('agreedFee' in body) c.agreedFee = num(body.agreedFee, 0, 1e8);
    if ('stage' in body && core.STAGES.includes(body.stage) && body.stage !== 'closed') c.stage = body.stage;
    const stageChanged = c.stage !== before;
    touch(c, user, stageChanged ? 'stage' : 'edit', stageChanged ? 'Stage updated to ' + c.stage : 'Case details updated', stageChanged);
    return { case: caseView(store, core, c, user.id) };
  });

  // hearings
  R.add('POST', '/api/cases/:id/hearings', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can schedule hearings');
    if (c.status !== 'open') throw new HttpError(409, 'This case is closed');
    const date = str(body.date, 10); if (!isDay(date)) throw bad('Choose the hearing date');
    const h = { id: newId(), date, time: time(body.time, ''), court: str(body.court, 80) || c.court, purpose: str(body.purpose, 120), status: 'scheduled', outcome: '' };
    c.hearings.push(h); touch(c, user, 'hearing', 'Hearing scheduled for ' + date + (h.time ? ' ' + h.time : '') + (h.purpose ? ' · ' + h.purpose : ''), true);
    return { case: caseView(store, core, c, user.id) };
  });
  R.add('PATCH', '/api/cases/:id/hearings/:hid', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can edit hearings');
    const h = c.hearings.find(x => x.id === params.hid); if (!h) throw new HttpError(404, 'Hearing not found');
    if (isDay(body.date)) { h.date = body.date; h.reminded = false; } if ('time' in body) h.time = time(body.time, ''); if ('purpose' in body) h.purpose = str(body.purpose, 120); if ('court' in body) h.court = str(body.court, 80);
    if (body.status && ['done', 'adjourned', 'scheduled', 'cancelled'].includes(body.status)) h.status = body.status;
    if ('outcome' in body) h.outcome = str(body.outcome, 400);
    let msg = 'Hearing on ' + h.date + ' marked ' + h.status + (h.outcome ? ': ' + h.outcome : '');
    if (isDay(body.nextDate) && h.status !== 'scheduled') {
      c.hearings.push({ id: newId(), date: body.nextDate, time: time(body.nextTime, ''), court: h.court, purpose: str(body.nextPurpose, 120) || 'Next hearing', status: 'scheduled', outcome: '' });
      msg += ' · next date ' + body.nextDate;
    }
    touch(c, user, 'hearing', msg, true);
    return { case: caseView(store, core, c, user.id) };
  });
  R.add('DELETE', '/api/cases/:id/hearings/:hid', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can remove hearings');
    const i = c.hearings.findIndex(x => x.id === params.hid); if (i < 0) throw new HttpError(404, 'Hearing not found');
    c.hearings.splice(i, 1); touch(c, user, 'edit', 'A hearing was removed', true); return { case: caseView(store, core, c, user.id) };
  });

  R.add('POST', '/api/cases/:id/updates', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can post updates');
    const text = str(body.text, 600); if (text.length < 2) throw bad('Write the update');
    touch(c, user, 'update', text, true); return { case: caseView(store, core, c, user.id) };
  });
  R.add('POST', '/api/cases/:id/notes', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can add private notes');
    const text = str(body.text, 1500); if (text.length < 2) throw bad('Write the note');
    c.notes.push({ id: newId(), t: Date.now(), text }); c.rev++; store.save(); return { case: caseView(store, core, c, user.id) };
  });
  R.add('DELETE', '/api/cases/:id/notes/:nid', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Not allowed');
    c.notes = c.notes.filter(n => n.id !== params.nid); c.rev++; store.save(); return { case: caseView(store, core, c, user.id) };
  });

  R.add('POST', '/api/cases/:id/close', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can close the case');
    if (c.status === 'closed') throw new HttpError(409, 'Already closed');
    const outcome = oneOf(body.outcome, ['won', 'lost', 'settled', 'withdrawn', 'disposed']); if (!outcome) throw bad('Choose how the case ended');
    c.status = 'closed'; c.stage = 'closed'; c.outcome = outcome; c.closed = Date.now();
    c.hearings.forEach(h => { if (h.status === 'scheduled') h.status = 'cancelled'; });
    touch(c, user, 'closed', 'Case closed: ' + outcome + (body.summary ? '. ' + str(body.summary, 300) : ''), true);
    core.notify(c.clientId, 'review_prompt', 'Rate your lawyer', 'Your case "' + c.title + '" is closed. How was the experience?', { caseId: c.id });
    return { case: caseView(store, core, c, user.id) };
  });
  R.add('POST', '/api/cases/:id/reopen', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id || c.status !== 'closed') throw new HttpError(409, 'Cannot reopen');
    c.status = 'open'; c.stage = 'hearing'; c.outcome = ''; c.closed = 0; touch(c, user, 'edit', 'Case reopened', true);
    return { case: caseView(store, core, c, user.id) };
  });

  /* ================= documents ================= */
  R.add('POST', '/api/cases/:id/files', { auth: 'user', maxBody: 2.4 * 1024 * 1024 }, ({ user, params, body }) => {
    const c = loadCase(user, params.id); if (c.status === 'closed' && user.role !== 'lawyer') throw new HttpError(409, 'This case is closed');
    const f = R.parseFile(body.file); if (!f) throw bad('Attach a PDF or image under 1.5 MB');
    const total = store.filter('files', x => x.caseId === c.id).reduce((s, x) => s + x.size, 0); if (total > 40e6) throw new HttpError(413, 'This case has reached its storage limit');
    const name = str(body.name, 80).replace(/[\\/:*?"<>|]/g, '_') || 'document';
    const rec = store.insert('files', { ownerId: user.id, caseId: c.id, name, mime: f.mime, size: f.size, b64: f.b64, kind: oneOf(body.kind, ['evidence', 'pleading', 'order', 'id', 'agreement', 'other']) || 'other', private: user.role === 'lawyer' && !!body.private, t: Date.now() });
    touch(c, user, 'file', (user.role === 'lawyer' ? 'Lawyer' : 'Client') + ' uploaded ' + name, !rec.private);
    return { case: caseView(store, core, c, user.id) };
  });
  R.add('GET', '/api/files/:id', { auth: 'user' }, ({ user, params }) => {
    const f = store.get('files', params.id); if (!f) throw new HttpError(404, 'File not found');
    let allowed = f.ownerId === user.id || f.msgTo === user.id;
    if (f.caseId) { const c = store.get('cases', f.caseId); allowed = !!c && (c.lawyerId === user.id || (c.clientId === user.id && !f.private)); }
    if (!allowed) throw new HttpError(404, 'File not found');
    return { __raw: Buffer.from(f.b64, 'base64'), type: f.mime, filename: f.name + (f.mime === 'application/pdf' ? '.pdf' : f.mime === 'image/png' ? '.png' : f.mime === 'image/webp' ? '.webp' : '.jpg') };
  });
  R.add('DELETE', '/api/files/:id', { auth: 'user' }, ({ user, params }) => {
    const f = store.get('files', params.id); if (!f || f.ownerId !== user.id || !f.caseId) throw new HttpError(404, 'File not found');
    const c = store.get('cases', f.caseId); store.remove('files', f.id); if (c) touch(c, user, 'edit', 'A document was removed', false); return { ok: true };
  });

  /* ================= invoices ================= */
  R.add('POST', '/api/cases/:id/invoices', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const c = loadCase(user, params.id); if (c.lawyerId !== user.id) throw new HttpError(403, 'Only the lawyer can raise invoices');
    const items = (Array.isArray(body.items) ? body.items : []).map(i => ({ desc: str(i.desc, 120), amount: Math.round(+i.amount) })).filter(i => i.desc && i.amount > 0 && i.amount <= 1e7).slice(0, 12);
    if (!items.length) throw bad('Add at least one item with an amount');
    const total = items.reduce((s, i) => s + i.amount, 0); if (total > 1e7) throw bad('Invoice total is too large');
    const inv = store.insert('invoices', { no: core.invoiceNo(), caseId: c.id, lawyerId: user.id, clientId: c.clientId, items, total, status: 'unpaid', due: isDay(body.due) ? body.due : core.addDays(core.ist().date, 7), t: Date.now() });
    const p = store.insert('payments', { kind: 'invoice', refId: inv.id, payerId: c.clientId, payeeId: user.id, amount: total, status: 'created', gateway: 'mock', t: Date.now() });
    inv.paymentId = p.id; store.save();
    touch(c, user, 'invoice', 'Invoice ' + inv.no + ' for ₹' + total + ' raised', true);
    core.notify(c.clientId, 'invoice', 'New invoice ₹' + total, inv.no + ' · ' + c.title, { caseId: c.id, invoiceId: inv.id });
    return { case: caseView(store, core, c, user.id) };
  });
  R.add('POST', '/api/invoices/:id/void', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const inv = store.get('invoices', params.id); if (!inv || inv.lawyerId !== user.id) throw new HttpError(404, 'Invoice not found');
    if (inv.status !== 'unpaid') throw new HttpError(409, 'Only unpaid invoices can be voided');
    inv.status = 'void'; const p = store.get('payments', inv.paymentId); if (p && p.status === 'created') p.status = 'expired'; store.save();
    const c = store.get('cases', inv.caseId); if (c) touch(c, user, 'invoice', 'Invoice ' + inv.no + ' was cancelled', true);
    return { case: caseView(store, core, c, user.id) };
  });

  /* ================= clients (lawyer CRM-lite) ================= */
  R.add('GET', '/api/lawyer/clients', { auth: 'user' }, ({ user }) => {
    needLawyer(user); const map = new Map();
    const add = (id, k, t) => { const e = map.get(id) || { id, cases: 0, openCases: 0, bookings: 0, last: 0 }; if (k === 'case') e.cases++; if (k === 'open') e.openCases++; if (k === 'booking') e.bookings++; e.last = Math.max(e.last, t || 0); map.set(id, e); };
    store.filter('cases', c => c.lawyerId === user.id).forEach(c => { add(c.clientId, 'case', c.opened); if (c.status === 'open') add(c.clientId, 'open', c.opened); });
    store.filter('bookings', b => b.lawyerId === user.id && ['confirmed', 'completed', 'requested'].includes(b.status)).forEach(b => add(b.clientId, 'booking', b.created));
    return { items: [...map.values()].map(e => { const u = core.userById(e.id); return Object.assign(e, u ? core.clientCard(u, true) : { name: 'Former client' }); }).sort((a, b) => b.last - a.last) };
  });

  /* ================= calendar (both roles) ================= */
  R.add('GET', '/api/calendar', { auth: 'user' }, ({ user, query }) => {
    const from = isDay(query.from) ? query.from : core.ist().date, to = isDay(query.to) ? query.to : core.addDays(from, 30), mine = c => (user.role === 'lawyer' ? c.lawyerId : c.clientId) === user.id;
    const events = [];
    store.filter('cases', mine).forEach(c => (c.hearings || []).forEach(h => { if (h.date >= from && h.date <= to && h.status !== 'cancelled') events.push({ kind: 'hearing', id: h.id, caseId: c.id, title: c.title, sub: h.purpose || 'Hearing', court: h.court || c.court, date: h.date, time: h.time || '', status: h.status }); }));
    store.filter('bookings', b => mine(b) && ['requested', 'confirmed', 'completed'].includes(b.status) && b.date >= from && b.date <= to).forEach(b => {
      const o = core.userById(user.role === 'lawyer' ? b.clientId : b.lawyerId);
      events.push({ kind: 'booking', id: b.id, title: (o && o.name) || 'Consultation', sub: core.modeName(b.mode), date: b.date, time: b.time, status: b.status });
    });
    return { from, to, events: events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) };
  });

  /* ================= reports ================= */
  function report(user, months) {
    const cases = store.filter('cases', c => c.lawyerId === user.id), bookings = store.filter('bookings', b => b.lawyerId === user.id), reqs = store.filter('requests', r => r.lawyerId === user.id);
    const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
    const t = core.ist().date; const keys = []; for (let i = months - 1; i >= 0; i--) { const d = new Date(t.slice(0, 7) + '-15T12:00:00+05:30'); d.setUTCMonth(d.getUTCMonth() - i); keys.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')); }
    const earn = store.filter('ledger', e => e.lawyerId === user.id && e.amount > 0), byMonth = keys.map(k => ({ month: k, amount: earn.filter(e => core.ist(e.t).date.startsWith(k)).reduce((s, e) => s + e.amount, 0) }));
    const open = cases.filter(c => c.status === 'open');
    const decided = reqs.filter(r => r.status !== 'open');
    return {
      cases: { total: cases.length, open: open.length, closed: cases.length - open.length, byStage: count(open, c => c.stage), byArea: count(cases, c => c.area), outcomes: count(cases.filter(c => c.status === 'closed'), c => c.outcome) },
      bookings: { total: bookings.length, completed: bookings.filter(b => b.status === 'completed').length, cancelled: bookings.filter(b => ['cancelled', 'declined'].includes(b.status)).length, byMode: count(bookings.filter(b => b.status !== 'expired'), b => b.mode) },
      requests: { received: reqs.length, accepted: reqs.filter(r => r.status === 'accepted').length, rate: decided.length ? Math.round(100 * reqs.filter(r => r.status === 'accepted').length / decided.length) : 0 },
      revenue: { total: earn.reduce((s, e) => s + e.amount, 0), byMonth }, rating: { avg: user.lawyer.rating, count: user.lawyer.ratingCount },
      invoices: { unpaid: store.filter('invoices', i => i.lawyerId === user.id && i.status === 'unpaid').reduce((s, i) => s + i.total, 0), paid: store.filter('invoices', i => i.lawyerId === user.id && i.status === 'paid').reduce((s, i) => s + i.total, 0) }
    };
  }
  R.add('GET', '/api/lawyer/reports', { auth: 'user' }, ({ user, query }) => { needLawyer(user); return report(user, Math.max(1, Math.min(12, +query.months || 6))); });
  const csv = rows => rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  R.add('GET', '/api/lawyer/reports.csv', { auth: 'user' }, ({ user, query }) => {
    needLawyer(user); const type = oneOf(query.type, ['cases', 'bookings', 'earnings']) || 'cases'; let rows;
    if (type === 'cases') rows = [['Case no', 'Title', 'Client', 'Area', 'Court', 'Stage', 'Status', 'Outcome', 'Opened', 'Next hearing']].concat(store.filter('cases', c => c.lawyerId === user.id).map(c => { const nh = nextHearing(c); return [c.no, c.title, (core.userById(c.clientId) || {}).name, c.area, c.court, c.stage, c.status, c.outcome, core.ist(c.opened).date, nh ? nh.date : '']; }));
    else if (type === 'bookings') rows = [['Date', 'Time', 'Client', 'Mode', 'Status', 'Fee', 'Commission', 'Net']].concat(store.filter('bookings', b => b.lawyerId === user.id && b.status !== 'expired').sort((a, b) => b.date.localeCompare(a.date)).map(b => [b.date, b.time, (core.userById(b.clientId) || {}).name, b.mode, b.status, b.fee, b.commission, b.net]));
    else rows = [['Date', 'Type', 'Amount', 'Note']].concat(store.filter('ledger', e => e.lawyerId === user.id).sort((a, b) => b.t - a.t).map(e => [core.ist(e.t).date, e.kind, e.amount, e.note]));
    return { __raw: '﻿' + csv(rows), type: 'text/csv; charset=utf-8', filename: 'getyourlawyer-' + type + '.csv' };
  });
};
