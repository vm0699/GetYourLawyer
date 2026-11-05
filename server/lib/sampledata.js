'use strict';
// Demo data. Everything here is fictional and flagged `demo: true`; demo people use un-loginable phones (+910000000nnn).
//   load(store, core)           admin button: 17 Chennai lawyers + 8 sample clients + some bookings, cases and reviews between them
//   populate(store, core, user) demo mode only: when a tester picks a role, give THEIR account a realistic history so every screen has content
//   clear(store)                removes everything flagged demo, and anything that references a demo person
const { newId } = require('./store');
const { makeCase } = require('./caseutil');

const D = { demo: true };
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const LAWYERS = [
  // name, firm, areas, years, langs, [chat,call,video,in_person], office, city/area, lat, lng, bio, rating, count, online
  ['Adv. Meenakshi Sundaram', 'Sundaram & Associates', ['family', 'civil'], 14, ['English', 'Tamil'], [400, 700, 900, 1500], 'Anna Nagar, near Tower Park', 'Anna Nagar', 13.0850, 80.2101, 'Family court practitioner focused on divorce, maintenance and custody, with a mediation-first approach.', 4.8, 112, true],
  ['Adv. Karthik Raman', 'Raman Law Chambers', ['criminal', 'cyber'], 11, ['English', 'Tamil', 'Hindi'], [500, 800, 1000, 2000], 'Madras High Court Campus, Parry\'s', 'High Court', 13.0878, 80.2870, 'Criminal defence, bail and anticipatory bail, and cyber crime complaints. Regular before the Sessions Court and High Court.', 4.7, 86, true],
  ['Adv. Priya Venkatesh', 'PV Property Law', ['property', 'wills'], 9, ['English', 'Tamil', 'Telugu'], [300, 600, 800, 1200], 'T. Nagar, Usman Road', 'T. Nagar', 13.0418, 80.2341, 'Title verification, sale deeds, partition suits and succession for residential and agricultural property.', 4.6, 64, true],
  ['Adv. Syed Imran', 'Imran & Partners', ['corporate', 'ip', 'tax'], 16, ['English', 'Hindi', 'Urdu'], [800, 1200, 1500, 3000], 'Nungambakkam High Road', 'Nungambakkam', 13.0569, 80.2425, 'Startup incorporation, shareholder agreements, trademarks and GST/Income Tax advisory.', 4.9, 141, true],
  ['Adv. Lakshmi Narayanan', 'LN Consumer Law', ['consumer', 'cheque', 'banking'], 8, ['English', 'Tamil'], [250, 500, 700, 1000], 'Adyar, Sardar Patel Road', 'Adyar', 13.0012, 80.2565, 'Consumer commission complaints, cheque bounce (Section 138) and banking disputes for individuals and small businesses.', 4.5, 58, true],
  ['Adv. Rajesh Kumar', 'Rajesh Kumar & Co.', ['labour', 'civil'], 13, ['English', 'Tamil'], [350, 600, 800, 1300], 'Guindy Industrial Estate', 'Guindy', 13.0067, 80.2206, 'Service matters, wrongful termination, PF/ESI and industrial disputes before the Labour Court.', 4.4, 47, false],
  ['Adv. Divya Subramanian', 'Subramanian Legal', ['family', 'criminal'], 7, ['English', 'Tamil'], [300, 500, 700, 1000], 'Mylapore, Luz Church Road', 'Mylapore', 13.0368, 80.2676, 'Domestic violence protection orders, 498A, maintenance and women\'s legal rights.', 4.7, 73, true],
  ['Adv. Arvind Menon', 'Menon Chambers', ['motor', 'civil', 'consumer'], 12, ['English', 'Malayalam', 'Tamil'], [400, 650, 850, 1400], 'Velachery Main Road', 'Velachery', 12.9815, 80.2180, 'Motor accident compensation claims, insurance disputes and recovery suits.', 4.6, 69, true],
  ['Adv. Nandini Iyer', 'Iyer & Iyer', ['constitutional', 'labour', 'civil'], 19, ['English', 'Tamil'], [900, 1400, 1800, 3500], 'Egmore, Pantheon Road', 'Egmore', 13.0732, 80.2609, 'Writ petitions before the High Court, service law and constitutional remedies.', 4.9, 157, true],
  ['Adv. Mohammed Faizal', 'Faizal Legal Aid & Advocates', ['property', 'civil', 'family'], 10, ['English', 'Tamil', 'Urdu'], [250, 450, 600, 900], 'Tambaram West', 'Tambaram', 12.9249, 80.1000, 'Property disputes, tenancy and eviction, and family settlements across South Chennai.', 4.3, 39, false],
  ['Adv. Kavitha Balasubramanian', 'KB Cyber Law', ['cyber', 'criminal', 'ip'], 6, ['English', 'Tamil'], [400, 700, 900, 1500], 'Sholinganallur, OMR', 'OMR', 12.9010, 80.2279, 'Online fraud, sextortion and harassment complaints, data protection and IT-sector disputes.', 4.6, 52, true],
  ['Adv. Gopinath Rao', 'Rao & Sons', ['wills', 'property', 'tax'], 22, ['English', 'Telugu', 'Tamil'], [600, 1000, 1300, 2500], 'Kodambakkam High Road', 'Kodambakkam', 13.0521, 80.2255, 'Wills, probate, succession certificates and estate planning for families.', 4.8, 101, true],
  ['Adv. Anitha Selvam', 'Selvam Associates', ['family', 'consumer'], 5, ['English', 'Tamil'], [200, 400, 500, 800], 'Porur, Mount-Poonamallee Road', 'Porur', 13.0382, 80.1565, 'Affordable family and consumer matters with fixed-fee consultations.', 4.2, 28, true],
  ['Adv. Vijay Anand', 'Anand Criminal Law', ['criminal'], 15, ['English', 'Tamil', 'Hindi'], [500, 800, 1100, 2200], 'Perambur, Paper Mills Road', 'Perambur', 13.1186, 80.2330, 'Trial and appellate criminal practice, bail and quashing petitions.', 4.5, 77, false],
  ['Adv. Sangeetha Prakash', 'SP Corporate Counsel', ['corporate', 'banking', 'tax'], 12, ['English', 'Hindi', 'Tamil'], [700, 1100, 1400, 2800], 'Ambattur Industrial Estate', 'Ambattur', 13.1143, 80.1548, 'MSME contracts, recovery, SARFAESI and insolvency matters for businesses.', 4.4, 44, true],
  ['Adv. Harish Chandran', 'Chandran Immigration & Law', ['immigration', 'corporate'], 8, ['English', 'Tamil', 'Malayalam'], [500, 800, 1000, 1800], 'Besant Nagar, 4th Avenue', 'Besant Nagar', 13.0002, 80.2668, 'Visa, OCI and citizenship matters, and cross-border family and business documentation.', 4.6, 36, false],
  ['Adv. Ramya Krishnan', 'Krishnan Cheque Bounce Clinic', ['cheque', 'civil', 'banking'], 9, ['English', 'Tamil'], [300, 500, 700, 1000], 'Chromepet GST Road', 'Chromepet', 12.9516, 80.1462, 'Cheque dishonour notices and complaints, recovery suits and negotiable instrument matters.', 4.5, 61, true]
];
const CLIENTS = ['Karthik Subramaniam', 'Divya Lakshmi', 'Arun Prakash', 'Nisha Fernandes', 'Rahul Venkat', 'Sneha Iyer', 'Mohammed Ashraf', 'Pooja Ramesh'];

