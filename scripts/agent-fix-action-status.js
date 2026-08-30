const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');
const oldBlock = `      const link = runUrl
        ? " <a href="" + escapeAttr(runUrl) + "" target="_blank" rel="noopener noreferrer">View run</a>"
        : "";`;
const newBlock = `      const link = runUrl
        ? ' <a href="' + escapeAttr(runUrl) + '" target="_blank" rel="noopener noreferrer">View run</a>'
        : "";`;
if (!html.includes(oldBlock)) {
  throw new Error('Malformed View run link block not found');
}
html = html.replace(oldBlock, newBlock);
fs.writeFileSync(path, html);

const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('No inline script found');
fs.writeFileSync('/tmp/app.js', match[1]);
