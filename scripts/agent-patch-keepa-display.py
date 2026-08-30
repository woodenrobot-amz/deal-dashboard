from pathlib import Path
import re

ROOT = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected block: {label}')
    return text.replace(old, new, 1)

# Capture Keepa token envelopes from discovery.
path = ROOT / 'scripts/keepa-discovery.js'
text = path.read_text()
text = replace_once(
    text,
    'const fs = require("fs");\n',
    'const fs = require("fs");\nconst { writeKeepaStatus } = require("./keepa-status");\n',
    'discovery status import'
)
text = replace_once(
    text,
    '  const data = await res.json();\n\n  if (data.error) {',
    '  const data = await res.json();\n  writeKeepaStatus(data, `discovery:${STREAM_NAME}`);\n\n  if (data.error) {',
    'discovery status write'
)
path.write_text(text)

# Capture the latest Keepa envelope after every enrichment batch.
path = ROOT / 'scripts/enrich-stream.js'
text = path.read_text()
text = replace_once(
    text,
    'const fs = require("fs");\n',
    'const fs = require("fs");\nconst { writeKeepaStatus } = require("./keepa-status");\n',
    'enrich status import'
)
text = replace_once(
    text,
    '    const data = await res.json();\n\n    if (data.error) {',
    '    const data = await res.json();\n    writeKeepaStatus(data, `enrich:${STREAM_NAME}`);\n\n    if (data.error) {',
    'enrich status write'
)
path.write_text(text)

# Make every workflow that executes the shared Keepa scripts publish the status snapshot.
workflow_count = 0
for path in (ROOT / '.github/workflows').glob('*.yml'):
    text = path.read_text()
    if 'node scripts/keepa-discovery.js' not in text and 'node scripts/enrich-stream.js' not in text:
        continue
    if 'git add data/keepa-status.json' in text:
        continue
    marker = '          git add data/discovered-asins.json\n'
    if marker not in text:
        raise SystemExit(f'Could not find discovery staging line in {path}')
    text = text.replace(marker, marker + '          git add data/keepa-status.json\n', 1)
    path.write_text(text)
    workflow_count += 1

if workflow_count < 2:
    raise SystemExit(f'Expected to patch multiple Keepa workflows, patched {workflow_count}')

# Add the Keepa token card to the Actions tab.
path = ROOT / 'index.html'
text = path.read_text()

css_marker = '    .workflow-grid {\n'
css = '''    .keepa-token-card {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      gap: 16px;\n      margin-bottom: 16px;\n      padding: 16px;\n      border: 1px solid var(--border);\n      border-radius: 18px;\n      background: var(--panel);\n      box-shadow: var(--shadow);\n    }\n\n    .keepa-token-copy { min-width: 0; }\n\n    .keepa-token-label {\n      color: var(--muted);\n      font-size: 0.78rem;\n      font-weight: 800;\n      letter-spacing: 0.08em;\n      text-transform: uppercase;\n    }\n\n    .keepa-token-value {\n      margin-top: 2px;\n      color: var(--text);\n      font-size: 2rem;\n      line-height: 1.05;\n      font-weight: 900;\n      letter-spacing: -0.03em;\n    }\n\n    .keepa-token-note {\n      margin-top: 6px;\n      color: var(--muted);\n      font-size: 0.82rem;\n      line-height: 1.35;\n    }\n\n    .keepa-token-actions {\n      display: flex;\n      flex-direction: column;\n      align-items: flex-end;\n      gap: 5px;\n      flex: 0 0 auto;\n    }\n\n    .keepa-token-refresh-note {\n      color: var(--muted);\n      font-size: 0.7rem;\n      white-space: nowrap;\n    }\n\n    .keepa-token-card.updating {\n      border-color: rgba(245, 158, 11, 0.5);\n    }\n\n'''
if css_marker not in text:
    raise SystemExit('Missing workflow grid CSS marker')
text = text.replace(css_marker, css + css_marker, 1)

