const fs = require("fs");

console.log("Starting Keepa test...");

async function run() {
  const apiKey = process.env.KEEPA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing KEEPA_API_KEY");
  }

  // TEST ASIN
  const asin = "B0D7P6KYSN";

  // SIMPLE product lookup endpoint
  const url =
    `https://api.keepa.com/product?key=${apiKey}` +
    `&domain=1&asin=${asin}&stats=90`;

  console.log("Calling Keepa...");

  const res = await fetch(url);
  const data = await res.json();

  if (!data.products || !data.products.length) {
    throw new Error("No products returned from Keepa");
  }

  const p = data.products[0];

  const output = {
    generatedAt: new Date().toISOString(),
    deals: [
      {
        asin: p.asin,
        title: p.title,
        price:
          p.stats?.current?.[1] > 0
            ? p.stats.current[1] / 100
            : null,
        avg90:
          p.stats?.avg90?.[1] > 0
            ? p.stats.avg90[1] / 100
            : null
      }
    ]
  };

  fs.writeFileSync(
    "data/deals.json",
    JSON.stringify(output, null, 2)
  );

  console.log("Keepa test successful");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
