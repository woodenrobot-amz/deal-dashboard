const fs = require("fs");

console.log("Starting Keepa query sync...");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;

if (!KEEPA_API_KEY) {
  throw new Error("Missing KEEPA_API_KEY");
}

const STREAMS = [
  {
    name: "woodworking",
    selection: {
      categories_exclude: [
        "13400741", "13749581", "2225057011", "228899", "3180231",
        "322525011", "3753381", "3754161", "495224", "495266",
        "495310", "511228", "551240", "552262", "553188",
        "553350", "553424", "8106310011", "2225055011", "553406",
        "15569906011", "553136", "553242", "552788"
      ],
      current_SALES_gte: 1,
      current_SALES_lte: 400000,
      current_RATING_gte: 42,
      current_COUNT_REVIEWS_gte: 25,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
      rootCategory: ["228013"],
      sort: [["title", "asc"]],
      lastRatingUpdate_gte: 7951881,
      productType: [0, 1, 2],
      page: 0,
      perPage: 100
    }
  }
];

function buildKeepaQueryUrl(selection) {
  return (
    "https://api.keepa.com/query" +
    `?key=${KEEPA_API_KEY}` +
    "&domain=1" +
    `&selection=${encodeURIComponent(JSON.stringify(selection))}`
  );
}

function getCurrentPrice(product) {
  const current = product.stats?.current || [];

  // Try common Keepa price slots safely.
  // Positive values are cents.
  const candidates = [
    current[1],  // Amazon
    current[2],  // New
    current[10], // Buy Box shipping
    current[0]
  ];

  const price = candidates.find(v => typeof v === "number" && v > 0);

  return price ? price / 100 : null;
}

function getAvg90(product) {
  const avg90 = product.stats?.avg90 || [];

  const candidates = [
    avg90[1],
    avg90[2],
    avg90[10],
    avg90[0]
  ];

  const price = candidates.find(v => typeof v === "number" && v > 0);

  return price ? price / 100 : null;
}

function normalizeProduct(product, streamName) {
  const price = getCurrentPrice(product);
  const avg90 = getAvg90(product);

  const ratingRaw = product.stats?.current?.[16] || null;
  const reviewCount = product.stats?.current?.[17] || null;

  return {
    asin: product.asin || "",
    title: product.title || "",
    category: streamName,

    price,
    avg90,

    rating: ratingRaw ? ratingRaw / 10 : null,
    reviewCount,

    rank: product.stats?.current?.[3] || null,

    img: product.imagesCSV
      ? `https://m.media-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
      : "",

    url: `https://www.amazon.com/dp/${product.asin}`,
    keepa: `https://keepa.com/#!product/1-${product.asin}`,

    isLowAll: false,
    drop1Day: 0,
    isHot: product.stats?.current?.[3] > 0 && product.stats.current[3] <= 5000,
    isNameBrand: false
  };
}

function scoreDeal(deal) {
  let score = 0;

  if (deal.rating) score += deal.rating * 5;

  if (deal.price && deal.avg90 && deal.avg90 > deal.price) {
    const savingsPercent = ((deal.avg90 - deal.price) / deal.avg90) * 100;
    score += savingsPercent * 1.5;
  }

  if (deal.isHot) score += 30;

  return Math.floor(score);
}

async function fetchStream(stream) {
  console.log(`Fetching stream: ${stream.name}`);

  const url = buildKeepaQueryUrl(stream.selection);
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Keepa error for ${stream.name}: ${JSON.stringify(data.error)}`);
  }

  const products = data.products || [];

  console.log(`${stream.name}: ${products.length} products returned`);

  return products
    .map(product => {
      const deal = normalizeProduct(product, stream.name);
      deal.dealScore = scoreDeal(deal);
      return deal;
    })
    .filter(deal => deal.asin && deal.title && deal.price);
}

async function run() {
  let allDeals = [];

  for (const stream of STREAMS) {
    const streamDeals = await fetchStream(stream);
    allDeals.push(...streamDeals);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "keepa-query",
    deals: allDeals
  };

  try {
    fs.mkdirSync("data");
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }

  fs.writeFileSync(
    "data/deals.json",
    JSON.stringify(output, null, 2)
  );

  console.log(`Wrote ${allDeals.length} deals to data/deals.json`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
