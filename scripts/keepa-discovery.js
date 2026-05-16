const fs = require("fs");

const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
const STREAM_NAME = process.argv[2];

if (!KEEPA_API_KEY) throw new Error("Missing KEEPA_API_KEY");
if (!STREAM_NAME) throw new Error("Missing stream argument");

const STREAMS = {
  woodworking: {
    name: "woodworking",
    selection: {
      categories_exclude: [
        "13399871","13749581","15569906011","157681011","17515060011",
        "2225057011","495346","553140","553242","553348","553350",
        "553392","553406","553422"
      ],
      current_SALES_gte: 1,
      current_SALES_lte: 200000,
      current_RATING_gte: 42,
      current_COUNT_REVIEWS_gte: 50,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,
      deltaPercent30_BUY_BOX_SHIPPING_gte: 5,
      rootCategory: ["16310091","228013"],
      productType: [0],
      variationReviewCount_gte: 1,
      categories_include: [
        "2399141011","3116511","551236","551238","552318","552342",
        "552578","552580","552648","552780","552794","552824","552842",
        "552866","552910","552940","552942","552962","552964","553022",
        "553150","553218","553244","553142","383663011","16412291"
      ],
      sort: [["current_SALES","asc"],["monthlySold","desc"]],
      lastRatingUpdate_gte: 7953123,
      page: 0,
      perPage: 3000
    }
  },


three_d_printing: {
    name: "three_d_printing",
    selection: {
      categories_exclude: ["8481415011"],

      current_SALES_gte: 1,
      current_SALES_lte: 200000,

      isLowest_BUY_BOX_SHIPPING: true,
      isLowest90_BUY_BOX_SHIPPING: true,

      deltaPercent90_BUY_BOX_SHIPPING_gte: 5,

      rootCategory: ["16310091"],

      categories_include: ["6066126011"],

      sort: [
        ["current_SALES", "asc"],
        ["monthlySold", "desc"]
      ],

      productType: [0],

      page: 0,
      perPage: 3000
    }
  },

  deals_for_dudes: {
    name: "deals_for_dudes",
    selection: {
      categories_exclude: [
        "172435","172526","172574","3011391011",
        "3248684011","502394","524136","6684132011"
      ],
      current_SALES_gte: 1,
      current_SALES_lte: 100000,
      current_RATING_gte: 41,
      current_COUNT_REVIEWS_gte: 50,
      isLowest90_BUY_BOX_SHIPPING: true,
      deltaPercent7_BUY_BOX_SHIPPING_gte: 10,
      deltaPercent90_BUY_BOX_SHIPPING_gte: 10,
      rootCategory: [
        "1055398","16310091","16333372011","172282",
        "228013","2617941011","2972638011"
      ],
      categories_include: [
        "206234609011","20972781011","20972798011","23673182011",
        "289810","3180261","541966","551242","552808","553232","553760"
      ],
      sort: [["current_SALES","asc"],["monthlySold","desc"]],
      lastRatingUpdate_gte: 7952433,
      productType: [0],
      page: 0,
      perPage: 3000
    }
  }
};

const stream = STREAMS[STREAM_NAME];
if (!stream) throw new Error(`Unknown stream: ${STREAM_NAME}`);

function buildQueryUrl(selection) {
  return (
    `https://api.keepa.com/query?key=${KEEPA_API_KEY}` +
    `&domain=1` +
    `&selection=${encodeURIComponent(JSON.stringify(selection))}`
  );
}

function readExistingDiscovery() {
  try {
    if (!fs.existsSync("data/discovered-asins.json")) return [];
    return JSON.parse(fs.readFileSync("data/discovered-asins.json", "utf8")).asins || [];
  } catch {
    return [];
  }
}

function dedupe(items) {
  const map = new Map();

  for (const item of items) {
    const existing = map.get(item.asin);

    if (!existing) {
      map.set(item.asin, item);
    } else {
      map.set(item.asin, {
        ...existing,
        ...item,
        streams: [...new Set([...(existing.streams || []), ...(item.streams || [])])]
      });
    }
  }

  return [...map.values()];
}

async function run() {
  console.log(`Starting discovery for ${stream.name}`);

  const res = await fetch(buildQueryUrl(stream.selection));
  const data = await res.json();

  if (data.error) throw new Error(JSON.stringify(data.error));

  const now = new Date().toISOString();

  const newItems = (data.asinList || []).map(asin => ({
    asin,
    streams: [stream.name],
    discoveredAt: now,
    lastSeenAt: now
  }));

  const existing = readExistingDiscovery();
  const merged = dedupe([...existing, ...newItems]);

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/discovered-asins.json",
    JSON.stringify({
      generatedAt: now,
      lastDiscoveryStream: stream.name,
      totalDiscovered: merged.length,
      asins: merged
    }, null, 2)
  );

  console.log(`${stream.name}: found ${newItems.length} ASINs`);
  console.log(`Discovery pool now has ${merged.length} unique ASINs`);
  console.log(`Tokens consumed: ${data.tokensConsumed}, tokens left: ${data.tokensLeft}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
