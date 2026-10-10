const { writeKeepaStatus } = require('./keepa-status');

const MAX_WAIT_MS = 60 * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function refillWaitMs(data, minimumTokens) {
  const rate = Number(data.refillRate) - Math.round(Number(data.tokenFlowReduction) || 0);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(data.tokensLeft)) {
    return 60000;
  }
  const refills = Math.max(1, Math.ceil((minimumTokens - data.tokensLeft) / rate));
  const nextRefill = Number.isFinite(data.refillIn) ? Math.max(0, data.refillIn) : 60000;
  return nextRefill + (refills - 1) * 60000 + 1000;
}

async function requestKeepa(url, {
  source,
  minimumTokens = 1,
  previousStatus = null,
  fetchImpl = fetch,
  sleepImpl = sleep,
  maxWaitMs = MAX_WAIT_MS
} = {}) {
  let waitedMs = 0;

  async function waitForRefill(data) {
    const delay = refillWaitMs(data, minimumTokens);
    if (waitedMs + delay > maxWaitMs) {
      throw new Error('Keepa token wait exceeded one hour; unprocessed ASINs remain pending.');
    }
    console.log(`Waiting ${Math.ceil(delay / 1000)}s for Keepa tokens (${data.tokensLeft} available; target ${minimumTokens}).`);
    // Keep individual waits short, including in GitHub Actions logs.
    for (let remaining = delay; remaining > 0; remaining -= 60000) {
      await sleepImpl(Math.min(remaining, 60000));
    }
    waitedMs += delay;
  }

  if (previousStatus && previousStatus.tokensLeft < minimumTokens) {
    await waitForRefill(previousStatus);
  }

  while (true) {
    const response = await fetchImpl(url);
    const data = await response.json();
    writeKeepaStatus(data, source);

    if (response.status === 429) {
      console.log('Keepa request failed: 429 Too Many Requests; waiting before retrying.');
      await waitForRefill(data);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Keepa request failed: ${response.status} ${response.statusText || ''}`.trim());
    }
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data;
  }
}

module.exports = { requestKeepa, refillWaitMs };
