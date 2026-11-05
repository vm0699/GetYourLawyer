'use strict';
/* Messages (client <-> lawyer, live) and the rule-based legal-help assistant. */

/* ================= CONVERSATIONS ================= */
SCREENS.messages = {
  title: 'Messages',
  load() { return API.get('/api/conversations'); },
  render(p, d) {
    let h = '<div class="bar big"><h1>' + esc(t('Messages')) + '</h1></div><div class="page" style="padding-top:6px">';
    if (!d) return h + skel(4) + '</div>';
    if (!d.items.length) return h + empty('chat', 'No conversations yet', isLawyer() ? 'When a client books you or sends a request you can chat here.' : 'Message a lawyer from their profile, or after you book.', isLawyer() ? '' : '<button class="btn mt" data-act="tosearch">Find a lawyer</button>') + '</div>';
    return h + '<div class="card" style="padding:2px 14px">' + d.items.map(c => '<div class="item" data-act="msg" data-id="' + c.with.id + '">' + avatar(c.with) + '<div class="sp" style="min-width:0"><div class="row"><span class="t sp" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.with.name) + '</span><span class="tiny muted">' + (c.last ? ago(c.last.t) : '') + '</span></div><div class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (c.unread ? 'color:var(--fg);font-weight:700' : '') + '">' + (c.last ? (c.last.from === S.me.id ? 'You: ' : '') + esc(c.last.text || (c.last.file ? '📎 ' + c.last.file.name : '')) : 'Say hello') + '</div></div>' + (c.unread ? '<span class="pill fill">' + c.unread + '</span>' : '') + '</div>').join('') + '</div></div>';
  }
};

