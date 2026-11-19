const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { requestKeepa, refillWaitMs } = require('../keepa-request');

function response(status, data) {
  return { status, ok: status === 200, statusText: 'test', json: async () => data };
}

test('429 without an error field waits for refill and retries the same request', async () => {
  const responses = [response(429, { tokensLeft: -9, refillRate: 5, refillIn: 2000 }),
    response(200, { products: [{ asin: 'B000000001' }], tokensLeft: 60 })];
  const urls = [], waits = [];
  const result = await requestKeepa('https://example.invalid/product', {
    minimumTokens: 57,
    fetchImpl: async url => { urls.push(url); return responses.shift(); },
    sleepImpl: async ms => waits.push(ms)
  });
  assert.equal(result.products.length, 1);
  assert.deepEqual(urls, ['https://example.invalid/product', 'https://example.invalid/product']);
  assert.equal(waits.reduce((a, b) => a + b, 0), 783000);
  assert.ok(waits.every(ms => ms <= 60000));
});

test('next batch waits until its estimated cost plus reserve can refill', async () => {
  const events = [];
  await requestKeepa('https://example.invalid/product', {
    minimumTokens: 105,
    previousStatus: { tokensLeft: 4, refillRate: 5, refillIn: 1000 },
    sleepImpl: async ms => events.push(['wait', ms]),
    fetchImpl: async () => { events.push(['fetch']); return response(200, { products: [] }); }
  });
  assert.equal(events.at(-1)[0], 'fetch');
  assert.equal(events.filter(e => e[0] === 'wait').reduce((a, e) => a + e[1], 0), 1202000);
});

test('non-throttling HTTP failures and API errors fail explicitly', async () => {
  await assert.rejects(requestKeepa('test', { fetchImpl: async () => response(500, {}) }), /500/);
  await assert.rejects(requestKeepa('test', { fetchImpl: async () => response(200, { error: { message: 'bad key' } }) }), /bad key/);
});

test('token wait has a finite budget', async () => {
  await assert.rejects(requestKeepa('test', {
    fetchImpl: async () => response(429, { tokensLeft: -9, refillRate: 5, refillIn: 60000 }),
    sleepImpl: async () => {}, maxWaitMs: 100
  }), /wait exceeded/);
  assert.equal(refillWaitMs({ tokensLeft: -1, refillRate: 0 }, 55), 60000);
});