html_marker = '      <section class="github-access-card" aria-label="GitHub access">\n'
html = '''      <section id="keepaTokenCard" class="keepa-token-card" aria-label="Keepa token balance">\n        <div class="keepa-token-copy">\n          <div class="keepa-token-label">Keepa Tokens</div>\n          <div id="keepaTokenValue" class="keepa-token-value">—</div>\n          <div id="keepaTokenNote" class="keepa-token-note">Waiting for the first saved Keepa response.</div>\n        </div>\n        <div class="keepa-token-actions">\n          <button id="refreshKeepaTokensBtn" class="small-control" type="button" data-workflow="keepa-token-check.yml" data-label="Keepa Token Refresh">Refresh Exact</button>\n          <span class="keepa-token-refresh-note">Exact check uses 1 token.</span>\n        </div>\n      </section>\n\n'''
if html_marker not in text:
    raise SystemExit('Missing GitHub access card marker')
text = text.replace(html_marker, html + html_marker, 1)

text = replace_once(
    text,
    '    const GITHUB_REPO = "woodenrobot-amz/deal-dashboard";\n    const GITHUB_REF = "main";\n',
    '    const GITHUB_REPO = "woodenrobot-amz/deal-dashboard";\n    const GITHUB_REF = "main";\n    const KEEPA_STATUS_URL = "https://raw.githubusercontent.com/woodenrobot-amz/deal-dashboard/main/data/keepa-status.json";\n',
    'Keepa status URL'
)

text = replace_once(
    text,
    '      showBookmarksOnly: false,\n      ignoredAsins:',
    '      showBookmarksOnly: false,\n      keepaStatus: null,\n      ignoredAsins:',
    'Keepa state'
)

text = replace_once(
    text,
    '      githubAccessState: document.getElementById("githubAccessState"),\n      setGithubTokenBtn:',
    '      githubAccessState: document.getElementById("githubAccessState"),\n      keepaTokenCard: document.getElementById("keepaTokenCard"),\n      keepaTokenValue: document.getElementById("keepaTokenValue"),\n      keepaTokenNote: document.getElementById("keepaTokenNote"),\n      setGithubTokenBtn:',
    'Keepa elements'
)

text = replace_once(
    text,
    '      workflowButtons: Array.from(document.querySelectorAll(".workflow-trigger")),',
    '      workflowButtons: Array.from(document.querySelectorAll(".workflow-trigger, #refreshKeepaTokensBtn")),',
    'workflow button selector'
)

text = replace_once(
    text,
    '      state.deals = normalizeDeals(await getDeals());\n      render();\n      resumeActiveWorkflow();\n',
    '      state.deals = normalizeDeals(await getDeals());\n      render();\n      await loadKeepaStatus();\n      window.setInterval(renderKeepaTokenStatus, 15000);\n      resumeActiveWorkflow();\n',
    'Keepa init'
)

# Keep token card aware of action-lock state.
text = replace_once(
    text,
    '      els.forgetGithubTokenBtn.disabled = locked || !Boolean(getGithubToken());\n    }',
    '      els.forgetGithubTokenBtn.disabled = locked || !Boolean(getGithubToken());\n      renderKeepaTokenStatus();\n    }',
    'control lock token render'
)

# Refresh token snapshot after any tracked action completes.
text = replace_once(
    text,
    '            clearActiveWorkflow();\n            setWorkflowControlsLocked(false);\n\n            if (succeeded) {',
    '            clearActiveWorkflow();\n            setWorkflowControlsLocked(false);\n            await loadKeepaStatus(true);\n\n            if (succeeded) {',
    'refresh token status on workflow complete'
)

