'use strict';
/* Client side: home, lawyer search + live map, lawyer profile, booking, payment, bookings, urgent help. */

const firstName = n => String(n || '').replace(/^Adv\.?\s+/i, '').split(/\s+/)[0] || 'there';
const fromFee = l => { const f = Object.values(l.fees || {}).filter(v => v != null); return f.length ? Math.min(...f) : null; };
const dirUrl = (lat, lng, label) => 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;

function lawyerCardHTML(l, mini) {
  const pr = l.fromFee != null ? l.fromFee : fromFee(l);
  if (mini) return '<div class="lc mini" data-act="lawyer" data-id="' + l.id + '"><div class="row">' + avatar({ id: l.id, name: l.name, hasPhoto: l.hasPhoto, photoV: l.photoV, online: l.online }) + '<div style="min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(l.name) + ' ' + tick() + '</div><div class="small muted">' + esc(l.city || '') + (l.distanceKm != null ? ' · ' + km(l.distanceKm) : '') + '</div></div></div>' +
    '<div class="small">' + l.areas.slice(0, 2).map(areaName).map(esc).join(' · ') + '</div><div class="row small"><span>★ <b>' + (l.rating || 'New') + '</b></span><span class="muted">' + l.experience + ' yrs</span><span class="sp"></span><b>' + (pr != null ? 'from ' + rupee(pr) : '') + '</b></div></div>';
  return '<div class="lc" data-act="lawyer" data-id="' + l.id + '">' + avatar({ id: l.id, name: l.name, hasPhoto: l.hasPhoto, photoV: l.photoV, online: l.online }, 'lg') +
    '<div class="sp" style="min-width:0"><div class="b" style="font-size:16px">' + esc(l.name) + ' ' + tick() + '</div><div class="small muted">' + (l.firm ? esc(l.firm) + ' · ' : '') + esc(l.city || '') + '</div>' +
    '<div class="meta">' + (l.online ? '<span class="live">' + t('Online') + '</span>' : '') + '<span class="pill">★ ' + (l.rating || 'New') + (l.ratingCount ? ' (' + l.ratingCount + ')' : '') + '</span><span class="pill">' + l.experience + ' ' + t('years') + '</span>' + (l.distanceKm != null ? '<span class="pill">' + I('pin') + km(l.distanceKm) + '</span>' : '') + '</div>' +
    '<div class="small mts muted">' + l.areas.slice(0, 3).map(areaName).map(esc).join(' · ') + '</div></div>' +
    '<div class="price"><span class="tiny muted">from</span><b>' + (pr != null ? rupee(pr) : '-') + '</b></div></div>';
}
ACT.lawyer = el => Nav.go('lawyer', { id: el.dataset.id });
ACT.bell = () => Nav.go('notifications');

