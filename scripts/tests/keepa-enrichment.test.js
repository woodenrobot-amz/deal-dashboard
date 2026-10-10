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

async function runEnrichment(count, batches) {
  const items = Array.from({ length: count }, (_, i) => ({ asin: `B${String(i).padStart(9, '0')}`, streams: ['trusted_sellers'] }));
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
    process: { env: { KEEPA_API_KEY: 'test' }, argv: ['node', 'script', 'trusted_sellers'], exit: code => errors.push(code) },
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
