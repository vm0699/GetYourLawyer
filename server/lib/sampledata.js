'use strict';
// Sample Chennai lawyers so the map, search and booking flow can be demoed before real lawyers join.
// Every record is flagged `demo` and uses an un-loginable phone (+910000000nnn), so nobody can sign in as one.
// All names, firms and bar numbers are fictional. Admin -> Settings -> "Remove sample data" deletes them.
const LAWYERS = [
  // name, firm, areas, years, langs, [chat,call,video,in_person], office, city/area, lat, lng, bio, rating, count, online
  ['Adv. Meenakshi Sundaram', 'Sundaram & Associates', ['family', 'civil'], 14, ['English', 'Tamil'], [400, 700, 900, 1500], 'Anna Nagar, near Tower Park', 'Anna Nagar', 13.0850, 80.2101, 'Family court practitioner focused on divorce, maintenance and custody, with a mediation-first approach.', 4.8, 112, true],
  ['Adv. Karthik Raman', 'Raman Law Chambers', ['criminal', 'cyber'], 11, ['English', 'Tamil', 'Hindi'], [500, 800, 1000, 2000], 'Madras High Court Campus, Parry\'s', 'High Court', 13.0878, 80.2870, 'Criminal defence, bail and anticipatory bail, and cyber crime complaints. Regular before the Sessions Court and High Court.', 4.7, 86, true],
  ['Adv. Priya Venkatesh', 'PV Property Law', ['property', 'wills'], 9, ['English', 'Tamil', 'Telugu'], [300, 600, 800, 1200], 'T. Nagar, Usman Road', 'T. Nagar', 13.0418, 80.2341, 'Title verification, sale deeds, partition suits and succession for residential and agricultural property.', 4.6, 64, false],
  ['Adv. Syed Imran', 'Imran & Partners', ['corporate', 'ip', 'tax'], 16, ['English', 'Hindi', 'Urdu'], [800, 1200, 1500, 3000], 'Nungambakkam High Road', 'Nungambakkam', 13.0569, 80.2425, 'Startup incorporation, shareholder agreements, trademarks and GST/Income Tax advisory.', 4.9, 141, true],
  ['Adv. Lakshmi Narayanan', 'LN Consumer Law', ['consumer', 'cheque', 'banking'], 8, ['English', 'Tamil'], [250, 500, 700, 1000], 'Adyar, Sardar Patel Road', 'Adyar', 13.0012, 80.2565, 'Consumer commission complaints, cheque bounce (Section 138) and banking disputes for individuals and small businesses.', 4.5, 58, true],
  ['Adv. Rajesh Kumar', 'Rajesh Kumar & Co.', ['labour', 'civil'], 13, ['English', 'Tamil'], [350, 600, 800, 1300], 'Guindy Industrial Estate', 'Guindy', 13.0067, 80.2206, 'Service matters, wrongful termination, PF/ESI and industrial disputes before the Labour Court.', 4.4, 47, false],
  ['Adv. Divya Subramanian', 'Subramanian Legal', ['family', 'criminal'], 7, ['English', 'Tamil'], [300, 500, 700, 1000], 'Mylapore, Luz Church Road', 'Mylapore', 13.0368, 80.2676, 'Domestic violence protection orders, 498A, maintenance and women\'s legal rights.', 4.7, 73, true],
  ['Adv. Arvind Menon', 'Menon Chambers', ['motor', 'civil', 'consumer'], 12, ['English', 'Malayalam', 'Tamil'], [400, 650, 850, 1400], 'Velachery Main Road', 'Velachery', 12.9815, 80.2180, 'Motor accident compensation claims, insurance disputes and recovery suits.', 4.6, 69, false],
  ['Adv. Nandini Iyer', 'Iyer & Iyer', ['constitutional', 'labour', 'civil'], 19, ['English', 'Tamil'], [900, 1400, 1800, 3500], 'Egmore, Pantheon Road', 'Egmore', 13.0732, 80.2609, 'Writ petitions before the High Court, service law and constitutional remedies.', 4.9, 157, true],
  ['Adv. Mohammed Faizal', 'Faizal Legal Aid & Advocates', ['property', 'civil', 'family'], 10, ['English', 'Tamil', 'Urdu'], [250, 450, 600, 900], 'Tambaram West', 'Tambaram', 12.9249, 80.1000, 'Property disputes, tenancy and eviction, and family settlements across South Chennai.', 4.3, 39, false],
  ['Adv. Kavitha Balasubramanian', 'KB Cyber Law', ['cyber', 'criminal', 'ip'], 6, ['English', 'Tamil'], [400, 700, 900, 1500], 'Sholinganallur, OMR', 'OMR', 12.9010, 80.2279, 'Online fraud, sextortion and harassment complaints, data protection and IT-sector disputes.', 4.6, 52, true],
  ['Adv. Gopinath Rao', 'Rao & Sons', ['wills', 'property', 'tax'], 22, ['English', 'Telugu', 'Tamil'], [600, 1000, 1300, 2500], 'Kodambakkam High Road', 'Kodambakkam', 13.0521, 80.2255, 'Wills, probate, succession certificates and estate planning for families.', 4.8, 101, false],
  ['Adv. Anitha Selvam', 'Selvam Associates', ['family', 'consumer'], 5, ['English', 'Tamil'], [200, 400, 500, 800], 'Porur, Mount-Poonamallee Road', 'Porur', 13.0382, 80.1565, 'Affordable family and consumer matters with fixed-fee consultations.', 4.2, 28, true],
  ['Adv. Vijay Anand', 'Anand Criminal Law', ['criminal'], 15, ['English', 'Tamil', 'Hindi'], [500, 800, 1100, 2200], 'Perambur, Paper Mills Road', 'Perambur', 13.1186, 80.2330, 'Trial and appellate criminal practice, bail and quashing petitions.', 4.5, 77, false],
  ['Adv. Sangeetha Prakash', 'SP Corporate Counsel', ['corporate', 'banking', 'tax'], 12, ['English', 'Hindi', 'Tamil'], [700, 1100, 1400, 2800], 'Ambattur Industrial Estate', 'Ambattur', 13.1143, 80.1548, 'MSME contracts, recovery, SARFAESI and insolvency matters for businesses.', 4.4, 44, true],
  ['Adv. Harish Chandran', 'Chandran Immigration & Law', ['immigration', 'corporate'], 8, ['English', 'Tamil', 'Malayalam'], [500, 800, 1000, 1800], 'Besant Nagar, 4th Avenue', 'Besant Nagar', 13.0002, 80.2668, 'Visa, OCI and citizenship matters, and cross-border family and business documentation.', 4.6, 36, false],
  ['Adv. Ramya Krishnan', 'Krishnan Cheque Bounce Clinic', ['cheque', 'civil', 'banking'], 9, ['English', 'Tamil'], [300, 500, 700, 1000], 'Chromepet GST Road', 'Chromepet', 12.9516, 80.1462, 'Cheque dishonour notices and complaints, recovery suits and negotiable instrument matters.', 4.5, 61, true]
];

