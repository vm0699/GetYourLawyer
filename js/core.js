'use strict';
/* GetYourLawyer web app core: helpers, i18n, API, router (restores the last screen), layers, live stream. No build step. */

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('gyl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gyl.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem('gyl.' + k); } catch (e) { /* ignore */ } }
};
const rupee = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const p2 = n => String(n).padStart(2, '0');
const pad = p2;
const istNow = () => { const d = new Date(Date.now() + 330 * 60e3); return { date: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), time: p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) }; };
const todayStr = () => istNow().date;
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dparts = date => { const d = new Date(date + 'T12:00:00Z'); return { dow: DOW[d.getUTCDay()], day: d.getUTCDate(), mon: MON[d.getUTCMonth()], y: d.getUTCFullYear(), idx: d.getUTCDay() }; };
const fmtDate = date => { if (!date) return ''; const p = dparts(date), t = todayStr(); if (date === t) return 'Today'; if (date === addDays(t, 1)) return 'Tomorrow'; return p.dow + ', ' + p.day + ' ' + p.mon + (p.y !== +t.slice(0, 4) ? ' ' + p.y : ''); };
const fmtTime = tm => { if (!tm) return ''; const [h, m] = tm.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + p2(m) + ' ' + (h < 12 ? 'AM' : 'PM'); };
const fmtTs = ts => { const d = new Date(+ts + 330 * 60e3); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; if (s < 604800) return Math.floor(s / 86400) + 'd'; return fmtTs(ts); };
const hhmm = ts => { const d = new Date(+ts + 330 * 60e3); return fmtTime(p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes())); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const val = (sel, root) => { const e = $(sel, root); return e ? e.value.trim() : ''; };
const initials = n => String(n || '?').replace(/^Adv\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const cap = s => s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';

/* ---------- icons (24px stroke set) ---------- */
const IC = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="17"/><line x1="15" y1="22" x2="15" y2="17"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="9" y1="14" x2="9.01" y2="14"/><line x1="15" y1="14" x2="15.01" y2="14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  locate: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  chev: '<polyline points="9 18 15 12 9 6"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><line x1="12" y1="8" x2="12" y2="4"/><circle cx="12" cy="3" r="1"/><circle cx="8.5" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/>',
  scale: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="6" y1="21" x2="18" y2="21"/><line x1="4" y1="6" x2="20" y2="6"/><path d="M4 6l-3 8a4 4 0 0 0 6 0z"/><path d="M20 6l-3 8a4 4 0 0 0 6 0z"/>',
  gavel: '<path d="M14 13l-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="M16 16l6-6"/><path d="M8 8l6-6"/><path d="M9 7l8 8"/><path d="M21 11l-8-8"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  bank: '<path d="M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M2 10l10-7 10 7"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  feather: '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  wallet: '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};
const I = (n, cls) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : '') + '>' + (IC[n] || '') + '</svg>';
const AREA_ICON = { family: 'users', criminal: 'gavel', property: 'home', civil: 'file', consumer: 'bag', cyber: 'shield', corporate: 'briefcase', labour: 'tool', tax: 'percent', ip: 'award', motor: 'truck', cheque: 'card', banking: 'bank', constitutional: 'book', wills: 'feather', immigration: 'globe' };
const MODE_ICON = { chat: 'chat', call: 'phone', video: 'video', in_person: 'building' };