/* ================= HOME ================= */
SCREENS.home = {
  title: 'Home',
  async load() {
    const p = await getPos();
    const [lw, bk, cal, cs] = await Promise.all([API.get('/api/lawyers?limit=10&sort=nearest&lat=' + p.lat + '&lng=' + p.lng), API.get('/api/bookings?scope=upcoming'), API.get('/api/calendar?to=' + addDays(todayStr(), 21)), API.get('/api/cases?status=open')]);
    return { lawyers: lw.items, booking: bk.items[0] || null, hearing: cal.events.find(e => e.kind === 'hearing') || null, openCases: cs.items.length };
  },
  render(p, d) {
    const me = S.me, areas = (S.meta ? S.meta.areas : []).slice(0, 7);
    let h = '<div class="bar big"><div class="sp"><div class="small muted">' + I('pin').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"') + ' ' + esc(me.city || 'Chennai') + '</div><h1 style="font-size:24px;margin-top:2px">Hello, ' + esc(firstName(me.name)) + '</h1></div><button class="iconbtn" data-act="bell" aria-label="Notifications">' + I('bell') + (S.unread ? '<span class="badge">' + (S.unread > 9 ? '9+' : S.unread) + '</span>' : '') + '</button></div><div class="page">';
    h += '<div class="search" data-act="tosearch" style="cursor:pointer">' + I('search') + '<span class="muted">' + esc(t('Search lawyers, topics')) + '</span></div>';
    h += '<div class="hero mt"><h2>' + esc(t('Urgent legal help')) + '</h2><p>Arrested, threatened or scammed? Alert online lawyers near you in one tap.</p><button class="btn" data-act="go" data-v="urgent">' + I('zap') + ' Get help now</button></div>';
    h += '<div class="sec"><h2>' + esc(t('Practice areas')) + '</h2><a data-act="tosearch">See all</a></div><div class="grid4">' + areas.map(a => '<div class="cat" data-act="area" data-id="' + a.id + '"><i>' + I(AREA_ICON[a.id] || 'file') + '</i>' + esc(a.name.split(' & ')[0].split(' ')[0]) + '</div>').join('') + '<div class="cat" data-act="tosearch"><i>' + I('plus') + '</i>More</div></div>';
    if (d && (d.booking || d.hearing)) {
      h += '<div class="sec"><h2>' + esc(t('Upcoming')) + '</h2></div><div class="list">';
      if (d.booking) h += '<div class="card tap" data-act="booking" data-id="' + d.booking.id + '"><div class="row"><div class="av sm">' + I(MODE_ICON[d.booking.mode]) + '</div><div class="sp"><div class="b">' + esc(d.booking.other.name) + '</div><div class="small muted">' + fmtDate(d.booking.date) + ' · ' + fmtTime(d.booking.time) + ' · ' + esc(d.booking.modeName) + '</div></div>' + statusPill(d.booking.status) + '</div></div>';
      if (d.hearing) h += '<div class="card tap" data-act="case" data-id="' + d.hearing.caseId + '"><div class="row"><div class="av sm">' + I('gavel') + '</div><div class="sp"><div class="b">' + esc(d.hearing.title) + '</div><div class="small muted">Hearing · ' + fmtDate(d.hearing.date) + (d.hearing.time ? ' · ' + fmtTime(d.hearing.time) : '') + (d.hearing.court ? ' · ' + esc(d.hearing.court) : '') + '</div></div></div></div>';
      h += '</div>';
    }
    h += '<div class="sec"><h2>' + esc(t('Nearby lawyers')) + '</h2><a data-act="tomap">' + esc(t('Live map')) + '</a></div>';
    if (!d) h += '<div class="skel"></div>';
    else if (!d.lawyers.length) h += empty('search', 'No lawyers listed yet', 'Lawyers appear here once they are verified and approved.');
    else h += '<div class="hscroll">' + d.lawyers.map(l => lawyerCardHTML(l, true)).join('') + '</div>';
    h += '<div class="card soft mt2 tap" data-act="bot"><div class="row"><div class="av">' + I('bot') + '</div><div class="sp"><div class="b">' + esc(t('Ask GetYourLawyer')) + '</div><div class="small muted">Not sure what kind of lawyer you need? Ask our assistant.</div></div>' + I('chev', 'chev') + '</div></div>';
    h += '<div class="sec"><h2>Know your rights</h2></div><div class="chips">' + ['Rights on arrest', 'Cheque bounced', 'Tenant deposit not returned', 'Online fraud', 'Divorce basics'].map(q => '<button class="chip" data-act="botq" data-v="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>';
    return h + '<p class="tiny muted c mt2">' + esc(t('Not legal advice')) + '. Information on this app is general.</p></div>';
  }
};
ACT.tosearch = () => Nav.tab('lawyers');
ACT.tomap = () => { Nav.tab('lawyers'); Nav.top().params.view = 'map'; Nav.refresh(false); };
ACT.area = el => { Nav.tab('lawyers'); Nav.top().params.area = el.dataset.id; Nav.refresh(false); };
ACT.go = el => Nav.go(el.dataset.v, el.dataset.id ? { id: el.dataset.id } : {});

/* ================= LAWYERS: list + live map ================= */
const MapUI = { map: null, markers: {}, items: [], me: null, sel: null };
SCREENS.lawyers = {
  title: 'Lawyers',
  async load(p) {
    const pos = await getPos(), q = new URLSearchParams({ lat: pos.lat, lng: pos.lng, limit: 150 });
    ['q', 'area', 'lang', 'mode', 'maxFee', 'minRating', 'sort'].forEach(k => { if (p[k]) q.set(k, p[k]); });
    if (p.online) q.set('online', '1'); if (p.fav) q.set('fav', '1');
    if (p.view === 'map' && !p.radiusOff) q.set('radius', 60);
    const r = await API.get('/api/lawyers?' + q); return { items: r.items, total: r.total };
  },
  render(p, d) {
    const nf = ['area', 'lang', 'mode', 'maxFee', 'minRating', 'online', 'fav'].filter(k => p[k]).length;
    let h = '<div class="bar big"><h1>' + esc(t('Lawyers')) + '</h1><button class="iconbtn" data-act="filters" aria-label="Filters">' + I('sliders') + (nf ? '<span class="badge">' + nf + '</span>' : '') + '</button></div><div class="pad">' +
      '<div class="search">' + I('search') + '<input id="q" placeholder="' + esc(t('Search lawyers, topics')) + '" value="' + esc(p.q || '') + '" autocomplete="off"></div>' +
      '<div class="seg mt"><button data-act="view" data-v="list" class="' + (p.view !== 'map' ? 'on' : '') + '">' + esc(t('List')) + '</button><button data-act="view" data-v="map" class="' + (p.view === 'map' ? 'on' : '') + '">' + esc(t('Map')) + '</button></div>';
    if (p.area || p.online || p.lang || p.mode || p.maxFee || p.minRating || p.fav) h += '<div class="chips mts">' + (p.area ? '<button class="chip on" data-act="clearf" data-v="area">' + esc(areaName(p.area)) + ' ✕</button>' : '') + (p.online ? '<button class="chip on" data-act="clearf" data-v="online">Online now ✕</button>' : '') + (p.lang ? '<button class="chip on" data-act="clearf" data-v="lang">' + esc(p.lang) + ' ✕</button>' : '') + (p.mode ? '<button class="chip on" data-act="clearf" data-v="mode">' + esc(modeName(p.mode)) + ' ✕</button>' : '') + (p.maxFee ? '<button class="chip on" data-act="clearf" data-v="maxFee">≤ ' + rupee(p.maxFee) + ' ✕</button>' : '') + (p.minRating ? '<button class="chip on" data-act="clearf" data-v="minRating">★ ' + p.minRating + '+ ✕</button>' : '') + (p.fav ? '<button class="chip on" data-act="clearf" data-v="fav">Saved ✕</button>' : '') + '</div>';
    h += '</div><div class="page" style="padding-top:10px" id="lw-body">' + SCREENS.lawyers.body(p, d) + '</div>';
    return h;
  },
  body(p, d) {
    if (!d) return '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    if (p.view === 'map') return '<div class="mapwrap"><div id="map"></div><div class="maplive"><span class="live">' + esc(t('Live map')) + ' · ' + d.items.length + '</span></div><div class="mapfab"><button class="iconbtn" data-act="locate" aria-label="My location">' + I('locate') + '</button><button class="iconbtn" data-act="view" data-v="list" aria-label="List">' + I('list') + '</button></div><div class="mapcard" id="mapcard"></div></div>';
    if (!d.items.length) return empty('search', 'No lawyers match', 'Try removing a filter or searching a nearby area.', '<button class="btn ghost mt" data-act="resetf">Clear filters</button>');
    return '<div class="list">' + d.items.map(l => lawyerCardHTML(l)).join('') + '</div>';
  },
  mount(el, p, d) {
    const q = $('#q', el);
    if (q) q.oninput = debounce(() => { p.q = q.value.trim(); Nav.save(); const f = Nav.top(); Nav.load(f, true); }, 350);
    if (p.view === 'map' && d) initMap(d.items, p);
    else if (MapUI.map) { try { MapUI.map.remove(); } catch (e) { /* gone */ } MapUI.map = null; MapUI.markers = {}; }
  }
};
ACT.view = el => { const f = Nav.top(); f.params.view = el.dataset.v; Nav.save(); f.data = null; Nav.load(f, false); };
ACT.clearf = el => { const f = Nav.top(); delete f.params[el.dataset.v]; Nav.load(f, false); };
ACT.resetf = () => { const f = Nav.top(), v = f.params.view; f.params = v ? { view: v } : {}; Nav.save(); Nav.load(f, false); };
ACT.filters = () => {
  const p = Nav.top().params, M = S.meta, chips = (arr, key, cur, lab) => '<div class="chips" style="margin:0;padding:0;flex-wrap:wrap">' + arr.map(a => '<button class="chip ' + (String(cur) === String(a.id) ? 'on' : '') + '" data-act="fpick" data-k="' + key + '" data-v="' + esc(a.id) + '">' + esc(a.name) + '</button>').join('') + '</div>';
  sheet('<div class="row"><div class="h2 sp">Filters</div><a class="link" data-act="resetf2">Reset</a></div><div id="fbody">' +
    '<div class="h3 mt">Practice area</div><div class="mts">' + chips(M.areas, 'area', p.area) + '</div>' +
    '<div class="h3 mt">Consultation type</div><div class="mts">' + chips(M.modes, 'mode', p.mode) + '</div>' +
    '<div class="h3 mt">Language</div><div class="mts">' + chips(M.langs.map(l => ({ id: l, name: l })), 'lang', p.lang) + '</div>' +
    '<div class="h3 mt">Max fee</div><div class="mts">' + chips([500, 1000, 2000, 5000].map(v => ({ id: v, name: '≤ ' + rupee(v) })), 'maxFee', p.maxFee) + '</div>' +
    '<div class="h3 mt">Rating</div><div class="mts">' + chips([4, 4.5].map(v => ({ id: v, name: '★ ' + v + '+' })), 'minRating', p.minRating) + '</div>' +
    '<div class="h3 mt">Sort by</div><div class="mts">' + chips([{ id: 'nearest', name: 'Nearest' }, { id: 'rating', name: 'Top rated' }, { id: 'fee', name: 'Lowest fee' }, { id: 'experience', name: 'Most experienced' }], 'sort', p.sort) + '</div>' +
    '<div class="row mt"><span class="sp b">Online now only</span><button class="switch ' + (p.online ? 'on' : '') + '" data-act="fonline" aria-label="Online only"></button></div></div><button class="btn block mt2" data-act="fdone">Show results</button>');
};
ACT.fpick = el => { const f = Nav.top(), k = el.dataset.k; f.params[k] = String(f.params[k]) === el.dataset.v ? '' : el.dataset.v; if (!f.params[k]) delete f.params[k]; el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el && !!f.params[k])); };
ACT.fonline = el => { const f = Nav.top(); f.params.online = !f.params.online; if (!f.params.online) delete f.params.online; el.classList.toggle('on', !!f.params.online); };
ACT.resetf2 = () => { const f = Nav.top(), v = f.params.view; f.params = v ? { view: v } : {}; Layers.closeTop(); Nav.save(); Nav.load(f, false); };
ACT.fdone = () => { Layers.closeTop(); Nav.save(); Nav.load(Nav.top(), false); };

