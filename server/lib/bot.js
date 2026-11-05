'use strict';
// Rule-based legal-help assistant (no AI service, no cost). It gives general information, guided "which lawyer do I need?"
// flows and in-app help, and hands off to a real lawyer through `cta` buttons. It never gives legal advice.
const DISC = '\n\nThis is general information, not legal advice. For your situation, talk to a verified lawyer.';
const HELP = '\n\nHelplines: Emergency 112 · Women 181 · Child 1098 · Cyber crime 1930 · Free legal aid (NALSA) 15100 · Consumer 1915';

const AREA_INFO = {
  family: ['Family & Divorce', 'Divorce, maintenance, custody, domestic violence, adoption and marriage disputes. Family courts handle most of these, and mediation is often tried first.'],
  criminal: ['Criminal', 'FIRs, arrest, bail, quashing of cases and trials. Since July 2024 the Bharatiya Nyaya Sanhita (BNS) and Bharatiya Nagarik Suraksha Sanhita (BNSS) replaced the IPC and CrPC for new offences.'],
  property: ['Property & Land', 'Sale deeds, title checks, partition, encroachment, tenancy and RERA disputes. Always verify title and encumbrance before paying.'],
  civil: ['Civil Disputes', 'Money recovery, contracts, injunctions and declaratory suits in civil courts.'],
  consumer: ['Consumer', 'Defective goods, deficient service, builder delays and insurance claims. You can file with the Consumer Commission, including online through e-Daakhil, usually within 2 years.'],
  cyber: ['Cyber Crime', 'Online fraud, hacking, harassment, identity theft and sextortion. Report fast on 1930 or cybercrime.gov.in and keep screenshots.'],
  corporate: ['Corporate & Startup', 'Company and LLP formation, founders\' agreements, contracts, compliance and disputes.'],
  labour: ['Labour & Service', 'Unpaid wages, wrongful termination, PF/ESI, service matters and workplace harassment.'],
  tax: ['Tax', 'Income tax and GST notices, assessments, appeals and tax planning.'],
  ip: ['Intellectual Property', 'Trademarks, copyright, patents and designs, including infringement notices.'],
  motor: ['Motor Accident', 'Claims before the Motor Accident Claims Tribunal for injury or death, and insurance disputes.'],
  cheque: ['Cheque Bounce', 'Section 138 of the Negotiable Instruments Act. Strict time limits apply: legal notice within 30 days of the bank memo, then 15 days for the payer to pay, then a complaint within a month.'],
  banking: ['Banking & Finance', 'Loan recovery, SARFAESI, DRT matters, credit card and bank fraud disputes.'],
  constitutional: ['Writ & Constitutional', 'Writ petitions in High Courts and the Supreme Court against state action.'],
  wills: ['Wills & Succession', 'Drafting and probate of wills, succession certificates and legal heir matters.'],
  immigration: ['Immigration', 'Visa, OCI and citizenship paperwork and appeals.']
};

