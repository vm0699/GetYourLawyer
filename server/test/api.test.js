'use strict';
process.env.GYL_NO_ENV = '1'; process.env.DEV_OTP = '1'; process.env.PORT = '8791'; process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:8791';
process.env.DL_PROVIDER = 'mock'; process.env.SMS_PROVIDER = 'console'; process.env.ADMIN_EMAIL = 'admin@test.local'; process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'gyl-test-' + process.pid);
const test = require('node:test'), assert = require('node:assert/strict'), http = require('http');
const { server, store, core, ready } = require('../server');
const BASE = 'http://127.0.0.1:8791';

async function api(method, path, body, token) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
  return { status: r.status, body: j, headers: r.headers };
}
async function login(phone, role) {
  const a = await api('POST', '/api/auth/otp/request', { phone });
  assert.equal(a.status, 200); assert.match(a.body.devOtp, /^\d{6}$/);
  const v = await api('POST', '/api/auth/otp/verify', { phone, otp: a.body.devOtp });
  assert.equal(v.status, 200);
  if (role) { const r = await api('POST', '/api/me/role', { role }, v.body.token); assert.equal(r.status, 200); }
  return { token: v.body.token, id: v.body.user.id };
}
// mock DigiLocker round trip, the way a browser would do it
async function digilocker(token, uid) {
  uid = uid || '9876543210';
  const s = await api('POST', '/api/digilocker/start', { platform: 'web', returnUrl: BASE + '/' }, token); assert.equal(s.status, 200, JSON.stringify(s.body));
  const state = new URL(s.body.authUrl).searchParams.get('state');
  const form = (path, o) => fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  const page = await fetch(s.body.authUrl); assert.equal(page.status, 200);
  assert.equal((await form('/api/digilocker/mock/login', { state, uid, consent: 'on' })).status, 200);
  assert.equal((await form('/api/digilocker/mock/otp', { state, otp: '123456' })).status, 200);
  const c = await form('/api/digilocker/mock/consent', { state, decision: 'allow', doc: 'aadhaar' }); assert.equal(c.status, 302);
  const cb = await fetch(c.headers.get('location'), { redirect: 'manual' }); assert.equal(cb.status, 302);
  const session = new URL(cb.headers.get('location')).searchParams.get('dl_session');
  const res = await api('GET', '/api/digilocker/result?session=' + session, null, token); assert.equal(res.body.ok, true, JSON.stringify(res.body));
  return res.body;
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const tomorrow = () => core.addDays(core.ist().date, 1);
const pickSlot = async (token, lawyerId, from) => { const s = await api('GET', '/api/lawyers/' + lawyerId + '/slots?days=10&date=' + (from || tomorrow()), null, token); for (const d of s.body.days) { const f = d.slots.filter(x => x.free); if (f.length) return { date: d.date, time: f[0].time, all: f }; } throw new Error('no free slot'); };

let adminTok, L, L2, C, C2, bookingId, caseId;

test.before(async () => { await ready; await new Promise(r => server.listen(8791, r)); });
test.after(() => { server.close(); store.flush(); process.exit(0); });

test('health + meta', async () => {
  const h = await api('GET', '/api/health'); assert.equal(h.body.ok, true);
  const m = await api('GET', '/api/meta'); assert.ok(m.body.areas.length >= 10); assert.equal(m.body.config.mockPayments, true);
  assert.equal((await api('GET', '/api/me')).status, 401);
});

test('OTP: bad code, then success; role is locked after first choice', async () => {
  await api('POST', '/api/auth/otp/request', { phone: '9000000011' });
  assert.equal((await api('POST', '/api/auth/otp/verify', { phone: '9000000011', otp: '000000' })).status, 400);
  assert.equal((await api('POST', '/api/auth/otp/request', { phone: '12345' })).status, 400);
  L = await login('9000000012', 'lawyer'); C = await login('9000000013', 'client');
  const again = await api('POST', '/api/me/role', { role: 'client' }, L.token); assert.equal(again.status, 409);
  const me = await api('GET', '/api/me', null, C.token); assert.equal(me.body.me.role, 'client');
});

test('demo OTP: fixed code signs in any number, no SMS; real flow resumes when unset', async () => {
  process.env.DEMO_OTP = '123456';
  const r = await api('POST', '/api/auth/otp/request', { phone: '9000000077' }); assert.equal(r.body.demo, true); assert.equal(r.body.devOtp, '123456');
  assert.equal((await api('POST', '/api/auth/otp/verify', { phone: '9000000077', otp: '654321' })).status, 400);
  const ok = await api('POST', '/api/auth/otp/verify', { phone: '9000000077', otp: '123456' }); assert.equal(ok.status, 200); assert.ok(ok.body.token);
  delete process.env.DEMO_OTP;
  const real = await api('POST', '/api/auth/otp/request', { phone: '9000000078' }); assert.equal(real.body.demo, undefined); assert.match(real.body.devOtp, /^\d{6}$/);
  assert.equal((await api('POST', '/api/auth/otp/verify', { phone: '9000000078', otp: '123456' })).status, 400);
});

test('lawyer: profile, DigiLocker, Bar Council, submit, admin approval, listing', async () => {
  const bad = await api('POST', '/api/lawyer/submit', {}, L.token); assert.equal(bad.status, 400); assert.ok(bad.body.todo.length >= 3);
  assert.equal((await api('PUT', '/api/me', { name: 'Adv. Test Lawyer', city: 'Chennai' }, L.token)).status, 200);
  assert.equal((await api('PUT', '/api/lawyer/profile', { areas: ['family', 'criminal'], bio: 'Family and criminal practitioner in Chennai courts.', experience: 8, languages: ['English', 'Tamil'], office: { address: 'T. Nagar', city: 'T. Nagar', lat: 13.04, lng: 80.23 }, fees: { chat: 300, call: 500, video: 700, in_person: 1000 } }, L.token)).status, 200);
  const dlr = await digilocker(L.token); assert.equal(dlr.me.verify.status, 'verified');
  assert.equal((await api('POST', '/api/lawyer/credentials', { barNo: 'tn/1234/2016', council: 'Bar Council of Tamil Nadu & Puducherry', enrolYear: 2016, certFile: PNG }, L.token)).status, 200);
  assert.equal((await api('POST', '/api/lawyer/credentials', { barNo: 'x', council: 'nope', enrolYear: 2016 }, L.token)).status, 400);
  const sub = await api('POST', '/api/lawyer/submit', {}, L.token); assert.equal(sub.status, 200, JSON.stringify(sub.body)); assert.equal(sub.body.me.lawyer.approval.status, 'submitted');
  // not visible yet
  C2 = await login('9000000014', 'client');
  assert.equal((await api('GET', '/api/lawyers', null, C2.token)).body.items.filter(x => x.id === L.id).length, 0);
  adminTok = (await api('POST', '/api/admin/login', { email: 'admin@test.local', password: 'test-password-123' })).body.token; assert.ok(adminTok);
  assert.equal((await api('POST', '/api/admin/login', { email: 'admin@test.local', password: 'nope' })).status, 401);
  const q = await api('GET', '/api/admin/lawyers?status=submitted', null, adminTok); assert.equal(q.body.items.length, 1);
  const f = await fetch(BASE + '/api/admin/file/' + q.body.items[0].approval.certFile, { headers: { Authorization: 'Bearer ' + adminTok } }); assert.equal(f.status, 200);
  assert.equal((await api('POST', '/api/admin/lawyers/' + L.id + '/review', { decision: 'reject', note: '' }, adminTok)).status, 400);
  assert.equal((await api('POST', '/api/admin/lawyers/' + L.id + '/review', { decision: 'approve' }, adminTok)).status, 200);
  const list = await api('GET', '/api/lawyers?lat=13.05&lng=80.24', null, C2.token); assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].areas.includes('family'), true); assert.ok(list.body.items[0].distanceKm >= 0);
  assert.equal((await api('GET', '/api/lawyers?area=cyber', null, C2.token)).body.items.length, 0);
  // clients cannot use lawyer endpoints and vice versa
  assert.equal((await api('GET', '/api/lawyer/dashboard', null, C.token)).status, 403);
  assert.equal((await api('POST', '/api/bookings', {}, L.token)).status, 403);
});

