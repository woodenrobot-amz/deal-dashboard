const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];
const TOKEN_FLOOR = 65;
const MAX_DEAL_AGE_HOURS = 48;

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");
if (!STREAM_NAME) throw new Error("Missing stream argument");

const STREAMS = {
 woodworking: {
  name: "woodworking",

  asinLimit: 100,

  selection: {
    categories_exclude: [
      "13399871",
      "13749581",
      "15569906011",
      "157681011",
      "17515060011",
      "2225057011",
      "495346",
      "553140",
      "553242",
      "553348",
      "553350",
      "553392",
      "553406",
      "553422",
     "383662011"
    ],

    current_SALES_gte: 1,
    current_SALES_lte: 200000,

    current_RATING_gte: 42,
    current_COUNT_REVIEWS_gte: 50,

    isLowest90_BUY_BOX_SHIPPING: true,

    deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
    deltaPercent30_BUY_BOX_SHIPPING_gte: 5,

    rootCategory: [
      "16310091",
      "228013"
    ],

    productType: [0],

    variationReviewCount_gte: 1,

    categories_include: [
      "2399141011",
      "3116511",
      "551236",
      "551238",
      "552318",
      "552342",
      "552578",
      "552580",
      "552648",
      "552780",
      "552794",
      "552824",
      "552842",
      "552866",
      "552910",
      "552940",
      "552942",
      "552962",
      "552964",
      "553022",
      "553150",
      "553218",
      "553244",
      "553142",
      "16412291"
    ],

    sort: [
  ["current_SALES", "asc"],
  ["monthlySold", "desc"]
],

    lastRatingUpdate_gte: 7953123,

    page: 0,
    perPage: 2000
  }
},

  three_d_printing: {
    name: "three_d_printing",
    asinLimit: 20,
    selection: {
      categories_exclude: ["8481415011"],
      current_SALES_gte: 1,
      current_SALES_lte: 200000,
      isLowest_BUY_BOX_SHIPPING: true,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
      rootCategory: ["16310091"],
      categories_include: ["6066126011"],
      sort: [["current_SALES", "asc"], ["monthlySold", "desc"]],
      productType: [0],
      page: 0,
      perPage: 100
    }
  },

  deals_for_dudes: {
    name: "deals_for_dudes",
    asinLimit: 30,
    selection: {
      categories_exclude: ["172435","172526","172574","3011391011","3248684011","502394","524136","6684132011"],
      current_SALES_gte: 1,
      current_SALES_lte: 100000,
      current_RATING_gte: 41,
      current_COUNT_REVIEWS_gte: 50,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent7_BUY_BOX_SHIPPING_gte: 10,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 10,
      rootCategory: ["1055398","16310091","16333372011","172282","228013","2617941011","2972638011"],
      categories_include: ["206234609011","20972781011","20972798011","23673182011","289810","3180261","541966","551242","552808","553232","553760"],
      sort: [["current_SALES", "asc"], ["monthlySold", "desc"]],
      lastRatingUpdate_gte: 7952433,
      productType: [0],
      page: 0,
      perPage: 100
    }
  }
};

const stream = STREAMS[STREAM_NAME];
if (!stream) throw new Error(`Unknown stream: ${STREAM_NAME}`);

function buildQueryUrl(selection) {
  return `https://api.keepa.com/query?key=${KEEPA_API_KEY}&domain=1&selection=${encodeURIComponent(JSON.stringify(selection))}`;
}

function buildProductUrl(asins) {
  return `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=1&asin=${asins.join(",")}&stats=90&rating=1&history=1`;
}

function cleanTitle(value) {
  return String(value || "").replace(/^"+|"+$/g, "").replace(/""/g, '"').trim();
}

function priceFrom(values = []) {
  const val = values.find(v => typeof v === "number" && v > 0);
  return val ? val / 100 : null;
}

function getCurrentPrice(p) {
  const c = p.stats?.current || [];
  return priceFrom([c[10], c[1], c[2], c[0]]);
}

function getAvg90(p) {
  const a = p.stats?.avg90 || [];
  return priceFrom([a[10], a[1], a[2], a[0]]);
}

function getRating(p) {
  if (typeof p.rating === "number" && p.rating > 0) return p.rating / 10;
  const r = p.stats?.current?.[16];
  return typeof r === "number" && r > 0 ? r / 10 : null;
}

function getReviewCount(p) {
  if (typeof p.reviewCount === "number" && p.reviewCount >= 0) return p.reviewCount;
  const r = p.stats?.current?.[17];
  return typeof r === "number" && r >= 0 ? r : null;
}