// [intent, keywords (any), reply builder]
const RULES = [
  ['greet', ['hi', 'hello', 'hey', 'hola', 'vanakkam', 'good morning', 'good evening'], c => 'Hi! I am the GetYourLawyer assistant. I can explain basics, help you pick the right kind of lawyer and guide you through the app.', ['Find a lawyer', 'I need urgent help', 'Explain my rights', 'How do fees work?']],
  ['urgent', ['urgent', 'emergency', 'arrested', 'arrest', 'police', 'detained', 'threat', 'violence', 'abuse', 'help me now', 'sos'], c => 'If you or someone is in danger, call 112 right now.\n\nIf someone has been arrested: they must be told the grounds, can speak to a lawyer, and must be produced before a magistrate within 24 hours. You do not have to sign blank papers.' + HELP + '\n\nYou can also send an urgent request and nearby online lawyers will be alerted.', ['Send urgent request', 'Bail basics', 'Find a criminal lawyer'], { label: 'Urgent legal help', nav: 'urgent' }],
  ['fir', ['fir', 'complaint', 'police station', 'zero fir', 'refuse to register'], c => 'You can file an FIR at any police station (a "Zero FIR" can be registered anywhere and moved later). You are entitled to a free copy. If the station refuses, you can send the complaint in writing to the Superintendent of Police or approach a Magistrate. Many states also allow e-FIR online.' + DISC, ['Find a criminal lawyer', 'Bail basics']],
  ['bail', ['bail', 'anticipatory', 'remand', 'custody'], c => 'Bail is permission to stay out of custody while a case continues. Whether it is easy or hard depends on the offence (bailable vs non-bailable), the facts and the court. Anticipatory bail can be sought if you fear arrest. A lawyer should draft and argue it quickly because time matters.' + DISC, ['Find a criminal lawyer', 'Urgent help']],
  ['divorce', ['divorce', 'separation', 'maintenance', 'alimony', 'custody', 'husband', 'wife', 'marriage', 'dowry'], c => 'Divorce can be by mutual consent (usually faster) or contested on legal grounds. Maintenance, child custody and property are decided separately and the court looks at the facts. Family courts often try mediation first. Keep marriage, income and communication records safe.' + DISC, ['Find a family lawyer', 'Domestic violence help']],
  ['dv', ['domestic violence', 'beaten', '498a', 'harassment at home', 'in laws'], c => 'You can seek protection orders, residence and monetary relief under the Protection of Women from Domestic Violence Act. Call 181 (Women Helpline) or 112 in danger. A lawyer can help you apply to the Magistrate and file an FIR if needed.' + HELP + DISC, ['Find a family lawyer', 'Urgent help']],
  ['property', ['property', 'land', 'plot', 'flat', 'sale deed', 'title', 'encroach', 'tenant', 'landlord', 'rent', 'eviction', 'partition', 'patta', 'registration'], c => 'For property matters: check the title chain, encumbrance certificate, approvals and tax receipts before you pay. For rent disputes, the written agreement and payment proof matter most. Never pay large sums without a registered document.' + DISC, ['Find a property lawyer', 'How do I book?']],
  ['cheque', ['cheque', 'check bounce', 'dishonour', '138', 'bounced'], c => 'For a bounced cheque (Section 138 NI Act): send a legal notice within 30 days of the bank return memo, wait 15 days for payment, and if unpaid file a complaint within the next 30 days. Missing these limits can end the case, so see a lawyer quickly.' + DISC, ['Find a cheque bounce lawyer']],
  ['consumer', ['consumer', 'refund', 'defective', 'warranty', 'builder delay', 'insurance claim', 'e-daakhil', 'product', 'service deficiency'], c => 'Start with a written complaint to the seller or service provider, then a legal notice. If unresolved, file with the District Consumer Commission (online via e-Daakhil). The limit is usually 2 years from the cause of action. The National Consumer Helpline is 1915.' + DISC, ['Find a consumer lawyer']],
  ['cyber', ['cyber', 'online fraud', 'upi fraud', 'hacked', 'phishing', 'sextortion', 'morphed', 'otp fraud', 'scam'], c => 'Act fast: call 1930 or report at cybercrime.gov.in, tell your bank immediately to freeze transactions, and save screenshots, numbers and transaction IDs. Do not delete chats. Do not pay blackmailers.' + HELP + DISC, ['Find a cyber lawyer', 'Urgent help']],
  ['notice', ['legal notice', 'notice'], c => 'A legal notice is a formal written demand sent before going to court. It states the facts, what you want and a deadline. It is usually sent through a lawyer by registered post and email. Keep proof of delivery.' + DISC, ['Find a lawyer', 'How do I book?']],
  ['labour', ['salary', 'wages', 'terminated', 'fired', 'pf', 'gratuity', 'employer', 'job', 'posh', 'workplace'], c => 'For unpaid salary or wrongful termination, collect your appointment letter, payslips and bank statements. You can send a notice, approach the Labour Commissioner or Labour Court, and PF/gratuity claims have their own procedures. Sexual harassment at work goes to the Internal Committee under POSH.' + DISC, ['Find a labour lawyer']],
  ['rti', ['rti', 'right to information'], c => 'Under the RTI Act you can ask a public authority for records. File an application with the Public Information Officer with the fee (₹10 for most central bodies). A reply is due in 30 days; you can appeal if not.', ['Find a lawyer']],
  ['rights', ['rights', 'know my rights', 'legal rights'], c => 'Some basics: you can seek a lawyer at any stage, you cannot be detained beyond 24 hours without a magistrate, you may get free legal aid if you cannot afford a lawyer (15100), and you can request a free copy of your FIR. What topic should I explain?', ['Arrest', 'Tenant rights', 'Consumer rights', 'Workplace rights']],
  ['legalaid', ['free legal', 'legal aid', 'nalsa', 'cannot afford', "can't afford", 'poor'], c => 'Free legal aid is available through State and District Legal Services Authorities (call NALSA 15100) for eligible people such as women, children, SC/ST, persons in custody and those under an income limit. You can walk into the District Legal Services Authority office.' + DISC, ['Find a lawyer']],
  ['fees', ['fee', 'fees', 'cost', 'price', 'charge', 'how much', 'pay', 'payment', 'refund policy', 'cancel', 'invoice'], c => 'Each lawyer sets their own fee for chat, phone, video and in-person consultations. You see the exact fee before booking. You pay in the app (currently a demo payment). Cancelling more than 2 hours before the slot refunds in full, and a lawyer cancelling always refunds you. Case fees are shared as invoices you can pay in the app.', ['Find a lawyer', 'How do I book?']],
  ['book', ['book', 'appointment', 'schedule', 'slot', 'consult', 'consultation'], c => 'To book: open a lawyer, pick a consultation type, choose a date and time slot, add a short note, then pay. The lawyer confirms and you will see the phone or video link in My Bookings.', ['Find a lawyer', 'Fees']],
  ['case', ['my case', 'track', 'case status', 'hearing', 'next date', 'follow up', 'case register', 'register a case'], c => 'Open the Cases tab: you can send a case request to a lawyer, and once they accept you see the stage, every hearing date, documents, updates and invoices in one place. You also get a reminder the day before each hearing.', ['Register a case', 'Find a lawyer']],
  ['verify', ['verify', 'verification', 'digilocker', 'aadhaar', 'aadhar', 'kyc', 'verified'], c => c.role === 'lawyer' ? 'To get listed: 1) verify identity with DigiLocker (Aadhaar), 2) add your Bar Council enrolment number and upload your certificate, 3) complete your profile. Our team reviews it and you appear to clients once approved.' : 'Verification uses DigiLocker: you sign in on DigiLocker\'s own site and approve sharing your Aadhaar details. We never see your DigiLocker password or OTP and we store only the last 4 digits. You can also upload an ID for manual review.', c => c.role === 'lawyer' ? ['Add Bar Council details', 'Go online'] : ['Verify now', 'Is my data safe?']],
  ['privacy', ['safe', 'privacy', 'data', 'secure', 'confidential'], c => 'Your phone number stays hidden from the other side until a booking or case is confirmed. Case documents are visible only to you and your lawyer. You can download or delete your data any time from Settings.', ['Open settings']],
  ['who', ['which lawyer', 'what lawyer', 'who should', 'what kind of lawyer', 'type of lawyer', 'which type'], c => 'Tell me what happened in a few words (for example "cheque bounced", "landlord not returning deposit", "online fraud") or pick a category:', ['Family', 'Criminal', 'Property', 'Consumer', 'Cyber', 'Labour', 'Cheque bounce', 'Corporate']],
  ['find', ['find a lawyer', 'find lawyer', 'lawyer near', 'nearby', 'search lawyer'], c => 'You can search by practice area, language, fee and rating, or switch to the live map to see lawyers near you who are online.', ['Open map', 'Family', 'Criminal', 'Property']],
  // lawyer-side help
  ['l_fees', ['set fee', 'my fee', 'consultation fee', 'change fee'], c => 'Go to Profile → Fees & availability. Set a fee for each mode (leave a mode empty to stop offering it) and your weekly working hours. Clients see these before booking.', ['Set availability', 'Payouts']],
  ['l_avail', ['availability', 'working hours', 'slots', 'holiday', 'leave'], c => 'Profile → Fees & availability lets you set weekly hours, the slot length and days off. Booked slots disappear automatically.', ['Set fees']],
  ['l_case', ['add case', 'new case', 'create case', 'add hearing'], c => 'Cases → Add case. Enter the client\'s registered phone number, title, court and stage. Inside a case you can add hearings, post updates your client sees, keep private notes, upload documents and raise invoices.', ['Open cases']],
  ['l_pay', ['payout', 'earnings', 'commission', 'withdraw', 'bank'], c => 'Earnings appear after a consultation is marked complete or an invoice is paid, minus the platform commission shown on each booking. Add bank or UPI details in Profile → Payouts and request a payout.', ['Open reports']],
  ['l_online', ['go online', 'online status', 'show on map', 'map'], c => 'Use the Online toggle on your dashboard. While online and approved you appear live on the clients\' map and can receive urgent requests near you.', ['Verification help']],
  ['app', ['how to use', 'help', 'support', 'contact', 'problem', 'bug'], c => 'I can help with finding a lawyer, booking, fees, tracking a case, verification and your rights. For app problems write to support from Profile → Help.', ['Find a lawyer', 'How do fees work?', 'Track my case']]
];