/* ---------- Tamil (English is the key; anything missing falls back to English). Have a native speaker review. ---------- */
const TA = {
  'Home': 'முகப்பு', 'Lawyers': 'வழக்கறிஞர்கள்', 'Cases': 'வழக்குகள்', 'Messages': 'செய்திகள்', 'Profile': 'சுயவிவரம்', 'Dashboard': 'டாஷ்போர்டு', 'Calendar': 'நாட்காட்டி',
  'Find a lawyer': 'வழக்கறிஞரைத் தேடுங்கள்', 'Search lawyers, topics': 'வழக்கறிஞர், தலைப்பு தேடுங்கள்', 'Urgent legal help': 'அவசர சட்ட உதவி', 'Book': 'முன்பதிவு', 'Book consultation': 'ஆலோசனை முன்பதிவு',
  'Continue': 'தொடரவும்', 'Cancel': 'ரத்து செய்', 'Save': 'சேமி', 'Next': 'அடுத்து', 'Back': 'பின்', 'Done': 'முடிந்தது', 'Pay': 'செலுத்து', 'Verify': 'சரிபார்', 'Verified': 'சரிபார்க்கப்பட்டது',
  'Welcome': 'வரவேற்கிறோம்', 'Get started': 'தொடங்குங்கள்', 'Sign in': 'உள்நுழை', 'Mobile number': 'கைபேசி எண்', 'Enter OTP': 'OTP உள்ளிடவும்', 'I am a client': 'நான் வாடிக்கையாளர்', 'I am a lawyer': 'நான் வழக்கறிஞர்',
  'Online': 'ஆன்லைன்', 'Offline': 'ஆஃப்லைன்', 'Nearby lawyers': 'அருகிலுள்ள வழக்கறிஞர்கள்', 'Live map': 'நேரலை வரைபடம்', 'List': 'பட்டியல்', 'Map': 'வரைபடம்', 'Filters': 'வடிகட்டிகள்',
  'Practice areas': 'சட்டப் பிரிவுகள்', 'Family & Divorce': 'குடும்பம் & விவாகரத்து', 'Criminal': 'குற்றவியல்', 'Property & Land': 'சொத்து & நிலம்', 'Consumer': 'நுகர்வோர்', 'Cyber Crime': 'சைபர் குற்றம்',
  'Fees': 'கட்டணம்', 'Consultation fee': 'ஆலோசனைக் கட்டணம்', 'Reviews': 'மதிப்புரைகள்', 'About': 'பற்றி', 'Experience': 'அனுபவம்', 'years': 'ஆண்டுகள்', 'Languages': 'மொழிகள்',
  'My bookings': 'என் முன்பதிவுகள்', 'Upcoming': 'வரவிருப்பவை', 'Past': 'கடந்தவை', 'Register a case': 'வழக்கைப் பதிவு செய்', 'My cases': 'என் வழக்குகள்', 'Hearings': 'விசாரணைகள்', 'Documents': 'ஆவணங்கள்',
  'Updates': 'புதுப்பிப்புகள்', 'Invoices': 'விலைப்பட்டியல்கள்', 'Next hearing': 'அடுத்த விசாரணை', 'Stage': 'நிலை', 'Court': 'நீதிமன்றம்', 'Settings': 'அமைப்புகள்', 'Language': 'மொழி', 'Appearance': 'தோற்றம்',
  'Log out': 'வெளியேறு', 'Help & support': 'உதவி & ஆதரவு', 'Notifications': 'அறிவிப்புகள்', 'Ask GetYourLawyer': 'GetYourLawyer-இடம் கேளுங்கள்', 'Type a message': 'செய்தியை எழுதுங்கள்',
  'Verify with DigiLocker': 'DigiLocker மூலம் சரிபார்க்கவும்', 'Bar Council details': 'பார் கவுன்சில் விவரங்கள்', 'Earnings': 'வருவாய்', 'Reports': 'அறிக்கைகள்', 'Clients': 'வாடிக்கையாளர்கள்', 'Requests': 'கோரிக்கைகள்',
  'Today': 'இன்று', 'Tomorrow': 'நாளை', 'Chat consult': 'அரட்டை ஆலோசனை', 'Phone call': 'தொலைபேசி அழைப்பு', 'Video call': 'வீடியோ அழைப்பு', 'In person': 'நேரில்', 'Confirmed': 'உறுதிசெய்யப்பட்டது',
  'Not legal advice': 'இது சட்ட ஆலோசனை அல்ல', 'Saved lawyers': 'சேமித்த வழக்கறிஞர்கள்', 'Payments': 'கட்டணங்கள்', 'Edit profile': 'சுயவிவரத்தைத் திருத்து', 'Go online': 'ஆன்லைனில் செல்', 'Add case': 'வழக்கைச் சேர்'
};
let LANG = LS.get('lang', 'en');
const t = s => (LANG === 'ta' && TA[s]) || s;