/* ---------- helpers ---------- */
const day = (core, n) => core.addDays(core.ist().date, n);
const ago = (d, h) => Date.now() - d * 864e5 - (h || 0) * 36e5;
const demoLawyers = store => store.filter('users', u => u.demo && u.role === 'lawyer' && u.lawyer);
const byArea = (store, area, skip) => demoLawyers(store).find(l => l.lawyer.areas.includes(area) && !(skip || []).includes(l.id)) || demoLawyers(store)[0];

function ensureLawyers(store, core) {
  if (demoLawyers(store).length) return { added: 0 };
  const now = Date.now(); let n = 0;
  let reviewer = store.find('users', u => u.demo && u.phone === '+910000000900');
  if (!reviewer) reviewer = store.insert('users', { phone: '+910000000900', role: 'client', name: 'Sample Client', status: 'active', createdAt: now, tv: 0, lang: 'en', devices: [], favs: [], prefs: {}, demo: true, onboarded: true });
  LAWYERS.forEach((x, i) => {
    const [name, firm, areas, years, langs, fees, address, area, lat, lng, bio, rating, count, online] = x;
    const lp = core.newLawyerProfile();
    Object.assign(lp, { barNo: 'TN/' + (1000 + i * 37) + '/' + (2025 - years), council: 'Bar Council of Tamil Nadu & Puducherry', enrolYear: 2025 - years, areas, languages: langs, courts: ['District Court', 'High Court'], experience: years, bio, firm,
      fees: { chat: fees[0], call: fees[1], video: fees[2], in_person: fees[3], hearing: fees[3] * 3, retainer: null }, office: { address: address + ', Chennai', city: area, lat, lng }, rating, ratingCount: count, casesHandled: count * 3, online: false });
    lp.approval = { status: 'approved', note: '', submitted: now, reviewed: now, certFile: null };
    const u = store.insert('users', { phone: '+91000000' + String(100 + i).padStart(4, '0'), role: 'lawyer', name, status: 'active', createdAt: now - (i + 3) * 864e5, tv: 0, lang: 'en', devices: [], favs: [], prefs: {}, city: 'Chennai', demo: true, demoOnline: online, onboarded: true,
      verify: { status: 'verified', method: 'digilocker', at: now, name, last4: String(1000 + i * 91).slice(-4), docs: [{ name: 'Aadhaar Card', type: 'aadhaar', issuer: 'UIDAI' }] }, lawyer: lp });
    [['Great clarity and quick responses.', 5], ['Explained the process patiently.', Math.round(rating)], ['Professional and well prepared.', 4]].forEach(([text, r], k) => {
      store.insert('reviews', Object.assign({ lawyerId: u.id, clientId: reviewer.id, rating: r, text, t: now - (k + 1) * 3 * 864e5 }, D));
    });
    n++;
  });
  store.save();
  return { added: n };
}