function pinIcon(l, sel) {
  return L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 38], html: '<div class="pin ' + (l.online ? 'on' : 'off') + (sel ? ' sel' : '') + '"><span>' + esc(initials(l.name)) + '</span></div>' });
}
function initMap(items, p) {
  if (typeof L === 'undefined') { $('#map').innerHTML = '<div class="empty">Map could not load. Check your connection.</div>'; return; }
  if (MapUI.map) { try { MapUI.map.remove(); } catch (e) { /* gone */ } }
  const pos = S.pos || CHENNAI;
  const map = MapUI.map = L.map('map', { zoomControl: false, attributionControl: true }).setView([pos.lat, pos.lng], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  MapUI.markers = {}; MapUI.items = items; MapUI.sel = null;
  MapUI.me = L.marker([pos.lat, pos.lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="me-dot"></div>' }), interactive: false, zIndexOffset: -100 }).addTo(map);
  const bounds = [];
  items.forEach(l => { if (l.lat == null) return; const at = l.live ? [l.live.lat, l.live.lng] : [l.lat, l.lng]; const m = L.marker(at, { icon: pinIcon(l) }).addTo(map); m.on('click', () => selectPin(l.id)); MapUI.markers[l.id] = m; bounds.push(at); });
  if (bounds.length) { const near = bounds.filter(b => Math.abs(b[0] - pos.lat) < 0.5 && Math.abs(b[1] - pos.lng) < 0.5); if (near.length > 1) map.fitBounds(L.latLngBounds(near.concat([[pos.lat, pos.lng]])).pad(0.15), { maxZoom: 14 }); }
  map.on('click', () => { MapUI.sel = null; $('#mapcard').innerHTML = ''; Object.keys(MapUI.markers).forEach(id => MapUI.markers[id].setIcon(pinIcon(MapUI.items.find(x => x.id === id)))); });
  setTimeout(() => map.invalidateSize(), 150);
}
function selectPin(id) {
  const l = MapUI.items.find(x => x.id === id); if (!l) return; MapUI.sel = id;
  Object.keys(MapUI.markers).forEach(k => MapUI.markers[k].setIcon(pinIcon(MapUI.items.find(x => x.id === k), k === id)));
  const c = $('#mapcard'); if (!c) return;
  c.innerHTML = '<div class="lc" style="box-shadow:var(--shadow)"><div data-act="lawyer" data-id="' + l.id + '" class="row sp" style="min-width:0">' + avatar({ id: l.id, name: l.name, hasPhoto: l.hasPhoto, photoV: l.photoV, online: l.online }) + '<div style="min-width:0"><div class="b" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(l.name) + ' ' + tick() + '</div><div class="small muted">' + l.areas.slice(0, 2).map(areaName).map(esc).join(' · ') + '</div><div class="small">★ ' + (l.rating || 'New') + ' · ' + (l.online ? '<b>Online</b>' : 'Offline') + (l.distanceKm != null ? ' · ' + km(l.distanceKm) : '') + '</div></div></div><button class="btn sm" data-act="book" data-id="' + l.id + '">' + esc(t('Book')) + '</button></div>';
  MapUI.map.panTo(MapUI.markers[id].getLatLng());
}
ACT.locate = async () => { const p = await getPos(true); if (MapUI.map) { MapUI.map.setView([p.lat, p.lng], 14); MapUI.me.setLatLng([p.lat, p.lng]); } API.put('/api/me/location', { lat: p.lat, lng: p.lng }).catch(() => {}); if (p.approx) toast('Could not get your exact location. Showing Chennai.'); };
// real time: lawyers going online / offline / moving appear on the map instantly
Live.sub('lawyer', c => {
  const f = Nav.top(); if (!f || f.name !== 'lawyers' || !f.data) return;
  const i = f.data.items.findIndex(x => x.id === c.id);
  if (i >= 0) { Object.assign(f.data.items[i], c.name ? c : { online: c.online != null ? c.online : f.data.items[i].online, rating: c.rating != null ? c.rating : f.data.items[i].rating }); if (c.name && !c.live) f.data.items[i].live = null; }
  else if (c.name && c.lat != null) f.data.items.push(c); else return;
  if (f.params.view === 'map' && MapUI.map) {
    const l = f.data.items.find(x => x.id === c.id), at = l.live ? [l.live.lat, l.live.lng] : [l.lat, l.lng];
    if (MapUI.markers[l.id]) { MapUI.markers[l.id].setLatLng(at); MapUI.markers[l.id].setIcon(pinIcon(l, MapUI.sel === l.id)); }
    else if (l.lat != null) { const m = L.marker(at, { icon: pinIcon(l) }).addTo(MapUI.map); m.on('click', () => selectPin(l.id)); MapUI.markers[l.id] = m; }
    const cnt = $('.maplive .live'); if (cnt) cnt.textContent = t('Live map') + ' · ' + f.data.items.length; if (MapUI.sel === l.id) selectPin(l.id);
  } else if (f.params.view !== 'map') { const b = $('#lw-body'); if (b) b.innerHTML = SCREENS.lawyers.body(f.params, f.data); }
});
Live.sub('gone', c => {
  const f = Nav.top(); if (!f || f.name !== 'lawyers' || !f.data) return;
  f.data.items = f.data.items.filter(x => x.id !== c.id);
  if (MapUI.markers[c.id]) { MapUI.map.removeLayer(MapUI.markers[c.id]); delete MapUI.markers[c.id]; }
  if (f.params.view !== 'map') { const b = $('#lw-body'); if (b) b.innerHTML = SCREENS.lawyers.body(f.params, f.data); }
});

/* ================= LAWYER PROFILE ================= */
SCREENS.lawyer = {
  title: 'Lawyer', bare: true,
  load(p) { return API.get('/api/lawyers/' + p.id); },
  render(p, l) {
    if (!l) return topbar('Lawyer') + skel(4);
    const mode = id => MODE_ICON[id];
    let h = topbar('Lawyer', { right: '<button class="iconbtn" data-act="favtoggle" data-id="' + l.id + '" aria-label="Save">' + I('heart').replace('<svg', '<svg style="' + (l.fav ? 'fill:currentColor' : '') + '"') + '</button><button class="iconbtn" data-act="sharelawyer" aria-label="Share">' + I('share') + '</button>' }) + '<div class="page with-fab">';
    h += '<div class="c">' + avatar({ id: l.id, name: l.name, hasPhoto: l.hasPhoto, photoV: l.photoV, online: l.online }, 'xl').replace('class="av xl"', 'class="av xl" style="margin:0 auto"') + '<div class="h2 mts">' + esc(l.name) + ' ' + tick() + '</div><div class="muted small">' + (l.firm ? esc(l.firm) + ' · ' : '') + esc(l.city || '') + '</div>' +
      '<div class="row mts" style="justify-content:center">' + (l.online ? '<span class="live">' + t('Online') + '</span>' : '<span class="pill">' + t('Offline') + '</span>') + (l.distanceKm != null ? '<span class="pill">' + I('pin') + km(l.distanceKm) + '</span>' : '') + '</div></div>';
    h += '<div class="grid4 mt" style="grid-template-columns:repeat(3,1fr)"><div class="card c"><b style="font-size:20px">' + (l.rating || '-') + '</b><div class="tiny muted">' + stars(l.rating) + '<br>' + l.ratingCount + ' reviews</div></div><div class="card c"><b style="font-size:20px">' + l.experience + '</b><div class="tiny muted">' + t('years') + '<br>experience</div></div><div class="card c"><b style="font-size:20px">' + (l.casesHandled || 0) + '</b><div class="tiny muted">cases<br>handled</div></div></div>';
    h += '<div class="sec"><h2>' + esc(t('About')) + '</h2></div><p>' + esc(l.bio) + '</p>';
    h += '<div class="sec"><h2>' + esc(t('Practice areas')) + '</h2></div><div class="row wrap">' + l.areas.map(a => '<span class="pill soft">' + I(AREA_ICON[a] || 'file') + esc(areaName(a)) + '</span>').join('') + '</div>';
    h += '<div class="sec"><h2>' + esc(t('Languages')) + ' · Courts</h2></div><div class="row wrap">' + l.languages.map(x => '<span class="pill">' + esc(x) + '</span>').join('') + l.courts.map(x => '<span class="pill soft">' + esc(x) + '</span>').join('') + '</div>';
    h += '<div class="sec"><h2>' + esc(t('Consultation fee')) + '</h2></div><div class="card" style="padding:4px 14px">' + (l.modes.length ? l.modes.map(m => '<div class="item" data-act="book" data-id="' + l.id + '" data-mode="' + m + '"><div class="av sm">' + I(mode(m)) + '</div><div class="sp"><div class="t">' + esc(modeName(m)) + '</div><div class="s">' + (m === 'in_person' ? 'At the chamber' : m === 'chat' ? 'Text chat in the app' : m === 'call' ? 'Phone call' : 'Video call link') + '</div></div><b>' + (l.fees[m] === 0 ? 'Free' : rupee(l.fees[m])) + '</b>' + I('chev', 'chev') + '</div>').join('') : '<div class="muted small" style="padding:12px 0">Fees not set</div>') + '</div>' +
      (l.fees.hearing ? '<p class="small muted mts">Court appearance from ' + rupee(l.fees.hearing) + ' per hearing (agreed once you register a case).</p>' : '');
    if (l.address) h += '<div class="sec"><h2>Chamber</h2></div><div class="card"><div class="row"><div class="av sm">' + I('building') + '</div><div class="sp small">' + esc(l.address) + '</div></div>' + (l.lat != null ? '<button class="btn ghost block sm mts" data-act="dir" data-lat="' + l.lat + '" data-lng="' + l.lng + '">' + I('locate') + ' Directions</button>' : '') + '</div>';
    h += '<div class="card soft mt small"><b>Bar Council:</b> ' + esc(l.council || '') + '<br><b>Enrolment no:</b> ' + esc(l.barNo || '') + ' (' + l.enrolYear + ')<div class="tiny muted mts">' + I('shield').replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"') + ' Identity verified through DigiLocker and credentials reviewed by GetYourLawyer.</div></div>';
    h += '<div class="sec"><h2>' + esc(t('Reviews')) + ' (' + l.ratingCount + ')</h2></div>' + (l.reviews.length ? '<div class="list">' + l.reviews.map(r => '<div class="card"><div class="row"><b class="sp">' + esc(r.name) + '</b>' + stars(r.rating) + '</div>' + (r.text ? '<p class="small mts">' + esc(r.text) + '</p>' : '') + (r.reply ? '<div class="card soft small mts"><b>Reply:</b> ' + esc(r.reply) + '</div>' : '') + '<div class="tiny muted mts">' + fmtTs(r.t) + '</div></div>').join('') + '</div>' : '<p class="muted small">No reviews yet.</p>');
    h += '<div class="row mt2"><button class="btn ghost block" data-act="newcase" data-id="' + l.id + '">' + I('briefcase') + ' Register a case</button></div></div>';
    h += '<div style="position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;padding:12px 18px calc(12px + var(--sab));background:var(--bg);border-top:1px solid var(--line);display:flex;gap:10px"><button class="btn ghost" data-act="msg" data-id="' + l.id + '" aria-label="Message">' + I('chat') + '</button><button class="btn block" data-act="book" data-id="' + l.id + '">' + esc(t('Book consultation')) + '</button></div>';
    return h;
  }
};
ACT.favtoggle = async el => { try { const r = await API.post('/api/favs/' + el.dataset.id); const f = Nav.top(); if (f.data) f.data.fav = r.favs.includes(el.dataset.id); S.me.favs = r.favs; Nav.paint(f, true); toast(f.data.fav ? 'Saved' : 'Removed from saved'); } catch (e) { fail(e); } };
ACT.sharelawyer = () => { const l = Nav.top().data; Bridge.share(l.name + ' · ' + l.areas.map(areaName).join(', ') + ' · ★ ' + l.rating + ' on GetYourLawyer'); };
ACT.dir = el => Bridge.open(dirUrl(el.dataset.lat, el.dataset.lng));
ACT.msg = el => Nav.go('thread', { id: el.dataset.id });
ACT.newcase = el => Nav.go('newcase', { lawyerId: el.dataset.id });
ACT.book = el => {
  if (isLawyer()) { toast('Switch to a client account to book'); return; }
  Nav.go('book', { lawyerId: el.dataset.id, mode: el.dataset.mode || '' });
};

/* ================= BOOKING FLOW ================= */
SCREENS.book = {
  title: 'Book', bare: true,
  async load(p) { const [l, s] = await Promise.all([API.get('/api/lawyers/' + p.lawyerId), API.get('/api/lawyers/' + p.lawyerId + '/slots?days=14&date=' + todayStr())]); return { l, days: s.days }; },
  render(p, d) {
    if (!d) return topbar('Book consultation') + skel(4);
    const l = d.l, mode = p.mode || '', day = d.days.find(x => x.date === p.date), fee = mode ? l.fees[mode] : null, conv = (fee > 0 && S.meta.config.convenienceFee) || 0;
    let h = topbar('Book consultation') + '<div class="page with-fab"><div class="row">' + avatar({ id: l.id, name: l.name, hasPhoto: l.hasPhoto, photoV: l.photoV, online: l.online }) + '<div><div class="b">' + esc(l.name) + ' ' + tick() + '</div><div class="small muted">' + l.areas.slice(0, 2).map(areaName).map(esc).join(' · ') + '</div></div></div>';
    h += '<div class="sec"><h2>1 · Consultation type</h2></div><div class="gap">' + l.modes.map(m => '<div class="step ' + (mode === m ? 'done' : '') + '" style="' + (mode === m ? 'opacity:1;border-color:var(--fg);background:var(--soft)' : '') + '" data-act="bmode" data-v="' + m + '"><div class="av sm">' + I(MODE_ICON[m]) + '</div><div class="sp"><div class="b">' + esc(modeName(m)) + '</div></div><b>' + (l.fees[m] === 0 ? 'Free' : rupee(l.fees[m])) + '</b></div>').join('') + '</div>';
    h += '<div class="sec"><h2>2 · Date</h2></div><div class="days">' + d.days.map(x => { const dp = dparts(x.date), free = x.slots.filter(s => s.free).length; return '<div class="day ' + (p.date === x.date ? 'on' : '') + (free ? '' : ' none') + '" data-act="bdate" data-v="' + x.date + '"><small>' + dp.dow + '</small><b>' + dp.day + '</b><small>' + dp.mon + '</small></div>'; }).join('') + '</div>';
    if (p.date) h += '<div class="sec"><h2>3 · Time <span class="muted small b">(' + fmtDate(p.date) + ')</span></h2></div>' + (day && day.slots.some(s => s.free) ? '<div class="slots">' + day.slots.map(s => '<div class="slot ' + (s.free ? '' : 'off') + (p.time === s.time ? ' on' : '') + '" data-act="btime" data-v="' + s.time + '">' + fmtTime(s.time) + '</div>').join('') + '</div>' : '<div class="card soft small">No free slots on this day. Pick another date.</div>');
    h += '<div class="sec"><h2>4 · What is it about?</h2></div><div class="field"><textarea id="bnote" class="in" placeholder="A few lines so the lawyer can prepare (optional)" maxlength="500">' + esc(p.note || '') + '</textarea></div>';
    if (mode && p.date && p.time) h += '<div class="card soft"><div class="kv"><span>' + esc(modeName(mode)) + ' · ' + fmtDate(p.date) + ' ' + fmtTime(p.time) + '</span><span></span></div><div class="kv"><span>Consultation fee</span><span>' + (fee === 0 ? 'Free' : rupee(fee)) + '</span></div>' + (conv ? '<div class="kv"><span>Convenience fee</span><span>' + rupee(conv) + '</span></div>' : '') + '<div class="kv"><span class="b" style="color:var(--fg)">Total</span><span style="font-size:18px">' + (fee + conv === 0 ? 'Free' : rupee(fee + conv)) + '</span></div></div><p class="tiny muted mts">Free cancellation up to ' + S.meta.config.cancelHoursBefore + ' hours before the slot. If the lawyer cancels, you are refunded in full.</p>';
    h += '</div><div style="position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;padding:12px 18px calc(12px + var(--sab));background:var(--bg);border-top:1px solid var(--line)"><button class="btn block" data-act="bconfirm" ' + (mode && p.date && p.time ? '' : 'disabled') + '>' + (fee + conv > 0 ? 'Pay ' + rupee(fee + conv) + ' & confirm' : 'Confirm booking') + '</button></div>';
    return h;
  },
  mount(el, p) { const n = $('#bnote', el); if (n) n.oninput = () => { p.note = n.value; Nav.save(); }; }
};
const bset = (k, v) => { const f = Nav.top(); f.params[k] = v; if (k === 'date') delete f.params.time; Nav.save(); Nav.paint(f, true); };
ACT.bmode = el => bset('mode', el.dataset.v); ACT.bdate = el => bset('date', el.dataset.v); ACT.btime = el => bset('time', el.dataset.v);
ACT.bconfirm = el => busy(el, async () => {
  const f = Nav.top(), p = f.params; p.note = val('#bnote') || p.note || '';
  try {
    const r = await API.post('/api/bookings', { lawyerId: p.lawyerId, mode: p.mode, date: p.date, time: p.time, note: p.note });
    await afterBooking(r.booking);
  } catch (e) {
    if (e.body && e.body.code === 'verify_required') { Nav.go('verify', {}); toast('Please verify your identity to book'); return; }
    if (e.body && e.body.code === 'slot_taken') { toast(e.message); f.params.time = ''; Nav.load(f, false); return; }
    throw e;
  }
});
async function afterBooking(b) {
  if (b.total > 0 && b.status === 'awaiting_payment') {
    payFlow({ paymentId: b.payment.id, amount: b.total, title: 'Consultation with ' + b.other.name, onDone: () => Nav.replace('booking', { id: b.id, success: 1 }), onClose: () => { toast('Booking held for 10 minutes. Pay to confirm.'); Nav.replace('booking', { id: b.id }); } });
  } else Nav.replace('booking', { id: b.id, success: 1 });
}

/* ================= MOCK PAYMENT SHEET ================= */
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Indian Bank', 'Canara Bank'], WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];
function payFlow(o) {
  let method = 'upi', paid = false;
  const layer = sheet('<div id="pf"></div>', { onClose: () => { if (!paid && o.onClose) o.onClose(); } });
  const draw = (err) => {
    const body = method === 'upi' ? '<div class="field"><label>UPI ID</label><input id="vpa" class="in" placeholder="name@bank" autocapitalize="off" value="' + esc(o.vpa || '') + '"></div><div class="row wrap mts">' + ['@okhdfcbank', '@oksbi', '@ybl', '@paytm'].map(s => '<button class="chip" data-act="vpasuf" data-v="' + s + '">' + s + '</button>').join('') + '</div>' :
      method === 'card' ? '<div class="field"><label>Card number</label><input id="card" class="in" inputmode="numeric" placeholder="4111 1111 1111 1111" maxlength="19"></div><div class="row"><div class="field sp"><label>Expiry</label><input class="in" placeholder="MM/YY" maxlength="5"></div><div class="field sp"><label>CVV</label><input class="in" type="password" inputmode="numeric" maxlength="4" placeholder="•••"></div></div>' :
      '<div class="gap">' + (method === 'netbanking' ? BANKS : WALLETS).map((b, i) => '<label class="step" style="cursor:pointer"><input type="radio" name="bk" ' + (i === 0 ? 'checked' : '') + '> <span class="b">' + b + '</span></label>').join('') + '</div>';
    $('#pf').innerHTML = '<div class="row"><div class="h2 sp">Pay ' + rupee(o.amount) + '</div><button class="iconbtn" data-act="close" aria-label="Close">' + I('x') + '</button></div><div class="small muted">' + esc(o.title) + '</div>' +
      '<div class="card soft tiny mt">Demo payment: no real money moves. For a declined payment try a UPI ID ending <b>@fail</b> or a card ending <b>0002</b>.</div>' +
      '<div class="seg mt">' + [['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Netbanking'], ['wallet', 'Wallet']].map(m => '<button data-act="paym" data-v="' + m[0] + '" class="' + (method === m[0] ? 'on' : '') + '">' + m[1] + '</button>').join('') + '</div><div class="mt">' + body + '</div>' +
      (err ? '<div class="err-msg">' + esc(err) + '</div>' : '') + '<button class="btn block mt" data-act="paygo">' + I('lock') + ' Pay ' + rupee(o.amount) + '</button>';
    const c = $('#card'); if (c) c.oninput = () => { c.value = c.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(); };
  };
  App._pay = { o, layer, set m(v) { method = v; o.vpa = val('#vpa') || o.vpa; draw(); }, get m() { return method; }, draw, done: () => { paid = true; } };
  draw();
}
ACT.paym = el => { App._pay.m = el.dataset.v; };
ACT.vpasuf = el => { const i = $('#vpa'); i.value = i.value.split('@')[0] + el.dataset.v; };
ACT.paygo = el => busy(el, async () => {
  const P = App._pay, m = P.m, body = { method: m };
  if (m === 'upi') body.vpa = val('#vpa'); if (m === 'card') body.card = val('#card');
  try {
    const r = await API.post('/api/payments/' + P.o.paymentId + '/pay', body);
    P.done(); P.layer.close(); Bridge.vibrate(25); toast('Payment successful · ' + r.payment.receipt); P.o.onDone && P.o.onDone(r);
  } catch (e) { if (e.status === 402) { P.draw(e.message); return; } if (e.status === 400) { P.draw(e.message); return; } throw e; }
});

/* ================= BOOKINGS ================= */
SCREENS.bookings = {
  title: 'My bookings',
  load() { return API.get('/api/bookings'); },
  render(p, d) {
    const seg = p.seg || 'upcoming'; let h = topbar('My bookings') + '<div class="page"><div class="seg"><button data-act="bseg" data-v="upcoming" class="' + (seg === 'upcoming' ? 'on' : '') + '">' + esc(t('Upcoming')) + '</button><button data-act="bseg" data-v="past" class="' + (seg === 'past' ? 'on' : '') + '">' + esc(t('Past')) + '</button></div><div class="mt">';
    if (!d) return h + skel(3) + '</div></div>';
    const now = Date.now(), act = b => ['awaiting_payment', 'requested', 'confirmed'].includes(b.status) && b.startMs + b.durationMin * 60e3 > now;
    const items = d.items.filter(b => b.status !== 'expired' && (seg === 'upcoming' ? act(b) : !act(b))).sort((a, b) => seg === 'upcoming' ? a.startMs - b.startMs : b.startMs - a.startMs);
    if (!items.length) return h + empty('calendar', seg === 'upcoming' ? 'No upcoming bookings' : 'Nothing here yet', 'Book a consultation with a verified lawyer.', isLawyer() ? '' : '<button class="btn mt" data-act="tosearch">Find a lawyer</button>') + '</div></div>';
    return h + '<div class="list">' + items.map(b => '<div class="card tap" data-act="booking" data-id="' + b.id + '"><div class="row"><div class="av sm">' + I(MODE_ICON[b.mode]) + '</div><div class="sp" style="min-width:0"><div class="b">' + esc(b.other.name) + '</div><div class="small muted">' + fmtDate(b.date) + ' · ' + fmtTime(b.time) + ' · ' + esc(b.modeName) + '</div></div><div class="c">' + statusPill(b.status) + '<div class="tiny muted mts">' + (b.total ? rupee(b.total) : 'Free') + '</div></div></div></div>').join('') + '</div></div></div>';
  }
};
ACT.bseg = el => { const f = Nav.top(); f.params.seg = el.dataset.v; Nav.save(); Nav.paint(f, false); };
ACT.booking = el => Nav.go('booking', { id: el.dataset.id });
ACT.mybookings = () => Nav.go('bookings', {});

SCREENS.booking = {
  title: 'Booking',
  load(p) { return API.get('/api/bookings/' + p.id).then(r => r.booking); },
  render(p, b) {
    if (!b) return topbar('Booking') + skel(3);
    const L = isLawyer(), o = b.other, upcoming = ['requested', 'confirmed'].includes(b.status);
    let h = topbar('Booking') + '<div class="page">';
    if (p.success) h += '<div class="hero c"><div style="width:56px;height:56px;border-radius:50%;background:var(--inv-fg);color:var(--inv-bg);display:grid;place-items:center;margin:0 auto 10px">' + I('check') + '</div><h2>' + (b.status === 'confirmed' ? 'Booking confirmed' : 'Request sent') + '</h2><p>' + (b.status === 'confirmed' ? 'We have notified ' + esc(o.name) + '.' : 'Waiting for ' + esc(o.name) + ' to confirm. You will be notified.') + '</p></div><div class="mt"></div>';
    h += '<div class="card"><div class="row" data-act="' + (L ? 'noop' : 'lawyer') + '" data-id="' + o.id + '">' + avatar(o) + '<div class="sp"><div class="b">' + esc(o.name) + '</div><div class="small muted">' + (L ? esc(o.city || '') : (o.areas || []).slice(0, 2).map(areaName).map(esc).join(' · ')) + '</div></div>' + statusPill(b.status) + '</div></div>';
    h += '<div class="card mt"><div class="kv"><span>When</span><span>' + fmtDate(b.date) + ' · ' + fmtTime(b.time) + '</span></div><div class="kv"><span>Type</span><span>' + esc(b.modeName) + '</span></div><div class="kv"><span>Duration</span><span>' + b.durationMin + ' min</span></div>' + (b.note ? '<div class="kv"><span>Note</span><span>' + esc(b.note) + '</span></div>' : '') + '</div>';
    if (b.status === 'confirmed') {
      h += '<div class="gap mt">';
      if (b.mode === 'video' && b.joinUrl) h += '<button class="btn block" data-act="ext" data-v="' + esc(b.joinUrl) + '">' + I('video') + ' Join video call</button>';
      if (b.mode === 'call' && o.phone) h += '<a class="btn block" href="tel:' + esc(o.phone) + '">' + I('phone') + ' Call ' + esc(o.phone) + '</a>';
      if (b.mode === 'in_person' && !L && o.lat != null) h += '<div class="card soft small">' + I('building').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"') + ' ' + esc(o.address || '') + '</div><button class="btn ghost block" data-act="dir" data-lat="' + o.lat + '" data-lng="' + o.lng + '">' + I('locate') + ' Directions</button>';
      if (b.mode === 'chat' || true) h += '<button class="btn ghost block" data-act="msg" data-id="' + o.id + '">' + I('chat') + ' Message ' + esc(firstName(o.name)) + '</button>';
      h += '</div>';
    }
    if (L && b.commission != null && b.fee) h += '<div class="card soft mt small"><div class="kv"><span>Fee</span><span>' + rupee(b.fee) + '</span></div><div class="kv"><span>Platform commission</span><span>− ' + rupee(b.commission) + '</span></div><div class="kv"><span class="b">You earn</span><span>' + rupee(b.net) + '</span></div></div>';
    else if (b.payment) h += '<div class="card mt"><div class="kv"><span>Paid</span><span>' + rupee(b.total) + ' · ' + esc(cap(b.payment.status)) + '</span></div>' + (b.payment.receipt ? '<div class="kv"><span>Receipt</span><span>' + esc(b.payment.receipt) + '</span></div>' : '') + (b.refund ? '<div class="kv"><span>Refunded</span><span>' + rupee(b.refund) + '</span></div>' : '') + '</div>' + (b.payment.receipt ? '<div class="mts c"><a class="link" data-act="sharereceipt">Share receipt</a></div>' : '');
    if (b.status === 'awaiting_payment' && !L && b.payment) h += '<button class="btn block mt" data-act="paybooking">Pay ' + rupee(b.total) + ' to confirm</button>';
    h += '<div class="gap mt2">';
    if (L && b.status === 'requested') h += '<div class="row"><button class="btn ghost block" data-act="bdecline">Decline</button><button class="btn block" data-act="bconfirmL">Confirm</button></div>';
    if (L && b.status === 'confirmed' && b.startMs <= Date.now() + 10 * 60e3) h += '<button class="btn block" data-act="bcomplete">Mark as completed</button>';
    if (!L && b.status === 'completed' && !b.reviewed) h += '<button class="btn block" data-act="breview">★ Rate this consultation</button>';
    if (!L && b.status === 'completed') h += '<button class="btn ghost block" data-act="newcase" data-id="' + o.id + '">' + I('briefcase') + ' Register a case with ' + esc(firstName(o.name)) + '</button>';
    if (!L && b.canReschedule) h += '<button class="btn ghost block" data-act="bresched">Reschedule</button>';
    if (b.canCancel && b.status !== 'awaiting_payment') h += '<button class="btn ghost block" data-act="bcancel">Cancel booking</button>';
    return h + '</div></div>';
  }
};
ACT.noop = () => {};
ACT.ext = el => Bridge.open(el.dataset.v);
ACT.paybooking = () => { const b = Nav.top().data; payFlow({ paymentId: b.payment.id, amount: b.total, title: 'Consultation with ' + b.other.name, onDone: () => { Nav.top().params.success = 1; Nav.refresh(false); } }); };
ACT.sharereceipt = () => { const b = Nav.top().data; Bridge.share('GetYourLawyer receipt ' + b.payment.receipt + '\n' + b.modeName + ' with ' + b.other.name + '\n' + fmtDate(b.date) + ' ' + fmtTime(b.time) + '\nPaid ' + rupee(b.total)); };
const bact = (el, path, body, msg) => busy(el, async () => { const r = await API.post('/api/bookings/' + Nav.top().params.id + '/' + path, body); Nav.top().data = r.booking; Nav.paint(Nav.top(), true); toast(msg); });
ACT.bconfirmL = el => bact(el, 'confirm', {}, 'Booking confirmed');
ACT.bdecline = async el => { if (await confirmBox({ title: 'Decline this request?', text: 'The client is refunded in full.', ok: 'Decline' })) bact(el, 'decline', {}, 'Declined'); };
ACT.bcomplete = el => bact(el, 'complete', {}, 'Marked as completed');
ACT.bcancel = async el => {
  const b = Nav.top().data, L = isLawyer(), refund = L || b.freeCancel;
  if (await confirmBox({ title: 'Cancel this booking?', text: b.payment && b.payment.status === 'paid' ? (refund ? 'You will be refunded ' + rupee(b.total) + '.' : 'It is too close to the appointment, so this will not be refunded.') : '', ok: 'Cancel booking', no: 'Keep it' })) bact(el, 'cancel', {}, 'Booking cancelled');
};
ACT.breview = () => {
  const b = Nav.top().data; let rating = 0;
  const l = sheet('<div class="h2">Rate ' + esc((b.other || b.lawyer).name) + '</div><div class="row mt" style="justify-content:center;font-size:38px" id="rs">' + [1, 2, 3, 4, 5].map(n => '<span data-act="rate" data-v="' + n + '" style="cursor:pointer;color:var(--line)">★</span>').join('') + '</div><div class="field mt"><textarea id="rtext" class="in" placeholder="Share a few words (optional)" maxlength="600"></textarea></div><button class="btn block" data-act="sendreview" disabled>Submit review</button>');
  App._rate = 0;
};
ACT.rate = el => { App._rate = +el.dataset.v; $$('#rs span').forEach((s, i) => { s.style.color = i < App._rate ? 'var(--fg)' : 'var(--line)'; }); $('[data-act=sendreview]').disabled = false; };
ACT.sendreview = el => busy(el, async () => {
  const f = Nav.top(), body = f.name === 'booking' ? { bookingId: f.params.id } : { caseId: f.params.id };
  await API.post('/api/reviews', Object.assign(body, { rating: App._rate, text: val('#rtext') })); Layers.closeTop(); toast('Thanks for your review'); Nav.refresh(false);
});
ACT.bresched = async () => {
  const b = Nav.top().data, s = await API.get('/api/lawyers/' + b.lawyerId + '/slots?days=10&date=' + todayStr()); let pick = null, date = '';
  const draw = () => { $('#rs-body').innerHTML = '<div class="days">' + s.days.map(x => { const dp = dparts(x.date), free = x.slots.some(z => z.free); return '<div class="day ' + (date === x.date ? 'on' : '') + (free ? '' : ' none') + '" data-act="rsdate" data-v="' + x.date + '"><small>' + dp.dow + '</small><b>' + dp.day + '</b></div>'; }).join('') + '</div>' + (date ? '<div class="slots mt">' + s.days.find(x => x.date === date).slots.map(z => '<div class="slot ' + (z.free ? '' : 'off') + (pick === z.time ? ' on' : '') + '" data-act="rstime" data-v="' + z.time + '">' + fmtTime(z.time) + '</div>').join('') + '</div>' : '') + '<button class="btn block mt" data-act="rsgo" ' + (pick ? '' : 'disabled') + '>Move booking</button>'; };
  sheet('<div class="h2">Reschedule</div><div id="rs-body" class="mt"></div>'); App._rs2 = { set d(v) { date = v; pick = null; draw(); }, set t(v) { pick = v; draw(); }, get v() { return { date, time: pick }; } }; draw();
};
ACT.rsdate = el => { App._rs2.d = el.dataset.v; }; ACT.rstime = el => { App._rs2.t = el.dataset.v; };
ACT.rsgo = el => busy(el, async () => { const r = await API.post('/api/bookings/' + Nav.top().params.id + '/reschedule', App._rs2.v); Layers.closeTop(); Nav.top().data = r.booking; Nav.paint(Nav.top(), true); toast('Booking moved'); });
Live.sub('booking', () => { if (Nav.is('booking') || Nav.is('bookings') || Nav.is('ldash') || Nav.is('lcalendar') || Nav.is('home')) Nav.refresh(true); });

/* ================= URGENT HELP ================= */
SCREENS.urgent = {
  title: 'Urgent legal help', bare: true,
  render(p) {
    if (p.done) return topbar('Urgent legal help') + '<div class="page"><div class="hero c"><h2>' + (p.alerted ? p.alerted + ' lawyer' + (p.alerted > 1 ? 's' : '') + ' alerted' : 'Request sent') + '</h2><p>' + (p.alerted ? 'The first lawyer to accept will open your case, and you will be notified instantly.' : 'No online lawyers are nearby right now. We will keep the request open for 6 hours and alert lawyers as they come online.') + '</p></div>' +
      '<div class="gap mt"><a class="btn block" href="tel:112">' + I('phone') + ' Call emergency 112</a><button class="btn ghost block" data-act="trackreq">Track in Cases</button></div></div>';
    const areas = S.meta.areas;
    return topbar('Urgent legal help') + '<div class="page"><div class="card inv"><b>In danger? Call 112 first.</b><div class="small muted mts">Women helpline 181 · Cyber crime 1930 · Free legal aid 15100</div></div>' +
      '<div class="field mt2"><label>What kind of help?</label><div class="chips" style="flex-wrap:wrap;margin:0;padding:0">' + areas.map(a => '<button class="chip ' + (p.area === a.id ? 'on' : '') + '" data-act="uarea" data-v="' + a.id + '">' + esc(a.name) + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>What happened?</label><textarea id="utext" class="in" maxlength="1000" placeholder="e.g. My brother was arrested last night and needs bail help.">' + esc(p.text || '') + '</textarea></div>' +
      '<div class="card soft small">' + I('pin').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"') + ' We alert <b>online, approved lawyers near your current location</b>. Your phone number is shared only with the lawyer who accepts.</div><div id="err"></div>' +
      '<button class="btn block mt" data-act="usend">' + I('zap') + ' Alert nearby lawyers</button></div>';
  },
  mount(el, p) { const t = $('#utext', el); if (t) t.oninput = () => { p.text = t.value; Nav.save(); }; }
};
ACT.uarea = el => { const f = Nav.top(); f.params.text = val('#utext'); f.params.area = el.dataset.v; Nav.save(); Nav.paint(f, true); };
ACT.usend = el => busy(el, async () => {
  const f = Nav.top(), text = val('#utext'), area = f.params.area; $('#err').innerHTML = '';
  if (!area) { $('#err').innerHTML = '<div class="err-msg">Choose the kind of help</div>'; return; } if (text.length < 10) { $('#err').innerHTML = '<div class="err-msg">Describe what happened in a sentence or two</div>'; return; }
  const pos = await getPos(); const title = (S.meta.areas.find(a => a.id === area).name + ' · urgent').slice(0, 100);
  try { const r = await API.post('/api/requests', { title, area, description: text, urgency: 'urgent', lat: pos.lat, lng: pos.lng }); f.params = { done: 1, alerted: r.request.alerted }; Nav.save(); Nav.paint(f, false); }
  catch (e) { if (e.body && e.body.code === 'verify_required') { Nav.go('verify', {}); toast('Please verify your identity first'); return; } throw e; }
});
ACT.trackreq = () => { S.stack = [{ name: 'cases', params: { seg: 'requests' } }]; S.tab = 'cases'; Nav.open(); };