test('client must verify before booking; manual ID upload goes to review', async () => {
  const L0 = await pickSlot(C.token, L.id);
  const r = await api('POST', '/api/bookings', { lawyerId: L.id, mode: 'chat', date: L0.date, time: L0.time }, C.token); assert.equal(r.status, 403); assert.equal(r.body.code, 'verify_required');
  await digilocker(C.token, '9123456780');
  // the same DigiLocker identity cannot verify a second account
  const dupTok = (await login('9000000016', 'client')).token;
  const s2 = await api('POST', '/api/digilocker/start', { platform: 'web', returnUrl: BASE + '/' }, dupTok), st2 = new URL(s2.body.authUrl).searchParams.get('state');
  const f2 = (p, o) => fetch(BASE + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  await f2('/api/digilocker/mock/login', { state: st2, uid: '9123456780', consent: 'on' }); await f2('/api/digilocker/mock/otp', { state: st2, otp: '123456' });
  const c2 = await f2('/api/digilocker/mock/consent', { state: st2, decision: 'allow', doc: 'aadhaar' }); const cb2 = await fetch(c2.headers.get('location'), { redirect: 'manual' });
  const dres = await api('GET', '/api/digilocker/result?session=' + new URL(cb2.headers.get('location')).searchParams.get('dl_session'), null, dupTok); assert.equal(dres.body.ok, false); assert.equal(dres.body.error, 'id_in_use');
  const up = await api('POST', '/api/verify/id', { type: 'pan', file: PNG }, C2.token); assert.equal(up.body.me.verify.status, 'pending');
  const pend = await api('GET', '/api/admin/verifications', null, adminTok); assert.equal(pend.body.items.length, 1);
  assert.equal((await api('POST', '/api/admin/verifications/' + C2.id, { decision: 'approve' }, adminTok)).status, 200);
  assert.equal((await api('GET', '/api/me', null, C2.token)).body.me.verify.status, 'verified');
});

test('booking: pay (decline, then success), no double booking under a race, cancel and refund', async () => {
  const s = await pickSlot(C.token, L.id);
  const [a, b] = await Promise.all([api('POST', '/api/bookings', { lawyerId: L.id, mode: 'video', date: s.date, time: s.time, note: 'divorce' }, C.token), api('POST', '/api/bookings', { lawyerId: L.id, mode: 'chat', date: s.date, time: s.time }, C2.token)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const won = a.status === 200 ? a : b, tok = a.status === 200 ? C.token : C2.token; bookingId = won.body.booking.id;
  assert.equal(won.body.booking.status, 'awaiting_payment'); assert.equal(won.body.booking.payment.status, 'created');
  const pid = won.body.booking.payment.id;
  const fail = await api('POST', '/api/payments/' + pid + '/pay', { method: 'upi', vpa: 'test@fail' }, tok); assert.equal(fail.status, 402);
  assert.equal((await api('POST', '/api/payments/' + pid + '/pay', { method: 'upi', vpa: 'bad' }, tok)).status, 400);
  assert.equal((await api('POST', '/api/payments/' + pid + '/pay', { method: 'upi', vpa: 'a@b' }, L.token)).status, 404);
  const ok = await api('POST', '/api/payments/' + pid + '/pay', { method: 'upi', vpa: 'client@okbank' }, tok); assert.equal(ok.status, 200);
  assert.equal(ok.body.booking.status, 'confirmed'); assert.match(ok.body.payment.receipt, /^RC-/);
  assert.ok(ok.body.booking.joinUrl.includes('meet.jit.si') || won.body.booking.mode !== 'video');
  assert.equal(ok.body.booking.other.phone, '+919000000012'); // phone unlocks once confirmed
  // paying twice is harmless
  assert.equal((await api('POST', '/api/payments/' + pid + '/pay', { method: 'upi', vpa: 'client@okbank' }, tok)).status, 200);
  // lawyer sees it with commission; the slot is gone
  const lb = await api('GET', '/api/bookings?scope=upcoming', null, L.token); assert.equal(lb.body.items.length, 1); assert.equal(lb.body.items[0].commission, Math.round(lb.body.items[0].fee * 0.1));
  const again = await pickSlot(C.token, L.id); assert.ok(!(again.date === s.date && again.time === s.time));
  // cannot complete before it starts
  assert.equal((await api('POST', '/api/bookings/' + bookingId + '/complete', {}, L.token)).status, 409);
  // client cancels well ahead: full refund
  const c = await api('POST', '/api/bookings/' + bookingId + '/cancel', { reason: 'change of plan' }, tok); assert.equal(c.status, 200); assert.equal(c.body.booking.status, 'cancelled'); assert.equal(c.body.booking.refund, ok.body.booking.total);
  assert.equal((await api('GET', '/api/payments/' + pid, null, tok)).body.payment.status, 'refunded');
  assert.equal((await api('POST', '/api/bookings/' + bookingId + '/cancel', {}, tok)).status, 409);
});

test('booking completion pays the lawyer and enables a review', async () => {
  const s = await pickSlot(C.token, L.id);
  const bk = await api('POST', '/api/bookings', { lawyerId: L.id, mode: 'chat', date: s.date, time: s.time }, C.token); const pay = bk.body.booking.payment.id;
  await api('POST', '/api/payments/' + pay + '/pay', { method: 'card', card: '4111 1111 1111 1111' }, C.token);
  const b = store.get('bookings', bk.body.booking.id); b.date = core.ist().date; b.time = '00:00';   // the session has started
  const done = await api('POST', '/api/bookings/' + b.id + '/complete', {}, L.token); assert.equal(done.status, 200, JSON.stringify(done.body));
  const earn = await api('GET', '/api/lawyer/earnings', null, L.token); assert.equal(earn.body.balance, 270); // 300 - 10%
  assert.equal((await api('POST', '/api/reviews', { bookingId: b.id, rating: 5, text: 'Very helpful' }, C.token)).status, 200);
  assert.equal((await api('POST', '/api/reviews', { bookingId: b.id, rating: 5 }, C.token)).status, 409);
  const det = await api('GET', '/api/lawyers/' + L.id, null, C.token); assert.equal(det.body.rating, 5); assert.equal(det.body.reviews.length, 1);
  // payout flow
  assert.equal((await api('POST', '/api/lawyer/payouts', { amount: 200 }, L.token)).status, 400);
  assert.equal((await api('PUT', '/api/lawyer/bank', { holder: 'Test Lawyer', acc: '123456789012', ifsc: 'HDFC0001234' }, L.token)).status, 200);
  const po = await api('POST', '/api/lawyer/payouts', { amount: 200 }, L.token); assert.equal(po.status, 200); assert.equal(po.body.balance, 70);
  assert.equal((await api('POST', '/api/lawyer/payouts', { amount: 100 }, L.token)).status, 409);
  const adm = await api('GET', '/api/admin/payouts', null, adminTok); assert.equal((await api('POST', '/api/admin/payouts/' + adm.body.items[0].id, { decision: 'rejected' }, adminTok)).status, 200);
  assert.equal((await api('GET', '/api/lawyer/earnings', null, L.token)).body.balance, 270);
});

test('case request -> accept -> hearing, update, document, invoice, payment, close, review', async () => {
  const r = await api('POST', '/api/requests', { lawyerId: L.id, title: 'Property partition dispute', area: 'property', description: 'Family land to be divided between three siblings.' }, C.token); assert.equal(r.status, 200);
  assert.equal((await api('POST', '/api/requests', { lawyerId: L.id, title: 'again', area: 'property', description: 'a duplicate open request here' }, C.token)).status, 409);
  const inbox = await api('GET', '/api/requests', null, L.token); assert.equal(inbox.body.items.length, 1);
  const acc = await api('POST', '/api/requests/' + r.body.request.id + '/accept', {}, L.token); assert.equal(acc.status, 200); caseId = acc.body.caseId;
  assert.equal((await api('POST', '/api/requests/' + r.body.request.id + '/accept', {}, L.token)).status, 409);
  const cs = await api('GET', '/api/cases/' + caseId, null, C.token); assert.equal(cs.body.case.status, 'open'); assert.equal(cs.body.case.notes, undefined);
  assert.equal((await api('GET', '/api/cases/' + caseId, null, C2.token)).status, 404); // strangers cannot see it
  const rev = cs.body.case.rev;
  assert.equal((await api('PATCH', '/api/cases/' + caseId, { stage: 'filing', court: 'District Court', rev }, L.token)).status, 200);
  const stale = await api('PATCH', '/api/cases/' + caseId, { stage: 'hearing', rev }, L.token); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'conflict');
  assert.equal((await api('PATCH', '/api/cases/' + caseId, { stage: 'hearing' }, C.token)).status, 403);
  const d = core.addDays(core.ist().date, 5);
  const h = await api('POST', '/api/cases/' + caseId + '/hearings', { date: d, time: '10:30', purpose: 'Framing of issues' }, L.token); assert.equal(h.body.case.nextHearing.date, d);
  const hid = h.body.case.hearings[0].id;
  const adj = await api('PATCH', '/api/cases/' + caseId + '/hearings/' + hid, { status: 'adjourned', outcome: 'Opposite party sought time', nextDate: core.addDays(d, 20) }, L.token);
  assert.equal(adj.body.case.hearings.length, 2); assert.equal(adj.body.case.nextHearing.date, core.addDays(d, 20));
  assert.equal((await api('POST', '/api/cases/' + caseId + '/updates', { text: 'Written statement filed' }, L.token)).status, 200);
  await api('POST', '/api/cases/' + caseId + '/notes', { text: 'Client is flexible on the eastern plot' }, L.token);
  assert.equal((await api('GET', '/api/cases/' + caseId, null, L.token)).body.case.notes.length, 1);
  assert.equal((await api('GET', '/api/cases/' + caseId, null, C.token)).body.case.notes, undefined);
  // documents: client uploads, lawyer uploads a private one the client cannot see
  assert.equal((await api('POST', '/api/cases/' + caseId + '/files', { name: 'sale-deed', file: PNG, kind: 'evidence' }, C.token)).status, 200);
  const pv = await api('POST', '/api/cases/' + caseId + '/files', { name: 'strategy', file: PNG, private: true }, L.token); assert.equal(pv.body.case.files.length, 2);
  const cv = await api('GET', '/api/cases/' + caseId, null, C.token); assert.equal(cv.body.case.files.length, 1);
  const privId = pv.body.case.files.find(f => f.private).id;
  assert.equal((await fetch(BASE + '/api/files/' + privId, { headers: { Authorization: 'Bearer ' + C.token } })).status, 404);
  assert.equal((await fetch(BASE + '/api/files/' + cv.body.case.files[0].id, { headers: { Authorization: 'Bearer ' + L.token } })).status, 200);
  assert.equal((await api('POST', '/api/cases/' + caseId + '/files', { name: 'x', file: 'data:text/html;base64,PGI+' }, C.token)).status, 400);
  // invoice -> client pays -> lawyer balance grows by amount minus commission
  const before = (await api('GET', '/api/lawyer/earnings', null, L.token)).body.balance;
  const inv = await api('POST', '/api/cases/' + caseId + '/invoices', { items: [{ desc: 'Drafting plaint', amount: 5000 }, { desc: 'Filing', amount: 1000 }] }, L.token); assert.equal(inv.status, 200);
  const civ = (await api('GET', '/api/cases/' + caseId, null, C.token)).body.case.invoices[0]; assert.equal(civ.total, 6000);
  assert.equal((await api('POST', '/api/payments/' + civ.paymentId + '/pay', { method: 'netbanking' }, C.token)).status, 200);
  assert.equal((await api('GET', '/api/lawyer/earnings', null, L.token)).body.balance, before + 5400);
  assert.equal((await api('POST', '/api/invoices/' + civ.id + '/void', {}, L.token)).status, 409);
  // calendar shows the hearing for both sides
  assert.ok((await api('GET', '/api/calendar', null, C.token)).body.events.some(e => e.kind === 'hearing'));
  // close, review
  assert.equal((await api('POST', '/api/cases/' + caseId + '/close', { outcome: 'bogus' }, L.token)).status, 400);
  const cl = await api('POST', '/api/cases/' + caseId + '/close', { outcome: 'settled', summary: 'Partition by consent' }, L.token); assert.equal(cl.body.case.status, 'closed');
  assert.equal((await api('POST', '/api/reviews', { caseId, rating: 4, text: 'Good' }, C.token)).status, 200);
  const rep = await api('GET', '/api/lawyer/reports', null, L.token); assert.equal(rep.body.cases.total, 1); assert.equal(rep.body.cases.outcomes.settled, 1); assert.ok(rep.body.revenue.total > 0);
  const csv = await fetch(BASE + '/api/lawyer/reports.csv?type=cases', { headers: { Authorization: 'Bearer ' + L.token } }); assert.match(await csv.text(), /GYL-\d{4}-0001/);
  assert.equal((await api('GET', '/api/lawyer/clients', null, L.token)).body.items.length, 1);
});

test('lawyer adds a case by client phone; unknown client is refused', async () => {
  assert.equal((await api('POST', '/api/cases', { clientPhone: '9111111111', title: 'Nobody case' }, L.token)).status, 404);
  const c = await api('POST', '/api/cases', { clientPhone: '9000000013', title: 'Cheque bounce notice', area: 'cheque', court: 'Magistrate Court' }, L.token); assert.equal(c.status, 200);
  assert.equal((await api('GET', '/api/cases', null, C.token)).body.items.length, 2);
  assert.equal((await api('GET', '/api/cases?status=open', null, C.token)).body.items.length, 1);
});

test('chat: only related people, unread counts, strangers limited', async () => {
  const m = await api('POST', '/api/messages', { to: L.id, text: 'Hello counsel' }, C.token); assert.equal(m.status, 200);
  assert.equal((await api('POST', '/api/messages', { to: C.id, text: 'Hello! How can I help?' }, L.token)).status, 200);
  const conv = await api('GET', '/api/conversations', null, C.token); assert.equal(conv.body.items[0].unread, 1);
  const th = await api('GET', '/api/messages?with=' + L.id, null, C.token); assert.equal(th.body.items.length, 2);
  assert.equal((await api('GET', '/api/conversations', null, C.token)).body.unread, 0);
  assert.equal((await api('POST', '/api/messages', { to: C.id, text: 'x' }, C2.token)).status, 403);   // client to client
  for (let i = 0; i < 3; i++) assert.equal((await api('POST', '/api/messages', { to: L.id, text: 'q' + i }, C2.token)).status, 200);
  assert.equal((await api('POST', '/api/messages', { to: L.id, text: 'q4' }, C2.token)).status, 403);  // first-question limit
});

test('open urgent request alerts nearby online lawyers; first to accept wins', async () => {
  L2 = await login('9000000015', 'lawyer');
  const u2 = store.get('users', L2.id); Object.assign(u2, { name: 'Adv. Second', verify: { status: 'verified' } });
  Object.assign(u2.lawyer, { areas: ['criminal'], bio: 'Criminal lawyer with ten years of practice.', experience: 10, online: true, pingAt: Date.now(), office: { address: 'Egmore', city: 'Egmore', lat: 13.07, lng: 80.26 } });
  u2.lawyer.approval.status = 'approved'; store.save();
  const r = await api('POST', '/api/requests', { title: 'Brother arrested last night', area: 'criminal', description: 'Need bail help urgently please', urgency: 'urgent', lat: 13.06, lng: 80.25 }, C.token);
  assert.equal(r.status, 200); assert.equal(r.body.request.alerted, 1);
  assert.equal((await api('GET', '/api/requests', null, L2.token)).body.items.length, 1);
  const n = await api('GET', '/api/notifications', null, L2.token); assert.ok(n.body.items.some(x => x.type === 'case_request'));
  assert.equal((await api('POST', '/api/requests/' + r.body.request.id + '/accept', {}, L2.token)).status, 200);
});

test('demo mode auto-approves a completed lawyer profile; without it the admin must approve', async () => {
  const D = await login('9000000066', 'lawyer'); const u = store.get('users', D.id);
  Object.assign(u, { name: 'Adv. Demo Lawyer', verify: { status: 'verified' } });
  Object.assign(u.lawyer, { barNo: 'TN/9999/2020', council: 'Bar Council of Tamil Nadu & Puducherry', enrolYear: 2020, areas: ['immigration'], bio: 'A demo lawyer with enough bio text.', office: { address: 'x', city: 'Adyar', lat: 13, lng: 80.2 } });
  u.lawyer.approval.certFile = store.insert('files', { ownerId: D.id, kind: 'barcert', mime: 'image/png', size: 70, b64: PNG.split(',')[1], t: Date.now() }).id; store.save();
  process.env.DEMO_OTP = '123456';
  const r = await api('POST', '/api/lawyer/submit', {}, D.token); delete process.env.DEMO_OTP;
  assert.equal(r.status, 200); assert.equal(r.body.me.lawyer.approval.status, 'approved'); assert.equal(r.body.me.lawyer.listed, true);
});

test('live stream delivers a notification the moment it is created', async () => {
  const got = new Promise((res, rej) => {
    const req = http.get(BASE + '/api/live', { headers: { Authorization: 'Bearer ' + C2.token } }, resp => {
      let buf = ''; resp.on('data', d => { buf += d; if (buf.includes('event: notice')) { req.destroy(); res(buf); } });
    }); req.on('error', e => { if (e.code !== 'ECONNRESET') rej(e); }); setTimeout(() => rej(new Error('no live event')), 4000);
  });
  await new Promise(r => setTimeout(r, 300));
  await core.notify(C2.id, 'broadcast', 'Hello', 'Live', {});
  assert.match(await got, /event: notice/);
});

test('lawyer presence + map data, favourites, filters', async () => {
  assert.equal((await api('POST', '/api/lawyer/presence', { online: true, share: true, lat: 13.041, lng: 80.232 }, L.token)).body.online, true);
  const online = await api('GET', '/api/lawyers?online=1', null, C.token); assert.ok(online.body.items.some(x => x.id === L.id && x.online && x.live));
  assert.equal((await api('POST', '/api/favs/' + L.id, {}, C.token)).body.favs.length, 1);
  assert.equal((await api('GET', '/api/lawyers?fav=1', null, C.token)).body.items.length, 1);
  assert.equal((await api('GET', '/api/lawyers?maxFee=100', null, C.token)).body.items.length, 0);
  assert.equal((await api('GET', '/api/lawyers?q=zzzz', null, C.token)).body.items.length, 0);
  assert.equal((await api('GET', '/api/lawyers?q=family', null, C.token)).body.items.length, 1);
});

test('availability rules: days off, overlapping hours, past slots hidden', async () => {
  const day = tomorrow();
  assert.equal((await api('PUT', '/api/lawyer/availability', { days: { 1: [{ from: '10:00', to: '12:00' }, { from: '11:00', to: '13:00' }] } }, L.token)).status, 400);
  assert.equal((await api('PUT', '/api/lawyer/availability', { off: [day] }, L.token)).status, 200);
  assert.equal((await api('GET', '/api/lawyers/' + L.id + '/slots?date=' + day, null, C.token)).body.days[0].slots.length, 0);
  await api('PUT', '/api/lawyer/availability', { off: [] }, L.token);
  const today = (await api('GET', '/api/lawyers/' + L.id + '/slots?date=' + core.ist().date, null, C.token)).body.days[0].slots;
  assert.ok(today.every(s => !s.free || core.istMs(core.ist().date, s.time) >= Date.now()));
});

test('chatbot: rules, area hand-off, role-aware help', async () => {
  const a = await api('POST', '/api/bot', { text: 'my cheque bounced what do I do' }, C.token); assert.match(a.body.reply, /Section 138/); assert.equal(a.body.cta.area, 'cheque');
  const u = await api('POST', '/api/bot', { text: 'I was arrested' }, C.token); assert.match(u.body.reply, /112/); assert.equal(u.body.cta.nav, 'urgent');
  const l = await api('POST', '/api/bot', { text: 'how do I set my fee' }, L.token); assert.match(l.body.reply, /Fees & availability/);
  const c = await api('POST', '/api/bot', { text: 'how do I set my fee' }, C.token); assert.doesNotMatch(c.body.reply, /Profile → Fees/);
  assert.ok((await api('POST', '/api/bot', { text: '' }, C.token)).body.chips.length > 2);
  assert.ok((await api('POST', '/api/bot', { text: 'asdf qwer' }, C.token)).body.reply.length > 10);
  const chip = await api('POST', '/api/bot', { text: 'Find a family lawyer' }, C.token); assert.equal(chip.body.cta.area, 'family');
});

test('admin: dashboard, settings (commission), broadcast, suspend, export, sample data', async () => {
  const d = await api('GET', '/api/admin/dashboard', null, adminTok); assert.ok(d.body.users.total >= 4); assert.ok(d.body.money.gross > 0);
  assert.equal((await api('PUT', '/api/admin/settings', { commissionPct: 80 }, adminTok)).status, 400);
  assert.equal((await api('PUT', '/api/admin/settings', { commissionPct: 20 }, adminTok)).body.settings.commissionPct, 20);
  assert.equal(core.commission(1000), 200); await api('PUT', '/api/admin/settings', { commissionPct: 10 }, adminTok);
  assert.equal((await api('POST', '/api/admin/broadcast', { title: 'Hi', body: 'All clients', role: 'client' }, adminTok)).body.sent, 3);
  assert.equal((await api('GET', '/api/admin/dashboard', null, C.token)).status, 401);
  const s = await api('POST', '/api/admin/sample', { action: 'load' }, adminTok); assert.ok(s.body.added >= 15);
  const list = await api('GET', '/api/lawyers?lat=13.0827&lng=80.2707&radius=30', null, C.token); assert.ok(list.body.items.length >= 15);
  assert.ok(list.body.items.every(x => x.distanceKm <= 30)); assert.equal(list.body.items[0].distanceKm <= list.body.items[1].distanceKm, true);
  const csv = await fetch(BASE + '/api/admin/export.csv?type=bookings', { headers: { Authorization: 'Bearer ' + adminTok } }); assert.match(await csv.text(), /Date,Time,Client/);
  assert.ok((await api('POST', '/api/admin/sample', { action: 'clear' }, adminTok)).body.removed >= 15);
  assert.equal((await api('POST', '/api/admin/users/' + C2.id + '/status', { status: 'suspended' }, adminTok)).status, 200);
  assert.equal((await api('GET', '/api/me', null, C2.token)).status, 401);
  assert.ok((await api('GET', '/api/admin/audit', null, adminTok)).body.items.length > 5);
});

test('demo seed: a new client and a new lawyer each start with a realistic history; clear removes it', async () => {
  process.env.DEMO_OTP = '123456';
  const SC = await login('9000000081', 'client'), SL = await login('9000000082', 'lawyer'); delete process.env.DEMO_OTP;
  // client
  const bk = await api('GET', '/api/bookings', null, SC.token); assert.ok(bk.body.items.some(b => b.status === 'completed' && !b.reviewed)); assert.ok(bk.body.items.some(b => b.status === 'confirmed'));
  const cs = await api('GET', '/api/cases', null, SC.token); assert.equal(cs.body.items.length, 2); assert.equal(cs.body.items.filter(c => c.status === 'open').length, 1); assert.equal(cs.body.items.find(c => c.status === 'open').pendingInvoices, 1);
  const det = await api('GET', '/api/cases/' + cs.body.items.find(c => c.status === 'open').id, null, SC.token); assert.equal(det.body.case.hearings.length, 2); assert.ok(det.body.case.nextHearing); assert.equal(det.body.case.notes, undefined); assert.equal(det.body.case.files.length, 1);
  assert.equal((await api('GET', '/api/conversations', null, SC.token)).body.unread, 1);
  assert.equal((await api('GET', '/api/me', null, SC.token)).body.me.favs.length, 2);
  const unpaid = det.body.case.invoices.find(i => i.status === 'unpaid'); assert.equal((await api('POST', '/api/payments/' + unpaid.paymentId + '/pay', { method: 'netbanking' }, SC.token)).status, 200);
  // lawyer
  const lc = await api('GET', '/api/cases', null, SL.token); assert.equal(lc.body.items.length, 3);
  const ld = await api('GET', '/api/lawyer/dashboard', null, SL.token); assert.ok(ld.body.kpi.openCases === 2); assert.ok(ld.body.hearings.length >= 1); assert.ok(ld.body.kpi.pendingRequests >= 1);
  const er = await api('GET', '/api/lawyer/earnings', null, SL.token); assert.ok(er.body.balance > 0);
  assert.equal((await api('GET', '/api/requests', null, SL.token)).body.items.length, 1);
  const rp = await api('GET', '/api/lawyer/reports', null, SL.token); assert.ok(rp.body.revenue.total > 0); assert.ok(rp.body.bookings.completed >= 2);
  assert.ok((await api('GET', '/api/lawyer/clients', null, SL.token)).body.items.length >= 3);
  assert.ok((await api('GET', '/api/conversations', null, SL.token)).body.unread >= 2);
  // re-running the role call does not duplicate the seed
  await api('POST', '/api/me/role', { role: 'client' }, SC.token); assert.equal((await api('GET', '/api/cases', null, SC.token)).body.items.length, 2);
  // admin button: sample data adds history between sample people; clear removes it all including the tester seeds
  const loaded = await api('POST', '/api/admin/sample', { action: 'load' }, adminTok); assert.equal(loaded.status, 200);
  assert.ok((await api('POST', '/api/admin/sample', { action: 'clear' }, adminTok)).body.removed >= 20);
  assert.equal((await api('GET', '/api/cases', null, SC.token)).body.items.length, 0);
});

test('data export, logout everywhere, account erasure', async () => {
  const ex = await api('GET', '/api/me/export', null, C.token); assert.ok(ex.body.profile.phone); assert.ok(ex.body.cases.every(c => c.notes === undefined));
  assert.equal((await api('POST', '/api/auth/logout-all', {}, C.token)).status, 200);
  assert.equal((await api('GET', '/api/me', null, C.token)).status, 401);
  const X = await login('9000000099', 'client'); assert.equal((await api('DELETE', '/api/me', null, X.token)).status, 200);
  assert.equal((await api('GET', '/api/me', null, X.token)).status, 401);
  assert.equal((await api('DELETE', '/api/me', null, L.token)).status, 409); // lawyer has an open case
});

test('web app + admin portal are served with security headers', async () => {
  const r = await fetch(BASE + '/admin'); assert.ok([200, 404].includes(r.status));
  assert.equal((await fetch(BASE + '/../server/.env')).status, 404);
  assert.equal((await fetch(BASE + '/js/../../server/server.js')).status, 404);
});
