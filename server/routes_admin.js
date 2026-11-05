'use strict';
// Admin portal API: lawyer approval queue, ID reviews, users, bookings, payments, payouts, settings, broadcast, audit, exports.
const A = require('./lib/auth');
const live = require('./lib/live');
const sample = require('./lib/sampledata');
const { HttpError, bad, str, oneOf } = require('./lib/http');

module.exports = function (R, { store, core, dl, env, dataDir, limiter }) {
  const adm = { auth: 'admin' };
  const aud = (a, action, detail) => core.audit('admin:' + a.email, action, detail);
  const briefUser = u => ({ id: u.id, name: u.name || '', phone: u.phone, role: u.role, status: u.status, city: u.city || '', createdAt: u.createdAt, lastLogin: u.lastLogin || 0, demo: !!u.demo,
    verify: u.verify ? { status: u.verify.status, method: u.verify.method, at: u.verify.at, last4: u.verify.last4, mismatch: !!u.verify.mismatch } : { status: 'none' } });

  R.add('POST', '/api/admin/login', { auth: 'public' }, ({ body, ip }) => {
    if (!limiter.take('adm-ip:' + ip, 20, 600e3)) throw new HttpError(429, 'Too many attempts. Try again later.');
    const email = str(body.email, 120).toLowerCase(), a = store.find('admins', x => x.email === email);
    if (!a || a.active === false || !A.checkPassword(String(body.password || ''), a.pass)) throw new HttpError(401, 'Wrong email or password');
    a.lastLogin = Date.now(); store.save(); core.audit('admin:' + a.email, 'login', '');
    return { token: A.sign({ sub: a.id, typ: 'admin', tv: a.tv || 0 }, dataDir, 12 * 3600), admin: { email: a.email, name: a.name, role: a.role } };
  });
  R.add('POST', '/api/admin/password', adm, ({ admin, body }) => {
    const pw = String(body.password || ''); if (pw.length < 10) throw bad('Use at least 10 characters');
    if (!A.checkPassword(String(body.current || ''), admin.pass)) throw new HttpError(403, 'Current password is wrong');
    admin.pass = A.hashPassword(pw); admin.tv = (admin.tv || 0) + 1; store.save(); return { ok: true };
  });

  R.add('GET', '/api/admin/dashboard', adm, () => {
    const users = store.list('users').filter(u => !u.demo), lawyers = users.filter(u => u.role === 'lawyer'), t = core.ist().date;
    const paid = store.filter('payments', p => p.status === 'paid'), bk = store.list('bookings');
    return {
      users: { total: users.length, clients: users.filter(u => u.role === 'client').length, lawyers: lawyers.length, unassigned: users.filter(u => !u.role).length },
      lawyers: { submitted: lawyers.filter(u => u.lawyer && u.lawyer.approval.status === 'submitted').length, approved: lawyers.filter(u => u.lawyer && u.lawyer.approval.status === 'approved').length, draft: lawyers.filter(u => u.lawyer && ['draft', 'rejected'].includes(u.lawyer.approval.status)).length, online: store.list('users').filter(u => u.role === 'lawyer' && core.listed(u) && core.isOnline(u)).length },
      pendingIds: users.filter(u => u.verify && u.verify.status === 'pending').length,
      bookings: { total: bk.length, today: bk.filter(b => b.date === t && ['requested', 'confirmed'].includes(b.status)).length, completed: bk.filter(b => b.status === 'completed').length },
      cases: { open: store.filter('cases', c => c.status === 'open').length, total: store.list('cases').length },
      money: { gross: paid.reduce((s, p) => s + p.amount, 0), refunded: store.filter('payments', p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0),
        platform: bk.filter(b => ['confirmed', 'completed', 'requested'].includes(b.status)).reduce((s, b) => s + (b.commission || 0) + (b.convenience || 0), 0) + store.filter('payments', p => p.kind === 'invoice' && p.status === 'paid').reduce((s, p) => s + (p.commission || 0), 0) },
      payoutsPending: store.filter('payouts', p => p.status === 'requested').length, tickets: store.filter('tickets', t => t.status === 'open').length, liveConnections: live.count(),
      demoData: store.filter('users', u => u.demo).length, digilocker: dl.PROVIDER, sms: require('./lib/sms').provider()
    };
  });

  /* ---- lawyers ---- */
  const lawyerRow = u => Object.assign(briefUser(u), { firm: u.lawyer.firm, barNo: u.lawyer.barNo, council: u.lawyer.council, enrolYear: u.lawyer.enrolYear, areas: u.lawyer.areas, approval: u.lawyer.approval, hasCert: !!u.lawyer.approval.certFile, listed: core.listed(u), online: core.isOnline(u), rating: u.lawyer.rating, hidden: !!u.hidden, experience: u.lawyer.experience, city: u.lawyer.office.city });
  R.add('GET', '/api/admin/lawyers', adm, ({ query }) => {
    const q = str(query.q, 60).toLowerCase();
    return { items: store.filter('users', u => u.role === 'lawyer' && u.lawyer && (!query.status || u.lawyer.approval.status === query.status) && (!q || (u.name || '').toLowerCase().includes(q) || u.phone.includes(q) || (u.lawyer.barNo || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.lawyer.approval.submitted || 0) - (a.lawyer.approval.submitted || 0)).slice(0, 300).map(lawyerRow) };
  });
  R.add('GET', '/api/admin/lawyers/:id', adm, ({ params }) => {
    const u = store.get('users', params.id); if (!u || u.role !== 'lawyer') throw new HttpError(404, 'Not found');
    return { lawyer: Object.assign(lawyerRow(u), { bio: u.lawyer.bio, fees: u.lawyer.fees, office: u.lawyer.office, languages: u.lawyer.languages, courts: u.lawyer.courts, email: u.email, verifyDocs: (u.verify && u.verify.docs) || [], verifyName: u.verify && u.verify.name, dob: u.dob, certFile: u.lawyer.approval.certFile }) };
  });
  R.add('POST', '/api/admin/lawyers/:id/review', adm, ({ admin, params, body }) => {
    const u = store.get('users', params.id); if (!u || u.role !== 'lawyer') throw new HttpError(404, 'Not found');
    const d = oneOf(body.decision, ['approve', 'reject']); if (!d) throw bad('Choose approve or reject');
    const note = str(body.note, 300); if (d === 'reject' && note.length < 5) throw bad('Tell the lawyer what to fix');
    u.lawyer.approval.status = d === 'approve' ? 'approved' : 'rejected'; u.lawyer.approval.note = note; u.lawyer.approval.reviewed = Date.now(); u.lawyer.approval.by = admin.email; store.save();
    aud(admin, 'lawyer_' + d, u.lawyer.barNo + ' ' + u.name);
    core.notify(u.id, 'lawyer_review', d === 'approve' ? 'You are approved' : 'Profile needs changes', d === 'approve' ? 'Your profile is live. Clients can now find and book you.' : note, {});
    if (d === 'approve' && core.listed(u)) live.emitAll('lawyer', core.lawyerCard(u));
    return { ok: true };
  });
  R.add('POST', '/api/admin/lawyers/:id/hide', adm, ({ admin, params, body }) => {
    const u = store.get('users', params.id); if (!u || u.role !== 'lawyer') throw new HttpError(404, 'Not found');
    u.hidden = !!body.hidden; store.save(); aud(admin, u.hidden ? 'lawyer_hidden' : 'lawyer_unhidden', u.name); if (u.hidden) live.emitAll('gone', { id: u.id }); return { ok: true };
  });

  /* ---- users + ID reviews ---- */
  R.add('GET', '/api/admin/users', adm, ({ query }) => {
    const q = str(query.q, 60).toLowerCase();
    return { items: store.filter('users', u => (!query.role || u.role === query.role) && (!q || (u.name || '').toLowerCase().includes(q) || u.phone.includes(q))).sort((a, b) => b.createdAt - a.createdAt).slice(0, 300).map(briefUser) };
  });
  R.add('POST', '/api/admin/users/:id/status', adm, ({ admin, params, body }) => {
    const u = store.get('users', params.id); if (!u) throw new HttpError(404, 'Not found');
    u.status = body.status === 'suspended' ? 'suspended' : 'active'; u.tv = (u.tv || 0) + 1; store.save(); aud(admin, 'user_' + u.status, u.phone);
    if (u.status === 'suspended' && u.role === 'lawyer') live.emitAll('gone', { id: u.id });
    return { ok: true };
  });
  R.add('GET', '/api/admin/verifications', adm, () => ({ items: store.filter('users', u => u.verify && u.verify.status === 'pending').map(u => Object.assign(briefUser(u), { docType: u.verify.docType, fileId: u.verify.fileId })) }));
  R.add('POST', '/api/admin/verifications/:id', adm, ({ admin, params, body }) => {
    const u = store.get('users', params.id); if (!u || !u.verify || u.verify.status !== 'pending') throw new HttpError(404, 'Nothing to review');
    const d = oneOf(body.decision, ['approve', 'reject']); if (!d) throw bad('Choose approve or reject');
    u.verify.status = d === 'approve' ? 'verified' : 'rejected'; u.verify.note = str(body.note, 200); u.verify.reviewedAt = Date.now(); store.save();
    aud(admin, 'id_' + d, u.phone); core.notify(u.id, 'verified', d === 'approve' ? 'Identity verified' : 'ID not accepted', d === 'approve' ? 'Your ID was approved.' : (u.verify.note || 'Please upload a clearer photo.'), {});
    return { ok: true };
  });
  R.add('GET', '/api/admin/file/:id', adm, ({ admin, params }) => {
    const f = store.get('files', params.id); if (!f || !['barcert', 'id'].includes(f.kind)) throw new HttpError(404, 'File not found');
    aud(admin, 'file_viewed', f.kind + ' ' + f.ownerId);
    return { __raw: Buffer.from(f.b64, 'base64'), type: f.mime };
  });

  /* ---- bookings, payments, cases, payouts ---- */
  const name = id => (store.get('users', id) || {}).name || '-';
  R.add('GET', '/api/admin/bookings', adm, ({ query }) => ({ items: store.filter('bookings', b => !query.status || b.status === query.status).sort((a, b) => b.created - a.created).slice(0, 300).map(b => ({ id: b.id, date: b.date, time: b.time, mode: b.mode, status: b.status, client: name(b.clientId), lawyer: name(b.lawyerId), fee: b.fee, total: b.total, commission: b.commission })) }));
  R.add('GET', '/api/admin/payments', adm, ({ query }) => ({ items: store.filter('payments', p => p.status !== 'created' && (!query.status || p.status === query.status)).sort((a, b) => b.t - a.t).slice(0, 300).map(p => ({ id: p.id, kind: p.kind, amount: p.amount, status: p.status, method: p.method, receipt: p.receipt, payer: name(p.payerId), payee: name(p.payeeId), t: p.t })) }));
  R.add('POST', '/api/admin/payments/:id/refund', adm, ({ admin, params }) => {
    const p = store.get('payments', params.id); if (!p || p.status !== 'paid') throw new HttpError(409, 'Only paid payments can be refunded');
    if (p.kind === 'invoice') { const inv = store.get('invoices', p.refId); if (inv) inv.status = 'void'; core.ledgerAdd(p.payeeId, 'refund', p.id, -(p.amount - (p.commission || 0)), 'Refund of ' + (inv ? inv.no : 'invoice')); }
    else { const b = store.get('bookings', p.refId); if (b) { if (b.status === 'completed') core.ledgerAdd(b.lawyerId, 'refund', b.id, -b.net, 'Refund of consultation'); b.status = b.status === 'completed' ? 'completed' : 'cancelled'; b.refund = p.amount; } }
    p.status = 'refunded'; p.refundedAt = Date.now(); store.save(); aud(admin, 'refund', p.id + ' ₹' + p.amount); core.notify(p.payerId, 'refund', 'Refund issued', '₹' + p.amount + ' was refunded.', {}); return { ok: true };
  });
  R.add('GET', '/api/admin/cases', adm, () => ({ items: store.list('cases').sort((a, b) => b.opened - a.opened).slice(0, 300).map(c => ({ id: c.id, no: c.no, title: c.title, status: c.status, stage: c.stage, client: name(c.clientId), lawyer: name(c.lawyerId), opened: c.opened })) }));
  R.add('GET', '/api/admin/payouts', adm, () => ({ items: store.list('payouts').sort((a, b) => b.t - a.t).slice(0, 200).map(p => Object.assign({}, p, { lawyer: name(p.lawyerId) })) }));
  R.add('POST', '/api/admin/payouts/:id', adm, ({ admin, params, body }) => {
    const p = store.get('payouts', params.id); if (!p || p.status !== 'requested') throw new HttpError(409, 'Already processed');
    const d = oneOf(body.decision, ['paid', 'rejected']); if (!d) throw bad('Choose paid or rejected');
    p.status = d; p.ref = str(body.ref, 60); p.doneAt = Date.now();
    if (d === 'rejected') core.ledgerAdd(p.lawyerId, 'payout_reversal', p.id, p.amount, 'Payout rejected');
    store.save(); aud(admin, 'payout_' + d, p.id + ' ₹' + p.amount); core.notify(p.lawyerId, 'payout', d === 'paid' ? 'Payout sent' : 'Payout rejected', d === 'paid' ? '₹' + p.amount + ' is on its way. Ref ' + (p.ref || '-') : 'Your payout was returned to your balance.', {}); return { ok: true };
  });

  /* ---- reviews moderation, tickets ---- */
  R.add('GET', '/api/admin/reviews', adm, () => ({ items: store.list('reviews').filter(r => !r.demo).sort((a, b) => b.t - a.t).slice(0, 200).map(r => ({ id: r.id, rating: r.rating, text: r.text, lawyer: name(r.lawyerId), client: name(r.clientId), hidden: !!r.hidden, t: r.t })) }));
  R.add('POST', '/api/admin/reviews/:id/hide', adm, ({ admin, params, body }) => { const r = store.get('reviews', params.id); if (!r) throw new HttpError(404, 'Not found'); r.hidden = !!body.hidden; core.recalcRating(r.lawyerId); aud(admin, 'review_hidden', r.id); return { ok: true }; });
  R.add('GET', '/api/admin/tickets', adm, () => ({ items: store.list('tickets').sort((a, b) => b.t - a.t).slice(0, 200).map(t => Object.assign({}, t, { user: name(t.userId), phone: (store.get('users', t.userId) || {}).phone })) }));
  R.add('POST', '/api/admin/tickets/:id/resolve', adm, ({ params }) => { const t = store.get('tickets', params.id); if (t) { t.status = 'resolved'; store.save(); } return { ok: true }; });

  /* ---- settings, broadcast, audit, sample data, exports ---- */
  R.add('GET', '/api/admin/settings', adm, () => ({ settings: core.cfg(), defaults: core.DEFAULTS, system: { digilocker: dl.PROVIDER, sms: require('./lib/sms').provider(), push: require('./lib/push').enabled(), publicBase: env.PUBLIC_BASE_URL || '', node: process.version } }));
  R.add('PUT', '/api/admin/settings', adm, ({ admin, body }) => {
    const n = Number; if ('commissionPct' in body && !(n(body.commissionPct) >= 0 && n(body.commissionPct) <= 50)) throw bad('Commission must be between 0 and 50%');
    const s = core.setCfg(body); aud(admin, 'settings', Object.keys(body).join(',')); return { settings: s };
  });
  R.add('POST', '/api/admin/broadcast', adm, ({ admin, body }) => {
    const title = str(body.title, 100), text = str(body.body, 280); if (!title || !text) throw bad('Write a title and message');
    const role = oneOf(body.role, ['client', 'lawyer']); let n = 0;
    store.filter('users', u => !u.demo && u.role && (!role || u.role === role) && u.status !== 'suspended').forEach(u => { core.notify(u.id, 'broadcast', title, text, {}); n++; });
    aud(admin, 'broadcast', title + ' -> ' + n); return { sent: n };
  });
  R.add('GET', '/api/admin/audit', adm, () => ({ items: store.list('audit').slice(-300).reverse() }));
  R.add('POST', '/api/admin/sample', adm, ({ admin, body }) => {
    const r = body.action === 'clear' ? sample.clear(store) : sample.load(store, core); aud(admin, 'sample_' + (body.action === 'clear' ? 'clear' : 'load'), JSON.stringify(r)); return r;
  });
  R.add('GET', '/api/admin/export.csv', adm, ({ query }) => {
    const type = oneOf(query.type, ['users', 'lawyers', 'bookings', 'payments']) || 'users', esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    let rows;
    if (type === 'users') rows = [['Name', 'Phone', 'Role', 'Status', 'City', 'Verified', 'Joined']].concat(store.filter('users', u => !u.demo).map(u => [u.name, u.phone, u.role, u.status, u.city, u.verify && u.verify.status, new Date(u.createdAt).toISOString().slice(0, 10)]));
    else if (type === 'lawyers') rows = [['Name', 'Phone', 'Bar no', 'Council', 'Approval', 'Areas', 'City', 'Rating']].concat(store.filter('users', u => !u.demo && u.role === 'lawyer' && u.lawyer).map(u => [u.name, u.phone, u.lawyer.barNo, u.lawyer.council, u.lawyer.approval.status, u.lawyer.areas.join('|'), u.lawyer.office.city, u.lawyer.rating]));
    else if (type === 'bookings') rows = [['Date', 'Time', 'Client', 'Lawyer', 'Mode', 'Status', 'Fee', 'Total', 'Commission']].concat(store.list('bookings').map(b => [b.date, b.time, name(b.clientId), name(b.lawyerId), b.mode, b.status, b.fee, b.total, b.commission]));
    else rows = [['Date', 'Kind', 'Amount', 'Status', 'Method', 'Receipt', 'Payer', 'Payee']].concat(store.list('payments').filter(p => p.status !== 'created').map(p => [new Date(p.t).toISOString().slice(0, 10), p.kind, p.amount, p.status, p.method, p.receipt, name(p.payerId), name(p.payeeId)]));
    return { __raw: '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n'), type: 'text/csv; charset=utf-8', filename: 'getyourlawyer-' + type + '.csv' };
  });
  R.add('GET', '/api/admin/system', adm, async () => ({ digilocker: await dl.diagnose().catch(e => ({ error: e.message })) }));
};