status_marker = '    async function getDeals() {\n'
status_functions = '''    function keepaActionIsActive() {\n      const active = getActiveWorkflow();\n      return Boolean(active && active.workflowFile !== "scrub-all.yml");\n    }\n\n    function effectiveKeepaRefillRate(status) {\n      const refillRate = Number(status && status.refillRate);\n      const reduction = Number(status && status.tokenFlowReduction);\n      if (!Number.isFinite(refillRate) || refillRate <= 0) return 0;\n      return Math.max(0, refillRate - Math.round(Number.isFinite(reduction) ? reduction : 0));\n    }\n\n    function estimateKeepaTokens(status) {\n      const exact = Number(status && status.tokensLeft);\n      const capturedAt = Date.parse(status && status.capturedAt);\n      if (!Number.isFinite(exact) || !Number.isFinite(capturedAt)) return null;\n\n      const rate = effectiveKeepaRefillRate(status);\n      if (!rate) return exact;\n\n      const elapsed = Math.max(0, Date.now() - capturedAt);\n      const refillIn = Math.max(0, Number(status.refillIn) || 0);\n      let added = 0;\n\n      if (elapsed >= refillIn) {\n        added = rate * (1 + Math.floor((elapsed - refillIn) / 60000));\n      }\n\n      const capacity = Math.max(exact, rate * 60);\n      return Math.min(capacity, exact + added);\n    }\n\n    function formatKeepaCaptureTime(value) {\n      const date = new Date(value);\n      if (!Number.isFinite(date.getTime())) return "unknown time";\n      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });\n    }\n\n    function renderKeepaTokenStatus() {\n      const status = state.keepaStatus;\n      const exact = Number(status && status.tokensLeft);\n\n      if (!status || !Number.isFinite(exact) || !status.capturedAt) {\n        els.keepaTokenCard.classList.remove("updating");\n        els.keepaTokenValue.textContent = "—";\n        els.keepaTokenNote.textContent = "Run any Keepa action or tap Refresh Exact to capture the balance.";\n        return;\n      }\n\n      const active = getActiveWorkflow();\n      const keepaActive = keepaActionIsActive();\n      const rate = effectiveKeepaRefillRate(status);\n      const estimated = estimateKeepaTokens(status);\n      const exactLabel = Math.round(exact).toLocaleString();\n\n      els.keepaTokenCard.classList.toggle("updating", keepaActive);\n\n      if (keepaActive) {\n        els.keepaTokenValue.textContent = exactLabel + " last exact";\n        els.keepaTokenNote.textContent =\n          formatKeepaCaptureTime(status.capturedAt) +\n          " • " + active.label + " is active; balance refreshes when it finishes.";\n        return;\n      }\n\n      els.keepaTokenValue.textContent = estimated === null\n        ? exactLabel\n        : "≈ " + Math.round(estimated).toLocaleString();\n      els.keepaTokenNote.textContent =\n        "Last exact " + exactLabel + " at " + formatKeepaCaptureTime(status.capturedAt) +\n        (rate ? " • " + rate.toLocaleString() + "/min refill" : "");\n    }\n\n    async function loadKeepaStatus(force) {\n      const suffix = force ? "?t=" + Date.now() : "?t=" + Math.floor(Date.now() / 15000);\n      try {\n        const response = await fetch(KEEPA_STATUS_URL + suffix, { cache: "no-store" });\n        if (!response.ok) throw new Error("HTTP " + response.status);\n        state.keepaStatus = await response.json();\n        renderKeepaTokenStatus();\n      } catch (error) {\n        console.warn("Could not load Keepa token status", error);\n        if (!state.keepaStatus) {\n          els.keepaTokenValue.textContent = "Unavailable";\n          els.keepaTokenNote.textContent = "Could not load the saved Keepa balance.";\n        }\n      }\n    }\n\n'''
if status_marker not in text:
    raise SystemExit('Missing getDeals marker')
text = text.replace(status_marker, status_functions + status_marker, 1)

# Improve mobile token card stacking.
mobile_marker = '      .github-access-card {\n        align-items: flex-start;\n        flex-direction: column;\n      }\n'
mobile_new = '''      .github-access-card,\n      .keepa-token-card {\n        align-items: flex-start;\n        flex-direction: column;\n      }\n\n      .keepa-token-actions {\n        width: 100%;\n        align-items: flex-start;\n      }\n'''
if mobile_marker not in text:
    raise SystemExit('Missing mobile access-card marker')
text = text.replace(mobile_marker, mobile_new, 1)

path.write_text(text)
print(f'Patched {workflow_count} Keepa workflows')