/* ---------- API ---------- */
const API = {
  base: '', token: LS.get('token', ''),
  init() {
    const q = new URLSearchParams(location.search).get('api');
    let b = q || (window.AndroidBridge && window.AndroidBridge.apiBase && window.AndroidBridge.apiBase()) || '';
    if (!b) { if (/^https?:$/.test(location.protocol) && location.hostname !== 'appassets.androidplatform.net') b = location.origin; else b = LS.get('apiBase', '') || 'https://getyourlawyer-api.onrender.com'; }
    if (q) LS.set('apiBase', q);
    this.base = b.replace(/\/$/, '');
  },
  setToken(tk) { this.token = tk || ''; if (tk) LS.set('token', tk); else LS.del('token'); },
  async call(method, path, body, opt) {
    let r; const ac = new AbortController(), big = body != null && JSON.stringify(body).length > 100000;
    const timer = setTimeout(() => ac.abort(), big ? 90000 : 60000);              // long enough for a sleeping free-tier server to wake; never spin forever
    if (opt && opt.signal) opt.signal.addEventListener('abort', () => ac.abort());
    try {
      r = await fetch(this.base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }, this.token ? { Authorization: 'Bearer ' + this.token } : {}), body: body == null ? undefined : JSON.stringify(body), signal: ac.signal });
    } catch (e) {
      let host = ''; try { host = new URL(this.base).host; } catch (x) { /* ignore */ }
      const err = new Error(e.name === 'AbortError' ? 'The server did not answer (' + host + '). Check your internet, or that the server is running and reachable.' : 'Cannot reach the server (' + host + '). Check your internet connection.'); err.offline = true; throw err;
    } finally { clearTimeout(timer); }
    const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = { raw: txt }; }
    if (!r.ok) {
      if (r.status === 401 && this.token && !(opt && opt.quiet401)) { App.signedOut(); }
      const err = new Error(j.error || 'Something went wrong (' + r.status + ')'); err.status = r.status; err.body = j; throw err;
    }
    return j;
  },
  get: (p, o) => API.call('GET', p, null, o), post: (p, b, o) => API.call('POST', p, b || {}, o), put: (p, b) => API.call('PUT', p, b || {}), patch: (p, b) => API.call('PATCH', p, b || {}), del: p => API.call('DELETE', p),
  async blob(path) {
    const r = await fetch(this.base + path, { headers: Object.assign({ 'ngrok-skip-browser-warning': '1' }, this.token ? { Authorization: 'Bearer ' + this.token } : {}) });
    if (!r.ok) throw new Error('Could not open the file'); return r.blob();
  },
  photo: (id, v) => API.base + '/api/photo/' + id + '?v=' + (v || 0)
};

/* ---------- global state ---------- */
const S = { me: null, meta: null, pos: null, unread: 0, convUnread: 0, tab: 'home', stack: [], layers: [], online: true };
const isLawyer = () => S.me && S.me.role === 'lawyer';
const areaName = id => ((S.meta && S.meta.areas.find(a => a.id === id)) || {}).name || cap(id);
const modeName = id => ((S.meta && S.meta.modes.find(m => m.id === id)) || {}).name || cap(id);

/* ---------- avatars, small components ---------- */
function avatar(p, cls) {
  p = p || {};
  const st = p.hasPhoto && p.id ? ' style="background-image:url(\'' + esc(API.photo(p.id, p.photoV)) + '\')"' : '';
  return '<div class="av ' + (cls || '') + '"' + st + '>' + (st ? '' : esc(initials(p.name))) + (p.online != null ? '<span class="dot' + (p.online ? ' on' : '') + '"></span>' : '') + '</div>';
}
const stars = r => '<span class="stars" aria-label="' + r + ' stars">' + '★'.repeat(Math.round(r)) + '<span class="faint">' + '★'.repeat(5 - Math.round(r)) + '</span></span>';
const tick = () => '<span class="vtick" title="Verified">' + I('check') + '</span>';
const pill = (txt, c) => '<span class="pill ' + (c || '') + '">' + txt + '</span>';
const empty = (icon, title, text, btn) => '<div class="empty">' + I(icon) + '<b>' + esc(title) + '</b>' + (text ? '<div>' + esc(text) + '</div>' : '') + (btn || '') + '</div>';
const skel = n => '<div class="pad" style="padding-top:12px">' + Array.from({ length: n || 4 }, () => '<div class="skel"></div>').join('') + '</div>';
const statusPill = s => { const m = { confirmed: 'fill', completed: 'soft', requested: '', awaiting_payment: '', cancelled: 'soft', declined: 'soft', open: 'fill', closed: 'soft', accepted: 'fill', paid: 'fill', unpaid: '', refunded: 'soft', failed: 'soft', scheduled: '', done: 'soft', adjourned: '' }; return pill(esc(cap(s === 'awaiting_payment' ? 'awaiting payment' : s)), m[s] || ''); };
const topbar = (title, o) => { o = o || {}; return '<div class="bar' + (o.big ? ' big' : '') + '">' + (o.back === false ? '' : '<button class="iconbtn" data-act="back" aria-label="Back">' + I('back') + '</button>') + '<h1>' + esc(t(title)) + '</h1>' + (o.right || '') + '</div>'; };