function ensureClients(store, core) {
  const out = [];
  CLIENTS.forEach((name, i) => {
    const phone = '+91000000' + String(901 + i).padStart(4, '0');
    let u = store.find('users', x => x.phone === phone);
    if (!u) u = store.insert('users', { phone, role: 'client', name, status: 'active', createdAt: ago(20 + i), tv: 0, lang: 'en', devices: [], favs: [], prefs: {}, city: 'Chennai', demo: true, onboarded: true,
      verify: { status: 'verified', method: 'digilocker', at: ago(19), name, last4: String(2000 + i * 77).slice(-4), docs: [{ name: 'Aadhaar Card', type: 'aadhaar', issuer: 'UIDAI' }] } });
    out.push(u);
  });
  store.save();
  return out;
}

function mkBooking(store, core, o) {
  const lw = core.userById(o.lawyerId), fee = lw.lawyer.fees[o.mode] || 0, commission = core.commission(fee), created = ago(o.agoDays || 1);
  const b = store.insert('bookings', Object.assign({ clientId: o.clientId, lawyerId: o.lawyerId, mode: o.mode, date: o.date, time: o.time, durationMin: 30, fee, convenience: 0, total: fee, commission, net: fee - commission, status: o.status, note: o.note || '', topic: o.topic || '', created, reminded: false }, D));
  if (fee > 0 && o.status !== 'awaiting_payment') {
    const p = store.insert('payments', Object.assign({ kind: 'booking', refId: b.id, payerId: o.clientId, payeeId: o.lawyerId, amount: fee, status: 'paid', method: 'upi', gateway: 'mock', receipt: core.receiptNo(), t: created, paidAt: created }, D));
    b.paymentId = p.id;
    if (o.status === 'completed') { const e = core.ledgerAdd(o.lawyerId, 'booking', b.id, b.net, 'Consultation ' + o.date); e.demo = true; e.t = created; }
  }
  if (o.status === 'completed') b.completedAt = created;
  if (o.review) store.insert('reviews', Object.assign({ lawyerId: o.lawyerId, clientId: o.clientId, bookingId: b.id, rating: o.review[0], text: o.review[1], t: created + 36e5 }, D));
  return b;
}

// a free slot for this lawyer on that date (so seeded bookings do not collide with each other)
function freeTime(core, lw, date, prefer) {
  const slots = core.slotsFor(lw, date).filter(s => s.free);
  return (slots.find(s => s.time === prefer) || slots[0] || {}).time || null;
}