// map free-text topics to a practice area so we can offer the right search
const TOPIC_AREA = [
  ['family', /divorce|custody|maintenance|marriage|dowry|domestic|alimony/], ['criminal', /fir|bail|arrest|police|crime|theft|assault|murder/], ['property', /property|land|plot|flat|tenant|landlord|rent|sale deed|partition|encroach/],
  ['consumer', /consumer|refund|defect|warranty|builder|insurance/], ['cyber', /cyber|online|hack|phishing|upi|sextortion|scam|fraud/], ['labour', /salary|wage|terminat|fired|pf\b|gratuity|employer/],
  ['cheque', /cheque|check bounce|138/], ['corporate', /company|startup|llp|contract|partnership|founder/], ['tax', /\btax\b|gst|income tax|itr/], ['motor', /accident|mact|vehicle|insurance claim/],
  ['wills', /\bwill\b|probate|succession|legal heir|inherit/], ['ip', /trademark|copyright|patent|brand/], ['banking', /loan|sarfaesi|bank fraud|credit card/], ['immigration', /visa|oci|citizenship|immigration/],
  ['civil', /recovery|injunction|civil suit|money owed|dues/], ['constitutional', /\bwrit\b|high court petition|fundamental right/]
];
const norm = s => ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9஀-௿\s'@.-]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