/* ---------- layers: sheets, dialogs, toasts ---------- */
const Layers = {
  el: null,
  push(node, onClose) {
    const l = { node, onClose, close: () => Layers.close(l) };
    S.layers.push(l); this.el.appendChild(node); this.el.style.pointerEvents = 'auto';
    return l;
  },
  close(l) {
    const i = S.layers.indexOf(l); if (i < 0) return;
    S.layers.splice(i, 1); l.node.remove(); if (!S.layers.length) this.el.style.pointerEvents = 'none'; if (l.onClose) l.onClose();
  },
  closeTop() { const l = S.layers[S.layers.length - 1]; if (!l) return false; this.close(l); return true; }
};
function sheet(html, o) {
  o = o || {};
  const wrap = document.createElement('div');
  wrap.innerHTML = '<div class="scrim"></div><div class="sheet ' + (o.full ? 'full' : '') + '" role="dialog">' + (o.full ? html : '<div class="grab"></div>' + html) + '</div>';
  const layer = Layers.push(wrap, o.onClose);
  wrap.firstChild.onclick = () => { if (o.dismissable !== false) layer.close(); };
  layer.root = wrap.querySelector('.sheet');
  return layer;
}
function confirmBox(o) {
  return new Promise(res => {
    const wrap = document.createElement('div'); let done = false;
    wrap.innerHTML = '<div class="scrim"></div><div class="dialog"><div class="h2">' + esc(o.title) + '</div>' + (o.text ? '<p class="muted mts">' + esc(o.text) + '</p>' : '') +
      '<div class="row mt"><button class="btn ghost block" data-x="0">' + esc(o.no || t('Cancel')) + '</button><button class="btn block" data-x="1">' + esc(o.ok || 'OK') + '</button></div></div>';
    const l = Layers.push(wrap, () => { if (!done) res(false); });
    wrap.onclick = e => { const x = e.target.closest('[data-x]'); if (x) { done = true; l.close(); res(x.dataset.x === '1'); } else if (e.target.classList.contains('scrim')) l.close(); };
  });
}
function toast(msg, o) {
  o = o || {}; const box = $('#toasts'), el = document.createElement('div');
  el.className = 'toast' + (o.onTap ? ' tap' : ''); el.textContent = msg; box.appendChild(el);
  if (o.onTap) el.onclick = () => { o.onTap(); el.remove(); };
  setTimeout(() => el.remove(), o.ms || 3200);
}
const fail = e => { if (!e) return; toast(e.message || String(e), { ms: 4200 }); };
// run an async action with the button disabled; errors become toasts
async function busy(el, fn) {
  if (el && el.disabled) return; const prev = el && el.innerHTML;
  if (el) { el.disabled = true; el.setAttribute('disabled', ''); }
  try { return await fn(); } catch (e) { fail(e); } finally { if (el && el.isConnected) { el.disabled = false; el.removeAttribute('disabled'); } }
}

