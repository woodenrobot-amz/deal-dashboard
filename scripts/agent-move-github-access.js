const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const card = `      <section class="github-access-card" aria-label="GitHub access">\n        <div class="github-access-copy">\n          <div class="github-access-title">GitHub Actions access</div>\n          <p class="github-access-note">A fine-grained token is stored only on this device. It only needs Actions read/write access to this repository.</p>\n        </div>\n        <div class="github-access-actions">\n          <button id="setGithubTokenBtn" class="small-control" type="button">Set / Replace Token</button>\n          <button id="forgetGithubTokenBtn" class="small-control muted" type="button">Forget Token</button>\n        </div>\n      </section>\n\n`;

const status = `      <section id="workflowStatus" class="workflow-status" aria-live="polite">\n        <strong>Status:</strong> Ready.\n      </section>`;

if (!html.includes(card)) throw new Error('GitHub access card not found');
if (!html.includes(status)) throw new Error('Workflow status section not found');

html = html.replace(card, '');
html = html.replace(status, status + '\n\n' + card.trimEnd());

fs.writeFileSync(path, html);

const moved = fs.readFileSync(path, 'utf8');
if (moved.indexOf('workflowStatus') > moved.indexOf('GitHub Actions access')) {
  throw new Error('GitHub access card was not moved below workflow status');
}
console.log('Moved GitHub access card below workflow status.');