function detectArea(t) { for (const [a, re] of TOPIC_AREA) if (re.test(t)) return a; return null; }
function areaFromChip(t) {
  const m = { 'family': 'family', 'criminal': 'criminal', 'property': 'property', 'consumer': 'consumer', 'cyber': 'cyber', 'labour': 'labour', 'cheque bounce': 'cheque', 'corporate': 'corporate' };
  const k = t.trim(); return m[k] || null;
}

function reply(text, ctx) {
  ctx = ctx || {};
  const role = ctx.role === 'lawyer' ? 'lawyer' : 'client';
  const raw = String(text || '').slice(0, 300), t = norm(raw);
  if (!raw.trim()) return welcome(role);
  // chip shortcuts with a destination
  const chipNav = {
    'find a lawyer': { label: 'Browse lawyers', nav: 'lawyers' }, 'open map': { label: 'Open live map', nav: 'map' }, 'send urgent request': { label: 'Urgent legal help', nav: 'urgent' }, 'urgent help': { label: 'Urgent legal help', nav: 'urgent' },
    'i need urgent help': { label: 'Urgent legal help', nav: 'urgent' }, 'register a case': { label: 'Register a case', nav: 'newcase' }, 'verify now': { label: 'Verify with DigiLocker', nav: 'verify' }, 'open settings': { label: 'Settings', nav: 'settings' },
    'open cases': { label: 'Open cases', nav: 'cases' }, 'open reports': { label: 'Open reports', nav: 'reports' }, 'set fees': { label: 'Fees & availability', nav: 'fees' }, 'set availability': { label: 'Fees & availability', nav: 'fees' }, 'payouts': { label: 'Payouts', nav: 'payouts' },
    'add bar council details': { label: 'Bar Council details', nav: 'credentials' }, 'go online': { label: 'Dashboard', nav: 'dashboard' }, 'verification help': { label: 'Verification', nav: 'credentials' }, 'track my case': { label: 'My cases', nav: 'cases' }
  };
  const sel = t.trim();
  if (chipNav[sel] && !RULES.some(r => r[1].includes(sel) && false)) {
    const r = answerFor(t, role); if (r) { r.cta = r.cta || chipNav[sel]; return r; }
    return { reply: 'Opening that for you.', chips: [], cta: chipNav[sel] };
  }
  const chipArea = areaFromChip(raw.replace(/^find an? /i, '').replace(/ lawyer$/i, ''));
  if (chipArea || /^find an? .+ lawyer$/i.test(raw.trim())) {
    const a = chipArea || detectArea(t);
    if (a) return areaReply(a);
  }
  const r = answerFor(t, role);
  if (r) {
    const a = detectArea(t);
    if (a && role === 'client' && !r.cta && r.chips) r.cta = { label: 'Lawyers for ' + AREA_INFO[a][0], nav: 'lawyers', area: a };
    return r;
  }
  const a = detectArea(t);
  if (a && role === 'client') return areaReply(a);
  return { reply: 'I am not sure I understood that. I can help with finding the right kind of lawyer, booking and fees, tracking a case, verification, and basic rights. What would you like to do?', chips: role === 'lawyer' ? ['Add a case', 'Set fees', 'Payouts', 'Verification help'] : ['Find a lawyer', 'Explain my rights', 'I need urgent help', 'How do fees work?'], cta: null };
}