function mkCase(store, core, o) {
  const c = makeCase(store, core, { clientId: o.clientId, lawyerId: o.lawyerId, title: o.title, area: o.area, description: o.description, court: o.court, courtCaseNo: o.courtCaseNo || '', opposing: o.opposing || '', stage: o.stage || 'filing', agreedFee: o.agreedFee || null });
  c.demo = true; c.opened = ago(o.openedDaysAgo || 14); c.updates = [{ id: newId(), t: c.opened, by: o.lawyerId, type: 'opened', text: 'Case opened' }];
  (o.hearings || []).forEach(h => c.hearings.push({ id: newId(), date: h.date, time: h.time || '', court: h.court || o.court || '', purpose: h.purpose || '', status: h.status || 'scheduled', outcome: h.outcome || '' }));
  (o.updates || []).forEach(([text, d]) => c.updates.push({ id: newId(), t: ago(d), by: o.lawyerId, type: 'update', text }));
  (o.notes || []).forEach(text => c.notes.push({ id: newId(), t: ago(2), text }));
  if (o.file) store.insert('files', Object.assign({ ownerId: o.clientId, caseId: c.id, name: o.file, mime: 'image/png', size: 70, b64: PNG_B64, kind: 'evidence', t: ago(10) }, D));
  if (o.invoice) {
    const total = o.invoice.items.reduce((s, i) => s + i.amount, 0), inv = store.insert('invoices', Object.assign({ no: core.invoiceNo(), caseId: c.id, lawyerId: o.lawyerId, clientId: o.clientId, items: o.invoice.items, total, status: o.invoice.paid ? 'paid' : 'unpaid', due: day(core, o.invoice.paid ? -5 : 5), t: ago(o.invoice.paid ? 8 : 2) }, D));
    const p = store.insert('payments', Object.assign({ kind: 'invoice', refId: inv.id, payerId: o.clientId, payeeId: o.lawyerId, amount: total, status: o.invoice.paid ? 'paid' : 'created', method: o.invoice.paid ? 'upi' : '', gateway: 'mock', t: inv.t }, D));
    inv.paymentId = p.id;
    if (o.invoice.paid) { p.receipt = core.receiptNo(); p.paidAt = ago(6); inv.receipt = p.receipt; inv.paidAt = p.paidAt; const com = core.commission(total); p.commission = com; const e = core.ledgerAdd(o.lawyerId, 'invoice', inv.id, total - com, 'Invoice ' + inv.no); e.demo = true; e.t = p.paidAt; }
  }
  if (o.closed) { c.status = 'closed'; c.stage = 'closed'; c.outcome = o.closed; c.closed = ago(3); c.updates.push({ id: newId(), t: c.closed, by: o.lawyerId, type: 'closed', text: 'Case closed: ' + o.closed }); }
  c.rev = c.updates.length;
  store.save();
  return c;
}

const msg = (store, from, to, text, minsAgo, read) => store.insert('messages', Object.assign({ from, to, text, fileId: null, t: Date.now() - minsAgo * 60e3, read: !!read }, D));
const note = (store, userId, type, title, body, data, hoursAgo) => store.insert('notifications', Object.assign({ userId, type, title, body, data: data || {}, read: false, t: Date.now() - hoursAgo * 36e5 }, D));

/* ---------- admin button ---------- */
function load(store, core) {
  const had = demoLawyers(store).length;
  const l = ensureLawyers(store, core);
  const clients = ensureClients(store, core);
  if (!had) {            // some history between the sample people so admin lists and counters are not empty
    const ls = demoLawyers(store);
    clients.forEach((c, i) => {
      const lw = ls[(i * 2) % ls.length];
      mkBooking(store, core, { clientId: c.id, lawyerId: lw.id, mode: ['video', 'call', 'chat', 'in_person'][i % 4], date: day(core, -(3 + i)), time: '11:00', status: 'completed', agoDays: 3 + i, review: [5 - (i % 2), ['Helpful and clear.', 'Quick turnaround.', 'Very professional.'][i % 3]] });
      if (i < 4) mkCase(store, core, { clientId: c.id, lawyerId: lw.id, title: ['Partition of ancestral property', 'Cheque dishonour, Section 138', 'Wrongful termination claim', 'Consumer refund dispute'][i], area: lw.lawyer.areas[0], court: 'District Court', stage: 'hearing', hearings: [{ date: day(core, 4 + i), time: '10:30', purpose: 'Evidence' }], updates: [['Notice sent to the opposite party.', 6]], openedDaysAgo: 20, invoice: { items: [{ desc: 'Drafting and filing', amount: 4000 }], paid: i % 2 === 0 } });
    });
  }
  store.save();
  return { added: l.added, clients: clients.length, existing: had ? had : 0 };
}

