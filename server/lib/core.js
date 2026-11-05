'use strict';
// Shared domain logic: config, public/private views, notifications, availability slots, ledger, scheduled jobs.
const live = require('./live');
const push = require('./push');
const { hav } = require('./geo');
const { showPhone } = require('./auth');

const HOUR = 3600e3, DAY = 864e5;
const p2 = n => String(n).padStart(2, '0');

/* ---------- reference data (sent to the app in /api/meta) ---------- */
const AREAS = [
  ['family', 'Family & Divorce'], ['criminal', 'Criminal'], ['property', 'Property & Land'], ['civil', 'Civil Disputes'],
  ['consumer', 'Consumer'], ['cyber', 'Cyber Crime'], ['corporate', 'Corporate & Startup'], ['labour', 'Labour & Service'],
  ['tax', 'Tax'], ['ip', 'Intellectual Property'], ['motor', 'Motor Accident'], ['cheque', 'Cheque Bounce'],
  ['banking', 'Banking & Finance'], ['constitutional', 'Writ & Constitutional'], ['wills', 'Wills & Succession'], ['immigration', 'Immigration']
].map(([id, name]) => ({ id, name }));
const MODES = [['chat', 'Chat consult'], ['call', 'Phone call'], ['video', 'Video call'], ['in_person', 'In person']].map(([id, name]) => ({ id, name }));
const STAGES = ['consultation', 'filing', 'notice', 'hearing', 'evidence', 'arguments', 'judgment', 'appeal', 'execution', 'closed'];
const COURTS = ['Supreme Court', 'High Court', 'District Court', 'Sessions Court', 'Magistrate Court', 'Family Court', 'Consumer Commission', 'Labour Court', 'Tribunal (NCLT/DRT/ITAT)', 'Arbitration', 'Police / Authority'];
const LANGS = ['English', 'Tamil', 'Hindi', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Gujarati', 'Urdu'];
const BAR_COUNCILS = ['Bar Council of Tamil Nadu & Puducherry', 'Bar Council of Delhi', 'Bar Council of Maharashtra & Goa', 'Bar Council of Karnataka', 'Bar Council of Kerala',
  'Bar Council of Andhra Pradesh', 'Bar Council of Telangana', 'Bar Council of Uttar Pradesh', 'Bar Council of West Bengal', 'Bar Council of Gujarat', 'Bar Council of Punjab & Haryana', 'Other State Bar Council'];

/* ---------- time (all slots are India time) ---------- */
function ist(ms) {
  const d = new Date((ms == null ? Date.now() : ms) + 330 * 60e3);
  return { date: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), time: p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()), dow: d.getUTCDay() };
}
const istMs = (date, time) => Date.parse(date + 'T' + (time || '00:00') + ':00+05:30');
const dowOf = date => new Date(date + 'T12:00:00+05:30').getUTCDay();
const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fromMin = m => p2(Math.floor(m / 60)) + ':' + p2(m % 60);
const addDays = (date, n) => ist(istMs(date, '12:00') + n * DAY).date;