function areaReply(a) {
  const [name, info] = AREA_INFO[a];
  return { reply: name + ' lawyers: ' + info + DISC, chips: ['Show lawyers', 'How do fees work?', 'Book a consultation'], cta: { label: 'Show ' + name + ' lawyers', nav: 'lawyers', area: a } };
}

function answerFor(t, role) {
  let best = null, bestScore = 0;
  for (const rule of RULES) {
    const [id, keys] = rule;
    if (id.startsWith('l_') && role !== 'lawyer') continue;
    let score = 0;
    keys.forEach(k => { if (t.includes(' ' + k + ' ') || (k.length > 4 && t.includes(k))) score += k.split(' ').length + (k.length > 5 ? 1 : 0); });
    if (id.startsWith('l_') && role === 'lawyer') score += 1;
    if (score > bestScore) { bestScore = score; best = rule; }
  }
  if (!best) return null;
  const out = best[2]({ role });
  const chips = typeof best[3] === 'function' ? best[3]({ role }) : best[3];
  return { reply: out, chips: chips || [], cta: best[4] || null, intent: best[0] };
}

function welcome(role) {
  if (role === 'lawyer') return { reply: 'Hello counsel. I can help you set up fees and availability, add cases and hearings, understand payouts, or finish verification.', chips: ['Add a case', 'Set fees', 'Payouts', 'Verification help', 'Go online'], cta: null };
  return { reply: 'Hello! I am your legal help assistant. Tell me what happened in a few words, or choose an option below.' + '\n\nI share general information only, not legal advice.', chips: ['Find a lawyer', 'I need urgent help', 'Explain my rights', 'How do fees work?', 'Track my case'], cta: null };
}

module.exports = { reply, welcome, detectArea, AREA_INFO };