/* ---------- screens + router (last screen is restored after the app is killed) ---------- */
const SCREENS = {}, ACT = {};
const TABS = { client: ['home', 'lawyers', 'cases', 'messages', 'profile'], lawyer: ['ldash', 'lcases', 'lcalendar', 'messages', 'lprofile'] };
const TAB_META = { home: ['Home', 'home'], lawyers: ['Lawyers', 'search'], cases: ['Cases', 'briefcase'], messages: ['Messages', 'chat'], profile: ['Profile', 'user'], ldash: ['Dashboard', 'home'], lcases: ['Cases', 'briefcase'], lcalendar: ['Calendar', 'calendar'], lprofile: ['Profile', 'user'] };
const Nav = {
  top: () => S.stack[S.stack.length - 1],
  save() { LS.set('nav', { tab: S.tab, stack: S.stack.map(f => ({ name: f.name, params: f.params })) }); },
  reset(tab, stackNames) { S.tab = tab; S.stack = [{ name: tab, params: {} }].concat(stackNames || []); this.open(); },
  tab(tab) { if (S.tab === tab && S.stack.length === 1) { const f = this.top(); f.scroll = 0; $('#screen').scrollTop = 0; this.refresh(true); return; } S.tab = tab; S.stack = [{ name: tab, params: {} }]; this.open(); },
  go(name, params) { const f = this.top(); if (f) f.scroll = $('#screen').scrollTop; S.stack.push({ name, params: params || {} }); this.open(); },
  replace(name, params) { S.stack[S.stack.length - 1] = { name, params: params || {} }; this.open(); },
  back() { if (S.stack.length > 1) { S.stack.pop(); this.open(true); return true; } return false; },
  open(restoreScroll) {
    const f = this.top(); this.save(); Layers.el && S.layers.slice().forEach(l => l.close());
    if (!restoreScroll) f.scroll = 0;
    this.load(f, false);
  },
  async load(f, silent) {
    const sc = SCREENS[f.name]; if (!sc) { f.name = 'home'; return this.load(f, silent); }
    if (!sc.load) { f.data = f.data || {}; this.paint(f, false); return; }
    if (!silent && !f.data) this.paint(f, false);
    const seq = f.seq = (f.seq || 0) + 1;
    try { const d = await sc.load(f.params, f); if (f.seq !== seq) return; f.data = d; f.error = null; } catch (e) { if (f.seq !== seq) return; f.error = e; if (!silent) f.data = null; }
    if (this.top() === f) this.paint(f, silent);
  },
  paint(f, keep) {
    const sc = SCREENS[f.name], el = $('#screen'), st = el.scrollTop;
    if (f.error && !f.data) el.innerHTML = topbar(sc.title || '', { back: S.stack.length > 1 }) + '<div class="page">' + empty('alert', f.error.offline ? 'You are offline' : 'Could not load', f.error.message, '<button class="btn mt" data-act="retry">Try again</button>') + '</div>';
    else el.innerHTML = sc.render(f.params, f.data, f);
    renderTabs(sc); if (sc.mount && !(f.error && !f.data)) sc.mount(el, f.params, f.data, f);
    el.scrollTop = keep ? st : (f.scroll || 0);
  },
  refresh(silent) { const f = this.top(); if (f) this.load(f, silent !== false); },
  is(name) { const f = this.top(); return f && f.name === name; }
};
function renderTabs(sc) {
  const bar = $('#tabs'), show = sc && !sc.bare && S.me && S.me.role && S.stack.length === 1 && TABS[S.me.role].includes(S.tab);
  const showAny = sc && !sc.bare && S.me && S.me.role && TABS[S.me.role];
  bar.classList.toggle('hide', !showAny);
  const bf = $('#botfab'); if (bf) bf.classList.toggle('hide', !showAny);
  if (!showAny) return;
  bar.innerHTML = TABS[S.me.role].map(k => { const m = TAB_META[k], b = k === 'messages' ? S.convUnread : 0; return '<button data-act="tab" data-v="' + k + '" class="' + (S.tab === k ? 'on' : '') + '">' + I(m[1]) + '<span>' + esc(t(m[0])) + '</span>' + (b ? '<span class="badge">' + (b > 9 ? '9+' : b) + '</span>' : '') + '</button>'; }).join('');
}
// Android back button / swipe: layers first, then screens, then the home tab
window.__back = function () {
  if (Layers.closeTop()) return true;
  if (Nav.back()) return true;
  if (S.me && S.me.role && S.tab !== TABS[S.me.role][0]) { Nav.tab(TABS[S.me.role][0]); return true; }
  return false;
};

