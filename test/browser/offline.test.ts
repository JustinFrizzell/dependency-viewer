import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';

fs.mkdirSync('.tmp', { recursive: true });
process.env.TMPDIR = path.resolve('.tmp');
const viewer = pathToFileURL(path.resolve('dist/dependency-viewer.html')).href;

function trackExternalRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file:') && !request.url().startsWith('blob:')) requests.push(request.url());
  });
  return requests;
}

test('opens in View and enables Document editing only in Edit', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#document-panel summary').click();
    await page.locator('#entity-results button[title="A"]').click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#document-json').isEditable(), false);
    assert.equal(await page.locator('#edit-entity-form').isVisible(), false);
    assert.equal(await page.locator('#compact-nodes').isDisabled(), true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.locator('#document-json').isEditable(), true);
    assert.equal(await page.locator('#edit-entity-form').isVisible(), true);
    assert.equal(await page.locator('#compact-nodes').isEnabled(), true);
  } finally {
    await browser.close();
  }
});

test('resolves JSON drafts before leaving Edit without saving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#document-panel summary').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#document-json').fill('{invalid');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply JSON draft' }).click();
    assert.match((await page.locator('#document-error').textContent())!, /error/i);
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Stay in Edit' }).click();
    assert.equal(await page.locator('#document-json').inputValue(), '{invalid');
    await page.locator('#document-json').fill('{"entities":[{"name":"B","dependencies":[]}]}');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply JSON draft' }).click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /unsaved/i);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#document-json').fill('{invalid');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Discard JSON draft' }).click();
    assert.match(await page.locator('#document-json').inputValue(), /"B"/);
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
  } finally {
    await browser.close();
  }
});

test('resolves contextual drafts and protects invalid drafts when switching modes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#edit-entity-name').fill('B');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply Entity draft' }).click();
    assert.match((await page.locator('#draft-resolution-error').textContent())!, /exists|already|collision/i);
    assert.equal(await page.locator('#edit-entity-name').inputValue(), 'B');
    await page.locator('#draft-resolution').getByRole('button', { name: 'Discard Entity draft' }).click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#new-dependency-name').fill('B');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply Direct dependency draft' }).click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#document-json').inputValue(), /"B"/);
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /unsaved/i);
  } finally {
    await browser.close();
  }
});

test('resolves property and new Entity drafts without merging conflicting work', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#metadata-panel summary').click();
    await page.locator('#metadata-key').fill('owner');
    await page.locator('#metadata-value').fill('"team"');
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#new-entity-name').fill('B');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply property draft' }).click();
    assert.match((await page.locator('#draft-resolution-error').textContent())!, /conflicting drafts/i);
    assert.equal(await page.locator('#new-entity-name').inputValue(), 'B');
    await page.locator('#draft-resolution').getByRole('button', { name: 'Discard new Entity draft' }).click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply property draft' }).click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    const current = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(current.entities, [{ name: 'A', dependencies: [], owner: 'team' }]);
  } finally {
    await browser.close();
  }
});

test('preserves work on failed opens and resets mode, history and navigation on reopening', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(viewer);
    const file = {
      name: 'same.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"entities":[{"name":"A","dependencies":[]}]}'),
    };
    await page.locator('#dependency-file').setInputFiles(file);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#document-panel summary').click();
    await page.locator('#document-json').fill('{"entities":[{"name":"B","dependencies":[]}]}');
    await page.locator('#apply-document').click();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await page.locator('#copy-document').click();
    assert.match((await page.locator('#document-status').textContent())!, /select and copy/i);
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /unsaved/i);
    const download = page.waitForEvent('download');
    await page.locator('#download-document').click();
    await download;
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.locator('#document-json').fill('{"entities":[{"name":"C","dependencies":[]}]}');
    await page.locator('#apply-document').click();
    await page.locator('#undo-document').click();
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.locator('#graph-filter').fill('B');
    await page.locator('#document-json').fill('{invalid draft');
    await page.locator('#toggle-file-panel').click();
    await page.locator('#paste-json').fill('{invalid document');
    await page.locator('#open-paste').click();
    assert.match((await page.locator('#file-error').textContent())!, /error/i);
    await page.locator('#dependency-file').setInputFiles([]);
    await page.locator('#paste-json').fill('{"entities":[]}');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.locator('#open-paste').click();
    assert.equal(await page.locator('#document-json').inputValue(), '{invalid draft');
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => {
      const Original = window.FileReader;
      window.FileReader = class extends Original {
        override readAsText() {
          window.FileReader = Original;
          this.dispatchEvent(new ProgressEvent('error'));
        }
      };
    });
    await page.locator('#dependency-file').setInputFiles(file);
    assert.match((await page.locator('#file-error').textContent())!, /could not read/i);
    assert.equal(await page.locator('#document-json').inputValue(), '{invalid draft');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('#dependency-file').setInputFiles(file);
    await page.waitForFunction(() => document.getElementById('file-error')!.textContent === '');
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#graph-filter').inputValue(), '');
    assert.equal(await page.locator('#document-panel').evaluate((panel: HTMLDetailsElement) => panel.open), false);
    assert.match(await page.locator('#document-json').inputValue(), /"A"/);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.locator('#undo-document').isDisabled(), true);
    assert.equal(await page.locator('#redo-document').isDisabled(), true);
  } finally {
    await browser.close();
  }
});

