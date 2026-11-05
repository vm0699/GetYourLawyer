'use strict';
// Directory + map, availability, bookings, mock payments, case requests, reviews.
const live = require('./lib/live');
const { HttpError, bad, str, num, isDay, oneOf } = require('./lib/http');
const { validLL, hav } = require('./lib/geo');
const { makeCase } = require('./lib/caseutil');

module.exports = function (R, { store, core, limiter }) {
  const needClient = u => { if (u.role !== 'client') throw new HttpError(403, 'This is for client accounts'); };
  const needLawyer = u => { if (u.role !== 'lawyer') throw new HttpError(403, 'This is for lawyer accounts'); };
  const verified = u => !!(u.verify && u.verify.status === 'verified');
  const needVerified = u => { if (core.cfg().clientVerifyRequired && !verified(u)) throw new HttpError(403, 'Please verify your identity to continue', { code: 'verify_required' }); };
  const minFee = l => { const f = Object.values(l.fees).filter(v => v != null); return f.length ? Math.min(...f) : 0; };
  const modeFee = (l, m) => l.fees[m];

  /* ================= directory + map ================= */
  R.add('GET', '/api/lawyers', { auth: 'user' }, ({ user, query }) => {
    const c = core.cfg();
    let lat = parseFloat(query.lat), lng = parseFloat(query.lng); const hasPos = validLL(lat, lng);
    if (hasPos) live.setPos(user.id, lat, lng);
    const q = str(query.q, 60).toLowerCase(), area = query.area || '', lang = query.lang || '', mode = query.mode || '';
    const maxFee = query.maxFee ? +query.maxFee : null, minRating = query.minRating ? +query.minRating : 0, radius = query.radius ? +query.radius : null;
    const areaNames = Object.fromEntries(core.AREAS.map(a => [a.id, a.name.toLowerCase()]));
    let items = store.list('users').filter(u => core.listed(u, c)).map(u => {
      const card = core.lawyerCard(u, user);
      card.distanceKm = hasPos && card.lat != null ? Math.round(hav(lat, lng, card.lat, card.lng) * 10) / 10 : null;
      card.fromFee = minFee(u.lawyer);
      return card;
    }).filter(l => {
      if (area && !l.areas.includes(area)) return false;
      if (lang && !l.languages.includes(lang)) return false;
      if (mode && l.fees[mode] == null) return false;
      if (maxFee != null && !(mode ? l.fees[mode] <= maxFee : l.fromFee <= maxFee)) return false;
      if (minRating && l.rating < minRating) return false;
      if (query.online === '1' && !l.online) return false;
      if (radius && hasPos && l.distanceKm != null && l.distanceKm > radius) return false;
      if (query.fav === '1' && !l.fav) return false;
      if (q && !(l.name.toLowerCase().includes(q) || (l.firm || '').toLowerCase().includes(q) || (l.city || '').toLowerCase().includes(q) || (l.bio || '').toLowerCase().includes(q) || l.areas.some(a => (areaNames[a] || '').includes(q)))) return false;
      return true;
    });
    const sort = query.sort || (hasPos ? 'nearest' : 'rating');
    const cmp = { nearest: (a, b) => (a.distanceKm == null) - (b.distanceKm == null) || a.distanceKm - b.distanceKm, rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount, fee: (a, b) => a.fromFee - b.fromFee, experience: (a, b) => b.experience - a.experience }[sort] || (() => 0);
    items.sort((a, b) => (b.online - a.online) * (sort === 'nearest' ? 0 : 0) || cmp(a, b));
    return { items: items.slice(0, Math.min(200, +query.limit || 100)), total: items.length };
  });

  R.add('GET', '/api/lawyers/:id', { auth: 'user' }, ({ user, params }) => {
    const u = store.get('users', params.id);
    if (!u || u.role !== 'lawyer' || (!core.listed(u) && u.id !== user.id)) throw new HttpError(404, 'Lawyer not found');
    const card = core.lawyerCard(u, user);
    const reviews = store.filter('reviews', r => r.lawyerId === u.id && !r.hidden).sort((a, b) => b.t - a.t).slice(0, 30).map(r => ({ id: r.id, rating: r.rating, text: r.text, t: r.t, name: shortName((store.get('users', r.clientId) || {}).name), reply: r.reply || '' }));
    const unlocked = user.role === 'client' && core.contactUnlocked(user.id, u.id);
    const dist = user.loc && card.lat != null ? Math.round(hav(user.loc.lat, user.loc.lng, card.lat, card.lng) * 10) / 10 : null;
    return Object.assign(card, { reviews, phone: unlocked ? u.phone : '', unlocked, distanceKm: dist, completedConsults: store.filter('bookings', b => b.lawyerId === u.id && b.status === 'completed').length });
  });
  const shortName = n => { const p = String(n || 'Client').split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };

  R.add('GET', '/api/lawyers/:id/slots', { auth: 'user' }, ({ params, query }) => {
    const u = store.get('users', params.id);
    if (!u || u.role !== 'lawyer' || !core.listed(u)) throw new HttpError(404, 'Lawyer not found');
    const start = isDay(query.date) ? query.date : core.ist().date, n = Math.max(1, Math.min(14, +query.days || 1));
    const days = []; for (let i = 0; i < n; i++) { const d = core.addDays(start, i); days.push({ date: d, slots: core.slotsFor(u, d) }); }
    return { days, slotMin: (u.lawyer.avail || {}).slotMin || 30 };
  });

  R.add('POST', '/api/favs/:id', { auth: 'user' }, ({ user, params }) => {
    const u = store.get('users', params.id); if (!u || u.role !== 'lawyer') throw new HttpError(404, 'Lawyer not found');
    user.favs = user.favs || []; const i = user.favs.indexOf(u.id);
    if (i >= 0) user.favs.splice(i, 1); else user.favs.push(u.id);
    store.save(); return { favs: user.favs };
  });

  /* ================= bookings ================= */
  function bookingView(b, viewer) {
    const isClient = viewer.id === b.clientId;
    const other = core.userById(isClient ? b.lawyerId : b.clientId);
    const unlocked = ['confirmed', 'completed'].includes(b.status);
    const pay = b.paymentId ? store.get('payments', b.paymentId) : null;
    const startMs = core.istMs(b.date, b.time), c = core.cfg();
    const o = other ? (isClient ? { id: other.id, name: other.name, firm: other.lawyer && other.lawyer.firm, areas: other.lawyer && other.lawyer.areas, hasPhoto: !!other.photo, photoV: other.photoV || 0, rating: other.lawyer && other.lawyer.rating, phone: unlocked ? other.phone : '', address: other.lawyer && other.lawyer.office.address, lat: other.lawyer && other.lawyer.office.lat, lng: other.lawyer && other.lawyer.office.lng, city: other.lawyer && other.lawyer.office.city }
      : { id: other.id, name: other.name || 'Client', city: other.city, verified: verified(other), phone: unlocked ? other.phone : '' }) : { name: 'Deleted user' };
    const v = {
      id: b.id, clientId: b.clientId, lawyerId: b.lawyerId, mode: b.mode, modeName: core.modeName(b.mode), date: b.date, time: b.time, durationMin: b.durationMin, startMs, fee: b.fee, convenience: b.convenience, total: b.total,
      status: b.status, note: b.note, topic: b.topic, created: b.created, cancelledBy: b.cancelledBy || '', refund: b.refund || 0, reviewed: !!store.find('reviews', r => r.bookingId === b.id),
      payment: pay ? { id: pay.id, status: pay.status, receipt: pay.receipt || '', method: pay.method || '' } : null, other: o,
      joinUrl: b.mode === 'video' && unlocked ? 'https://meet.jit.si/GetYourLawyer-' + b.id : '',
      canCancel: ['awaiting_payment', 'requested', 'confirmed'].includes(b.status), canReschedule: ['requested', 'confirmed'].includes(b.status) && isClient && startMs - Date.now() >= c.cancelHoursBefore * 3600e3,
      freeCancel: startMs - Date.now() >= c.cancelHoursBefore * 3600e3 || b.status !== 'confirmed'
    };
    if (!isClient) { v.commission = b.commission; v.net = b.net; }
    return v;
  }

  R.add('POST', '/api/bookings', { auth: 'user' }, ({ user, body }) => {
    needClient(user); needVerified(user);
    if (!limiter.take('book:' + user.id, 20, 3600e3)) throw new HttpError(429, 'Too many bookings. Try again later.');
    const lw = store.get('users', str(body.lawyerId, 40));
    if (!lw || !core.listed(lw)) throw new HttpError(404, 'Lawyer not available');
    const mode = oneOf(body.mode, core.MODES.map(m => m.id)); if (!mode || modeFee(lw.lawyer, mode) == null) throw bad('This lawyer does not offer that consultation type');
    const date = str(body.date, 10), time = str(body.time, 5);
    if (!isDay(date) || !/^\d{2}:\d{2}$/.test(time)) throw bad('Choose a date and time');
    if (date > core.addDays(core.ist().date, 60)) throw bad('You can book up to 60 days ahead');
    const slot = core.slotsFor(lw, date).find(s => s.time === time);
    if (!slot) throw bad('That time is not available');
    if (!slot.free) throw new HttpError(409, 'That slot was just taken. Please pick another.', { code: 'slot_taken' });
    if (store.find('bookings', b => b.clientId === user.id && b.date === date && b.time === time && core.bookedStatuses.includes(b.status))) throw new HttpError(409, 'You already have a booking at this time');
    const c = core.cfg(), fee = modeFee(lw.lawyer, mode), convenience = fee > 0 ? c.convenienceFee : 0, total = fee + convenience;
    const commission = core.commission(fee);
    const b = store.insert('bookings', { clientId: user.id, lawyerId: lw.id, mode, date, time, durationMin: (lw.lawyer.avail || {}).slotMin || 30, fee, convenience, total, commission, net: fee - commission,
      status: 'awaiting_payment', note: str(body.note, 500), topic: oneOf(body.topic, core.AREAS.map(a => a.id)) || '', created: Date.now() });
    if (total > 0) {
      const p = store.insert('payments', { kind: 'booking', refId: b.id, payerId: user.id, payeeId: lw.id, amount: total, status: 'created', gateway: 'mock', t: Date.now() });
      b.paymentId = p.id;
    } else activateBooking(b, lw);
    store.save();
    return { booking: bookingView(b, user) };
  });

  function activateBooking(b, lw) {
    b.status = lw.lawyer.autoConfirm ? 'confirmed' : 'requested';
    const cl = core.userById(b.clientId);
    core.notify(lw.id, b.status === 'confirmed' ? 'booking_confirmed' : 'booking_request', b.status === 'confirmed' ? 'New booking confirmed' : 'New booking request',
      (cl && cl.name || 'A client') + ' · ' + core.modeName(b.mode) + ' · ' + b.date + ' ' + b.time, { bookingId: b.id });
    if (b.status === 'confirmed') core.notify(b.clientId, 'booking_confirmed', 'Booking confirmed', 'With ' + lw.name + ' · ' + b.date + ' ' + b.time, { bookingId: b.id });
    live.emitUser(lw.id, 'booking', { id: b.id }); live.emitUser(b.clientId, 'booking', { id: b.id });
  }

  R.add('GET', '/api/bookings', { auth: 'user' }, ({ user, query }) => {
    const mine = store.filter('bookings', b => (user.role === 'lawyer' ? b.lawyerId : b.clientId) === user.id && b.status !== 'expired');
    const nowMs = Date.now();
    let items = mine.map(b => bookingView(b, user));
    if (query.scope === 'upcoming') items = items.filter(b => ['awaiting_payment', 'requested', 'confirmed'].includes(b.status) && b.startMs + b.durationMin * 60e3 > nowMs).sort((a, b) => a.startMs - b.startMs);
    else if (query.scope === 'past') items = items.filter(b => !(['awaiting_payment', 'requested', 'confirmed'].includes(b.status) && b.startMs + b.durationMin * 60e3 > nowMs)).sort((a, b) => b.startMs - a.startMs);
    else items.sort((a, b) => b.startMs - a.startMs);
    if (query.date) items = items.filter(b => b.date === query.date);
    return { items: items.slice(0, 300) };
  });
  const loadBooking = (user, id) => {
    const b = store.get('bookings', id); if (!b || (b.clientId !== user.id && b.lawyerId !== user.id)) throw new HttpError(404, 'Booking not found'); return b;
  };
  R.add('GET', '/api/bookings/:id', { auth: 'user' }, ({ user, params }) => ({ booking: bookingView(loadBooking(user, params.id), user) }));

  R.add('POST', '/api/bookings/:id/confirm', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const b = loadBooking(user, params.id);
    if (b.status !== 'requested') throw new HttpError(409, 'This booking cannot be confirmed now');
    b.status = 'confirmed'; store.save();
    core.notify(b.clientId, 'booking_confirmed', 'Booking confirmed', user.name + ' · ' + b.date + ' ' + b.time, { bookingId: b.id }); live.emitUser(b.clientId, 'booking', { id: b.id });
    return { booking: bookingView(b, user) };
  });

  function refund(b, why) {
    const p = b.paymentId && store.get('payments', b.paymentId);
    if (p && p.status === 'paid') { p.status = 'refunded'; p.refundedAt = Date.now(); b.refund = p.amount; }
    else if (p && p.status === 'created') p.status = 'expired';
    return b.refund || 0;
  }
  function cancelBooking(user, b, status, reason) {
    const mine = user.id === b.clientId;
    if (!['awaiting_payment', 'requested', 'confirmed'].includes(b.status)) throw new HttpError(409, 'This booking is already closed');
    const startMs = core.istMs(b.date, b.time), late = b.status === 'confirmed' && startMs - Date.now() < core.cfg().cancelHoursBefore * 3600e3;
    if (!mine || !late) refund(b); // the lawyer cancelling, or the client cancelling in time: money back
    b.status = status; b.cancelledBy = mine ? 'client' : 'lawyer'; b.cancelReason = reason; store.save();
    const other = mine ? b.lawyerId : b.clientId;
    core.notify(other, 'booking_cancelled', status === 'declined' ? 'Booking declined' : 'Booking cancelled', user.name + ' · ' + b.date + ' ' + b.time + (reason ? ' · ' + reason : ''), { bookingId: b.id });
    live.emitUser(other, 'booking', { id: b.id }); live.emitUser(user.id, 'booking', { id: b.id });
  }
  R.add('POST', '/api/bookings/:id/cancel', { auth: 'user' }, ({ user, params, body }) => { const b = loadBooking(user, params.id); cancelBooking(user, b, 'cancelled', str(body.reason, 200)); return { booking: bookingView(b, user) }; });
  R.add('POST', '/api/bookings/:id/decline', { auth: 'user' }, ({ user, params, body }) => { needLawyer(user); const b = loadBooking(user, params.id); if (b.status !== 'requested') throw new HttpError(409, 'Only pending requests can be declined'); cancelBooking(user, b, 'declined', str(body.reason, 200)); return { booking: bookingView(b, user) }; });

  R.add('POST', '/api/bookings/:id/reschedule', { auth: 'user' }, ({ user, params, body }) => {
    needClient(user); const b = loadBooking(user, params.id);
    if (!['requested', 'confirmed'].includes(b.status)) throw new HttpError(409, 'This booking cannot be moved');
    if (core.istMs(b.date, b.time) - Date.now() < core.cfg().cancelHoursBefore * 3600e3) throw new HttpError(409, 'Too close to the appointment to move it');
    const date = str(body.date, 10), time = str(body.time, 5), lw = core.userById(b.lawyerId);
    if (!isDay(date) || !/^\d{2}:\d{2}$/.test(time)) throw bad('Choose a date and time');
    const slot = core.slotsFor(lw, date, b.id).find(s => s.time === time);
    if (!slot || !slot.free) throw new HttpError(409, 'That slot is not available', { code: 'slot_taken' });
    b.date = date; b.time = time; b.reminded = false; if (b.status === 'confirmed' && !lw.lawyer.autoConfirm) b.status = 'requested'; store.save();
    core.notify(lw.id, 'booking_moved', 'Booking rescheduled', user.name + ' moved to ' + date + ' ' + time, { bookingId: b.id }); live.emitUser(lw.id, 'booking', { id: b.id });
    return { booking: bookingView(b, user) };
  });

  R.add('POST', '/api/bookings/:id/complete', { auth: 'user' }, ({ user, params }) => {
    needLawyer(user); const b = loadBooking(user, params.id);
    if (b.status !== 'confirmed') throw new HttpError(409, 'Only confirmed bookings can be completed');
    if (core.istMs(b.date, b.time) > Date.now() + 10 * 60e3) throw new HttpError(409, 'You can complete this once the session has started');
    b.status = 'completed'; b.completedAt = Date.now();
    if (b.net > 0) core.ledgerAdd(b.lawyerId, 'booking', b.id, b.net, 'Consultation ' + b.date);
    store.save();
    core.notify(b.clientId, 'booking_completed', 'Consultation completed', 'How was it with ' + user.name + '? Leave a review.', { bookingId: b.id });
    live.emitUser(b.clientId, 'booking', { id: b.id });
    return { booking: bookingView(b, user) };
  });

  /* ================= mock payments ================= */
  const payView = (p, user) => {
    const other = core.userById(user.id === p.payerId ? p.payeeId : p.payerId);
    return { id: p.id, kind: p.kind, refId: p.refId, amount: p.amount, status: p.status, method: p.method || '', receipt: p.receipt || '', t: p.t, paidAt: p.paidAt || 0, refundedAt: p.refundedAt || 0, other: other ? other.name : '', gateway: p.gateway, failReason: p.failReason || '' };
  };
  R.add('GET', '/api/payments', { auth: 'user' }, ({ user }) => ({ items: store.filter('payments', p => (p.payerId === user.id || p.payeeId === user.id) && p.status !== 'created' && p.status !== 'expired').sort((a, b) => b.t - a.t).slice(0, 200).map(p => payView(p, user)) }));
  R.add('GET', '/api/payments/:id', { auth: 'user' }, ({ user, params }) => {
    const p = store.get('payments', params.id); if (!p || (p.payerId !== user.id && p.payeeId !== user.id)) throw new HttpError(404, 'Payment not found');
    return { payment: payView(p, user), booking: p.kind === 'booking' ? bookingView(store.get('bookings', p.refId), user) : null };
  });

  // Demo gateway. Rules: UPI id ending "@fail" or a card ending 0002 is declined; everything else succeeds.
  R.add('POST', '/api/payments/:id/pay', { auth: 'user' }, ({ user, params, body }) => {
    const p = store.get('payments', params.id); if (!p || p.payerId !== user.id) throw new HttpError(404, 'Payment not found');
    if (p.status === 'paid') return { payment: payView(p, user), booking: p.kind === 'booking' ? bookingView(store.get('bookings', p.refId), user) : null };
    if (p.status !== 'created' && p.status !== 'failed') throw new HttpError(409, 'This payment can no longer be paid');
    const method = oneOf(body.method, ['upi', 'card', 'netbanking', 'wallet']); if (!method) throw bad('Choose a payment method');
    let b = null, inv = null;
    if (p.kind === 'booking') { b = store.get('bookings', p.refId); if (!b || b.status !== 'awaiting_payment') { p.status = 'expired'; store.save(); throw new HttpError(409, 'This booking has expired. Please book again.'); } }
    if (p.kind === 'invoice') { inv = store.get('invoices', p.refId); if (!inv || inv.status !== 'unpaid') throw new HttpError(409, 'This invoice is not payable'); }
    const vpa = str(body.vpa, 60).toLowerCase(), card = str(body.card, 24).replace(/\D/g, '');
    if (method === 'upi' && !/^[a-z0-9._-]{2,}@[a-z]{2,}$/.test(vpa)) throw bad('Enter a valid UPI ID, like name@bank');
    if (method === 'card' && card.length < 15) throw bad('Enter a valid card number');
    const decline = (method === 'upi' && vpa.endsWith('@fail')) || (method === 'card' && card.endsWith('0002'));
    p.method = method; p.attempts = (p.attempts || 0) + 1;
    if (decline) { p.status = 'failed'; p.failReason = 'Declined by the bank (demo)'; store.save(); throw new HttpError(402, 'Payment declined. Try another method.', { payment: payView(p, user) }); }
    p.status = 'paid'; p.paidAt = Date.now(); p.receipt = core.receiptNo(); p.gatewayRef = 'mock_' + Math.random().toString(36).slice(2, 12);
    if (b) { const lw = core.userById(b.lawyerId); activateBooking(b, lw); }
    if (inv) {
      inv.status = 'paid'; inv.paidAt = Date.now(); inv.receipt = p.receipt; inv.paymentId = p.id;
      const com = core.commission(inv.total); p.commission = com;
      core.ledgerAdd(inv.lawyerId, 'invoice', inv.id, inv.total - com, 'Invoice ' + inv.no);
      core.notify(inv.lawyerId, 'invoice_paid', 'Invoice paid', inv.no + ' · ₹' + inv.total, { caseId: inv.caseId, invoiceId: inv.id });
      live.emitUser(inv.lawyerId, 'case', { id: inv.caseId }); live.emitUser(inv.clientId, 'case', { id: inv.caseId });
    }
    store.save();
    return { payment: payView(p, user), booking: b ? bookingView(b, user) : null };
  });

  /* ================= case requests (registering with a lawyer) ================= */
  function requestView(r, viewer) {
    const cl = core.userById(r.clientId), lw = r.lawyerId && core.userById(r.lawyerId);
    return { id: r.id, title: r.title, area: r.area, description: r.description, urgency: r.urgency, budget: r.budget, status: r.status, created: r.created, caseId: r.caseId || null, city: r.city || '',
      directed: !!r.directedTo, client: cl ? core.clientCard(cl, r.status === 'accepted') : { name: 'Client' }, lawyer: lw ? { id: lw.id, name: lw.name, firm: lw.lawyer && lw.lawyer.firm, hasPhoto: !!lw.photo, photoV: lw.photoV || 0, rating: lw.lawyer && lw.lawyer.rating } : null,
      distanceKm: viewer && viewer.role === 'lawyer' && r.lat != null && viewer.lawyer.office.lat != null ? Math.round(hav(r.lat, r.lng, viewer.lawyer.office.lat, viewer.lawyer.office.lng) * 10) / 10 : null };
  }

  R.add('POST', '/api/requests', { auth: 'user' }, ({ user, body }) => {
    needClient(user); needVerified(user);
    if (!limiter.take('req:' + user.id, 15, 3600e3)) throw new HttpError(429, 'Too many requests. Try again later.');
    const title = str(body.title, 100), description = str(body.description, 2000);
    if (title.length < 4) throw bad('Give your case a short title'); if (description.length < 10) throw bad('Describe what happened in a few sentences');
    const area = oneOf(body.area, core.AREAS.map(a => a.id)); if (!area) throw bad('Choose a practice area');
    const urgency = body.urgency === 'urgent' ? 'urgent' : 'normal';
    const lat = parseFloat(body.lat), lng = parseFloat(body.lng), pos = validLL(lat, lng) ? { lat, lng } : (user.loc ? { lat: user.loc.lat, lng: user.loc.lng } : { lat: null, lng: null });
    let directed = null;
    if (body.lawyerId) { directed = store.get('users', str(body.lawyerId, 40)); if (!directed || !core.listed(directed)) throw new HttpError(404, 'Lawyer not available'); }
    if (directed && store.find('requests', r => r.clientId === user.id && r.lawyerId === directed.id && r.status === 'open')) throw new HttpError(409, 'You already have an open request with this lawyer');
    const r = store.insert('requests', { clientId: user.id, lawyerId: directed ? directed.id : null, directedTo: directed ? directed.id : null, title, area, description, urgency, budget: Math.max(0, Math.min(1e7, +body.budget || 0)), status: 'open', created: Date.now(), lat: pos.lat, lng: pos.lng, city: user.city || '' });
    // alert the lawyer, or the best-matching lawyers when it is an open request
    if (directed) {
      core.notify(directed.id, 'case_request', (urgency === 'urgent' ? 'Urgent case request' : 'New case request'), user.name + ' · ' + title, { requestId: r.id });
      live.emitUser(directed.id, 'request', { id: r.id });
    } else {
      const c = core.cfg(), radius = urgency === 'urgent' ? c.urgentRadiusKm : c.defaultRadiusKm * 2;
      const cands = store.list('users').filter(u => core.listed(u, c) && u.lawyer.areas.includes(area) && (urgency !== 'urgent' || core.isOnline(u, c)))
        .map(u => ({ u, km: pos.lat != null && u.lawyer.office.lat != null ? hav(pos.lat, pos.lng, u.lawyer.office.lat, u.lawyer.office.lng) : 0 })).filter(x => x.km <= radius).sort((a, b) => a.km - b.km).slice(0, 12);
      cands.forEach(x => { core.notify(x.u.id, 'case_request', urgency === 'urgent' ? 'Urgent: client needs a ' + area + ' lawyer' : 'New open case request', title + (x.km ? ' · ' + (Math.round(x.km * 10) / 10) + ' km away' : ''), { requestId: r.id }); live.emitUser(x.u.id, 'request', { id: r.id }); });
      r.alerted = cands.length;
    }
    store.save();
    return { request: Object.assign(requestView(r, user), { alerted: r.alerted || 0 }) };
  });

  R.add('GET', '/api/requests', { auth: 'user' }, ({ user, query }) => {
    let items;
    if (user.role === 'client') items = store.filter('requests', r => r.clientId === user.id);
    else {
      const l = user.lawyer;
      items = store.filter('requests', r => r.lawyerId === user.id || (!r.lawyerId && r.status === 'open' && l.areas.includes(r.area) && !(r.declinedBy || []).includes(user.id)
        && (r.lat == null || l.office.lat == null || hav(r.lat, r.lng, l.office.lat, l.office.lng) <= core.cfg().defaultRadiusKm * 2)));
    }
    if (query.status) items = items.filter(r => r.status === query.status);
    return { items: items.sort((a, b) => b.created - a.created).slice(0, 100).map(r => requestView(r, user)) };
  });

  R.add('POST', '/api/requests/:id/accept', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const r = store.get('requests', params.id);
    if (!r || (r.lawyerId && r.lawyerId !== user.id)) throw new HttpError(404, 'Request not found');
    if (r.status !== 'open') throw new HttpError(409, r.status === 'accepted' ? 'Another lawyer has already taken this request' : 'This request is closed');
    if (!core.listed(user)) throw new HttpError(403, 'Your profile must be approved before you can accept cases');
    r.lawyerId = user.id; r.status = 'accepted'; r.acceptedAt = Date.now();
    const c = makeCase(store, core, { clientId: r.clientId, lawyerId: user.id, title: r.title, area: r.area, description: r.description, requestId: r.id, court: str(body.court, 80), agreedFee: num(body.agreedFee, 0, 1e8) });
    r.caseId = c.id; store.save();
    core.notify(r.clientId, 'case_accepted', 'Your case was accepted', user.name + ' will handle "' + r.title + '". Track it in Cases.', { caseId: c.id, requestId: r.id });
    live.emitUser(r.clientId, 'case', { id: c.id }); live.emitUser(r.clientId, 'request', { id: r.id });
    // other lawyers alerted about an open request: tell them it is gone
    return { request: requestView(r, user), caseId: c.id };
  });
  R.add('POST', '/api/requests/:id/decline', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const r = store.get('requests', params.id);
    if (!r) throw new HttpError(404, 'Request not found');
    if (r.lawyerId === user.id && r.status === 'open') {
      r.status = 'declined'; r.declineNote = str(body.reason, 200); store.save();
      core.notify(r.clientId, 'case_declined', 'Request declined', user.name + ' cannot take "' + r.title + '". Try another lawyer.', { requestId: r.id });
      live.emitUser(r.clientId, 'request', { id: r.id });
    } else if (!r.lawyerId) { r.declinedBy = (r.declinedBy || []).concat(user.id); store.save(); }
    else throw new HttpError(404, 'Request not found');
    return { ok: true };
  });
  R.add('POST', '/api/requests/:id/withdraw', { auth: 'user' }, ({ user, params }) => {
    const r = store.get('requests', params.id); if (!r || r.clientId !== user.id) throw new HttpError(404, 'Request not found');
    if (r.status !== 'open') throw new HttpError(409, 'This request can no longer be withdrawn');
    r.status = 'withdrawn'; store.save(); return { ok: true };
  });

  /* ================= reviews ================= */
  R.add('POST', '/api/reviews', { auth: 'user' }, ({ user, body }) => {
    needClient(user);
    const rating = Math.round(+body.rating); if (!(rating >= 1 && rating <= 5)) throw bad('Choose 1 to 5 stars');
    const text = str(body.text, 600);
    let lawyerId, ref = {};
    if (body.bookingId) {
      const b = store.get('bookings', str(body.bookingId, 40)); if (!b || b.clientId !== user.id || b.status !== 'completed') throw new HttpError(409, 'You can review a completed consultation');
      if (store.find('reviews', r => r.bookingId === b.id)) throw new HttpError(409, 'You already reviewed this'); lawyerId = b.lawyerId; ref = { bookingId: b.id };
    } else if (body.caseId) {
      const c = store.get('cases', str(body.caseId, 40)); if (!c || c.clientId !== user.id || c.status !== 'closed') throw new HttpError(409, 'You can review a closed case');
      if (store.find('reviews', r => r.caseId === c.id)) throw new HttpError(409, 'You already reviewed this'); lawyerId = c.lawyerId; ref = { caseId: c.id };
    } else throw bad('Nothing to review');
    const rv = store.insert('reviews', Object.assign({ lawyerId, clientId: user.id, rating, text, t: Date.now() }, ref));
    core.recalcRating(lawyerId);
    core.notify(lawyerId, 'review', 'New review: ' + '★'.repeat(rating), text.slice(0, 100) || 'A client rated you ' + rating + '/5', { reviewId: rv.id });
    live.emitAll('lawyer', { id: lawyerId, rating: core.userById(lawyerId).lawyer.rating });
    return { ok: true };
  });
  R.add('POST', '/api/reviews/:id/reply', { auth: 'user' }, ({ user, params, body }) => {
    needLawyer(user); const r = store.get('reviews', params.id); if (!r || r.lawyerId !== user.id) throw new HttpError(404, 'Review not found');
    r.reply = str(body.text, 400); store.save(); return { ok: true };
  });

  R.bookingView = bookingView;
};