/* ---------- a populated account for each tester (demo mode) ---------- */
function populateClient(store, core, me) {
  const A = byArea(store, 'family'), B = byArea(store, 'property'), C = byArea(store, 'cheque', [A.id, B.id]);
  me.favs = [A.id, B.id];
  // completed consultation the tester can still review, and a confirmed video call coming up
  mkBooking(store, core, { clientId: me.id, lawyerId: A.id, mode: 'video', date: day(core, -9), time: '11:00', status: 'completed', agoDays: 9, note: 'Initial advice on a maintenance matter.' });
  for (let k = 1; k <= 6; k++) {            // first day in the next week where this lawyer still has a free slot
    const date = day(core, k), time = freeTime(core, B, date, '11:00');
    if (time) { mkBooking(store, core, { clientId: me.id, lawyerId: B.id, mode: 'video', date, time, status: 'confirmed', agoDays: 1, note: 'Review my tenancy documents before the hearing.' }); break; }
  }
  mkCase(store, core, { clientId: me.id, lawyerId: B.id, title: 'Landlord not returning security deposit', area: 'property', court: 'District Court', courtCaseNo: 'O.S. No. 214 of 2026', opposing: 'Mr. R. Natarajan (landlord)', stage: 'hearing', openedDaysAgo: 21, agreedFee: 18000,
    description: 'Deposit of ₹2,00,000 paid under a rental agreement. The landlord has refused to return it after I vacated.',
    hearings: [{ date: day(core, -12), time: '10:30', purpose: 'First appearance', status: 'done', outcome: 'Notice issued to the opposite party.' }, { date: day(core, 6), time: '11:00', purpose: 'Written statement' }],
    updates: [['Legal notice drafted and sent by registered post.', 18], ['Plaint filed. Case number received.', 14], ['Opposite party served. Next date fixed for written statement.', 12]], notes: ['Client prefers settlement if the full deposit is returned.'], file: 'Rental agreement (sample)',
    invoice: { items: [{ desc: 'Drafting legal notice', amount: 3000 }, { desc: 'Filing and court fees', amount: 500 }], paid: false } });
  mkCase(store, core, { clientId: me.id, lawyerId: C.id, title: 'Cheque bounce notice, settled', area: 'cheque', court: 'Magistrate Court', stage: 'closed', openedDaysAgo: 50, description: 'Cheque of ₹75,000 returned unpaid. Notice sent and amount recovered.', closed: 'settled', updates: [['Legal notice sent within the statutory period.', 40], ['Opposite party paid the full amount.', 20]], invoice: { items: [{ desc: 'Notice and settlement', amount: 4500 }], paid: true } });
  msg(store, me.id, B.id, 'Hello, I uploaded the rental agreement. Can you check clause 7?', 300, true);
  msg(store, B.id, me.id, 'Thank you. I have reviewed the agreement. Clause 7 supports your claim. Please keep the payment receipts ready for our video call.', 240, false);
  note(store, me.id, 'case_update', 'Landlord not returning security deposit', 'Opposite party served. Next date fixed for written statement.', {}, 30);
  note(store, me.id, 'invoice', 'New invoice ₹3,500', 'INV · Landlord not returning security deposit', {}, 20);
}