/* ================= THREAD ================= */
const Thread = { id: null, last: 0, typingT: 0 };
const bubble = m => '<div class="bub ' + (m.from === S.me.id ? 'me' : '') + (m.file ? ' file' : '') + '" data-mid="' + m.id + '"' + (m.file ? ' data-act="dlfile" data-id="' + m.file.id + '" data-name="' + esc(m.file.name) + '"' : '') + '>' + (m.file ? I('file') + '<div style="min-width:0"><div class="b" style="overflow:hidden;text-overflow:ellipsis">' + esc(m.file.name) + '</div><div class="tiny" style="opacity:.7">' + Math.round(m.file.size / 1024) + ' KB</div></div>' : '') + (m.text ? esc(m.text) : '') + '<small>' + hhmm(m.t) + (m.from === S.me.id ? ' <span class="ticks">' + (m.read ? '✓✓' : '✓') + '</span>' : '') + '</small></div>';
function threadHTML(items) {
  let out = '', day = '';
  items.forEach(m => { const d = new Date(m.t + 330 * 60e3).toISOString().slice(0, 10); if (d !== day) { day = d; out += '<div class="c tiny muted" style="padding:8px">' + fmtDate(d) + '</div>'; } out += bubble(m); });
  return out || '<div class="empty" style="margin:auto">' + I('chat') + '<b>Start the conversation</b>Messages are private between you and this ' + (isLawyer() ? 'client' : 'lawyer') + '.</div>';
}
SCREENS.thread = {
  title: 'Chat', bare: true,
  load(p) { return API.get('/api/messages?with=' + p.id); },
  render(p, d) {
    if (!d) return topbar('Chat') + skel(3);
    const w = d.with;
    return '<div class="chat" style="height:calc(100vh - var(--sat))"><div class="bar" style="border-bottom:1px solid var(--line)"><button class="iconbtn" data-act="back" aria-label="Back">' + I('back') + '</button>' + avatar(w, 'sm') + '<div class="sp" style="min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(w.name) + '</div><div class="tiny muted" id="tstat">' + (w.role === 'lawyer' ? (w.online ? 'Online' : 'Offline') : 'Client') + '</div></div>' + (w.role === 'lawyer' ? '<button class="iconbtn" data-act="lawyer" data-id="' + w.id + '" aria-label="Profile">' + I('user') + '</button>' : '') + '</div>' +
      '<div class="msgs" id="msgs">' + threadHTML(d.items) + '</div><div class="typing" id="typing"></div>' +
      (d.canSend ? '<div class="composer"><button class="iconbtn" data-act="tattach" aria-label="Attach">' + I('upload') + '</button><textarea id="tin" rows="1" placeholder="' + esc(t('Type a message')) + '" maxlength="2000"></textarea><button class="iconbtn send" data-act="tsend" aria-label="Send">' + I('send') + '</button></div>' : '<div class="composer"><div class="small muted c sp" style="padding:10px">You can message after a booking or case, or for a first question.</div></div>') + '</div>';
  },
  mount(el, p, d) {
    Thread.id = p.id; Thread.last = d && d.items.length ? d.items[d.items.length - 1].t : 0;
    const m = $('#msgs', el); if (m) m.scrollTop = m.scrollHeight;
    const i = $('#tin', el); if (i) { i.oninput = () => { i.style.height = 'auto'; i.style.height = Math.min(120, i.scrollHeight) + 'px'; if (Date.now() - Thread.typingT > 2500) { Thread.typingT = Date.now(); API.post('/api/messages/typing', { to: p.id }).catch(() => {}); } }; i.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); ACT.tsend($('[data-act=tsend]')); } }; }
    App.syncCounts();
  }
};
ACT.tsend = el => busy(el, async () => {
  const f = Nav.top(), i = $('#tin'), text = i.value.trim(); if (!text) return; i.value = ''; i.style.height = 'auto';
  try { const r = await API.post('/api/messages', { to: f.params.id, text }); addMsg(r.message); } catch (e) { i.value = text; throw e; }
});
ACT.tattach = async () => {
  try {
    const file = await pickFile(); if (!file) return; const data = await fileToDataURL(file, { maxBytes: 1.0e6, maxDim: 1400 });
    const r = await API.post('/api/messages', { to: Nav.top().params.id, file: data, fileName: file.name.replace(/\.[^.]+$/, ''), text: '' }); addMsg(r.message);
  } catch (e) { fail(e); }
};
function addMsg(m) {
  const box = $('#msgs'); if (!box || Thread.id !== (m.from === S.me.id ? m.to : m.from)) return;
  if (box.querySelector('[data-mid="' + m.id + '"]')) return;
  const empty = box.querySelector('.empty'); if (empty) empty.remove();
  box.insertAdjacentHTML('beforeend', bubble(m)); box.scrollTop = box.scrollHeight;
}
Live.sub('msg', m => {
  const f = Nav.top(); if (!f) return;
  if (f.name === 'thread' && (m.from === f.params.id || m.to === f.params.id)) { addMsg(m); if (m.from !== S.me.id) API.get('/api/messages?with=' + f.params.id + '&since=' + (m.t - 1)).catch(() => {}); $('#typing') && ($('#typing').textContent = ''); return; }
  if (m.from !== S.me.id) { S.convUnread++; renderTabs(SCREENS[f.name]); if (f.name === 'messages') Nav.refresh(true); }
});
Live.sub('typing', c => { const f = Nav.top(); if (f && f.name === 'thread' && f.params.id === c.from) { const e = $('#typing'); if (e) { e.textContent = 'typing…'; clearTimeout(Thread.tt); Thread.tt = setTimeout(() => { e.textContent = ''; }, 3000); } } });
Live.sub('read', c => { const f = Nav.top(); if (f && f.name === 'thread' && f.params.id === c.by) $$('.bub.me .ticks').forEach(t => { t.textContent = '✓✓'; }); });
Live.sub('notice', n => {
  S.unread++; App.syncCounts();
  API.get('/api/notifications').then(r => { const x = r.items[0]; if (x && n.id === x.id && !(x.type === 'message' && Nav.is('thread'))) toast(x.title + (x.body ? ' · ' + x.body : ''), { onTap: () => openNotice(x), ms: 4500 }); }).catch(() => {});
});

