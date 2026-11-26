const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

fs.mkdirSync('.tmp', { recursive: true });
process.env.TMPDIR = path.resolve('.tmp');
const viewer = pathToFileURL(path.resolve('dist/dependency-viewer.html')).href;

function trackExternalRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file:') && !request.url().startsWith('blob:')) requests.push(request.url());
  });
  return requests;
}

test('opens a pasted Document in the standalone viewer offline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Source","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.match(await page.locator('#graph-summary').textContent(), /Source/);
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
  }
});

test('edits and downloads a Document that can be uploaded offline with metadata intact', async () => {
  const browser = await chromium.launch({ headless: true });
  const downloadedPath = path.resolve('.tmp/browser-document.json');
  try {
    const context = await browser.newContext({ offline: true, acceptDownloads: true });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    await page.goto(viewer);
    const original = {
      entities: [
        { name: 'Source', description: 'Original', dependencies: [], extra: { owner: ['team', 7] } },
        { name: 'Report', dependencies: ['Source', 'Source'] },
      ],
      metadata: { retained: true },
    };
    await page.locator('#dependency-file').setInputFiles({
      name: 'original.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(original)),
    });

    await page.locator('#entity-results button[title="Source"]').click();
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.locator('#edit-entity-description').fill('Updated');
    await page.locator('#edit-entity-form button[type=submit]').click();
    await page.locator('#entity-results button[title="Report"]').click();
    await page.locator('#new-dependency-name').fill('External');
    await page.locator('#add-dependency-form button[type=submit]').click();
    await page.locator('#compact-nodes').check();
    await page.locator('#document-panel summary').click();
    assert.match(await page.locator('#unsaved-indicator').textContent(), /unsaved/i);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-document').click();
    const download = await downloadPromise;
    await download.saveAs(downloadedPath);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.locator('#toggle-file-panel').click();
    await page.locator('#dependency-file').setInputFiles(downloadedPath);
    await page.waitForFunction(() => document.getElementById('file-name').textContent === 'browser-document.json');
    const saved = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(saved, {
      entities: [
        { name: 'Renamed', description: 'Updated', dependencies: [], extra: { owner: ['team', 7] } },
        { name: 'Report', dependencies: ['Renamed', 'Renamed', 'External'] },
      ],
      metadata: { retained: true },
      settings: { appearance: { compact: true } },
    });
    assert.equal(await page.locator('#compact-nodes').isChecked(), true);
    assert.match(await page.locator('#graph-summary').textContent(), /External.*Report/s);
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
    fs.rmSync(downloadedPath, { force: true });
  }
});

test('keeps form drafts visible and blocks download and selection until resolved', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#edit-entity-name').fill('B');
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#edit-entity-name').inputValue(), 'B');
    assert.match(await page.locator('#edit-entity-error').textContent(), /apply or discard/i);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#new-dependency-name').fill(' A');
    await page.locator('#add-dependency-form button[type=submit]').click();
    assert.match(await page.locator('#dependency-error').textContent(), /whitespace/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#discard-dependency-draft').click();
    assert.equal(await page.locator('#download-document').isDisabled(), false);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'B');
  } finally {
    await browser.close();
  }
});

test('protects invalid drafts and unsaved changes while supporting undo and redo', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#document-panel summary').click();
    await page.locator('#document-json').fill('{"entities":[{"name":"B","dependencies":[]}]}');
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#edit-entity-name').fill('C');
    await page.locator('#edit-entity-form button[type=submit]').click();
    assert.match(await page.locator('#edit-entity-error').textContent(), /apply or discard/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#apply-document').click();
    assert.match(await page.locator('#graph-summary').textContent(), /B/);
    await page.locator('#undo-document').click();
    assert.match(await page.locator('#graph-summary').textContent(), /A/);
    await page.locator('#redo-document').click();
    assert.match(await page.locator('#graph-summary').textContent(), /B/);
    await page.locator('#document-json').fill('{"entities":[],"x":1,"x":2}');
    await page.locator('#apply-document').click();
    assert.match(await page.locator('#document-error').textContent(), /duplicate/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#toggle-file-panel').click();
    await page.locator('#paste-json').fill('{invalid');
    await page.locator('#open-paste').click();
    assert.match(await page.locator('#file-error').textContent(), /error/i);
    assert.match(await page.locator('#graph-summary').textContent(), /B/);
    await page.locator('#paste-json').fill('{"entities":[]}');
    const confirmation = page.waitForEvent('dialog');
    const replace = page.locator('#open-paste').click();
    const dialog = await confirmation;
    assert.equal(dialog.type(), 'confirm');
    await dialog.dismiss();
    await replace;
    assert.match(await page.locator('#graph-summary').textContent(), /B/);
    const beforeUnload = page.waitForEvent('dialog');
    const reload = page.reload({ timeout: 1500 }).catch(() => {});
    const leaveDialog = await beforeUnload;
    assert.equal(leaveDialog.type(), 'beforeunload');
    await leaveDialog.dismiss();
    await reload;
    assert.equal(await page.locator('#document-json').inputValue(), '{"entities":[],"x":1,"x":2}');
    await page.locator('#discard-document').click();
    assert.equal(await page.locator('#download-document').isDisabled(), false);
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
  }
});

test('exposes safe details by keyboard and tooltip and retains graph views and PNG export', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      offline: true,
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    const hostile = '<img src=x onerror="window.injected=true">';
    await page.goto(viewer);
    await page.locator('#paste-json').fill(
      JSON.stringify({
        entities: [{ name: 'Report', description: hostile, owner: hostile, dependencies: ['Source'] }],
      }),
    );
    await page.locator('#open-paste').click();
    const graph = page.locator('#graph');
    const bounds = await graph.boundingBox();
    let tooltip = '';
    for (let y = bounds.y + 35; y < bounds.y + bounds.height - 35 && !tooltip.includes(hostile); y += 15) {
      for (let x = bounds.x + 325; x < bounds.x + bounds.width - 35; x += 15) {
        await page.mouse.move(x, y);
        tooltip = (await graph.getAttribute('title')) || '';
        if (tooltip.includes(hostile)) break;
      }
    }
    assert.match(tooltip, /Description: <img/);
    assert.match(tooltip, /owner: <img/);
    await page.locator('#entity-search').fill('Report');
    await page.locator('#entity-search').focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.locator('#entity-results button[title="Report"]').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#selection-status').textContent(), /owner/);
    assert.equal(await page.locator('#selection-status img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.locator('[data-view="upstream"]').click();
    assert.equal(await page.locator('[data-view="upstream"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#graph-summary').textContent(), /Source.*Report/s);
    await page.locator('#export-menu summary').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-png').click();
    const png = await downloadPromise;
    assert.match(png.suggestedFilename(), /\.png$/i);
    const chunks = [];
    for await (const chunk of await png.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
  }
});