test('opens a pasted Document in the standalone viewer offline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Source","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /Source/);
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

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#entity-results button[title="Source"]').click();
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.locator('#edit-entity-description').fill('Updated');
    await page.locator('#edit-entity-form button[type=submit]').click();
    await page.locator('#entity-results button[title="Report"]').click();
    await page.locator('#new-dependency-name').fill('External');
    await page.locator('#add-dependency-form button[type=submit]').click();
    await page.locator('#compact-nodes').check();
    await page.locator('#document-panel summary').click();
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /unsaved/i);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-document').click();
    const download = await downloadPromise;
    await download.saveAs(downloadedPath);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.locator('#toggle-file-panel').click();
    await page.locator('#dependency-file').setInputFiles(downloadedPath);
    await page.waitForFunction(() => document.getElementById('file-name')!.textContent === 'browser-document.json');
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
    assert.match((await page.locator('#graph-summary').textContent())!, /External.*Report/s);
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
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#edit-entity-name').fill('B');
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#edit-entity-name').inputValue(), 'B');
    assert.match((await page.locator('#edit-entity-error').textContent())!, /apply or discard/i);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#new-dependency-name').fill(' A');
    await page.locator('#add-dependency-form button[type=submit]').click();
    assert.match((await page.locator('#dependency-error').textContent())!, /whitespace/i);
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
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#document-panel summary').click();
    await page.locator('#document-json').fill('{"entities":[{"name":"B","dependencies":[]}]}');
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#edit-entity-name').fill('C');
    await page.locator('#edit-entity-form button[type=submit]').click();
    assert.match((await page.locator('#edit-entity-error').textContent())!, /apply or discard/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#apply-document').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
    await page.locator('#undo-document').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /A/);
    await page.locator('#redo-document').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
    await page.locator('#document-json').fill('{"entities":[],"x":1,"x":2}');
    await page.locator('#apply-document').click();
    assert.match((await page.locator('#document-error').textContent())!, /duplicate/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#toggle-file-panel').click();
    await page.locator('#paste-json').fill('{invalid');
    await page.locator('#open-paste').click();
    assert.match((await page.locator('#file-error').textContent())!, /error/i);
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
    await page.locator('#paste-json').fill('{"entities":[]}');
    const confirmation = page.waitForEvent('dialog');
    const replace = page.locator('#open-paste').click();
    const dialog = await confirmation;
    assert.equal(dialog.type(), 'confirm');
    await dialog.dismiss();
    await replace;
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
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
    assert.ok(bounds);
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
    assert.match((await page.locator('#selection-status').textContent())!, /owner/);
    assert.equal(await page.locator('#selection-status img').count(), 0);
    assert.equal(await page.evaluate(() => (window as Window & { injected?: boolean }).injected), undefined);
    await page.locator('[data-view="upstream"]').click();
    assert.equal(await page.locator('[data-view="upstream"]').getAttribute('aria-pressed'), 'true');
    assert.match((await page.locator('#graph-summary').textContent())!, /Source.*Report/s);
    await page.locator('#export-menu summary').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-png').click();
    const png = await downloadPromise;
    assert.match(png.suggestedFilename(), /\.png$/i);
    const chunks: Buffer[] = [];
    for await (const chunk of await png.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
  }
});
