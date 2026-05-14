console.log("Starting script...");

const fs = require("fs");
const path = require("path");

console.log("data exists:", fs.existsSync("data"));

const output = {
  generatedAt: new Date().toISOString(),
  deals: [
    {
      asin: "TEST123",
      title: "Pipeline Test Product",
      price: 49.99,
      category: "woodworking"
    }
  ]
};

// Remove data if it exists (whether file or directory)
try {
  const stats = fs.statSync("data");
  if (stats.isDirectory()) {
    fs.rmSync("data", { recursive: true, force: true });
  } else {
    fs.unlinkSync("data");
  }
} catch (err) {
      - name: Commit results
        run: |
          git config user.name "keepa-bot"
          git config user.email "keepa-bot@users.noreply.github.com"
          git add data/deals.json
          git commit -m "daily keepa update" || echo "no changes"

      - name: Push changes
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/${{ github.repository }}.git
          git push
  JSON.stringify(output, null, 2)
);

console.log("Wrote deals.json successfully");