/* ---------- click delegation ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
ACT.back = () => { if (!Layers.closeTop()) Nav.back(); };
ACT.tab = el => Nav.tab(el.dataset.v);
ACT.retry = () => Nav.refresh(false);
ACT.go = el => Nav.go(el.dataset.v, el.dataset.id ? { id: el.dataset.id } : {});
ACT.close = () => Layers.closeTop();
ACT.tel = el => { location.href = 'tel:' + el.dataset.v; };

/* ---------- native bridge + device helpers ---------- */
const Bridge = {
  has: () => !!window.AndroidBridge,
  share(text) { if (window.AndroidBridge && AndroidBridge.share) AndroidBridge.share(text); else if (navigator.share) navigator.share({ text }).catch(() => {}); else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast('Copied to clipboard'); } },
  open(url) { if (window.AndroidBridge && AndroidBridge.openExternal) AndroidBridge.openExternal(url); else window.open(url, '_blank', 'noopener'); },
  vibrate(ms) { if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms || 15); else if (navigator.vibrate) navigator.vibrate(ms || 15); },
  async save(name, blob) {
    if (window.AndroidBridge && AndroidBridge.saveFile) {
      const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      if (AndroidBridge.saveFile(name, blob.type || 'application/octet-stream', b64)) { toast('Saved to Downloads/GetYourLawyer'); return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  },
  notice(id, when, title, text) { if (window.AndroidBridge && AndroidBridge.scheduleNotice) AndroidBridge.scheduleNotice(id, when, title, text); }
};
const CHENNAI = { lat: 13.0827, lng: 80.2707 };
function getPos(force) {
  if (S.pos && !force) return Promise.resolve(S.pos);
  return new Promise(res => {
    if (!navigator.geolocation) return res(S.pos = Object.assign({ approx: true }, CHENNAI));
    navigator.geolocation.getCurrentPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, approx: false }; LS.set('pos', S.pos); res(S.pos); },
      () => { S.pos = Object.assign({ approx: true }, LS.get('pos', CHENNAI)); res(S.pos); }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 });
  });
}
const km = d => d == null ? '' : (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km');
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || 'image/*,application/pdf'; i.style.display = 'none';
    i.onchange = () => { res(i.files[0] || null); i.remove(); }; i.oncancel = () => res(null); document.body.appendChild(i); i.click();
  });
}
// photo -> compressed JPEG data URL; PDF -> data URL if small enough
function fileToDataURL(file, o) {
  o = o || {}; const maxDim = o.maxDim || 1600, maxBytes = o.maxBytes || 1.5e6;
  return new Promise((res, rej) => {
    if (!file) return rej(new Error('No file chosen'));
    if (file.type === 'application/pdf') {
      if (file.size > maxBytes) return rej(new Error('PDF is too large. Keep it under ' + (maxBytes / 1e6).toFixed(1) + ' MB.'));
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Could not read the file')); return fr.readAsDataURL(file);
    }
    if (!/^image\//.test(file.type)) return rej(new Error('Choose a photo or PDF'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img; const sc = Math.min(1, maxDim / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      let q = 0.85, d = c.toDataURL('image/jpeg', q); while (d.length * 0.75 > maxBytes && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
      res(d);
    };
    img.onerror = () => rej(new Error('Could not read the image')); img.src = url;
  });
}
async function openFile(id, name) {
  try {
    const b = await API.blob('/api/files/' + id);
    if (/^image\/|pdf/.test(b.type) && !Bridge.has()) { window.open(URL.createObjectURL(b), '_blank'); return; }
    await Bridge.save(name || 'document', b);
  } catch (e) { fail(e); }
}

/* ---------- live stream (server-sent events over fetch, so the auth header works) ---------- */
const Live = {
  on: {}, ctrl: null, retry: 0, alive: false,
  start() {
    this.stop(); if (!API.token) return; this.alive = true;
    const run = async () => {
      if (!this.alive) return;
      this.ctrl = new AbortController();
      try {
        const q = S.pos ? '?lat=' + S.pos.lat + '&lng=' + S.pos.lng : '';
        const r = await fetch(API.base + '/api/live' + q, { headers: { Authorization: 'Bearer ' + API.token, 'ngrok-skip-browser-warning': '1' }, signal: this.ctrl.signal });
        if (r.status === 401) { App.signedOut(); return; }
        if (!r.ok || !r.body) throw new Error('stream ' + r.status);
        this.retry = 0; const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { done, value } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) { this.parse(buf.slice(0, i)); buf = buf.slice(i + 2); }
        }
      } catch (e) { /* reconnect below */ }
      if (this.alive) { this.retry = Math.min(this.retry + 1, 6); setTimeout(run, 1000 * this.retry); }
    };
    run();
  },
  stop() { this.alive = false; if (this.ctrl) try { this.ctrl.abort(); } catch (e) { /* closed */ } },
  parse(block) {
    let ev = 'message', data = ''; block.split('\n').forEach(l => { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data += l.slice(5).trim(); });
    if (!data) return; let j = {}; try { j = JSON.parse(data); } catch (e) { return; }
    (this.on[ev] || []).forEach(fn => { try { fn(j); } catch (e) { console.error(e); } });
  },
  sub(ev, fn) { (this.on[ev] = this.on[ev] || []).push(fn); }
};

/* ---------- theme ---------- */
function applyTheme() {
  const th = LS.get('theme', 'light'); document.documentElement.dataset.theme = th;
  const m = $('meta[name=theme-color]'); if (m) m.content = th === 'dark' ? '#000000' : '#ffffff';
}