function getSalesRank(p) {
  const r = p.stats?.current?.[3];
  return typeof r === "number" && r > 0 ? r : null;
}

function getImage(p) {
  if (p.imagesCSV) return `https://images-na.ssl-images-amazon.com/images/I/${p.imagesCSV.split(",")[0]}`;
  if (Array.isArray(p.images) && p.images.length) {
    const first = p.images[0];
    if (first.l) return `https://images-na.ssl-images-amazon.com/images/I/${first.l}`;
    if (first.m) return `https://images-na.ssl-images-amazon.com/images/I/${first.m}`;
  }
  return "";
}

function scoreDeal(d) {
  let score = 0;
  if (d.rating) score += d.rating * 5;
  if (d.price && d.avg90 && d.avg90 > d.price) {
    score += ((d.avg90 - d.price) / d.avg90) * 100 * 1.5;
  }
  if (d.rank && d.rank <= 5000) score += 30;
  if (d.reviewCount >= 500) score += 5;
  if (d.reviewCount >= 1000) score += 5;
  return Math.floor(score);
}

function normalizeProduct(p, streamName) {
  const asin = p.asin || "";
  const rank = getSalesRank(p);

  const deal = {
    asin,
    title: cleanTitle(p.title),
    category: streamName,
    price: getCurrentPrice(p),
    avg90: getAvg90(p),
    rating: getRating(p),
    reviewCount: getReviewCount(p),
    rank,
    img: getImage(p),
    url: asin ? `https://www.amazon.com/dp/${asin}` : "",
    keepa: asin ? `https://keepa.com/#!product/1-${asin}` : "",
    isLowAll: false,
    drop1Day: 0,
    isHot: rank !== null && rank <= 5000,
    isNameBrand: false,
    updatedAt: new Date().toISOString()
  };

  deal.dealScore = scoreDeal(deal);
  return deal;
}

function readExistingDeals() {
  try {
    if (!fs.existsSync("data/deals.json")) return [];
    const raw = fs.readFileSync("data/deals.json", "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.deals) ? parsed.deals : [];
  } catch {
    return [];
  }
}

function dedupeDeals(deals) {
  const map = new Map();

  for (const deal of deals) {
    if (!deal.asin) continue;

    const existing = map.get(deal.asin);

    if (!existing) {
      map.set(deal.asin, deal);
      continue;
    }

    const categories = new Set(
      String(existing.category || "")
        .split(",")
        .concat(String(deal.category || "").split(","))
        .map(x => x.trim())
        .filter(Boolean)
    );

    map.set(deal.asin, {
      ...existing,
      ...deal,
      category: [...categories].join(","),
      dealScore: Math.max(existing.dealScore || 0, deal.dealScore || 0)
    });
  }

  return [...map.values()].sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

async function run() {
  console.log(`Starting stream: ${stream.name}`);

  const queryData = await fetchJson(buildQueryUrl(stream.selection));
  console.log(`${stream.name}: ${queryData.asinList?.length || 0} ASINs found`);
  console.log(`${stream.name}: query tokens consumed ${queryData.tokensConsumed}, tokens left ${queryData.tokensLeft}`);

  if (queryData.tokensLeft !== undefined && queryData.tokensLeft < TOKEN_FLOOR) {
    console.log(`Token floor hit after query. Skipping enrichment. Floor: ${TOKEN_FLOOR}`);
    return;
  }

  const asins = (queryData.asinList || []).slice(0, stream.asinLimit);
  console.log(`${stream.name}: enriching ${asins.length} ASINs`);

  const productData = await fetchJson(buildProductUrl(asins));
  console.log(`${stream.name}: product tokens consumed ${productData.tokensConsumed}, tokens left ${productData.tokensLeft}`);

  const newDeals = (productData.products || [])
    .map(p => normalizeProduct(p, stream.name))
    .filter(d => d.asin && d.title && d.price);

  const existingDeals = readExistingDeals();

let mergedDeals = dedupeDeals([
  ...existingDeals,
  ...newDeals
]);

// Remove stale deals
const cutoff =
  Date.now() - (MAX_DEAL_AGE_HOURS * 60 * 60 * 1000);

mergedDeals = mergedDeals.filter(deal => {
  if (!deal.updatedAt) return false;

  return (
    new Date(deal.updatedAt).getTime() > cutoff
  );
});

fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/deals.json",
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "keepa-rolling-streams",
      lastStreamRun: stream.name,
      dealCount: mergedDeals.length,
      deals: mergedDeals
    }, null, 2)
  );

  console.log(`Merged ${newDeals.length} new ${stream.name} deals.`);
  console.log(`Wrote ${mergedDeals.length} total deals to data/deals.json`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
