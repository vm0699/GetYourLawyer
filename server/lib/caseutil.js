'use strict';
// Creating and describing cases, shared by the client and lawyer routes.
const { newId } = require('./store');

function makeCase(store, core, d) {
  const now = Date.now();
  const c = store.insert('cases', {
    no: core.caseNo(), clientId: d.clientId, lawyerId: d.lawyerId, title: d.title, area: d.area || '', description: d.description || '', court: d.court || '', courtCaseNo: d.courtCaseNo || '',
    opposing: d.opposing || '', stage: d.stage || 'consultation', status: 'open', outcome: '', opened: now, closed: 0, requestId: d.requestId || null,
    hearings: [], updates: [{ id: newId(), t: now, by: d.lawyerId, type: 'opened', text: 'Case opened' }], notes: [], agreedFee: d.agreedFee || null, rev: 1
  });
  const l = core.userById(d.lawyerId); if (l && l.lawyer) { l.lawyer.casesHandled = (l.lawyer.casesHandled || 0) + 1; }
  store.save();
  return c;
}

const nextHearing = c => (c.hearings || []).filter(h => h.status === 'scheduled').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;

// viewer 'client' never sees private notes
function caseView(store, core, c, viewerId) {
  const isLawyer = viewerId === c.lawyerId;
  const cl = core.userById(c.clientId), lw = core.userById(c.lawyerId);
  const nh = nextHearing(c);
  const unlocked = true; // a case is a confirmed relationship: contact details are shared
  const files = store.filter('files', f => f.caseId === c.id).map(f => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, kind: f.kind, by: f.ownerId, t: f.t, private: !!f.private })).filter(f => isLawyer || !f.private);
  const invoices = store.filter('invoices', i => i.caseId === c.id && i.status !== 'void').sort((a, b) => b.t - a.t);
  return {
    id: c.id, no: c.no, title: c.title, area: c.area, description: c.description, court: c.court, courtCaseNo: c.courtCaseNo, opposing: c.opposing, stage: c.stage, status: c.status, outcome: c.outcome,
    opened: c.opened, closed: c.closed, agreedFee: c.agreedFee, rev: c.rev, hearings: (c.hearings || []).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))), nextHearing: nh,
    updates: (c.updates || []).slice().sort((a, b) => b.t - a.t), notes: isLawyer ? (c.notes || []).slice().sort((a, b) => b.t - a.t) : undefined, files, invoices: invoices.map(i => invoiceView(i)),
    client: cl ? core.clientCard(cl, unlocked) : { id: c.clientId, name: 'Former client' }, lawyer: lw ? { id: lw.id, name: lw.name, firm: lw.lawyer && lw.lawyer.firm, areas: lw.lawyer && lw.lawyer.areas, rating: lw.lawyer && lw.lawyer.rating, hasPhoto: !!lw.photo, photoV: lw.photoV || 0, phone: lw.phone, city: lw.lawyer && lw.lawyer.office.city } : { id: c.lawyerId, name: 'Former lawyer' },
    reviewed: !!store.find('reviews', r => r.caseId === c.id)
  };
}
const invoiceView = i => ({ id: i.id, no: i.no, caseId: i.caseId, items: i.items, total: i.total, status: i.status, due: i.due, t: i.t, paidAt: i.paidAt || 0, paymentId: i.paymentId || null, receipt: i.receipt || '' });

module.exports = { makeCase, caseView, invoiceView, nextHearing };