function create(store, dataDir) {
  /* ---------- config (admin editable) ---------- */
  const DEFAULTS = {
    commissionPct: 10,            // platform commission taken from the lawyer's earning
    convenienceFee: 0,            // flat fee added to what the client pays (rupees)
    clientVerifyRequired: true,   // clients must verify (DigiLocker or ID upload) before booking / sending a case request
    lawyerNeedsDL: true,          // lawyers need a DigiLocker (Aadhaar) verification before approval
    lawyerNeedsBarCert: true,     // lawyers must upload the Bar Council certificate
    cancelHoursBefore: 2,         // free cancellation window before the slot
    leadMinutes: 30,              // earliest bookable slot from now
    payHoldMinutes: 10,           // how long an unpaid booking holds its slot
    urgentRadiusKm: 40, defaultRadiusKm: 25,
    presenceFreshMin: 20,         // a lawyer who has not pinged for this long shows offline
    maintenance: false, announcement: '', supportEmail: '', supportPhone: ''
  };
  const cfg = () => store.doc('config', DEFAULTS) && Object.assign({}, DEFAULTS, store.doc('config', DEFAULTS));
  const setCfg = patch => { const d = store.doc('config', DEFAULTS); Object.keys(DEFAULTS).forEach(k => { if (k in patch) d[k] = typeof DEFAULTS[k] === 'boolean' ? !!patch[k] : typeof DEFAULTS[k] === 'number' ? +patch[k] : String(patch[k]).slice(0, 300); }); store.save(); return cfg(); };

  const userById = id => store.get('users', id);
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  const maskPhone = p => p ? p.slice(0, 3) + ' ' + 'XXXXX ' + p.slice(-3) : '';

  /* ---------- counters (case numbers, invoice numbers, receipts) ---------- */
  function counter(name) { const d = store.doc('counters', {}); d[name] = (d[name] || 0) + 1; store.save(); return d[name]; }
  const caseNo = () => 'GYL-' + new Date().getFullYear() + '-' + String(counter('case')).padStart(4, '0');
  const invoiceNo = () => 'INV-' + new Date().getFullYear() + '-' + String(counter('invoice')).padStart(4, '0');
  const receiptNo = () => 'RC-' + new Date().getFullYear() + '-' + String(counter('receipt')).padStart(5, '0');

  /* ---------- lawyer helpers ---------- */
  const DEFAULT_AVAIL = () => ({ slotMin: 30, days: { 1: [{ from: '10:00', to: '13:00' }, { from: '15:00', to: '18:00' }], 2: [{ from: '10:00', to: '13:00' }, { from: '15:00', to: '18:00' }], 3: [{ from: '10:00', to: '13:00' }, { from: '15:00', to: '18:00' }], 4: [{ from: '10:00', to: '13:00' }, { from: '15:00', to: '18:00' }], 5: [{ from: '10:00', to: '13:00' }, { from: '15:00', to: '18:00' }], 6: [{ from: '10:00', to: '13:00' }] }, off: [] });
  function newLawyerProfile() {
    return {
      barNo: '', council: '', enrolYear: null, areas: [], languages: ['English'], courts: [], experience: 0, bio: '', firm: '',
      fees: { chat: 300, call: 500, video: 700, in_person: 1000, hearing: null, retainer: null }, autoConfirm: true,
      office: { address: '', city: '', lat: null, lng: null }, avail: DEFAULT_AVAIL(),
      rating: 0, ratingCount: 0, casesHandled: 0, online: false, live: null, bank: null,
      approval: { status: 'draft', note: '', submitted: 0, reviewed: 0, certFile: null }
    };
  }
  const profileComplete = u => { const l = u.lawyer; return !!(u.name && l && l.areas.length && l.office.lat != null && l.experience >= 0 && l.bio && Object.values(l.fees).some(v => v != null)); };
  // may clients see this lawyer?
  function listed(u, c) {
    c = c || cfg();
    if (!u || u.role !== 'lawyer' || !u.lawyer || u.status === 'suspended' || u.hidden) return false;
    if (u.lawyer.approval.status !== 'approved') return false;
    if (c.lawyerNeedsDL && !(u.verify && u.verify.status === 'verified')) return false;
    return profileComplete(u);
  }
  const isOnline = (u, c) => !!(u.lawyer.online && u.lawyer.pingAt && Date.now() - u.lawyer.pingAt < (c || cfg()).presenceFreshMin * 60e3) || !!u.demoOnline;
  const bookedStatuses = ['awaiting_payment', 'requested', 'confirmed'];

  function slotsFor(lawyer, date, ignoreBookingId) {
    const av = lawyer.lawyer.avail || DEFAULT_AVAIL(), c = cfg();
    if (av.off && av.off.includes(date)) return [];
    const wins = (av.days && av.days[dowOf(date)]) || [], step = Math.max(10, Math.min(120, +av.slotMin || 30));
    const taken = store.filter('bookings', b => b.lawyerId === lawyer.id && b.date === date && bookedStatuses.includes(b.status) && b.id !== ignoreBookingId);
    const earliest = Date.now() + c.leadMinutes * 60e3, out = [];
    wins.forEach(w => {
      for (let m = hm(w.from); m + step <= hm(w.to); m += step) {
        const time = fromMin(m), s = istMs(date, time);
        const clash = taken.some(b => { const bs = hm(b.time), be = bs + (b.durationMin || step); return m < be && m + step > bs; });
        out.push({ time, free: !clash && s >= earliest });
      }
    });
    return out;
  }

  /* ---------- views ---------- */
  function lawyerCard(u, viewer) {
    const l = u.lawyer, c = cfg();
    const fav = viewer && (viewer.favs || []).includes(u.id);
    return {
      id: u.id, name: u.name, firm: l.firm, areas: l.areas, languages: l.languages, courts: l.courts, experience: l.experience, bio: l.bio,
      fees: l.fees, rating: l.rating, ratingCount: l.ratingCount, casesHandled: l.casesHandled, online: isOnline(u, c), verified: true,
      barNo: l.barNo, council: l.council, enrolYear: l.enrolYear, city: l.office.city, address: l.office.address,
      lat: l.office.lat, lng: l.office.lng, live: l.live && isOnline(u, c) ? l.live : null, hasPhoto: !!u.photo, photoV: u.photoV || 0,
      modes: MODES.map(m => m.id).filter(m => l.fees[m] != null), fav: !!fav, since: u.createdAt
    };
  }
  // what a lawyer may see about a client
  function clientCard(u, related) {
    return { id: u.id, name: u.name || 'Client', city: u.city || '', verified: !!(u.verify && u.verify.status === 'verified'), phone: related ? u.phone : '', phoneShown: related ? showPhone(u.phone) : '' };
  }
  function userView(u) {
    const v = {
      id: u.id, phone: u.phone, role: u.role || null, name: u.name || '', email: u.email || '', dob: u.dob || '', gender: u.gender || '', city: u.city || '', state: u.state || '', pincode: u.pincode || '',
      lang: u.lang || 'en', status: u.status, createdAt: u.createdAt, favs: u.favs || [], hasPhoto: !!u.photo, photoV: u.photoV || 0, prefs: u.prefs || {},
      verify: u.verify ? { status: u.verify.status, method: u.verify.method, at: u.verify.at, name: u.verify.name, last4: u.verify.last4, mismatch: !!u.verify.mismatch, consentUntil: u.verify.consentUntil, docs: u.verify.docs || [], note: u.verify.note || '' } : { status: 'none' },
      documents: (u.documents || []).map(d => ({ id: d.id, name: d.name, type: d.type, issuer: d.issuer, at: d.at })),
      devices: (u.devices || []).length, onboarded: !!u.onboarded
    };
    if (u.role === 'lawyer' && u.lawyer) {
      const l = u.lawyer;
      v.lawyer = Object.assign({}, l, { bank: l.bank ? { holder: l.bank.holder, ifsc: l.bank.ifsc, last4: l.bank.acc.slice(-4), upi: l.bank.upi || '' } : null, online: isOnline(u), complete: profileComplete(u), listed: listed(u) });
    }
    return v;
  }

  /* ---------- notifications ---------- */
  async function notify(userId, type, title, body, data) {
    const u = userById(userId); if (!u) return null;
    const n = store.insert('notifications', { userId, type, title: String(title).slice(0, 120), body: String(body || '').slice(0, 300), data: data || {}, read: false, t: Date.now() });
    live.emitUser(userId, 'notice', { id: n.id, type });
    const tokens = (u.devices || []).map(d => d.token);
    if (tokens.length && push.enabled() && !(u.prefs && u.prefs.push === false)) {
      push.send(tokens, { title: n.title, body: n.body, data: Object.assign({ type, id: n.id }, data || {}) }).then(dead => {
        if (dead && dead.length) { u.devices = u.devices.filter(d => !dead.includes(d.token)); store.save(); }
      }).catch(() => {});
    }
    return n;
  }
  const audit = (who, action, detail) => { store.insert('audit', { who: who || 'system', action, detail: String(detail || '').slice(0, 300), t: Date.now() }); };

  /* ---------- money ledger (rupees, integers) ---------- */
  const ledgerAdd = (lawyerId, kind, refId, amount, note) => store.insert('ledger', { lawyerId, kind, refId, amount: Math.round(amount), note: note || '', t: Date.now() });
  const balanceOf = lawyerId => store.filter('ledger', e => e.lawyerId === lawyerId).reduce((s, e) => s + e.amount, 0);
  const commission = amount => Math.round(amount * cfg().commissionPct / 100);

  function relationExists(aId, bId) {
    return !!(store.find('bookings', b => ((b.clientId === aId && b.lawyerId === bId) || (b.clientId === bId && b.lawyerId === aId)) && ['requested', 'confirmed', 'completed'].includes(b.status))
      || store.find('cases', c => (c.clientId === aId && c.lawyerId === bId) || (c.clientId === bId && c.lawyerId === aId))
      || store.find('requests', r => (r.clientId === aId && r.lawyerId === bId) || (r.clientId === bId && r.lawyerId === aId)));
  }
  // phone numbers unlock only for a confirmed booking or an open case
  function contactUnlocked(clientId, lawyerId) {
    return !!(store.find('bookings', b => b.clientId === clientId && b.lawyerId === lawyerId && ['confirmed', 'completed'].includes(b.status))
      || store.find('cases', c => c.clientId === clientId && c.lawyerId === lawyerId));
  }

  function recalcRating(lawyerId) {
    const u = userById(lawyerId); if (!u || !u.lawyer) return;
    const rs = store.filter('reviews', r => r.lawyerId === lawyerId && !r.hidden);
    u.lawyer.ratingCount = rs.length; u.lawyer.rating = rs.length ? Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 10) / 10 : 0;
    store.save();
  }

  function eraseUser(id) {
    const u = userById(id); if (!u) return;
    // keep legal/financial records (cases, payments) but detach identity; remove personal content
    store.removeWhere('notifications', n => n.userId === id);
    store.removeWhere('otps', o => o.phone === u.phone);
    store.removeWhere('messages', m => m.from === id || m.to === id);
    store.removeWhere('files', f => f.ownerId === id && !f.caseId);
    store.list('bookings').forEach(b => { if (['awaiting_payment', 'requested', 'confirmed'].includes(b.status) && (b.clientId === id || b.lawyerId === id)) { b.status = 'cancelled'; b.cancelledBy = 'system'; } });
    store.remove('users', id); store.save();
    audit('user:' + id, 'account_erased', u.phone ? maskPhone(u.phone) : '');
  }

  /* ---------- scheduled jobs (every 10 minutes, and at boot) ---------- */
  function jobs() {
    const c = cfg(), now = Date.now();
    // unpaid bookings release their slot
    store.list('bookings').forEach(b => { if (b.status === 'awaiting_payment' && now - b.created > c.payHoldMinutes * 60e3) { b.status = 'expired'; if (b.paymentId) { const p = store.get('payments', b.paymentId); if (p && p.status === 'created') p.status = 'expired'; } } });
    // open case requests expire after 10 days (urgent: 6 hours)
    store.list('requests').forEach(r => { if (r.status === 'open' && now - r.created > (r.urgency === 'urgent' ? 6 * HOUR : 10 * DAY)) { r.status = 'expired'; notify(r.clientId, 'request_expired', 'Request expired', 'Nobody picked up "' + r.title + '". You can send it again to another lawyer.', { requestId: r.id }); } });
    // appointment reminders: 1 hour before
    store.list('bookings').forEach(b => {
      if (b.status !== 'confirmed' || b.reminded) return;
      const s = istMs(b.date, b.time);
      if (s - now < HOUR && s - now > -15 * 60e3) {
        b.reminded = true;
        notify(b.clientId, 'booking_reminder', 'Appointment in under an hour', b.date + ' ' + b.time + ' · ' + modeName(b.mode), { bookingId: b.id });
        notify(b.lawyerId, 'booking_reminder', 'Appointment in under an hour', b.date + ' ' + b.time + ' · ' + modeName(b.mode), { bookingId: b.id });
      }
    });
    // hearing reminders the day before
    const tomorrow = addDays(ist().date, 1);
    store.list('cases').forEach(cs => (cs.hearings || []).forEach(h => {
      if (h.status === 'scheduled' && h.date === tomorrow && !h.reminded) {
        h.reminded = true;
        const t = 'Hearing tomorrow · ' + cs.title, b = (h.time || '') + ' ' + (h.court || cs.court || '') + (h.purpose ? ' · ' + h.purpose : '');
        notify(cs.clientId, 'hearing_reminder', t, b, { caseId: cs.id }); notify(cs.lawyerId, 'hearing_reminder', t, b, { caseId: cs.id });
      }
    }));
    // lawyers who stopped pinging go offline on the map
    store.list('users').forEach(u => { if (u.role === 'lawyer' && u.lawyer && u.lawyer.online && !isOnline(u, c) && !u.demoOnline) { u.lawyer.online = false; live.emitAll('lawyer', { id: u.id, online: false }); } });
    store.removeWhere('otps', o => o.exp < now - HOUR);
    store.save();
  }
  const modeName = id => (MODES.find(m => m.id === id) || {}).name || id;

  function migrate() { store.doc('config', DEFAULTS); store.doc('counters', {}); }

  return { cfg, setCfg, DEFAULTS, AREAS, MODES, STAGES, COURTS, LANGS, BAR_COUNCILS, ist, istMs, addDays, userById, initials, maskPhone, counter, caseNo, invoiceNo, receiptNo,
    newLawyerProfile, profileComplete, listed, isOnline, slotsFor, bookedStatuses, lawyerCard, clientCard, userView, notify, audit, ledgerAdd, balanceOf, commission,
    relationExists, contactUnlocked, recalcRating, eraseUser, jobs, migrate, modeName, hav, DEFAULT_AVAIL };
}
module.exports = { create, AREAS: AREAS, MODES, STAGES, ist, istMs };
