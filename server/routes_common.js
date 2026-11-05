'use strict';
// Messaging between a client and a lawyer they have a relationship with (booking, request or case).
const live = require('./lib/live');
const { HttpError, bad, str } = require('./lib/http');

module.exports = function (R, { store, core, limiter }) {
  const msgView = m => {
    const f = m.fileId && store.get('files', m.fileId);
    return { id: m.id, from: m.from, to: m.to, text: m.text, t: m.t, read: !!m.read, file: f ? { id: f.id, name: f.name, mime: f.mime, size: f.size } : null };
  };
  const partnerCard = (id, me) => {
    const u = core.userById(id); if (!u) return { id, name: 'Deleted user', role: '' };
    const base = { id: u.id, name: u.name || (u.role === 'lawyer' ? 'Lawyer' : 'Client'), role: u.role, hasPhoto: !!u.photo, photoV: u.photoV || 0 };
    if (u.role === 'lawyer') Object.assign(base, { online: core.isOnline(u), firm: u.lawyer.firm });
    return base;
  };
  function canMessage(user, other) {
    if (!other || other.id === user.id || other.status === 'suspended') return false;
    if (user.role === other.role || !user.role || !other.role) return false;
    if (core.relationExists(user.id, other.id)) return true;
    // a client may ask a listed lawyer a first question (max 3 messages until the lawyer replies)
    if (user.role === 'client' && core.listed(other)) {
      const sent = store.filter('messages', m => m.from === user.id && m.to === other.id).length, replied = store.find('messages', m => m.from === other.id && m.to === user.id);
      return replied || sent < 3;
    }
    return false;
  }

  R.add('GET', '/api/conversations', { auth: 'user' }, ({ user }) => {
    const by = new Map();
    store.filter('messages', m => m.from === user.id || m.to === user.id).forEach(m => {
      const pid = m.from === user.id ? m.to : m.from, e = by.get(pid) || { last: null, unread: 0 };
      if (!e.last || m.t > e.last.t) e.last = m; if (m.to === user.id && !m.read) e.unread++; by.set(pid, e);
    });
    // people you can talk to but have not messaged yet (confirmed bookings / cases)
    const rel = new Set();
    store.filter('cases', c => c.clientId === user.id || c.lawyerId === user.id).forEach(c => rel.add(c.clientId === user.id ? c.lawyerId : c.clientId));
    store.filter('bookings', b => (b.clientId === user.id || b.lawyerId === user.id) && ['requested', 'confirmed', 'completed'].includes(b.status)).forEach(b => rel.add(b.clientId === user.id ? b.lawyerId : b.clientId));
    rel.forEach(id => { if (!by.has(id)) by.set(id, { last: null, unread: 0 }); });
    const items = [...by.entries()].map(([id, e]) => ({ with: partnerCard(id, user), last: e.last ? msgView(e.last) : null, unread: e.unread })).filter(x => x.with.role)
      .sort((a, b) => ((b.last && b.last.t) || 0) - ((a.last && a.last.t) || 0));
    return { items, unread: items.reduce((s, x) => s + x.unread, 0) };
  });

  R.add('GET', '/api/messages', { auth: 'user' }, ({ user, query }) => {
    const other = core.userById(String(query.with || '')); if (!other) throw new HttpError(404, 'Conversation not found');
    const since = +query.since || 0;
    let items = store.filter('messages', m => ((m.from === user.id && m.to === other.id) || (m.from === other.id && m.to === user.id)) && m.t > since).sort((a, b) => a.t - b.t);
    if (!since) items = items.slice(-100);
    let changed = false;
    items.forEach(m => { if (m.to === user.id && !m.read) { m.read = true; changed = true; } });
    if (changed) { store.save(); live.emitUser(other.id, 'read', { by: user.id }); }
    return { with: partnerCard(other.id, user), items: items.map(msgView), canSend: canMessage(user, other) };
  });

  R.add('POST', '/api/messages', { auth: 'user', maxBody: 1.6 * 1024 * 1024 }, ({ user, body }) => {
    if (!limiter.take('msg:' + user.id, 40, 60e3)) throw new HttpError(429, 'You are sending messages too fast');
    const other = core.userById(str(body.to, 40)); if (!canMessage(user, other)) throw new HttpError(403, 'You can message a lawyer after booking, registering a case, or for a first question. Clients and lawyers only.');
    const text = str(body.text, 2000); let fileId = null;
    if (body.file) {
      const f = R.parseFile(body.file); if (!f || f.size > 1.1e6) throw bad('Attach a PDF or image under 1 MB');
      fileId = store.insert('files', { ownerId: user.id, msgTo: other.id, name: str(body.fileName, 80).replace(/[\\/:*?"<>|]/g, '_') || 'attachment', mime: f.mime, size: f.size, b64: f.b64, kind: 'chat', t: Date.now() }).id;
    }
    if (!text && !fileId) throw bad('Write a message');
    const m = store.insert('messages', { from: user.id, to: other.id, text, fileId, t: Date.now(), read: false });
    store.save();
    const v = msgView(m);
    live.emitUser(other.id, 'msg', v); live.emitUser(user.id, 'msg', v);
    // a push only when the other person has no open stream
    core.notify(other.id, 'message', user.name || 'New message', text ? text.slice(0, 120) : 'Sent an attachment', { from: user.id });
    return { message: v };
  });

  R.add('POST', '/api/messages/typing', { auth: 'user' }, ({ user, body }) => {
    const other = core.userById(str(body.to, 40)); if (other && limiter.take('typing:' + user.id, 60, 60e3)) live.emitUser(other.id, 'typing', { from: user.id });
    return { ok: true };
  });
};
