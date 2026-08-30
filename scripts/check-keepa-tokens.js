const { writeKeepaStatus } = require("./keepa-status");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const CHECK_ASIN = "B00002ND64";

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");

async function run() {
  const url =
    `https://api.keepa.com/product?key=${KEEPA_API_KEY}` +
    `&domain=1` +
    `&asin=${CHECK_ASIN}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!writeKeepaStatus(data, "token_check", true)) {
    throw new Error("Keepa response did not include token status.");
  }

  console.log(`Keepa tokens left: ${data.tokensLeft}`);
  console.log(`Refill rate: ${data.refillRate}/min`);

  if (!response.ok && response.status !== 429) {
    throw new Error(`Keepa token check failed: ${response.status} ${response.statusText}`);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