async function runEnrichment(count, batches, stream = 'trusted_sellers') {
  const items = Array.from({ length: count }, (_, i) => ({ asin: `B${String(i).padStart(9, '0')}`, streams: [stream] }));
  items.push({ asin: 'B999999999', streams: ['trusted_sellers'], enrichedAt: 'existing' });
  const files = new Map([
    ['data/discovered-asins.json', JSON.stringify({ asins: items })],
    ['data/deals.json', JSON.stringify({ deals: [] })]
  ]);
  const calls = [], errors = [];
  const context = {
    require: name => {
      if (name === 'fs') return {
        existsSync: p => files.has(p), readFileSync: p => files.get(p),
        mkdirSync: () => {}, writeFileSync: (p, s) => files.set(p, s)
      };
      if (name === './keepa-request') return { requestKeepa: async (url, opts) => {
        calls.push({ url, opts }); return batches.shift();
      } };
      throw new Error(`Unexpected dependency ${name}`);
    },
    process: { env: { KEEPA_API_KEY: 'test' }, argv: ['node', 'script', stream], exit: code => errors.push(code) },
    console: { log: () => {}, error: error => errors.push(error) },
    URL, URLSearchParams, Date, Set, Map
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../enrich-stream.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { files, calls, errors };
}

test('only returned products are marked; missing products stay pending', async () => {
  const r = await runEnrichment(2, [{ products: [{ asin: 'B000000000' }], tokensLeft: 1 }]);
  assert.deepEqual(r.errors, []);
  const items = JSON.parse(r.files.get('data/discovered-asins.json')).asins;
  assert.ok(items[0].enrichedAt);
  assert.equal(items[1].enrichedAt, undefined);
  assert.equal(items[2].enrichedAt, 'existing');
});

test('missing products array fails without changing saved data', async () => {
  const r = await runEnrichment(2, [{ tokensLeft: -9 }]);
  assert.equal(r.errors.at(-1), 1);
  assert.ok(r.errors[0].message.includes('missing its products array'));
  assert.equal(JSON.parse(r.files.get('data/discovered-asins.json')).asins[0].enrichedAt, undefined);
});

test('125 candidates continue to the second batch after crossing the token floor', async () => {
  const r = await runEnrichment(125, [
    { products: [{ asin: 'B000000000' }], tokensLeft: 4, refillRate: 5 },
    { products: [{ asin: 'B000000100' }], tokensLeft: 55 }
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[1].opts.minimumTokens, 105);
  assert.equal(r.calls[1].opts.previousStatus.tokensLeft, 4);
  const marked = JSON.parse(r.files.get('data/discovered-asins.json')).asins.filter(i => i.enrichedAt && i.enrichedAt !== 'existing');
  assert.equal(marked.length, 2);
});

test('shop lighting retains relevant deals within price and discount limits', async () => {
  const product = (i, title, price = 2000, avg90 = 2500, avg30 = 2500) => ({
    asin: `B${String(i).padStart(9, '0')}`, title, parentAsin: '',
    trackingSince: 1, rating: 45, reviewCount: 200,
    stats: { current: [price, price, price, 1000], avg90: [avg90], avg30: [avg30] }
  });
  const products = [
    product(0, 'Linkable LED Shop Lights for Garage'),
    product(1, 'Hexagon Garage Lights', 20000, 25000, 25000),
    product(2, 'Rechargeable Under Hood Work Light'),
    product(3, 'LED Grow Lights for Indoor Plants'),
    product(4, 'Decorative Pendant Lights'),
    product(5, 'LED Headlight Work Lights for Off-Road'),
    product(6, 'LED Shop Lights', 20001, 25000, 25000),
    product(7, 'LED Shop Lights', 2000, 2100, 2500),
    product(8, 'LED Shop Lights', 1999),
    product(9, 'Replacement Brackets for Shop Lights'),
    product(10, 'Rechargeable Flashlight'),
    product(11, 'LED High-Bay Light')
  ];
  const r = await runEnrichment(products.length, [{ products, tokensLeft: 100 }], 'shop_lighting');
  assert.deepEqual(r.errors, []);
  const deals = JSON.parse(r.files.get('data/deals.json')).deals;
  assert.deepEqual(deals.map(d => d.asin).sort(), [0, 1, 2, 11].map(i => `B${String(i).padStart(9, '0')}`));
  assert.ok(deals.every(d => d.category === 'shop_lighting'));
});

test('shop lighting discovery uses the approved filters', async () => {
  let selection;
  const context = {
    require: name => name === 'fs' ? {
      existsSync: () => false, mkdirSync: () => {}, writeFileSync: () => {}
    } : { requestKeepa: async url => {
      selection = JSON.parse(new URL(url).searchParams.get('selection'));
      return { asinList: [] };
    } },
    process: { env: { KEEPA_API_KEY: 'test' }, argv: ['node', 'script', 'shop_lighting'], exit: () => assert.fail('discovery failed') },
    console: { log: () => {} }, URL, Date, Map, Set
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../keepa-discovery.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.equal(selection.current_BUY_BOX_SHIPPING_gte, 2000);
  assert.equal(selection.current_BUY_BOX_SHIPPING_lte, 20000);
  assert.equal(selection.current_RATING_gte, 40);
  assert.equal(selection.current_COUNT_REVIEWS_gte, 50);
  assert.equal(selection.current_SALES_lte, 200000);
  assert.equal(selection.deltaPercent90_BUY_BOX_SHIPPING_gte, 15);
  assert.equal(selection.deltaPercent30_BUY_BOX_SHIPPING_gte, 10);
  assert.equal(selection.isLowest90_BUY_BOX_SHIPPING, true);
  assert.equal(selection.brand, undefined);
});
