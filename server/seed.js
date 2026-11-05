// Loads (or removes) the sample Chennai lawyers directly in the database:   node seed.js   |   node seed.js clear
'use strict';
const { store, core, ready } = require('./server');
const sample = require('./lib/sampledata');
ready.then(async () => {
  const r = process.argv[2] === 'clear' ? sample.clear(store) : sample.load(store, core);
  console.log(JSON.stringify(r));
  await (store.close ? store.close() : store.flush());
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