function populateLawyer(store, core, me) {
  const cl = ensureClients(store, core), l = me.lawyer, area = (l.areas && l.areas[0]) || 'property';
  me.hidden = me.hidden || false;
  mkCase(store, core, { clientId: cl[0].id, lawyerId: me.id, title: 'Partition suit, Anna Nagar plot', area, court: 'District Court', courtCaseNo: 'O.S. No. 88 of 2026', opposing: 'Mr. K. Mohan', stage: 'evidence', openedDaysAgo: 30, agreedFee: 45000,
    description: 'Family plot to be divided among three siblings. Draft partition deed rejected by one sibling.',
    hearings: [{ date: day(core, -9), time: '10:30', purpose: 'Issues framed', status: 'done', outcome: 'Issues framed. Evidence affidavit due.' }, { date: day(core, 1), time: '10:30', purpose: 'Plaintiff evidence' }],
    updates: [['Plaint filed and numbered.', 26], ['Written statement received from the defendant.', 15], ['Issues framed by the court.', 9]], notes: ['Client open to a settlement on the eastern portion.'], file: 'Title deed (sample)', invoice: { items: [{ desc: 'Plaint drafting', amount: 8000 }, { desc: 'Court fees', amount: 2500 }], paid: false } });
  mkCase(store, core, { clientId: cl[1].id, lawyerId: me.id, title: 'Cheque dishonour, Section 138 complaint', area, court: 'Magistrate Court', stage: 'notice', openedDaysAgo: 10, agreedFee: 15000, description: 'Cheque of ₹1,20,000 returned for insufficient funds.',
    hearings: [{ date: day(core, 9), time: '11:30', purpose: 'Appearance of the accused' }], updates: [['Legal notice sent. 15 days to pay.', 7]], notes: ['Bank return memo dated 18 Oct.'] });
  mkCase(store, core, { clientId: cl[2].id, lawyerId: me.id, title: 'Consumer complaint, refund recovered', area, court: 'Consumer Commission', stage: 'closed', openedDaysAgo: 60, description: 'Defective appliance, seller refused replacement.', closed: 'won', updates: [['Complaint filed on e-Daakhil.', 50], ['Order passed in favour of the client.', 5]], invoice: { items: [{ desc: 'Complaint drafting and appearance', amount: 8000 }], paid: true } });
  const date1 = day(core, 1);
  mkBooking(store, core, { clientId: cl[3].id, lawyerId: me.id, mode: 'video', date: date1, time: '11:00', status: 'confirmed', agoDays: 1, note: 'Title verification before buying a flat.' });
  mkBooking(store, core, { clientId: cl[4].id, lawyerId: me.id, mode: 'call', date: day(core, 2), time: '15:00', status: 'requested', agoDays: 0, note: 'Neighbour boundary wall dispute.' });
  mkBooking(store, core, { clientId: cl[0].id, lawyerId: me.id, mode: 'in_person', date: day(core, -3), time: '10:00', status: 'completed', agoDays: 3, review: [5, 'Patient and very clear about the next steps.'] });
  mkBooking(store, core, { clientId: cl[1].id, lawyerId: me.id, mode: 'chat', date: day(core, -6), time: '16:00', status: 'completed', agoDays: 6, review: [4, 'Quick reply and practical advice.'] });
  store.insert('reviews', Object.assign({ lawyerId: me.id, clientId: cl[2].id, rating: 5, text: 'Won my consumer case. Highly recommend.', t: ago(5) }, D));
  core.recalcRating(me.id); l.casesHandled = 3;
  store.insert('requests', Object.assign({ clientId: cl[5].id, lawyerId: me.id, directedTo: me.id, title: 'Property title verification before purchase', area, description: 'Buying a 2BHK in Velachery. Need the title chain, encumbrance certificate and approvals checked before paying the advance.', urgency: 'normal', budget: 6000, status: 'open', created: ago(0, 3), lat: 12.98, lng: 80.22, city: 'Chennai' }, D));
  msg(store, cl[3].id, me.id, 'Good morning sir, I have the sale agreement ready. Shall I share it before our video call?', 120, false);
  msg(store, cl[3].id, me.id, 'It is a 3-page PDF from the builder.', 118, false);
  note(store, me.id, 'booking_confirmed', 'New booking confirmed', cl[3].name + ' · Video call · tomorrow 11:00', {}, 5);
  note(store, me.id, 'case_request', 'New case request', cl[5].name + ' · Property title verification before purchase', {}, 3);
  store.save();
}

function populate(store, core, me) {
  if (!me || me.seeded || me.demo || !['client', 'lawyer'].includes(me.role)) return false;
  ensureLawyers(store, core);
  if (me.role === 'client') populateClient(store, core, me); else populateLawyer(store, core, me);
  me.seeded = true; store.save();
  return true;
}

/* ---------- removal ---------- */
function clear(store) {
  const ids = new Set(store.filter('users', u => u.demo).map(u => u.id));
  let n = 0;
  ids.forEach(id => { store.remove('users', id); n++; });
  const gone = x => x.demo || ids.has(x.lawyerId) || ids.has(x.clientId) || ids.has(x.payerId) || ids.has(x.payeeId);
  ['reviews', 'bookings', 'requests', 'payments', 'invoices', 'cases', 'files', 'ledger', 'notifications'].forEach(c => store.removeWhere(c, gone));
  store.removeWhere('messages', m => m.demo || ids.has(m.from) || ids.has(m.to));
  store.list('users').forEach(u => { if (u.seeded) u.seeded = false; if (u.favs) u.favs = u.favs.filter(f => !ids.has(f)); });
  store.save();
  return { removed: n };
}
module.exports = { load, clear, populate, LAWYERS };
