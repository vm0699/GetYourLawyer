'use strict';
// Accounts: phone OTP login, role, profile, photo, devices, notifications, verification (DigiLocker + ID upload), live stream, data export.
const crypto = require('crypto');
const A = require('./lib/auth');
const live = require('./lib/live');
const sms = require('./lib/sms');
const bot = require('./lib/bot');
const { HttpError, bad, str, oneOf } = require('./lib/http');
const { validLL } = require('./lib/geo');

module.exports = function (R, { store, core, dl, env, dataDir, limiter }) {
  const view = u => core.userView(u);
  const unread = u => store.filter('notifications', n => n.userId === u.id && !n.read).length;

  R.add('GET', '/api/health', { auth: 'public' }, async () => {
    let db = 'unknown'; try { db = await store.health(); } catch (e) { throw new HttpError(503, 'database unavailable'); }
    return { ok: true, name: 'GetYourLawyer', db, sms: sms.provider(), push: require('./lib/push').enabled(), digilocker: dl.PROVIDER };
  });

  R.add('GET', '/api/meta', { auth: 'public' }, () => {
    const c = core.cfg();
    return {
      areas: core.AREAS, modes: core.MODES, stages: core.STAGES, courts: core.COURTS, langs: core.LANGS, councils: core.BAR_COUNCILS,
      config: { clientVerifyRequired: c.clientVerifyRequired, lawyerNeedsDL: c.lawyerNeedsDL, lawyerNeedsBarCert: c.lawyerNeedsBarCert, cancelHoursBefore: c.cancelHoursBefore,
        convenienceFee: c.convenienceFee, announcement: c.announcement, maintenance: c.maintenance, supportEmail: c.supportEmail || env.SUPPORT_EMAIL || '', supportPhone: c.supportPhone, digilockerMock: dl.MOCK, mockPayments: true, defaultRadiusKm: c.defaultRadiusKm }
    };
  });

  /* ---------- phone OTP ---------- */
  R.add('POST', '/api/auth/otp/request', { auth: 'public' }, async ({ body, ip }) => {
    const phone = A.normPhone(body.phone);
    if (!phone) throw bad('Enter a valid 10-digit mobile number');
    if (!limiter.take('otp-ip:' + ip, 30, 3600e3) || !limiter.take('otp-ph:' + phone, 5, 600e3)) throw new HttpError(429, 'Too many codes requested. Try again in a few minutes.');
    // Demo mode: a fixed code that works for any number, no SMS is sent. The real flow below is kept but unused while DEMO_OTP is set.
    if (env.DEMO_OTP) return { ok: true, demo: true, devOtp: String(env.DEMO_OTP) };
    const otp = String(crypto.randomInt(100000, 1000000));
    if (sms.verifyMode()) {
      try { await sms.startVerify(phone); } catch (e) { console.error('sms failed:', e.message); throw new HttpError(502, 'Could not send the SMS. Please try again.'); }
      return { ok: true };
    }
    store.removeWhere('otps', o => o.phone === phone);
    store.insert('otps', { phone, hash: A.sha(otp + phone + A.secret(dataDir)), exp: Date.now() + 5 * 60e3, attempts: 0 });
    try { await sms.sendOtp(phone, otp); } catch (e) { console.error('sms failed:', e.message); throw new HttpError(502, 'Could not send the SMS. Please try again.'); }
    return env.DEV_OTP === '1' ? { ok: true, devOtp: otp } : { ok: true };
  });

  R.add('POST', '/api/auth/otp/verify', { auth: 'public' }, async ({ body, ip }) => {
    const phone = A.normPhone(body.phone), otp = str(body.otp, 6);
    if (!phone || !/^\d{6}$/.test(otp)) throw bad('Enter the 6-digit code');
    if (!limiter.take('ver-ip:' + ip, 60, 3600e3)) throw new HttpError(429, 'Too many attempts. Try again later.');
    if (env.DEMO_OTP) { if (otp !== String(env.DEMO_OTP)) throw bad('Incorrect code. In demo mode the code is ' + env.DEMO_OTP); }
    else if (sms.verifyMode()) {
      if (!limiter.take('ver-ph:' + phone, 8, 600e3)) throw new HttpError(429, 'Too many attempts. Try again later.');
      let ok = false;
      try { ok = await sms.checkVerify(phone, otp); } catch (e) { console.error('sms verify failed:', e.message); throw new HttpError(502, 'Could not check the code. Please try again.'); }
      if (!ok) throw bad('Incorrect code');
    } else {
      const rec = store.find('otps', o => o.phone === phone);
      if (!rec || rec.exp < Date.now()) throw bad('That code has expired. Request a new one.');
      if (++rec.attempts > 5) { store.removeWhere('otps', o => o.phone === phone); throw bad('Too many wrong attempts. Request a new code.'); }
      store.save();
      if (rec.hash !== A.sha(otp + phone + A.secret(dataDir))) throw bad('Incorrect code');
      store.removeWhere('otps', o => o.phone === phone);
    }
    let u = store.find('users', x => x.phone === phone), isNew = false;
    if (!u) { u = store.insert('users', { phone, role: null, status: 'active', createdAt: Date.now(), tv: 0, lang: body.lang === 'ta' ? 'ta' : 'en', devices: [], favs: [], prefs: {} }); isNew = true; }
    if (u.status === 'suspended') throw new HttpError(403, 'This account is suspended. Contact support.');
    u.lastLogin = Date.now(); store.save();
    return { token: A.sign({ sub: u.id, typ: 'user', tv: u.tv || 0 }, dataDir, 60 * 86400), user: view(u), isNew };
  });

  /* ---------- me ---------- */
  R.add('GET', '/api/me', { auth: 'user' }, ({ user }) => ({ me: view(user), unread: unread(user), serverTime: Date.now() }));

  R.add('POST', '/api/me/role', { auth: 'user' }, ({ user, body }) => {
    const role = oneOf(body.role, ['client', 'lawyer']); if (!role) throw bad('Choose Client or Lawyer');
    if (user.role && user.role !== role) throw new HttpError(409, 'This number is already registered as a ' + user.role + '. One phone number can only be one role.');
    if (!user.role) {
      user.role = role;
      if (role === 'lawyer') user.lawyer = core.newLawyerProfile();
      core.audit('user:' + user.id, 'role_set', role); store.save();
      // Demo mode: every tester starts with a realistic history (bookings, cases, hearings, invoices, chats) so the whole app can be explored.
      if (env.DEMO_OTP && env.DEMO_SEED !== '0') { try { require('./lib/sampledata').populate(store, core, user); } catch (e) { console.error('demo seed failed:', e.stack || e.message); } }
    }
    return { me: view(user) };
  });

  R.add('PUT', '/api/me', { auth: 'user' }, ({ user, body }) => {
    if ('name' in body) { user.name = str(body.name, 80); }
    if ('email' in body) { const e = str(body.email, 120); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Enter a valid email'); user.email = e; }
    if ('dob' in body) { const d = str(body.dob, 10); if (d && !(/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d)))) throw bad('Enter a valid date of birth'); if (d) { const age = (Date.now() - new Date(d)) / 31557600e3; if (age < 18) throw bad('You must be 18 or older'); } user.dob = d; }
    if ('gender' in body) user.gender = oneOf(body.gender, ['M', 'F', 'O']) || '';
    ['city', 'state'].forEach(k => { if (k in body) user[k] = str(body[k], 60); });
    if ('pincode' in body) user.pincode = str(body.pincode, 6).replace(/\D/g, '');
    if ('lang' in body) user.lang = body.lang === 'ta' ? 'ta' : 'en';
    if (body.prefs && typeof body.prefs === 'object') user.prefs = Object.assign({}, user.prefs, { push: body.prefs.push !== false, sound: body.prefs.sound !== false, marketing: !!body.prefs.marketing });
    if (user.name && user.role) user.onboarded = true;
    store.save();
    return { me: view(user) };
  });

  // profile photo: lawyers only (clients keep initials for privacy); small data URL, public by lawyer id once listed
  R.add('PUT', '/api/me/photo', { auth: 'user', maxBody: 400 * 1024 }, ({ user, body }) => {
    if (user.role !== 'lawyer') throw new HttpError(403, 'Photos are for lawyer profiles');
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.photo || ''));
    if (body.photo === '') { user.photo = ''; user.photoV = Date.now(); store.save(); return { ok: true }; }
    if (!m || m[2].length > 240 * 1024) throw bad('Use a JPG or PNG under 170 KB');
    user.photo = body.photo; user.photoV = Date.now(); store.save();
    return { ok: true, photoV: user.photoV };
  });
  R.add('GET', '/api/photo/:id', { auth: 'public' }, ({ params }) => {
    const u = store.get('users', params.id);
    if (!u || u.role !== 'lawyer' || !u.photo) throw new HttpError(404, 'No photo');
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(u.photo);
    return { __raw: Buffer.from(m[2], 'base64'), type: m[1], cache: 'public, max-age=3600' };
  });

  R.add('POST', '/api/me/devices', { auth: 'user' }, ({ user, body }) => {
    const t = str(body.token, 400); if (!t) throw bad('token required');
    user.devices = (user.devices || []).filter(d => d.token !== t).concat({ token: t, platform: str(body.platform, 12, 'android'), at: Date.now() }).slice(-5);
    store.save(); return { ok: true };
  });
  R.add('POST', '/api/auth/logout-all', { auth: 'user' }, ({ user }) => { user.tv = (user.tv || 0) + 1; user.devices = []; store.save(); return { ok: true }; });

  R.add('GET', '/api/me/export', { auth: 'user' }, ({ user }) => ({
    exportedAt: new Date().toISOString(), profile: view(user),
    bookings: store.filter('bookings', b => b.clientId === user.id || b.lawyerId === user.id),
    cases: store.filter('cases', c => (c.clientId === user.id || c.lawyerId === user.id)).map(c => user.role === 'client' ? Object.assign({}, c, { notes: undefined }) : c),
    requests: store.filter('requests', r => r.clientId === user.id || r.lawyerId === user.id),
    payments: store.filter('payments', p => p.payerId === user.id || p.payeeId === user.id),
    reviews: store.filter('reviews', r => r.clientId === user.id || r.lawyerId === user.id),
    messages: store.filter('messages', m => m.from === user.id || m.to === user.id).map(m => ({ t: m.t, from: m.from, to: m.to, text: m.text }))
  }));
  R.add('DELETE', '/api/me', { auth: 'user' }, ({ user }) => {
    if (store.find('cases', c => (c.clientId === user.id || c.lawyerId === user.id) && c.status === 'open')) throw new HttpError(409, 'You have open cases. Close or transfer them before deleting your account.');
    core.eraseUser(user.id); return { ok: true };
  });

  /* ---------- real-time stream (server-sent events) ---------- */
  R.add('GET', '/api/live', { auth: 'user' }, ({ req, res, user, query }) => {
    live.add(req, res, user.id, parseFloat(query.lat), parseFloat(query.lng));
    return { __stream: true };
  });

  /* ---------- notifications ---------- */
  R.add('GET', '/api/notifications', { auth: 'user' }, ({ user }) => ({
    items: store.filter('notifications', n => n.userId === user.id).sort((a, b) => b.t - a.t).slice(0, 100).map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, read: n.read, t: n.t })),
    unread: unread(user)
  }));
  R.add('POST', '/api/notifications/read', { auth: 'user' }, ({ user, body }) => {
    store.filter('notifications', n => n.userId === user.id && !n.read && (body.all || n.id === body.id)).forEach(n => { n.read = true; });
    store.save(); return { unread: unread(user) };
  });

  /* ---------- verification: DigiLocker (both roles) ---------- */
  R.add('POST', '/api/digilocker/start', { auth: 'user' }, async ({ user, body }) => {
    if (!user.role) throw bad('Choose your role first');
    let r; try { r = await dl.start(user, body || {}); } catch (e) { console.error('digilocker start failed:', e.message); throw new HttpError(502, 'Could not start DigiLocker. Please try again.'); }
    if (r.error) throw bad(r.error);
    return r;
  });
  R.add('GET', '/api/digilocker/mock', { auth: 'public', raw: true }, ({ query }) => ({ __html: dl.MOCK ? dl.mockLoginPage(query.state || '') : 'Not available', code: dl.MOCK ? 200 : 404 }));
  R.add('POST', '/api/digilocker/mock/login', { auth: 'public', raw: true, form: true }, ({ body }) => { const r = dl.MOCK ? dl.mockLogin(body) : { html: 'Not available', code: 404 }; return { __html: r.html, code: r.code }; });
  R.add('POST', '/api/digilocker/mock/otp', { auth: 'public', raw: true, form: true }, ({ body }) => { const r = dl.MOCK ? dl.mockOtp(body) : { html: 'Not available', code: 404 }; return { __html: r.html, code: r.code }; });
  R.add('POST', '/api/digilocker/mock/consent', { auth: 'public', raw: true, form: true }, ({ body }) => dl.MOCK ? { __redirect: dl.mockConsent(body).redirect } : { __html: 'Not available', code: 404 });
  const dlReturn = async q => { const r = await dl.callback(q); return r.redirect ? { __redirect: r.redirect } : { __html: r.html, code: r.code }; };
  R.add('GET', '/api/digilocker/callback', { auth: 'public', raw: true }, ({ query }) => dlReturn(query));
  R.add('GET', '/api/digilocker/return/:state', { auth: 'public', raw: true }, ({ query, params }) => dlReturn(Object.assign({}, query, { state: params.state })));
  R.add('GET', '/api/digilocker/result', { auth: 'user' }, ({ user, query }) => {
    const r = dl.result(user, query.session); if (!r) throw new HttpError(404, 'Session not found');
    return Object.assign({}, r, { me: view(user) });
  });

  // Manual ID upload (fallback): goes to the admin review queue
  R.add('POST', '/api/verify/id', { auth: 'user', maxBody: 2.4 * 1024 * 1024 }, ({ user, body }) => {
    if (user.verify && user.verify.status === 'verified') throw new HttpError(409, 'You are already verified');
    const type = oneOf(body.type, ['aadhaar', 'pan', 'dl', 'voter', 'passport']); if (!type) throw bad('Choose a document type');
    const f = parseFile(body.file); if (!f) throw bad('Attach a photo or PDF under 1.5 MB');
    const fid = store.insert('files', { ownerId: user.id, name: type + '-id', mime: f.mime, size: f.size, b64: f.b64, kind: 'id', t: Date.now() }).id;
    user.verify = { status: 'pending', method: 'upload', at: Date.now(), docType: type, fileId: fid, name: user.name || '' };
    store.save(); core.audit('user:' + user.id, 'id_uploaded', type);
    return { me: view(user) };
  });

  function parseFile(s) {
    const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(s || ''));
    if (!m || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(m[1].toLowerCase()) || m[2].length > 2.1e6) return null;
    return { mime: m[1].toLowerCase(), b64: m[2], size: Math.floor(m[2].length * 3 / 4) };
  }
  R.parseFile = parseFile;

  /* ---------- assistant + support ---------- */
  R.add('POST', '/api/bot', { auth: 'user' }, ({ user, body }) => {
    if (!limiter.take('bot:' + user.id, 40, 60e3)) throw new HttpError(429, 'Slow down a little');
    return bot.reply(str(body.text, 300), { role: user.role });
  });
  R.add('POST', '/api/support', { auth: 'user' }, ({ user, body }) => {
    const text = str(body.text, 1000); if (text.length < 5) throw bad('Please describe the problem');
    store.insert('tickets', { userId: user.id, role: user.role, text, status: 'open', t: Date.now() });
    return { ok: true };
  });

  /* ---------- location presence (clients share their position for nearby search) ---------- */
  R.add('PUT', '/api/me/location', { auth: 'user' }, ({ user, body }) => {
    const lat = +body.lat, lng = +body.lng; if (!validLL(lat, lng)) throw bad('Invalid location');
    user.loc = { lat, lng, at: Date.now() }; live.setPos(user.id, lat, lng); store.save(); return { ok: true };
  });
};