function load(store, core) {
  const existing = store.filter('users', u => u.demo).length;
  if (existing) return { added: 0, existing };
  const now = Date.now(); let n = 0;
  const client = store.insert('users', { phone: '+910000000900', role: 'client', name: 'Sample Client', status: 'active', createdAt: now, tv: 0, lang: 'en', devices: [], favs: [], prefs: {}, demo: true, onboarded: true });
  LAWYERS.forEach((x, i) => {
    const [name, firm, areas, years, langs, fees, address, area, lat, lng, bio, rating, count, online] = x;
    const lp = core.newLawyerProfile();
    Object.assign(lp, { barNo: 'TN/' + (1000 + i * 37) + '/' + (2025 - years), council: 'Bar Council of Tamil Nadu & Puducherry', enrolYear: 2025 - years, areas, languages: langs, courts: ['District Court', 'High Court'], experience: years, bio, firm,
      fees: { chat: fees[0], call: fees[1], video: fees[2], in_person: fees[3], hearing: fees[3] * 3, retainer: null }, office: { address: address + ', Chennai', city: area, lat, lng }, rating, ratingCount: count, casesHandled: count * 3, online: false });
    lp.approval = { status: 'approved', note: '', submitted: now, reviewed: now, certFile: null };
    const u = store.insert('users', { phone: '+91000000' + String(100 + i).padStart(4, '0'), role: 'lawyer', name, status: 'active', createdAt: now - (i + 3) * 864e5, tv: 0, lang: 'en', devices: [], favs: [], prefs: {}, city: 'Chennai', demo: true, demoOnline: online, onboarded: true,
      verify: { status: 'verified', method: 'digilocker', at: now, name, last4: String(1000 + i * 91).slice(-4), docs: [{ name: 'Aadhaar Card', type: 'aadhaar', issuer: 'UIDAI' }] }, lawyer: lp });
    [['Great clarity and quick responses.', 5], ['Explained the process patiently.', Math.round(rating)], ['Professional and well prepared.', 4]].forEach(([text, r], k) => {
      store.insert('reviews', { lawyerId: u.id, clientId: client.id, rating: r, text, t: now - (k + 1) * 3 * 864e5, demo: true });
    });
    n++;
  });
  store.save();
  return { added: n };
}

function clear(store) {
  const ids = new Set(store.filter('users', u => u.demo).map(u => u.id));
  let n = 0;
  ids.forEach(id => { store.remove('users', id); n++; });
  store.removeWhere('reviews', r => r.demo || ids.has(r.lawyerId) || ids.has(r.clientId));
  store.removeWhere('bookings', b => ids.has(b.lawyerId) || ids.has(b.clientId));
  store.removeWhere('requests', r => ids.has(r.lawyerId));
  store.save();
  return { removed: n };
}
module.exports = { load, clear, LAWYERS };
