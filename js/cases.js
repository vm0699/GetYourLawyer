'use strict';
/* Cases, case requests, hearings, documents, updates, invoices. Shared by both roles; the lawyer gets the edit controls. */

const STAGE_LABEL = { consultation: 'Consultation', filing: 'Filing', notice: 'Notice', hearing: 'Hearing', evidence: 'Evidence', arguments: 'Arguments', judgment: 'Judgment', appeal: 'Appeal', execution: 'Execution', closed: 'Closed' };
const stageBar = (stage, stages) => { const list = (stages || []).filter(s => s !== 'closed'), i = Math.max(0, list.indexOf(stage)); return '<div class="hbar mts"><i style="width:' + (stage === 'closed' ? 100 : Math.round((i + 1) / list.length * 100)) + '%"></i></div>'; };
const caseRow = (c, L) => '<div class="card tap" data-act="case" data-id="' + c.id + '"><div class="row"><div class="av sm">' + I(AREA_ICON[c.area] || 'briefcase') + '</div><div class="sp" style="min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.title) + '</div><div class="small muted">' + esc(c.no) + ' · ' + esc(L ? c.client.name : c.lawyer.name) + '</div></div>' + statusPill(c.status) + '</div>' +
  '<div class="row small mts"><span class="pill soft">' + esc(STAGE_LABEL[c.stage] || c.stage) + '</span>' + (c.nextHearing ? '<span class="muted">' + I('gavel').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"') + ' ' + fmtDate(c.nextHearing.date) + (c.nextHearing.time ? ' · ' + fmtTime(c.nextHearing.time) : '') + '</span>' : '') + (c.pendingInvoices ? '<span class="pill fill">Invoice due</span>' : '') + '</div></div>';
ACT.case = el => Nav.go('case', { id: el.dataset.id });

/* ================= CASES LIST (+ requests, + clients) ================= */
function casesScreen(L) {
  return {
    title: 'Cases',
    async load(p) {
      const seg = p.seg || 'cases';
      if (seg === 'requests') return { seg, ...(await API.get('/api/requests')) };
      if (seg === 'clients') return { seg, ...(await API.get('/api/lawyer/clients')) };
      const q = new URLSearchParams(); if (p.status) q.set('status', p.status); if (p.q) q.set('q', p.q);
      const [c, r] = await Promise.all([API.get('/api/cases?' + q), L ? API.get('/api/requests?status=open') : Promise.resolve({ items: [] })]);
      return { seg, items: c.items, openReq: r.items.length };
    },
    render(p, d) {
      const seg = p.seg || 'cases';
      let h = '<div class="bar big"><h1>' + esc(t('Cases')) + '</h1></div><div class="pad"><div class="seg"><button data-act="cseg" data-v="cases" class="' + (seg === 'cases' ? 'on' : '') + '">' + esc(t('Cases')) + '</button><button data-act="cseg" data-v="requests" class="' + (seg === 'requests' ? 'on' : '') + '">' + esc(t('Requests')) + (L && d && d.openReq ? ' (' + d.openReq + ')' : '') + '</button>' + (L ? '<button data-act="cseg" data-v="clients" class="' + (seg === 'clients' ? 'on' : '') + '">' + esc(t('Clients')) + '</button>' : '') + '</div>';
      if (seg === 'cases') h += '<div class="search mt">' + I('search') + '<input id="cq" placeholder="Search title, case no, name" value="' + esc(p.q || '') + '"></div><div class="chips mts" style="padding-left:0;margin-left:0">' + [['', 'All'], ['open', 'Open'], ['closed', 'Closed']].map(x => '<button class="chip ' + ((p.status || '') === x[0] ? 'on' : '') + '" data-act="cstatus" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
      h += '</div><div class="page with-fab" style="padding-top:12px">';
      if (!d) return h + skel(4) + '</div>';
      if (seg === 'cases') h += d.items.length ? '<div class="list">' + d.items.map(c => caseRow(c, L)).join('') + '</div>' : empty('briefcase', 'No cases yet', L ? 'Add a case for a registered client, or accept a request.' : 'Register your case with a lawyer to follow every hearing here.');
      else if (seg === 'requests') h += d.items.length ? '<div class="list">' + d.items.map(r => requestRow(r, L)).join('') + '</div>' : empty('file', 'No requests', L ? 'New case requests from clients appear here, and you are alerted instantly.' : 'Send a request to a lawyer and track its status here.');
      else h += d.items.length ? '<div class="card" style="padding:4px 14px">' + d.items.map(c => '<div class="item" data-act="msg" data-id="' + c.id + '">' + avatar({ name: c.name }) + '<div class="sp"><div class="t">' + esc(c.name) + (c.verified ? ' ' + tick() : '') + '</div><div class="s">' + c.openCases + ' open · ' + c.cases + ' case' + (c.cases === 1 ? '' : 's') + ' · ' + c.bookings + ' consult' + (c.bookings === 1 ? '' : 's') + '</div></div>' + I('chat', 'chev') + '</div>').join('') + '</div>' : empty('users', 'No clients yet', 'Clients you consult or take cases for appear here.');
      return h + '</div>' + (seg === 'cases' ? '<button class="fab pill" data-act="' + (L ? 'addcase' : 'newcase') + '">' + I('plus') + (L ? t('Add case') : t('Register a case')) + '</button>' : '');
    },
    mount(el, p) { const q = $('#cq', el); if (q) q.oninput = debounce(() => { p.q = q.value.trim(); Nav.save(); Nav.load(Nav.top(), true); }, 350); }
  };
}
SCREENS.cases = casesScreen(false);
SCREENS.lcases = casesScreen(true);
ACT.cseg = el => { const f = Nav.top(); f.params.seg = el.dataset.v; f.data = null; Nav.save(); Nav.load(f, false); };
ACT.cstatus = el => { const f = Nav.top(); f.params.status = el.dataset.v; Nav.save(); Nav.load(f, true); };
ACT.addcase = () => Nav.go('addcase', {});

function requestRow(r, L) {
  const party = L ? r.client.name : (r.lawyer ? r.lawyer.name : 'Any matching lawyer');
  return '<div class="card"><div class="row"><div class="av sm">' + I(r.urgency === 'urgent' ? 'zap' : AREA_ICON[r.area] || 'file') + '</div><div class="sp" style="min-width:0"><div class="b">' + esc(r.title) + '</div><div class="small muted">' + esc(party) + ' · ' + ago(r.created) + (r.distanceKm != null ? ' · ' + km(r.distanceKm) : '') + '</div></div>' + (r.urgency === 'urgent' ? '<span class="pill fill">Urgent</span>' : '') + statusPill(r.status) + '</div>' +
    '<p class="small mts" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(r.description) + '</p>' +
    (r.status === 'open' && L ? '<div class="row mt"><button class="btn ghost sm block" data-act="rdecline" data-id="' + r.id + '">Decline</button><button class="btn sm block" data-act="raccept" data-id="' + r.id + '">Accept case</button></div>' : '') +
    (r.status === 'open' && !L ? '<button class="btn ghost sm block mt" data-act="rwithdraw" data-id="' + r.id + '">Withdraw request</button>' : '') +
    (r.status === 'accepted' && r.caseId ? '<button class="btn sm block mt" data-act="case" data-id="' + r.caseId + '">Open case</button>' : '') + '</div>';
}
ACT.raccept = el => busy(el, async () => { const ok = await confirmBox({ title: 'Accept this case?', text: 'A case file opens and the client sees you as their lawyer. Their phone number is shared with you.', ok: 'Accept' }); if (!ok) return; const r = await API.post('/api/requests/' + el.dataset.id + '/accept', {}); Bridge.vibrate(20); toast('Case accepted'); Nav.go('case', { id: r.caseId }); });
ACT.rdecline = el => busy(el, async () => { if (!await confirmBox({ title: 'Decline this request?', ok: 'Decline' })) return; await API.post('/api/requests/' + el.dataset.id + '/decline', {}); Nav.refresh(false); });
ACT.rwithdraw = el => busy(el, async () => { if (!await confirmBox({ title: 'Withdraw this request?', ok: 'Withdraw' })) return; await API.post('/api/requests/' + el.dataset.id + '/withdraw', {}); Nav.refresh(false); });
Live.sub('request', () => { if (Nav.is('cases') || Nav.is('lcases') || Nav.is('ldash')) Nav.refresh(true); });
Live.sub('case', c => { if (Nav.is('cases') || Nav.is('lcases') || Nav.is('home') || Nav.is('ldash') || (Nav.is('case') && Nav.top().params.id === c.id)) Nav.refresh(true); });

/* ================= REGISTER A CASE (client -> lawyer) ================= */
SCREENS.newcase = {
  title: 'Register a case', bare: true,
  async load(p) { return p.lawyerId ? { l: await API.get('/api/lawyers/' + p.lawyerId) } : { l: null }; },
  render(p, d) {
    if (!d) return topbar('Register a case') + skel(3);
    if (p.done) return topbar('Register a case') + '<div class="page"><div class="hero c"><h2>Request sent</h2><p>' + (d.l ? esc(d.l.name) + ' will review it and respond. ' : (p.alerted ? p.alerted + ' matching lawyers were alerted. ' : 'We will alert matching lawyers as they come online. ')) + 'Once accepted, your case file opens here with hearings, documents and updates.</p></div><button class="btn block mt" data-act="trackreq">Track request</button></div>';
    const areas = S.meta.areas;
    return topbar('Register a case') + '<div class="page">' + (d.l ? '<div class="card"><div class="row">' + avatar({ id: d.l.id, name: d.l.name, hasPhoto: d.l.hasPhoto, photoV: d.l.photoV }) + '<div><div class="small muted">Sending to</div><div class="b">' + esc(d.l.name) + ' ' + tick() + '</div></div></div></div>' : '<div class="card soft small">No lawyer chosen: we will alert verified lawyers for this practice area near you, and the first to accept takes your case.</div>') +
      '<div class="field mt"><label>Practice area</label><select id="carea" class="in"><option value="">Choose…</option>' + areas.map(a => '<option value="' + a.id + '" ' + ((p.area || (d.l && d.l.areas[0])) === a.id ? 'selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Case title</label><input id="ctitle" class="in" maxlength="100" placeholder="e.g. Tenant deposit not returned" value="' + esc(p.title || '') + '"></div>' +
      '<div class="field"><label>What happened?</label><textarea id="cdesc" class="in" maxlength="2000" placeholder="Describe the facts, dates, and what you want to achieve.">' + esc(p.desc || '') + '</textarea><span class="hint">Do not include passwords or card numbers.</span></div>' +
      '<div class="field"><label>Budget (₹) <span class="muted">optional</span></label><input id="cbud" class="in" inputmode="numeric" placeholder="e.g. 15000" value="' + esc(p.bud || '') + '"></div>' +
      '<div id="err"></div><button class="btn block" data-act="sendcase">Send request</button></div>';
  },
  mount(el, p) { [['#ctitle', 'title'], ['#cdesc', 'desc'], ['#cbud', 'bud'], ['#carea', 'area']].forEach(([s, k]) => { const e = $(s, el); if (e) e.oninput = e.onchange = () => { p[k] = e.value; Nav.save(); }; }); }
};
ACT.sendcase = el => busy(el, async () => {
  const f = Nav.top(), p = f.params, err = m => { $('#err').innerHTML = '<div class="err-msg">' + m + '</div>'; };
  const body = { lawyerId: p.lawyerId || null, area: val('#carea'), title: val('#ctitle'), description: val('#cdesc'), budget: val('#cbud') };
  if (!body.area) return err('Choose a practice area'); if (body.title.length < 4) return err('Give your case a short title'); if (body.description.length < 10) return err('Describe what happened in a few sentences');
  const pos = await getPos(); body.lat = pos.lat; body.lng = pos.lng;
  try { const r = await API.post('/api/requests', body); f.params = { lawyerId: p.lawyerId, done: 1, alerted: r.request.alerted }; Nav.save(); Nav.paint(f, false); }
  catch (e) { if (e.body && e.body.code === 'verify_required') { Nav.go('verify', {}); toast('Please verify your identity to register a case'); return; } throw e; }
});

/* ================= ADD CASE (lawyer) ================= */
SCREENS.addcase = {
  title: 'Add case', bare: true,
  render(p) {
    const M = S.meta;
    return topbar('Add case') + '<div class="page"><p class="muted small">The client must already have a GetYourLawyer account. They are notified and can follow the case.</p>' +
      '<div class="field mt"><label>Client mobile number</label><input id="acph" class="in" inputmode="numeric" maxlength="10" placeholder="98765 43210" value="' + esc(p.phone || '') + '"></div>' +
      '<div class="field"><label>Case title</label><input id="actitle" class="in" maxlength="100" placeholder="e.g. Sharma v. Kumar, partition suit"></div>' +
      '<div class="field"><label>Practice area</label><select id="acarea" class="in">' + M.areas.map(a => '<option value="' + a.id + '">' + esc(a.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Court</label><select id="accourt" class="in"><option value="">Not filed yet</option>' + M.courts.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Court case number <span class="muted">optional</span></label><input id="accno" class="in" placeholder="O.S. No. 123 of 2026"></div>' +
      '<div class="field"><label>Opposing party <span class="muted">optional</span></label><input id="acopp" class="in"></div>' +
      '<div class="field"><label>Stage</label><select id="acstage" class="in">' + M.stages.filter(s => s !== 'closed').map(s => '<option value="' + s + '">' + STAGE_LABEL[s] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Agreed fee (₹) <span class="muted">optional</span></label><input id="acfee" class="in" inputmode="numeric"></div>' +
      '<div class="field"><label>Summary</label><textarea id="acdesc" class="in" maxlength="2000"></textarea></div><div id="err"></div><button class="btn block" data-act="saveaddcase">Create case</button></div>';
  }
};
ACT.saveaddcase = el => busy(el, async () => {
  try {
    const r = await API.post('/api/cases', { clientPhone: val('#acph'), title: val('#actitle'), area: val('#acarea'), court: val('#accourt'), courtCaseNo: val('#accno'), opposing: val('#acopp'), stage: val('#acstage'), agreedFee: val('#acfee') || null, description: val('#acdesc') });
    toast('Case created'); Nav.replace('case', { id: r.case.id });
  } catch (e) { if (e.body && e.body.code === 'client_not_found') { $('#err').innerHTML = '<div class="err-msg">' + esc(e.message) + '</div><button class="btn ghost block sm" data-act="invite">Share an invite</button>'; return; } throw e; }
});
ACT.invite = () => Bridge.share('I use GetYourLawyer to manage my cases and hearings. Install it and register as a client so I can add your case: ' + API.base);

/* ================= CASE DETAIL ================= */
SCREENS.case = {
  title: 'Case',
  load(p) { return API.get('/api/cases/' + p.id).then(r => r.case); },
  render(p, c) {
    if (!c) return topbar('Case') + skel(4);
    const L = isLawyer(), tab = p.tab || 'overview', other = L ? c.client : c.lawyer, stages = S.meta.stages;
    const tabs = [['overview', 'Overview'], ['hearings', t('Hearings')], ['docs', t('Documents')], ['updates', t('Updates')], ['invoices', t('Invoices')]].concat(L ? [['notes', 'Notes']] : []);
    let h = topbar('Case', { right: '<button class="iconbtn" data-act="msg" data-id="' + other.id + '" aria-label="Message">' + I('chat') + '</button>' }) + '<div class="page">';
    h += '<div class="card"><div class="row"><div class="sp"><div class="h2" style="font-size:19px">' + esc(c.title) + '</div><div class="small muted">' + esc(c.no) + (c.courtCaseNo ? ' · ' + esc(c.courtCaseNo) : '') + '</div></div>' + statusPill(c.status) + '</div>' +
      '<div class="row small mts"><span class="b">' + esc(STAGE_LABEL[c.stage] || c.stage) + '</span>' + (c.status === 'closed' && c.outcome ? '<span class="pill fill">' + esc(cap(c.outcome)) + '</span>' : '') + '</div>' + stageBar(c.stage, stages) +
      '<div class="row mt" data-act="' + (L ? 'noop' : 'lawyer') + '" data-id="' + other.id + '">' + avatar(L ? { name: other.name } : other) + '<div class="sp"><div class="small muted">' + (L ? 'Client' : 'Your lawyer') + '</div><div class="b">' + esc(other.name) + '</div></div>' + (other.phone ? '<a class="iconbtn" href="tel:' + esc(other.phone) + '" aria-label="Call">' + I('phone') + '</a>' : '') + '</div></div>';
    if (c.nextHearing) h += '<div class="card inv mt"><div class="row"><div class="av" style="background:var(--inv-fg);color:var(--inv-bg)">' + I('gavel') + '</div><div class="sp"><div class="small muted">Next hearing</div><div class="b" style="font-size:17px">' + fmtDate(c.nextHearing.date) + (c.nextHearing.time ? ' · ' + fmtTime(c.nextHearing.time) : '') + '</div><div class="small muted">' + esc(c.nextHearing.court || c.court || '') + (c.nextHearing.purpose ? ' · ' + esc(c.nextHearing.purpose) : '') + '</div></div></div></div>';
    h += '<div class="chips mt">' + tabs.map(x => '<button class="chip ' + (tab === x[0] ? 'on' : '') + '" data-act="ctab" data-v="' + x[0] + '">' + esc(x[1]) + (x[0] === 'invoices' && c.invoices.some(i => i.status === 'unpaid') ? ' •' : '') + '</button>').join('') + '</div><div class="mt">';
    if (tab === 'overview') {
      h += '<div class="card"><div class="kv"><span>Practice area</span><span>' + esc(areaName(c.area)) + '</span></div><div class="kv"><span>Court</span><span>' + esc(c.court || 'Not filed yet') + '</span></div>' + (c.opposing ? '<div class="kv"><span>Opposing party</span><span>' + esc(c.opposing) + '</span></div>' : '') + '<div class="kv"><span>Opened</span><span>' + fmtTs(c.opened) + '</span></div>' + (c.agreedFee ? '<div class="kv"><span>Agreed fee</span><span>' + rupee(c.agreedFee) + '</span></div>' : '') + '</div>' + (c.description ? '<div class="sec"><h2>Summary</h2></div><p class="small">' + esc(c.description) + '</p>' : '');
      if (L && c.status === 'open') h += '<div class="gap mt2"><button class="btn ghost block" data-act="cedit">' + I('edit') + ' Edit details & stage</button><button class="btn ghost block" data-act="cclose">Close case</button></div>';
      if (L && c.status === 'closed') h += '<button class="btn ghost block mt2" data-act="creopen">Reopen case</button>';
      if (!L && c.status === 'closed' && !c.reviewed) h += '<button class="btn block mt2" data-act="breview">★ Rate your lawyer</button>';
    } else if (tab === 'hearings') {
      h += (L && c.status === 'open' ? '<button class="btn block sm" data-act="haddsheet">' + I('plus') + ' Schedule hearing</button><div class="mts"></div>' : '') + (c.hearings.length ? '<div class="tl">' + c.hearings.map(x => '<div class="e"' + (L && c.status === 'open' ? ' data-act="hedit" data-id="' + x.id + '" style="cursor:pointer"' : '') + '><div class="row"><b class="sp">' + fmtDate(x.date) + (x.time ? ' · ' + fmtTime(x.time) : '') + '</b>' + statusPill(x.status) + '</div><div class="small muted">' + esc(x.court || '') + (x.purpose ? ' · ' + esc(x.purpose) : '') + '</div>' + (x.outcome ? '<div class="small mts">' + esc(x.outcome) + '</div>' : '') + '</div>').join('') + '</div>' : empty('gavel', 'No hearings yet', L ? 'Schedule one and your client is reminded the day before.' : 'Your lawyer will add hearing dates here.'));
    } else if (tab === 'docs') {
      h += '<button class="btn block sm" data-act="cupload">' + I('upload') + ' Upload document</button><div class="mts"></div>' + (c.files.length ? '<div class="card" style="padding:4px 14px">' + c.files.map(f => '<div class="item" data-act="dlfile" data-id="' + f.id + '" data-name="' + esc(f.name) + '"><div class="av sm">' + I('file') + '</div><div class="sp" style="min-width:0"><div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(f.name) + '</div><div class="s">' + esc(cap(f.kind)) + ' · ' + Math.round(f.size / 1024) + ' KB · ' + fmtTs(f.t) + (f.private ? ' · Private' : '') + '</div></div>' + I('download', 'chev') + '</div>').join('') + '</div>' : empty('file', 'No documents', 'Upload IDs, agreements, notices and orders to keep everything in one place.'));
    } else if (tab === 'updates') {
      h += (L && c.status === 'open' ? '<div class="field"><textarea id="upd" class="in" placeholder="Post an update your client will see…" maxlength="600" style="min-height:70px"></textarea></div><button class="btn block sm" data-act="postupd">Post update</button><div class="mt"></div>' : '') + '<div class="tl">' + c.updates.map(u => '<div class="e"><div class="small muted">' + fmtTs(u.t) + ' · ' + hhmm(u.t) + '</div><div>' + esc(u.text) + '</div></div>').join('') + '</div>';
    } else if (tab === 'invoices') {
      h += (L && c.status === 'open' ? '<button class="btn block sm" data-act="invnew">' + I('plus') + ' Raise invoice</button><div class="mts"></div>' : '') + (c.invoices.length ? '<div class="list">' + c.invoices.map(i => '<div class="card"><div class="row"><div class="sp"><div class="b">' + esc(i.no) + '</div><div class="small muted">' + fmtTs(i.t) + (i.status === 'unpaid' ? ' · due ' + fmtDate(i.due) : '') + '</div></div><div class="c"><b style="font-size:17px">' + rupee(i.total) + '</b><div>' + statusPill(i.status) + '</div></div></div>' + i.items.map(x => '<div class="kv small"><span>' + esc(x.desc) + '</span><span>' + rupee(x.amount) + '</span></div>').join('') + (i.status === 'unpaid' && !L ? '<button class="btn block mt" data-act="payinv" data-id="' + i.paymentId + '" data-amt="' + i.total + '" data-no="' + esc(i.no) + '">Pay ' + rupee(i.total) + '</button>' : '') + (i.status === 'unpaid' && L ? '<button class="btn ghost sm block mt" data-act="invvoid" data-id="' + i.id + '">Cancel invoice</button>' : '') + (i.receipt ? '<div class="tiny muted mts">Receipt ' + esc(i.receipt) + '</div>' : '') + '</div>').join('') + '</div>' : empty('card', 'No invoices', L ? 'Raise an invoice for fees and expenses. Your client pays in the app.' : 'Invoices from your lawyer appear here.'));
    } else if (tab === 'notes') {
      h += '<p class="small muted">Private notes are visible only to you.</p><div class="field mts"><textarea id="note" class="in" placeholder="Strategy, reminders, client preferences…" maxlength="1500" style="min-height:80px"></textarea></div><button class="btn block sm" data-act="addnote">Save note</button><div class="list mt">' + (c.notes || []).map(n => '<div class="card"><div class="tiny muted">' + fmtTs(n.t) + ' · ' + hhmm(n.t) + '</div><div class="small mts" style="white-space:pre-wrap">' + esc(n.text) + '</div><a class="link tiny" data-act="delnote" data-id="' + n.id + '">Delete</a></div>').join('') + '</div>';
    }
    return h + '</div></div>';
  }
};
ACT.ctab = el => { const f = Nav.top(); f.params.tab = el.dataset.v; Nav.save(); Nav.paint(f, false); };
const caseCall = async (el, fn, msg) => busy(el, async () => { const f = Nav.top(); try { const r = await fn(f.params.id, f.data.rev); f.data = r.case; Nav.paint(f, true); Layers.closeTop(); if (msg) toast(msg); } catch (e) { if (e.body && e.body.code === 'conflict') { f.data = e.body.case; Nav.paint(f, true); toast(e.message); return; } throw e; } });
ACT.cedit = () => {
  const c = Nav.top().data, M = S.meta;
  sheet('<div class="h2">Edit case</div><div class="field mt"><label>Title</label><input id="etitle" class="in" value="' + esc(c.title) + '"></div><div class="field"><label>Stage</label><select id="estage" class="in">' + M.stages.filter(s => s !== 'closed').map(s => '<option value="' + s + '" ' + (c.stage === s ? 'selected' : '') + '>' + STAGE_LABEL[s] + '</option>').join('') + '</select></div><div class="field"><label>Court</label><select id="ecourt" class="in"><option value="">Not filed yet</option>' + M.courts.map(x => '<option ' + (c.court === x ? 'selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div><div class="field"><label>Court case number</label><input id="ecno" class="in" value="' + esc(c.courtCaseNo) + '"></div><div class="field"><label>Opposing party</label><input id="eopp" class="in" value="' + esc(c.opposing) + '"></div><div class="field"><label>Agreed fee (₹)</label><input id="efee" class="in" inputmode="numeric" value="' + (c.agreedFee || '') + '"></div><button class="btn block" data-act="csave">Save</button>');
};
ACT.csave = el => caseCall(el, (id, rev) => API.patch('/api/cases/' + id, { title: val('#etitle'), stage: val('#estage'), court: val('#ecourt'), courtCaseNo: val('#ecno'), opposing: val('#eopp'), agreedFee: val('#efee') || null, rev }), 'Case updated');
ACT.cclose = () => {
  sheet('<div class="h2">Close this case</div><p class="muted small mts">Your client is notified and asked to rate you. Scheduled hearings are cancelled.</p><div class="field mt"><label>Outcome</label><select id="cout" class="in"><option value="won">Won</option><option value="lost">Lost</option><option value="settled">Settled</option><option value="withdrawn">Withdrawn</option><option value="disposed">Disposed</option></select></div><div class="field"><label>Closing note</label><textarea id="csum" class="in" maxlength="300"></textarea></div><button class="btn block" data-act="cclosego">Close case</button>');
};
ACT.cclosego = el => caseCall(el, id => API.post('/api/cases/' + id + '/close', { outcome: val('#cout'), summary: val('#csum') }), 'Case closed');
ACT.creopen = el => caseCall(el, id => API.post('/api/cases/' + id + '/reopen'), 'Case reopened');
ACT.haddsheet = () => sheet('<div class="h2">Schedule hearing</div><div class="field mt"><label>Date</label><input id="hdate" class="in" type="date" min="' + todayStr() + '"></div><div class="field"><label>Time <span class="muted">optional</span></label><input id="htime" class="in" type="time"></div><div class="field"><label>Purpose</label><input id="hpur" class="in" placeholder="e.g. Framing of issues" maxlength="120"></div><div class="field"><label>Court / hall</label><input id="hcourt" class="in" value="' + esc(Nav.top().data.court || '') + '" maxlength="80"></div><button class="btn block" data-act="hadd">Schedule & notify client</button>');
ACT.hadd = el => { if (!val('#hdate')) { toast('Choose the hearing date'); return; } return caseCall(el, id => API.post('/api/cases/' + id + '/hearings', { date: val('#hdate'), time: val('#htime'), purpose: val('#hpur'), court: val('#hcourt') }), 'Hearing scheduled'); };
ACT.hedit = el => {
  const c = Nav.top().data, h = c.hearings.find(x => x.id === el.dataset.id); App._h = h.id;
  sheet('<div class="h2">' + fmtDate(h.date) + (h.time ? ' · ' + fmtTime(h.time) : '') + '</div><div class="small muted">' + esc(h.purpose || 'Hearing') + '</div><div class="field mt"><label>Status</label><select id="hst" class="in"><option value="scheduled" ' + (h.status === 'scheduled' ? 'selected' : '') + '>Scheduled</option><option value="done" ' + (h.status === 'done' ? 'selected' : '') + '>Done</option><option value="adjourned" ' + (h.status === 'adjourned' ? 'selected' : '') + '>Adjourned</option><option value="cancelled">Cancelled</option></select></div><div class="field"><label>What happened?</label><textarea id="hout" class="in" maxlength="400">' + esc(h.outcome) + '</textarea></div><div class="row"><div class="field sp"><label>Next date</label><input id="hnd" class="in" type="date"></div><div class="field sp"><label>Time</label><input id="hnt" class="in" type="time"></div></div><div class="row"><button class="btn ghost block" data-act="hdel">Remove</button><button class="btn block" data-act="hsave">Save</button></div>');
};
ACT.hsave = el => caseCall(el, id => API.patch('/api/cases/' + id + '/hearings/' + App._h, { status: val('#hst'), outcome: val('#hout'), nextDate: val('#hnd'), nextTime: val('#hnt') }), 'Hearing updated');
ACT.hdel = async el => { if (await confirmBox({ title: 'Remove this hearing?', ok: 'Remove' })) caseCall(el, id => API.del('/api/cases/' + id + '/hearings/' + App._h), 'Removed'); };
ACT.postupd = el => { const v = val('#upd'); if (v.length < 2) { toast('Write the update first'); return; } return caseCall(el, id => API.post('/api/cases/' + id + '/updates', { text: v }), 'Update posted'); };
ACT.addnote = el => { const v = val('#note'); if (v.length < 2) { toast('Write a note first'); return; } return caseCall(el, id => API.post('/api/cases/' + id + '/notes', { text: v }), 'Note saved'); };
ACT.delnote = el => caseCall(el, id => API.del('/api/cases/' + id + '/notes/' + el.dataset.id));
ACT.cupload = () => {
  App._up = null; const L = isLawyer();
  sheet('<div class="h2">Upload document</div><button class="btn ghost block mt" data-act="cpick">' + I('upload') + ' <span id="fn">Choose photo or PDF (up to 1.5 MB)</span></button><div class="field mt"><label>Name</label><input id="dname" class="in" maxlength="80" placeholder="e.g. Sale deed"></div><div class="field"><label>Type</label><select id="dkind" class="in"><option value="evidence">Evidence</option><option value="agreement">Agreement</option><option value="pleading">Pleading / petition</option><option value="order">Court order</option><option value="id">ID proof</option><option value="other">Other</option></select></div>' + (L ? '<div class="row"><span class="sp small b">Private (hide from client)</span><button class="switch" id="dpriv" data-act="sw" aria-label="Private"></button></div>' : '') + '<button class="btn block mt" data-act="cupgo">Upload</button>');
};
ACT.sw = el => el.classList.toggle('on');
ACT.cpick = async () => { try { const f = await pickFile(); if (!f) return; App._up = await fileToDataURL(f); $('#fn').textContent = f.name; if (!val('#dname')) $('#dname').value = f.name.replace(/\.[^.]+$/, ''); } catch (e) { fail(e); } };
ACT.cupgo = el => { if (!App._up) { toast('Choose a file first'); return; } return caseCall(el, id => API.post('/api/cases/' + id + '/files', { file: App._up, name: val('#dname') || 'document', kind: val('#dkind'), private: !!($('#dpriv') && $('#dpriv').classList.contains('on')) }), 'Uploaded'); };
ACT.dlfile = el => openFile(el.dataset.id, el.dataset.name);
ACT.invnew = () => {
  App._items = 1; sheet('<div class="h2">Raise invoice</div><div id="invrows" class="mt"></div><a class="link" data-act="invrow">+ Add another item</a><div class="field mt"><label>Due date</label><input id="invdue" class="in" type="date" value="' + addDays(todayStr(), 7) + '"></div><button class="btn block" data-act="invgo">Send invoice</button>');
  ACT.invrow();
};
ACT.invrow = () => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<div class="field sp"><input class="in inv-d" placeholder="Description" maxlength="120"></div><div class="field" style="width:110px"><input class="in inv-a" inputmode="numeric" placeholder="₹"></div>'; $('#invrows').appendChild(d); };
ACT.invgo = el => { const rows = $$('#invrows .row').map(r => ({ desc: r.querySelector('.inv-d').value.trim(), amount: r.querySelector('.inv-a').value })).filter(r => r.desc && r.amount); if (!rows.length) { toast('Add at least one item with an amount'); return; } return caseCall(el, id => API.post('/api/cases/' + id + '/invoices', { items: rows, due: val('#invdue') }), 'Invoice sent'); };
ACT.invvoid = el => caseCall(el, () => API.post('/api/invoices/' + el.dataset.id + '/void'), 'Invoice cancelled');
ACT.payinv = el => payFlow({ paymentId: el.dataset.id, amount: +el.dataset.amt, title: 'Invoice ' + el.dataset.no, onDone: () => Nav.refresh(false) });
