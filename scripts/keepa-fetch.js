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
        "13400741",
        "13749581",
        "2225057011",
        "228899",
        "3180231",
        "322525011",
        "3753381",
        "3754161",
        "495224",
        "495266",
        "495310",
        "511228",
        "551240",
        "552262",
        "553188",
        "553350",
        "553424",
        "8106310011",
        "2225055011",
        "553406",
        "15569906011",
        "553136",
        "553242",
        "552788"
      ],

      rootCategory: ["228013"],

      current_SALES_gte: 1,
      current_SALES_lte: 400000,

      current_RATING_gte: 42,
      current_COUNT_REVIEWS_gte: 25,

      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,

      productType: [0, 1, 2],

      sort: [["title", "asc"]],

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

function buildKeepaProductUrl(asins) {
  return (
    "https://api.keepa.com/product" +
    `?key=${KEEPA_API_KEY}` +
    "&domain=1" +
    `&asin=${asins.join(",")}` +
    "&stats=90" +
    "&rating=1" +
    "&images=1"
  );
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/^"+|"+$/g, "")
    .replace(/""/g, '"')
    .trim();
}

function getFirstValidPrice(values = []) {
  const price = values.find(
    v => typeof v === "number" && v > 0
  );

  return price ? price / 100 : null;
}

function getCurrentPrice(product) {
  const current = product.stats?.current || [];

  return getFirstValidPrice([
    current[10], // Buy Box shipping
    current[1],  // Amazon
    current[2],  // New
    current[0]
  ]);
}

function getAvg90(product) {
  const avg90 = product.stats?.avg90 || [];

  return getFirstValidPrice([
    avg90[10],
    avg90[1],
    avg90[2],
    avg90[0]
  ]);
}

function getRating(product) {
  if (
    typeof product.rating === "number" &&
    product.rating > 0
  ) {
    return product.rating / 10;
  }

  const ratingRaw = product.stats?.current?.[16];

  if (
    typeof ratingRaw === "number" &&
    ratingRaw > 0
  ) {
    return ratingRaw / 10;
  }

  return null;
}

function getReviewCount(product) {
  if (
    typeof product.reviewCount === "number" &&
    product.reviewCount >= 0
  ) {
    return product.reviewCount;
  }

  const reviewCount = product.stats?.current?.[17];

  if (
    typeof reviewCount === "number" &&
    reviewCount >= 0
  ) {
    return reviewCount;
  }

  return null;
}

function getSalesRank(product) {
  const rank = product.stats?.current?.[3];

  if (
    typeof rank !== "number" ||
    rank <= 0
  ) {
    return null;
  }

  return rank;
}

function normalizeProduct(product, streamName) {
  const asin = product.asin || "";

  const price = getCurrentPrice(product);
  const avg90 = getAvg90(product);
  const rank = getSalesRank(product);

  console.log(
  "Image debug:",
  product.asin,
  {
    imagesCSV: product.imagesCSV,
    image: product.image,
    images: product.images,
    imageUrl: product.imageUrl
  }
);

  return {
    asin,

    title: cleanTitle(product.title),

    category: streamName,

    price,
    avg90,

    rating: getRating(product),

    reviewCount: getReviewCount(product),

    rank,

    img: product.imagesCSV
      ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
      : "",

    url: asin
      ? `https://www.amazon.com/dp/${asin}`
      : "",

    keepa: asin
      ? `https://keepa.com/#!product/1-${asin}`
      : "",

    isLowAll: false,

    drop1Day: 0,

    isHot:
      rank !== null &&
      rank <= 5000,

    isNameBrand: false
  };
}

function scoreDeal(deal) {
  let score = 0;

  if (deal.rating) {
    score += deal.rating * 5;
  }

  if (
    deal.price &&
    deal.avg90 &&
    deal.avg90 > deal.price
  ) {
    const savingsPercent =
      ((deal.avg90 - deal.price) / deal.avg90) *
      100;

    score += savingsPercent * 1.5;
  }

  if (deal.isHot) {
    score += 30;
  }

  return Math.floor(score);
}

async function fetchProductDetails(asins) {
  if (!asins.length) {
    return [];
  }

  console.log(
    `Fetching product details for ${asins.length} ASINs...`
  );

  const url = buildKeepaProductUrl(asins);

  const res = await fetch(url);

  const data = await res.json();

  if (data.error) {
    throw new Error(
      `Keepa product error: ${JSON.stringify(data.error)}`
    );
  }

  console.log(
    `Product lookup tokens consumed: ${data.tokensConsumed}, tokens left: ${data.tokensLeft}`
  );

  return data.products || [];
}

async function fetchStream(stream) {
  console.log(
    `Fetching stream: ${stream.name}`
  );

  const url = buildKeepaQueryUrl(stream.selection);

  const res = await fetch(url);

  const data = await res.json();

  if (data.error) {
    throw new Error(
      `Keepa query error for ${stream.name}: ${JSON.stringify(data.error)}`
    );
  }

  const asinList =
    (data.asinList || []).slice(0, 10);

  console.log(
    `${stream.name}: ${asinList.length} ASINs returned`
  );

  console.log(
    `${stream.name}: query tokens consumed ${data.tokensConsumed}, tokens left ${data.tokensLeft}`
  );

  const products =
    await fetchProductDetails(asinList);

  console.log(
    `${stream.name}: ${products.length} product details returned`
  );

  return products
    .map(product => {
      const deal = normalizeProduct(
        product,
        stream.name
      );

      deal.dealScore = scoreDeal(deal);

      return deal;
    })
    .filter(
      deal =>
        deal.asin &&
        deal.title &&
        deal.price
    );
}

async function run() {
  let allDeals = [];

  for (const stream of STREAMS) {
    const streamDeals =
      await fetchStream(stream);

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
    if (e.code !== "EEXIST") {
      throw e;
    }
  }

  fs.writeFileSync(
    "data/deals.json",
    JSON.stringify(output, null, 2)
  );

  console.log(
    `Wrote ${allDeals.length} deals to data/deals.json`
  );
}

run().catch(err => {
  console.error(err);

  process.exit(1);
});