/* ================= ASSISTANT (rule-based, free) ================= */
const Bot = { log: [], layer: null };
function botNav(c) {
  if (!c) return; if (Bot.layer) Bot.layer.close();
  const m = { lawyers: () => { Nav.tab(isLawyer() ? TABS.lawyer[0] : 'lawyers'); if (!isLawyer()) { if (c.area) Nav.top().params.area = c.area; Nav.refresh(false); } }, map: () => ACT.tomap(), urgent: () => Nav.go('urgent'), newcase: () => Nav.go('newcase', {}), verify: () => Nav.go(isLawyer() ? 'lcredentials' : 'verify', {}),
    settings: () => Nav.go('settings'), cases: () => Nav.tab(isLawyer() ? 'lcases' : 'cases'), reports: () => Nav.go('lreports'), fees: () => Nav.go('lfees'), payouts: () => Nav.go('learnings'), credentials: () => Nav.go('lcredentials'), dashboard: () => Nav.tab('ldash') };
  (m[c.nav] || (() => {}))();
}
function openBot(first) {
  Bot.layer = sheet('<div class="head"><div class="av sm">' + I('bot') + '</div><div class="sp"><div class="b">' + esc(t('Ask GetYourLawyer')) + '</div><div class="tiny muted">General information · ' + esc(t('Not legal advice')) + '</div></div><button class="iconbtn" data-act="close" aria-label="Close">' + I('x') + '</button></div><div class="body" style="padding:0"><div class="chat" style="height:100%"><div class="msgs" id="bmsgs"></div><div class="qr" id="bchips"></div></div></div><div class="foot" style="padding:0"><div class="composer"><textarea id="bin" rows="1" placeholder="Ask anything, e.g. my cheque bounced" maxlength="300"></textarea><button class="iconbtn send" data-act="botsend" aria-label="Send">' + I('send') + '</button></div></div>', { full: true, dismissable: false, onClose: () => { Bot.layer = null; } });
  const i = $('#bin'); i.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ACT.botsend(); } };
  Bot.log.forEach(drawBot); if (!Bot.log.length) askBot(''); else if (first) askBot(first); else drawChips(Bot.chips || []);
  if (first && Bot.log.length) { /* asked above */ }
}
function drawBot(m) { const b = $('#bmsgs'); if (!b) return; b.insertAdjacentHTML('beforeend', '<div class="bub ' + (m.me ? 'me' : '') + '">' + esc(m.text) + '</div>' + (m.cta ? '<button class="btn sm" style="align-self:flex-start" data-act="botcta" data-i="' + Bot.log.indexOf(m) + '">' + esc(m.cta.label) + ' →</button>' : '')); b.scrollTop = b.scrollHeight; }
function drawChips(chips) { Bot.chips = chips; const c = $('#bchips'); if (c) c.innerHTML = chips.map(x => '<button class="chip" data-act="botchip" data-v="' + esc(x) + '">' + esc(x) + '</button>').join(''); const b = $('#bmsgs'); if (b) b.scrollTop = b.scrollHeight; }
async function askBot(text) {
  if (text) { const m = { me: true, text }; Bot.log.push(m); drawBot(m); }
  const b = $('#bmsgs'); const tp = document.createElement('div'); tp.className = 'bub'; tp.textContent = '…'; b && b.appendChild(tp);
  try { const r = await API.post('/api/bot', { text }); tp.remove(); const m = { me: false, text: r.reply, cta: r.cta }; Bot.log.push(m); drawBot(m); drawChips(r.chips || []); }
  catch (e) { tp.remove(); const m = { me: false, text: 'I could not reach the server. Please check your connection.' }; Bot.log.push(m); drawBot(m); }
}
ACT.bot = () => openBot();
ACT.botq = el => openBot(el.dataset.v);
ACT.botsend = () => { const i = $('#bin'); const v = i.value.trim(); if (!v) return; i.value = ''; askBot(v); };
ACT.botchip = el => askBot(el.dataset.v);
ACT.botcta = el => botNav(Bot.log[+el.dataset.i].cta);
