import { afterEach, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium as chromiumEngine, webkit, type Browser, type BrowserContextOptions, type Page } from 'playwright';

fs.mkdirSync('.tmp', { recursive: true });
process.env.TMPDIR = path.resolve('.tmp');
const viewer = pathToFileURL(path.resolve('dist/dependency-viewer.html')).href;
const browserName = process.env.BROWSER || 'chromium';
if (browserName !== 'chromium' && browserName !== 'webkit') throw new Error(`Unsupported browser: ${browserName}`);
const chromium = browserName === 'webkit' ? webkit : chromiumEngine;
const externalRequests: string[] = [];

afterEach(() => {
  const requests = externalRequests.splice(0);
  assert.deepEqual(requests, [], 'The standalone viewer must not make external requests');
});

async function newContext(browser: Browser, options?: BrowserContextOptions) {
  const context = await browser.newContext(options);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    externalRequests.push(url);
    return route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => {
    externalRequests.push(socket.url());
    socket.close();
  });
  return context;
}

async function newPage(browser: Browser, options?: BrowserContextOptions) {
  return (await newContext(browser, options)).newPage();
}

async function openFind(page: Page) {
  const list = page.locator('#entity-list');
  if (!(await list.evaluate((element: HTMLDetailsElement) => element.open))) await list.locator('summary').click();
}

async function openEntityEditor(page: Page) {
  if (!(await page.locator('#edit-entity-form').isVisible())) {
    await page.getByRole('button', { name: 'Edit Entity', exact: true }).click();
  }
}

async function openFilter(page: Page) {
  await page.locator('#graph-filter').focus();
}

async function openSettings(page: Page) {
  const settings = page.locator('#colour-settings');
  if (!(await settings.evaluate((element: HTMLDetailsElement) => element.open)))
    await settings.locator('summary').click();
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  if ((await page.locator('html').getAttribute('data-theme')) !== theme) await page.locator('#toggle-theme').click();
}

function trackExternalRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file:') && !request.url().startsWith('blob:')) requests.push(request.url());
  });
  return requests;
}

function contrast(first: string, second: string) {
  const luminance = (colour: string) => {
    const components = colour.match(/\d+/g)!.slice(0, 3).map(Number);
    return components.reduce((sum, component, index) => {
      const value = component / 255;
      return (
        sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test('small workspace controls can be reopened and the notice returns only on re-entry', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 679, height: 600 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.locator('#small-screen-notice').isVisible(), true);
    assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'false');
    await page.locator('#dismiss-small-screen').click();
    await page.locator('#toggle-controls').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#mode-view').isVisible(), true);
    await openSettings(page);
    assert.equal(await page.locator('#colours-enabled').isVisible(), true);
    await page.locator('#colour-settings summary').click();
    await page.locator('#toggle-controls').click();
    assert.equal(
      await page.locator('#toggle-controls').evaluate((element) => element === document.activeElement),
      true,
    );
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForFunction(() => document.body.dataset.smallScreen === 'false');
    assert.equal(await page.locator('#small-screen-notice').isVisible(), false);
    await page.setViewportSize({ width: 800, height: 499 });
    await page.waitForFunction(() => document.body.dataset.smallScreen === 'true');
    assert.equal(await page.locator('#small-screen-notice').isVisible(), true);
  } finally {
    await browser.close();
  }
});

test('Find results remain clickable while the small screen notice is visible', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 320, height: 500 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill(
      JSON.stringify({
        entities: Array.from({ length: 10 }, (_, index) => ({ name: `Entity ${index}`, dependencies: [] })),
      }),
    );
    await page.locator('#open-paste').click();
    await page.locator('#toggle-controls').click();
    await openFind(page);
    const find = (await page.locator('.entity-list-content').boundingBox())!;
    const notice = (await page.locator('#small-screen-notice').boundingBox())!;
    assert.ok(find.y + find.height <= notice.y, 'Find results must not be obscured by the notice');
    await page.locator('#entity-results button[title="Entity 0"]').click({ timeout: 5000 });
    assert.equal(await page.locator('#selection-status h2').textContent(), 'Entity 0');
    assert.equal(await page.locator('#small-screen-notice').isVisible(), true);
    await page.locator('#dismiss-small-screen').click();
    assert.equal(await page.locator('#small-screen-notice').isVisible(), false);
  } finally {
    await browser.close();
  }
});

test('property editing remains usable after minimizing controls on a small screen', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 375, height: 667 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[],"custom":1}]}');
    await page.locator('#open-paste').click();
    await page.locator('#dismiss-small-screen').click();
    await page.locator('#toggle-controls').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await page.locator('#toggle-controls').click();
    await openEntityEditor(page);
    await page.getByRole('button', { name: 'Edit properties' }).click();
    assert.equal(await page.locator('#metadata-property').isVisible(), true);
    await page.locator('#metadata-property').selectOption({ label: 'custom' });
    await page.locator('#metadata-value').fill('2');
    await page.locator('#metadata-form button[type=submit]').click();
    assert.equal(JSON.parse(await page.locator('#document-json').inputValue()).entities[0].custom, 2);
  } finally {
    await browser.close();
  }
});

test('closing a details card with a hidden Entity draft exposes its safeguard', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.getByRole('button', { name: 'Close editor' }).click();
    await page.locator('#close-inspector').click();
    assert.equal(await page.locator('#edit-entity-error').isVisible(), true);
    assert.match((await page.locator('#edit-entity-error').textContent())!, /apply or discard/i);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#close-inspector').click();
    assert.equal(await page.locator('#inspector').isVisible(), false);
  } finally {
    await browser.close();
  }
});

test('closing a card with a hidden Direct dependency draft returns focus to the draft', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#new-dependency-name').fill('B');
    await page.getByRole('button', { name: 'Close editor' }).click();
    await page.locator('#close-inspector').click();
    assert.equal(
      await page.locator('#new-dependency-name').evaluate((element) => element === document.activeElement),
      true,
    );
    assert.match((await page.locator('#dependency-error').textContent())!, /apply or discard/i);
    await page.locator('#add-dependency-form button[type=submit]').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[0].dependencies, ['B']);
    await page.locator('#close-inspector').click();
    assert.equal(await page.locator('#inspector').isVisible(), false);
  } finally {
    await browser.close();
  }
});

test('Entity editing is explicitly opened from the compact details card', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"raw.orders","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.getByRole('button', { name: 'raw.orders', exact: true }).click();
    assert.equal(await page.locator('#edit-entity-form').isVisible(), false);
    await page.getByRole('button', { name: 'Edit Entity', exact: true }).click();
    assert.equal(await page.locator('#edit-entity-form').isVisible(), true);
    assert.equal(await page.locator('#add-dependency-form').isVisible(), true);
    await page.locator('#edit-entity-name').fill('raw.renamed');
    await page.locator('#mode-view').click();
    assert.equal(
      await page.locator('#draft-resolution').getByRole('button', { name: 'Discard Entity draft' }).isVisible(),
      true,
    );
  } finally {
    await browser.close();
  }
});

test('workspace separates Document actions from dependency views and shows Entity name parts', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"warehouse.raw.orders","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.locator('header #entity-list').isVisible(), true);
    assert.equal(await page.locator('header #colour-settings').isVisible(), true);
    assert.equal(await page.locator('header #export-menu').isVisible(), true);
    assert.equal(await page.locator('.workspace-toolbar #dependency-views').isVisible(), true);
    assert.equal(await page.locator('.graph-entity-prefix').textContent(), 'warehouse.raw');
    assert.equal(await page.getByRole('button', { name: 'Inspect Entity warehouse.raw.orders' }).count(), 1);
  } finally {
    await browser.close();
  }
});

test('PNG exports distinguish Entities with the same final name but different prefixes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { acceptDownloads: true });
    await page.goto(viewer);
    const exportEntity = async (name: string) => {
      await page.locator('#paste-json').fill(JSON.stringify({ entities: [{ name, dependencies: [] }] }));
      await page.locator('#open-paste').click();
      await page.locator('#export-menu summary').click();
      const download = page.waitForEvent('download');
      await page.locator('#export-png').click();
      const chunks: Buffer[] = [];
      for await (const chunk of await (await download).createReadStream()) chunks.push(chunk);
      return Buffer.concat(chunks);
    };
    const first = await exportEntity('raw.orders');
    await page.locator('#toggle-file-panel').click();
    const second = await exportEntity('stage.orders');
    assert.notDeepEqual(first, second);
  } finally {
    await browser.close();
  }
});

test('blank canvas mouse click opens creation but panning and touch do not', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { offline: browserName !== 'webkit', hasTouch: true });
    const page = await context.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[]}');
    await page.locator('#open-paste').click();
    const graph = page.locator('#graph');
    const box = (await graph.boundingBox())!;
    const point = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
    const panel = page.locator('#add-entity-panel');
    await page.mouse.click(point.x, point.y);
    assert.equal(await panel.isVisible(), false);
    await page.locator('#mode-edit').click();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 30, point.y + 20);
    await page.mouse.up();
    assert.equal(await panel.evaluate((element: HTMLDetailsElement) => element.open), false);
    await page.touchscreen.tap(point.x, point.y);
    assert.equal(await panel.evaluate((element: HTMLDetailsElement) => element.open), false);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event('pointercancel')));
    await page.mouse.up();
    assert.equal(await panel.evaluate((element: HTMLDetailsElement) => element.open), false);
    await page.mouse.click(point.x, point.y);
    assert.equal(await panel.evaluate((element: HTMLDetailsElement) => element.open), true);
    assert.equal(
      await page.locator('#new-entity-name').evaluate((element) => element === document.activeElement),
      true,
    );
    await page.locator('#new-entity-name').fill('First');
    await page.locator('#add-entity-form button[type=submit]').click();
    assert.equal(await page.locator('#inspector h2').textContent(), 'First');
    await page.locator('#undo-document').click();
    assert.match((await page.locator('#graph-count').textContent())!, /^0 Entities/);
  } finally {
    await browser.close();
  }
});

test('creating an Entity on the canvas places it at the click without moving existing Entities', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1200, height: 900 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Existing","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const existing = page.getByRole('button', { name: 'Inspect Entity Existing' });
    const before = (await existing.boundingBox())!;
    const point = { x: 1000, y: 650 };
    await page.mouse.click(point.x, point.y);
    await page.locator('#new-entity-name').fill('New');
    await page.locator('#add-entity-form button[type=submit]').click();
    const created = (await page.getByRole('button', { name: 'Inspect Entity New' }).boundingBox())!;
    const after = (await existing.boundingBox())!;
    assert.ok(Math.abs(created.x + created.width / 2 - point.x) < 2);
    assert.ok(Math.abs(created.y + created.height / 2 - point.y) < 2);
    assert.ok(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2);
  } finally {
    await browser.close();
  }
});

test('renaming and removing an undocumented Entity changes references without creating a record', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":["Missing","Missing"]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="Missing (undocumented)"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('External');
    await page.locator('#edit-entity-form button[type=submit]').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'A', dependencies: ['External', 'External'] },
    ]);
    await page.locator('#delete-entity').click();
    await page.locator('#delete-entity-remove').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'A', dependencies: [] },
    ]);
    await page.locator('#undo-document').click();
    await page.locator('#undo-document').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'A', dependencies: ['Missing', 'Missing'] },
    ]);
  } finally {
    await browser.close();
  }
});

test('touch Add Entity documents a missing dependency and validates names without losing work', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit', hasTouch: true });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Report","dependencies":["Missing"]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await page.locator('#add-entity-panel summary').tap();
    const name = page.locator('#new-entity-name');
    await name.fill(' Report');
    await page.locator('#add-entity-form button[type=submit]').tap();
    assert.match((await page.locator('#add-entity-error').textContent())!, /whitespace/i);
    await name.fill('Report');
    await page.locator('#add-entity-form button[type=submit]').tap();
    assert.match((await page.locator('#add-entity-error').textContent())!, /exists/i);
    await name.fill('Missing');
    await page.locator('#new-entity-description').fill('Now documented');
    await page.locator('#add-entity-form button[type=submit]').tap();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'Missing');
    assert.match((await page.locator('#selection-status').textContent())!, /Documented entity/);
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'Report', dependencies: ['Missing'] },
      { name: 'Missing', dependencies: [], description: 'Now documented' },
    ]);
    await page.locator('#undo-document').tap();
    assert.match((await page.locator('#graph-summary').textContent())!, /Missing \(undocumented\)/);
    await page.locator('#redo-document').tap();
    assert.equal(JSON.parse(await page.locator('#document-json').inputValue()).entities.length, 2);
  } finally {
    await browser.close();
  }
});

test('a new Entity draft is protected when selecting another Entity', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#new-entity-name').fill('New');
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    assert.equal(await page.getByRole('button', { name: 'Stay on current Entity' }).isVisible(), true);
    assert.equal(await page.locator('#new-entity-name').inputValue(), 'New');
    await page.getByRole('button', { name: 'Stay on current Entity' }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await page.getByRole('button', { name: 'Discard new Entity draft' }).last().click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'A');
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'A', dependencies: [] },
    ]);
  } finally {
    await browser.close();
  }
});

test('contextual Entity changes and deletion choices preserve references and undo independently', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    const original = {
      entities: [
        { name: 'A', dependencies: [], custom: { keep: true } },
        { name: 'B', dependencies: ['A', 'A', 'Missing'] },
      ],
      extra: ['preserved'],
    };
    await page.locator('#paste-json').fill(JSON.stringify(original));
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('Missing');
    await page.locator('#edit-entity-form button[type=submit]').click();
    assert.match((await page.locator('#edit-entity-error').textContent())!, /exists/i);
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.locator('#edit-entity-description').fill('Updated');
    await page.locator('#edit-entity-form button[type=submit]').click();
    let data = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(data.entities[1].dependencies, ['Renamed', 'Renamed', 'Missing']);
    await page.getByRole('button', { name: 'Edit properties' }).click();
    await page.locator('#metadata-property').selectOption({ label: 'custom' });
    await page.locator('#metadata-value').fill('{"keep":false,"values":[1,null]}');
    await page.locator('#metadata-form button[type=submit]').click();
    data = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(data.entities[0].custom, { keep: false, values: [1, null] });
    await page.locator('#metadata-panel summary').click();
    await page.locator('#delete-entity').click();
    await page.locator('#delete-entity-cancel').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()), data);
    await page.locator('#delete-entity').click();
    await page.locator('#delete-entity-retain').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /Renamed \(undocumented\)/);
    await page.locator('#undo-document').click();
    await openFind(page);
    await page.locator('#entity-results button[title="Renamed"]').click();
    await openEntityEditor(page);
    await page.locator('#delete-entity').click();
    await page.locator('#delete-entity-remove').click();
    data = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(data.entities[0].dependencies, ['Missing']);
    assert.deepEqual(data.extra, ['preserved']);
    await page.locator('#undo-document').click();
    await page.locator('#undo-document').click();
    data = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(data.entities[0].custom, { keep: true });
    await page.locator('#undo-document').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()), original);
  } finally {
    await browser.close();
  }
});

test('theme follows the system until an explicit choice is made', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { colorScheme: 'light', offline: browserName !== 'webkit' });
    const page = await context.newPage();
    await page.goto(viewer);
    const theme = page.getByLabel('Theme');
    assert.equal(await theme.inputValue(), 'system');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await theme.selectOption('light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await theme.selectOption('dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.waitForFunction(() => !window.matchMedia('(prefers-color-scheme: dark)').matches);
    await theme.selectOption('system');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  } finally {
    await browser.close();
  }
});

test('theme text and essential controls meet contrast targets', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme as 'light' | 'dark');
      for (const selector of [
        '#inspector',
        '#zoom-in',
        '#graph-count',
        '#graph-filter-control',
        '#theme-preference',
        '#mode-view',
      ]) {
        const colours = await page.locator(selector).evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.color, style.backgroundColor, style.borderTopColor];
        });
        assert.ok(contrast(colours[0], colours[1]) >= 4.5, `${theme} ${selector} text`);
        if (selector === '#zoom-in') {
          assert.ok(contrast(colours[2], colours[1]) >= 3, `${theme} ${selector} boundary`);
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('dark theme renders readable workspace surfaces and controls offline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page.getByLabel('Theme').selectOption('dark');
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    const colours = await page.evaluate(() => {
      return {
        canvas: getComputedStyle(document.querySelector('main')!).backgroundColor,
        panel: getComputedStyle(document.querySelector('#inspector')!).backgroundColor,
        text: getComputedStyle(document.querySelector('#inspector')!).color,
        button: getComputedStyle(document.querySelector('#zoom-in')!).backgroundColor,
        buttonText: getComputedStyle(document.querySelector('#zoom-in')!).color,
      };
    });
    assert.notEqual(colours.canvas, 'rgb(245, 249, 250)');
    assert.notEqual(colours.panel, 'rgb(255, 255, 255)');
    assert.notEqual(colours.button, 'rgb(255, 255, 255)');
    assert.notEqual(colours.text, colours.panel);
    assert.notEqual(colours.buttonText, colours.button);
  } finally {
    await browser.close();
  }
});

test('dark graph and white PNG retain colour rules, connections and selection', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, {
      offline: browserName !== 'webkit',
      acceptDownloads: true,
      viewport: { width: 1200, height: 900 },
    });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill(
        '{"entities":[{"name":"bronze A","dependencies":["Missing"]},{"name":"Plain","dependencies":["bronze A"]}]}',
      );
    await page.locator('#open-paste').click();
    await setTheme(page, 'dark');
    await openFind(page);
    await page.locator('#entity-results button[title="Plain"]').click();
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    await page.locator('#entity-list summary').click();
    await page.locator('#fit').click();
    const screenshot = await page.screenshot();
    const counts = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const result: Record<string, number> = {};
      for (let i = 0; i < pixels.length; i += 4) {
        const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
        result[key] = (result[key] || 0) + 1;
      }
      return result;
    }, screenshot.toString('base64'));
    assert.ok(counts['25,28,36'] > 50, 'uncoloured nodes use the dark graph palette');
    assert.ok(counts['233,201,173'] > 50, 'rule colours remain unchanged');
    assert.ok(counts['101,221,202'] > 20, 'selection outline is visible');
    assert.ok(counts['245,203,120'] > 20, 'undocumented outline is visible');
    await page.locator('#export-menu summary').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-png').click();
    const chunks: Buffer[] = [];
    for await (const chunk of await (await downloadPromise).createReadStream()) chunks.push(chunk);
    const png = Buffer.concat(chunks).toString('base64');
    const exportCounts = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const result: Record<string, number> = {};
      for (let i = 0; i < pixels.length; i += 4) {
        const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
        result[key] = (result[key] || 0) + 1;
      }
      return result;
    }, png);
    assert.ok(exportCounts['255,255,255'] > 100, 'white background');
    assert.ok(exportCounts['233,201,173'] > 50, 'displayed colour rule');
    assert.ok(exportCounts['8,124,114'] > 20, 'selection outline visible on white');
    assert.ok(exportCounts['96,125,135'] > 20, 'edges visible on white');
  } finally {
    await browser.close();
  }
});

test('prototype controls toggle the theme and wider nodes retain compact mode', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { colorScheme: 'light' });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"warehouse.orders","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    const mode = page.getByRole('group', { name: 'Document mode' });
    assert.equal(await mode.locator('#mode-view').getAttribute('aria-pressed'), 'true');
    assert.equal(await mode.evaluate((element) => getComputedStyle(element).display), 'flex');
    assert.equal(await page.locator('.graph-entity-decoration').evaluate((element) => element.style.width), '210px');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.getByRole('button', { name: 'Switch to light mode' }).textContent(), '☀');
    assert.equal(await page.evaluate(() => localStorage.getItem('dependency-viewer-theme')), 'dark');
    await page.locator('#mode-edit').click();
    assert.equal(await mode.locator('#mode-edit').getAttribute('aria-pressed'), 'true');
    await openSettings(page);
    await page.locator('#compact-nodes').check();
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('.graph-entity-decoration')?.style.width === '174px',
    );
    await page.locator('#toggle-file-panel').click();
    await page.getByLabel('Theme').selectOption('system');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.getByRole('button', { name: 'Switch to light mode' }).textContent(), '☀');
  } finally {
    await browser.close();
  }
});

test('theme preference persists without storing Documents and survives unavailable browser APIs', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { colorScheme: 'dark', offline: browserName !== 'webkit' });
    const page = await context.newPage();
    await page.goto(viewer);
    await page.evaluate(() => localStorage.clear());
    await page.getByLabel('Theme').selectOption('light');
    await page.locator('#paste-json').fill('{"entities":[{"name":"Private","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ['dependency-viewer-theme']);
    await page.reload();
    assert.equal(await page.getByLabel('Theme').inputValue(), 'light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.evaluate(() => localStorage.setItem('dependency-viewer-theme', 'invalid'));
    await page.reload();
    assert.equal(await page.getByLabel('Theme').inputValue(), 'system');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

    const blocked = await newContext(browser, { offline: browserName !== 'webkit' });
    await blocked.addInitScript(`
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      Object.defineProperty(window, 'matchMedia', { value: undefined });
    `);
    const unavailable = await blocked.newPage();
    await unavailable.goto(viewer);
    assert.equal(await unavailable.evaluate(() => typeof window.matchMedia), 'undefined');
    assert.equal(
      await unavailable.evaluate(() => {
        try {
          void window.localStorage;
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    assert.equal(await unavailable.getByLabel('Theme').inputValue(), 'system');
    assert.equal(await unavailable.locator('html').getAttribute('data-theme'), 'light');
    await unavailable.getByLabel('Theme').selectOption('dark');
    await unavailable.locator('#paste-json').fill('{"entities":[]}');
    await unavailable.locator('#open-paste').click();
    assert.equal(await unavailable.locator('html').getAttribute('data-theme'), 'dark');
    await unavailable.reload();
    await unavailable.waitForFunction(
      () => (document.getElementById('theme-preference') as HTMLSelectElement).value === 'system',
      null,
      { timeout: 2000 },
    );
    assert.equal(await unavailable.getByLabel('Theme').inputValue(), 'system');
    assert.equal(await unavailable.locator('html').getAttribute('data-theme'), 'light');
  } finally {
    await browser.close();
  }
});

test('switching themes preserves Document settings, history and session state', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    const original = {
      entities: [{ name: 'bronze A', dependencies: [] }],
      settings: { colours: { texts: { bronze: 'A' } }, appearance: { compact: true }, tooltips: { enabled: false } },
    };
    await page.locator('#paste-json').fill(JSON.stringify(original));
    await page.locator('#open-paste').click();
    const before = await page.locator('#document-json').inputValue();
    await setTheme(page, 'dark');
    assert.equal(await page.locator('#document-json').inputValue(), before);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.locator('#undo-document').isDisabled(), true);
    await openSettings(page);
    assert.equal(await page.locator('#compact-nodes').isChecked(), true);
    assert.equal(await page.locator('#tooltips-enabled').isChecked(), false);
    assert.equal(await page.getByLabel('Text for bronze colour').inputValue(), 'A');
    await page.locator('#compact-nodes').uncheck();
    const changed = await page.locator('#document-json').inputValue();
    await setTheme(page, 'light');
    assert.equal(await page.locator('#document-json').inputValue(), changed);
    await page.locator('#undo-document').click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()), original);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    await page.locator('#toggle-file-panel').click();
    await page.locator('#paste-json').fill('{"entities":[]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.getByLabel('Theme').inputValue(), 'light');
    await page.locator('#toggle-file-panel').click();
    const conflicting = '{"entities":[],"settings":{"colours":{"unexpected":1},"appearance":{"compact":"broken"}}}';
    await page.locator('#paste-json').fill(conflicting);
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openSettings(page);
    assert.match((await page.locator('#colour-error').textContent())!, /conflict/i);
    assert.match((await page.locator('#presentation-error').textContent())!, /conflict/i);
    assert.equal(await page.locator('#colours-enabled').isDisabled(), true);
    assert.equal(await page.locator('#compact-nodes').isDisabled(), true);
    const incompatibleJSON = await page.locator('#document-json').inputValue();
    await setTheme(page, 'dark');
    assert.equal(await page.locator('#document-json').inputValue(), incompatibleJSON);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
  } finally {
    await browser.close();
  }
});

test('opening a graph works when system preference queries throw', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { offline: browserName !== 'webkit' });
    await context.addInitScript(`window.matchMedia = () => { throw new Error('unavailable'); };`);
    const page = await context.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.match((await page.locator('#graph-summary').textContent())!, /A/);
    assert.equal(await page.locator('#zoom-in').isVisible(), true);
    await page.locator('#edge-motion').click();
    assert.equal(await page.locator('#edge-motion').textContent(), 'Resume');
  } finally {
    await browser.close();
  }
});

test('opens in View and enables Document editing only in Edit', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#document-panel summary').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    assert.equal(await page.getByRole('button', { name: 'View', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#document-json').isEditable(), false);
    assert.equal(await page.locator('#edit-entity-form').isVisible(), false);
    assert.equal(await page.locator('#compact-nodes').isDisabled(), true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.locator('#document-json').isEditable(), true);
    assert.equal(await page.locator('#edit-entity-form').isVisible(), false);
    await openEntityEditor(page);
    assert.equal(await page.locator('#edit-entity-form').isVisible(), true);
    assert.equal(await page.locator('#compact-nodes').isEnabled(), true);
  } finally {
    await browser.close();
  }
});

test('resolves JSON drafts before leaving Edit without saving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
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
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
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
    const page = await newPage(browser);
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
    const page = await newPage(browser, { acceptDownloads: true });
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
    await openFilter(page);
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
    const context = await newContext(browser, { offline: browserName !== 'webkit' });
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
    const context = await newContext(browser, { offline: browserName !== 'webkit', acceptDownloads: true });
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
    await openFind(page);
    await page.locator('#entity-results button[title="Source"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.locator('#edit-entity-description').fill('Updated');
    await page.locator('#edit-entity-form button[type=submit]').click();
    await openFind(page);
    await page.locator('#entity-results button[title="Report"]').click();
    await openEntityEditor(page);
    await page.locator('#new-dependency-name').fill('External');
    await page.locator('#add-dependency-form button[type=submit]').click();
    await openSettings(page);
    await page.locator('#compact-nodes').check();
    await page.locator('#colour-settings summary').click();
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
    const context = await newContext(browser, { offline: browserName !== 'webkit' });
    const page = await context.newPage();
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('B');
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await openFind(page);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#edit-entity-name').inputValue(), 'B');
    assert.match((await page.locator('#edit-entity-error').textContent())!, /apply or discard/i);
    await page.getByRole('button', { name: 'Stay on current Entity' }).click();
    await page.locator('#discard-entity-draft').click();
    await page.locator('#new-dependency-name').fill(' A');
    await page.locator('#add-dependency-form button[type=submit]').click();
    assert.match((await page.locator('#dependency-error').textContent())!, /whitespace/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#discard-dependency-draft').click();
    assert.equal(await page.locator('#download-document').isDisabled(), false);
    await openFind(page);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'B');
  } finally {
    await browser.close();
  }
});

test('protects invalid drafts and unsaved changes while supporting undo and redo', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { offline: browserName !== 'webkit' });
    const page = await context.newPage();
    const externalRequests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#document-panel summary').click();
    await page.locator('#document-json').fill('{"entities":[{"name":"B","dependencies":[]}]}');
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('C');
    await page.locator('#edit-entity-form button[type=submit]').click();
    assert.match((await page.locator('#edit-entity-error').textContent())!, /apply or discard/i);
    assert.equal(await page.locator('#download-document').isDisabled(), true);
    await page.locator('#discard-entity-draft').click();
    await page.locator('#document-panel summary').click();
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
    await page.locator('#toggle-file-panel').click();
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
    const context = await newContext(browser, {
      offline: browserName !== 'webkit',
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
    const node = await page.getByRole('button', { name: 'Inspect Entity Report' }).boundingBox();
    assert.ok(node);
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    assert.match((await page.locator('#selection-status').textContent())!, /owner/);
    assert.equal(await page.locator('#inspector').isVisible(), true);
    await openFind(page);
    await page.locator('#entity-search').fill('Report');
    await page.locator('#entity-search').focus();
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
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

test('graph-first workspace keeps controls floating and supports an empty Document', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1200, height: 800 } });
    await page.goto(viewer);
    assert.equal(await page.getByText('Open a Document', { exact: true }).isVisible(), true);
    await page.locator('#paste-json').fill('{"entities":[]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.getByText('Open a Document', { exact: true }).isVisible(), false);
    const graph = (await page.locator('#graph').boundingBox())!;
    assert.equal(graph.width, 1200);
    assert.equal(graph.height, 800);
    assert.equal(await page.getByRole('button', { name: 'File', exact: true }).isVisible(), true);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#new-entity-name').fill('First');
    await page.locator('#add-entity-form button[type=submit]').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /First/);
  } finally {
    await browser.close();
  }
});

test('graph edits preserve the filter and dependency view', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill(
      JSON.stringify({
        entities: [
          { name: 'Alpha', dependencies: ['Alpine'] },
          { name: 'Alpine', dependencies: [] },
          { name: 'Other', dependencies: [] },
        ],
      }),
    );
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="Alpha"]').click();
    await page.getByRole('button', { name: 'Upstream' }).click();
    await openFilter(page);
    await page.locator('#graph-filter').fill('Al');
    await openEntityEditor(page);
    await page.locator('#edit-entity-description').fill('Updated');
    await page.getByRole('button', { name: 'Apply Entity changes' }).click();
    assert.equal(await page.locator('#graph-filter').inputValue(), 'Al');
    assert.equal(await page.getByRole('button', { name: 'Upstream' }).getAttribute('aria-pressed'), 'true');
    assert.match((await page.locator('#graph-count').textContent())!, /^2 Entities/);
    await openFilter(page);
    await page.locator('#graph-filter').fill('Alpine');
    await page.locator('#edit-entity-description').fill('Updated again');
    await page.getByRole('button', { name: 'Apply Entity changes' }).click();
    assert.equal(await page.locator('#graph-filter').inputValue(), 'Alpine');
    assert.match((await page.locator('#graph-count').textContent())!, /^1 Entity/);
    assert.equal(await page.getByRole('button', { name: 'Upstream' }).getAttribute('aria-pressed'), 'true');
    await openFilter(page);
    await page.getByRole('button', { name: 'Clear graph filter' }).click();
    assert.match((await page.locator('#graph-count').textContent())!, /^2 Entities/);
    assert.doesNotMatch((await page.locator('#graph-summary').textContent())!, /Other/);
  } finally {
    await browser.close();
  }
});

test('Find and Filter are separate and preserve dependency view semantics', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill(
        '{"entities":[{"name":"report.Total","dependencies":["source.Missing"]},{"name":"other","dependencies":[]}]}',
      );
    await page.locator('#open-paste').click();
    assert.match((await page.locator('#graph-count').textContent())!, /3 entities.*1 connection/i);
    assert.equal(await page.getByRole('button', { name: 'Upstream' }).isDisabled(), true);
    await page.locator('#entity-list summary').click();
    await page.locator('#entity-search').fill('SOURCE.missing');
    await openFind(page);
    await page.locator('#entity-results button[title="source.Missing (undocumented)"]').click();
    assert.match((await page.locator('#selection-status').textContent())!, /source.Missing/);
    await page.getByRole('button', { name: 'Downstream' }).click();
    await openFilter(page);
    await page.locator('#graph-filter').fill('TOTAL');
    assert.match((await page.locator('#graph-summary').textContent())!, /report.Total/);
    assert.doesNotMatch((await page.locator('#graph-summary').textContent())!, /source.Missing/);
    await page.getByRole('button', { name: 'Clear graph filter' }).click();
    assert.match((await page.locator('#graph-summary').textContent())!, /source.Missing/);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    assert.match((await page.locator('#graph-summary').textContent())!, /other/);
    assert.match((await page.locator('#selection-status').textContent())!, /source.Missing/);
  } finally {
    await browser.close();
  }
});

test('narrow screens keep File and graph controls reachable', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 375, height: 812 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#dismiss-small-screen').click();
    await page.locator('#toggle-controls').click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    assert.equal(await page.locator('#file-copy-document').isVisible(), true);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#new-entity-name').fill('B');
    await page.locator('#add-entity-form button[type=submit]').click();
    assert.match((await page.locator('#graph-summary').textContent())!, /B/);
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#entity-list summary').click();
    await page.locator('#entity-search').fill('A');
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    assert.match((await page.locator('#selection-status').textContent())!, /A/);
  } finally {
    await browser.close();
  }
});

test('top bar follows the prototype layout and keeps edit controls mode-specific', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1440, height: 800 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"One","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    const header = page.locator('header');
    const style = await header.evaluate((element) => {
      const css = getComputedStyle(element);
      return { border: css.borderTopColor, shadow: css.boxShadow };
    });
    assert.equal(style.border, 'rgb(228, 230, 235)');
    assert.notEqual(style.shadow, 'none');
    const file = (await page.locator('#toggle-file-panel').boundingBox())!;
    const filter = (await page.locator('#graph-filter').boundingBox())!;
    const mode = (await page.locator('.mode-switch').boundingBox())!;
    const theme = (await page.locator('#toggle-theme').boundingBox())!;
    assert.ok(file.x < filter.x && filter.x < mode.x && mode.x < theme.x);
    assert.equal(await page.locator('#undo-document').isVisible(), false);
    await page.locator('#mode-edit').click();
    assert.equal(await page.locator('#undo-document').isVisible(), true);
    await openSettings(page);
    const settings = (await page.locator('.colour-settings-content').boundingBox())!;
    assert.ok(settings.x >= 0 && settings.x + settings.width <= 1440);
    await page.locator('#colour-settings summary').click();
    await setTheme(page, 'dark');
    assert.equal(await header.evaluate((element) => getComputedStyle(element).borderTopColor), 'rgb(48, 52, 64)');
  } finally {
    await browser.close();
  }
});

test('Filter is inline in the top bar and can be cleared by keyboard', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"One","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.locator('header #graph-filter').isVisible(), true);
    await page.locator('#graph-filter').fill(' One ');
    assert.match((await page.locator('#graph-count').textContent())!, /^1 Entity/);
    await page.getByRole('button', { name: 'Clear graph filter' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#graph-filter').inputValue(), '');
    assert.equal(await page.locator('#graph-filter').evaluate((element) => element === document.activeElement), true);
  } finally {
    await browser.close();
  }
});

test('narrow-screen Settings and Filter remain usable', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 375, height: 812 } });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#dismiss-small-screen').click();
    await page.locator('#toggle-controls').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openSettings(page);
    const settingsBounds = (await page.locator('.colour-settings-content').boundingBox())!;
    assert.ok(settingsBounds.x >= 0 && settingsBounds.x + settingsBounds.width <= 375);
    await page.locator('#compact-nodes').check();
    await page.locator('#colour-settings summary').click();
    await openFilter(page);
    const filterBounds = (await page.locator('#graph-filter-control').boundingBox())!;
    assert.ok(filterBounds.x >= 0 && filterBounds.x + filterBounds.width <= 375);
    await page.locator('#graph-filter').fill('A');
    await page.getByRole('button', { name: 'Clear graph filter' }).click();
    await page.locator('#export-menu summary').click();
    assert.equal(await page.locator('#export-png').isEnabled(), true);
  } finally {
    await browser.close();
  }
});

test('File opens the spacious JSON surface and copy fallback', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('button', { name: 'View Document JSON' }).click();
    assert.equal(await page.locator('#document-json').isVisible(), true);
    assert.equal(await page.locator('#document-json').isEditable(), false);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await page.locator('#file-copy-document').click();
    assert.equal(await page.locator('#document-json').isVisible(), true);
    assert.match((await page.locator('#document-status').textContent())!, /select and copy/i);
  } finally {
    await browser.close();
  }
});

test('opens persistent Entity details from Find and closes them', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","description":"<img src=x>","dependencies":["missing"]}]}');
    await page.locator('#open-paste').click();
    await openFind(page);
    const result = page.locator('#entity-results button[title="A"]');
    await result.click();
    const card = page.getByRole('region', { name: 'Entity details' });
    assert.equal(await card.isVisible(), true);
    assert.match((await card.textContent())!, /<img src=x>/);
    assert.equal(await card.locator('img').count(), 0);
    await card.getByRole('button', { name: 'Close Entity details' }).click();
    assert.equal(await card.isVisible(), false);
    assert.equal(await result.evaluate((element) => element === document.activeElement), true);
  } finally {
    await browser.close();
  }
});

test('unfocused button activation restores the invoker and focuses keyboard movement controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await openFind(page);
    const result = page.locator('#entity-results button[title="A"]');
    await page.locator('#entity-search').focus();
    await result.dispatchEvent('click');
    const card = page.locator('#inspector');
    const moveCard = page.locator('#move-inspector');
    const cardBefore = await card.boundingBox();
    await moveCard.dispatchEvent('click');
    assert.equal(await moveCard.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    assert.ok(cardBefore && (await card.boundingBox())!.y < cardBefore.y);
    const node = page.getByRole('button', { name: 'Inspect Entity A', exact: true });
    const nodeBefore = await node.boundingBox();
    const moveEntity = page.locator('#move-entity');
    await moveEntity.dispatchEvent('click');
    assert.equal(await moveEntity.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.ok(nodeBefore && (await node.boundingBox())!.x > nodeBefore.x);
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    assert.equal(await result.evaluate((element) => element === document.activeElement), true);
    await page.locator('#entity-search').focus();
    await node.dispatchEvent('click');
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    assert.equal(await node.evaluate((element) => element === document.activeElement), true);
  } finally {
    await browser.close();
  }
});

test('moves details by keyboard and updates in place until closed', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    const card = page.locator('#inspector');
    const before = await card.boundingBox();
    await page.getByRole('button', { name: 'Move card' }).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    const moved = await card.boundingBox();
    assert.ok(before && moved && moved.y < before.y);
    await page.locator('#entity-results button[title="B"]').focus();
    assert.equal(await card.locator('h2').textContent(), 'B');
    assert.deepEqual(await card.boundingBox(), moved);
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    await page.locator('#entity-results button[title="A"]').click();
    assert.notEqual((await card.boundingBox())!.y, moved.y);
  } finally {
    await browser.close();
  }
});

test('protects Entity drafts when another Entity is explicitly selected', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-name').fill('Changed');
    await openFind(page);
    await page.locator('#entity-results button[title="B"]').click();
    assert.equal(await page.locator('#edit-entity-name').inputValue(), 'Changed');
    await page.getByRole('button', { name: 'Stay on current Entity' }).click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'A');
    await page.locator('#entity-results button[title="B"]').click();
    await page.locator('#draft-resolution').getByRole('button', { name: 'Discard Entity draft' }).click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'B');
  } finally {
    await browser.close();
  }
});

test('keyboard Entity controls open details without hover', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":["missing"]}]}');
    await page.locator('#open-paste').click();
    const entity = page.getByRole('button', { name: 'Inspect Entity missing (undocumented)' });
    await entity.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#selection-status h2').textContent(), 'missing');
    assert.match((await page.locator('#selection-status').textContent())!, /Unknown/);
    assert.equal(await page.locator('#inspector').isVisible(), true);
  } finally {
    await browser.close();
  }
});

test('opens property editing for the inspected Entity', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[],"owner":"team"}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="B"]').click();
    await openEntityEditor(page);
    await page.locator('#inspector').getByRole('button', { name: 'Edit properties' }).click();
    assert.equal(await page.locator('#metadata-entity').inputValue(), 'B');
    assert.equal(await page.locator('#metadata-panel').evaluate((element: HTMLDetailsElement) => element.open), true);
  } finally {
    await browser.close();
  }
});

test('touch inspection works with hover previews disabled and the card can be dragged', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { hasTouch: true, viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]}],"settings":{"tooltips":{"enabled":false}}}');
    await page.locator('#open-paste').click();
    const node = await page.getByRole('button', { name: 'Inspect Entity A' }).boundingBox();
    assert.ok(node);
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    assert.equal(await page.locator('#inspector').isVisible(), false);
    await page.touchscreen.tap(node.x + node.width / 2, node.y + node.height / 2);
    const card = page.locator('#inspector');
    assert.equal(await card.isVisible(), true);
    const before = await card.boundingBox();
    const header = await card.locator('.inspector-header').boundingBox();
    assert.ok(before && header);
    if (browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: header.x + 15, y: header.y + 15 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: header.x - 45, y: header.y + 55 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(header.x + 15, header.y + 15);
      await page.mouse.down();
      await page.mouse.move(header.x - 45, header.y + 55);
      await page.mouse.up();
    }
    const after = await card.boundingBox();
    assert.ok(after && (after.x !== before.x || after.y !== before.y));
  } finally {
    await browser.close();
  }
});

test('keeps moved card position after applying an Entity edit', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.getByRole('button', { name: 'Move card' }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const card = page.locator('#inspector');
    const moved = await card.boundingBox();
    await page.locator('#edit-entity-name').fill('Renamed');
    await page.getByRole('button', { name: 'Apply Entity changes' }).click();
    assert.equal(await card.locator('h2').textContent(), 'Renamed');
    assert.deepEqual(await card.boundingBox(), moved);
  } finally {
    await browser.close();
  }
});

test('moved card protects Direct dependency drafts from automatic inspection and applies before switching', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser);
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.getByRole('button', { name: 'Move card' }).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.locator('#new-dependency-name').fill('B');
    await page.getByRole('button', { name: 'Inspect Entity B' }).focus();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'A');
    assert.equal(await page.locator('#new-dependency-name').inputValue(), 'B');
    await page.keyboard.press('Enter');
    await page.locator('#draft-resolution').getByRole('button', { name: 'Apply Direct dependency draft' }).click();
    assert.equal(await page.locator('#selection-status h2').textContent(), 'B');
    assert.match(await page.locator('#document-json').inputValue(), /"B"/);
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).getAttribute('aria-pressed'), 'true');
  } finally {
    await browser.close();
  }
});

test('offers searchable existing Entities and exact undocumented dependency names', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"Report","dependencies":[]},{"name":"Source","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await openFind(page);
    await page.locator('#entity-results button[title="Report"]').click();
    await openEntityEditor(page);
    const input = page.getByLabel('Direct dependency name');
    const list = await input.getAttribute('list');
    assert.ok(list);
    assert.deepEqual(
      await page
        .locator(`#${list} option`)
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
      ['Report', 'Source'],
    );
    await input.fill('Source');
    await page.getByRole('button', { name: 'Add dependency', exact: true }).click();
    await page.getByLabel('Direct dependency name').fill('External');
    if (browserName === 'webkit') {
      await page.getByRole('button', { name: 'Add dependency', exact: true }).focus();
      await page.keyboard.press('Enter');
    } else await page.getByLabel('Direct dependency name').press('Enter');
    const saved = JSON.parse(await page.locator('#document-json').inputValue());
    assert.deepEqual(saved.entities, [
      { name: 'Report', dependencies: ['Source', 'External'] },
      { name: 'Source', dependencies: [] },
    ]);
    assert.match((await page.locator('#graph-summary').textContent())!, /External \(undocumented\)/);
  } finally {
    await browser.close();
  }
});

test('connects only from dependency right handle to dependent left handle', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1400, height: 900 }, offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"Source","dependencies":[]},{"name":"Report","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    assert.equal(await page.getByLabel('Start dependency from Source').isVisible(), false);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const start = page.getByLabel('Start dependency from Source');
    const target = page.getByLabel('Connect to dependent Report');
    const sourceBox = (await start.boundingBox())!;
    const targetBox = (await target.boundingBox())!;
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(20, 200);
    await page.mouse.up();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.keyboard.press('Escape');
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.up();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.up();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.up();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await start.dragTo(target);
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, [
      'Source',
    ]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, [
      'Source',
    ]);
  } finally {
    await browser.close();
  }
});

test('selects and removes a graph relationship including repeated entries, with undo', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1400, height: 900 }, offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"Source","dependencies":[]},{"name":"Report","dependencies":["Source","Source"]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const start = (await page.getByLabel('Start dependency from Source').boundingBox())!;
    const end = (await page.getByLabel('Connect to dependent Report').boundingBox())!;
    await page.mouse.click((start.x + end.x + start.width) / 2, (start.y + end.y + start.height) / 2);
    const remove = page.getByRole('button', { name: 'Remove Direct dependency Source from Report' });
    assert.equal(await remove.isVisible(), true);
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, [
      'Source',
      'Source',
    ]);
    await remove.click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, [
      'Source',
      'Source',
    ]);
  } finally {
    await browser.close();
  }
});

test('rejects invalid connections and protects drafts for both editing paths', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1400, height: 900 }, offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"Source","dependencies":[]},{"name":"Report","dependencies":["Source","Source"]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Start dependency from Source').dragTo(page.getByLabel('Connect to dependent Report'));
    assert.match((await page.locator('#connection-status').textContent())!, /already exists/i);
    await page.getByLabel('Start dependency from Report').dragTo(page.getByLabel('Connect to dependent Source'));
    assert.match((await page.locator('#connection-status').textContent())!, /cycle/i);
    await openFind(page);
    await page.locator('#entity-results button[title="Report"]').click();
    await openEntityEditor(page);
    await page.getByLabel('Direct dependency name').fill('Source');
    await page.getByRole('button', { name: 'Add dependency', exact: true }).click();
    assert.match((await page.locator('#dependency-error').textContent())!, /already exists/i);
    await page.getByLabel('Direct dependency name').fill(' Source');
    await page.getByLabel('Direct dependency name').press('Enter');
    assert.match((await page.locator('#dependency-error').textContent())!, /whitespace/i);
    await page.locator('#discard-dependency-draft').click();
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    await page.getByRole('button', { name: 'Reset to fit' }).click();
    await page.locator('#add-entity-panel summary').click();
    await page.locator('#new-entity-name').fill('Draft');
    await page.getByLabel('Start dependency from Report').dragTo(page.getByLabel('Connect to dependent Source'));
    assert.match((await page.locator('#connection-status').textContent())!, /apply or discard/i);
    await page.locator('#discard-new-entity-draft').click();
    await page.locator('#add-entity-panel summary').click();
    await openFind(page);
    await page.locator('#entity-results button[title="Report"]').click();
    await openEntityEditor(page);
    await page.getByRole('button', { name: 'Remove Direct dependency Source', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, [
      'Source',
      'Source',
    ]);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities[1].dependencies, []);
  } finally {
    await browser.close();
  }
});

test('touch users can add an undocumented dependency using the details form', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, { hasTouch: true, offline: browserName !== 'webkit' });
    const page = await context.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Report","dependencies":[]}]}');
    await page.locator('#open-paste').tap();
    await page.getByRole('button', { name: 'Edit', exact: true }).tap();
    await page.locator('#entity-list summary').tap();
    await page.locator('#entity-results button[title="Report"]').tap();
    await page.getByRole('button', { name: 'Edit Entity', exact: true }).tap();
    await page.getByLabel('Direct dependency name').fill('Remote');
    await page.getByRole('button', { name: 'Add dependency', exact: true }).tap();
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()).entities, [
      { name: 'Report', dependencies: ['Remote'] },
    ]);
    assert.match((await page.locator('#graph-summary').textContent())!, /Remote \(undocumented\)/);
  } finally {
    await browser.close();
  }
});

test('hover updates a moved card without announcing each inspection', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1400, height: 900 } });
    await page.goto(viewer);
    await page
      .locator('#paste-json')
      .fill('{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":["A"]}]}');
    await page.locator('#open-paste').click();
    await page.getByRole('button', { name: 'Inspect Entity A' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Move card' }).click();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const card = page.locator('#inspector');
    const position = await card.boundingBox();
    const announcement = await page.locator('#inspection-announcement').textContent();
    const node = await page.getByRole('button', { name: 'Inspect Entity B' }).boundingBox();
    assert.ok(node);
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2);
    assert.equal(await card.locator('h2').textContent(), 'B');
    assert.deepEqual(await card.boundingBox(), position);
    assert.equal(await page.locator('#inspection-announcement').textContent(), announcement);
    await page.mouse.move(2, 2);
    assert.equal(await card.locator('h2').textContent(), 'B');
  } finally {
    await browser.close();
  }
});

test('canvas keyboard navigation pans and zooms without intercepting text entry offline', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit', viewport: { width: 1200, height: 900 } });
    const requests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"Alpha","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    const node = page.getByRole('button', { name: 'Inspect Entity Alpha' });
    const before = await node.boundingBox();
    await page.locator('#graph').focus();
    assert.equal(await page.locator('#graph').evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press('ArrowRight');
    const after = await node.boundingBox();
    assert.notEqual(after!.x, before!.x);
    const zoom = await page.locator('#zoom-level').textContent();
    await page.keyboard.press('-');
    assert.notEqual(await page.locator('#zoom-level').textContent(), zoom);
    await page.keyboard.press('+');
    assert.equal(await page.locator('#zoom-level').textContent(), zoom);
    await openFind(page);
    const search = page.locator('#entity-search');
    await search.fill('Al');
    await search.press('ArrowLeft');
    await search.press('+');
    assert.equal(await search.inputValue(), 'A+l');
    assert.equal(await page.locator('#zoom-level').textContent(), zoom);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('moving an Entity by keyboard is transient in View and Edit and can be cancelled', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, {
      offline: browserName !== 'webkit',
      acceptDownloads: true,
      viewport: { width: 1200, height: 900 },
    });
    const original = '{"entities":[{"name":"A","dependencies":["Missing"],"extra":42}]}';
    await page.goto(viewer);
    await page.locator('#paste-json').fill(original);
    await page.locator('#open-paste').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    const node = page.getByRole('button', { name: 'Inspect Entity A', exact: true });
    const before = await node.boundingBox();
    const move = page.getByRole('button', { name: 'Move Entity', exact: true });
    await move.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const moved = await node.boundingBox();
    assert.ok(before && moved && moved.x > before.x);
    assert.match((await page.locator('#inspection-announcement').textContent())!, /moved/i);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await move.click();
    await page.keyboard.press('ArrowDown');
    assert.notEqual((await node.boundingBox())!.y, moved.y);
    await page.keyboard.press('Escape');
    assert.deepEqual(await node.boundingBox(), moved);
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    assert.equal(await page.locator('#undo-document').isDisabled(), true);
    assert.deepEqual(JSON.parse(await page.locator('#document-json').inputValue()), JSON.parse(original));
    await page.locator('#toggle-file-panel').click();
    const download = page.waitForEvent('download');
    await page.locator('#file-download-document').click();
    const chunks: Buffer[] = [];
    for await (const chunk of await (await download).createReadStream()) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), JSON.parse(original));
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
  } finally {
    await browser.close();
  }
});

test('Find centers an Entity while keeping the All view graph visible', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { viewport: { width: 1200, height: 900 } });
    await page.goto(viewer);
    const entities = Array.from({ length: 10 }, (_, index) => ({
      name: `Node${index}`,
      dependencies: index ? [`Node${index - 1}`] : [],
    }));
    await page.locator('#paste-json').fill(JSON.stringify({ entities }));
    await page.locator('#open-paste').click();
    await openFind(page);
    await page.locator('#entity-results button[title="Node0"]').click();
    const graph = (await page.locator('#graph').boundingBox())!;
    const first = (await page.getByRole('button', { name: 'Inspect Entity Node0' }).boundingBox())!;
    const last = (await page.getByRole('button', { name: 'Inspect Entity Node9' }).boundingBox())!;
    assert.ok(Math.abs(first.x + first.width / 2 - (graph.x + graph.width / 2)) < 2);
    assert.ok(last.x >= graph.x && last.x + last.width <= graph.x + graph.width);
    assert.ok(last.y >= graph.y && last.y + last.height <= graph.y + graph.height);
  } finally {
    await browser.close();
  }
});

test('Find and related Entity links center offscreen documented and undocumented Entities by keyboard', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit', viewport: { width: 1200, height: 900 } });
    const requests = trackExternalRequests(page);
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"model.Alpha","dependencies":["source.Missing"]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#graph').focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
    await openFind(page);
    await page.locator('#entity-search').fill('alpha');
    const result = page.getByRole('button', { name: 'model.Alpha', exact: true });
    await result.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#selection-status h2').textContent(), 'model.Alpha');
    const graph = (await page.locator('#graph').boundingBox())!;
    const centered = async (label: string) => {
      const node = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
      assert.ok(Math.abs(node.x + node.width / 2 - (graph.x + graph.width / 2)) < 2);
      assert.ok(Math.abs(node.y + node.height / 2 - (graph.y + graph.height / 2)) < 2);
    };
    await centered('Inspect Entity model.Alpha');
    const related = page.locator('#inspector').getByRole('button', { name: 'source.Missing (undocumented)' });
    await related.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#selection-status h2').textContent(), 'source.Missing');
    await centered('Inspect Entity source.Missing (undocumented)');
    await page.getByRole('button', { name: 'Move Entity', exact: true }).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    assert.match((await page.locator('#inspection-announcement').textContent())!, /source.Missing moved/);
    await page.locator('#entity-search').fill('missing');
    const missing = page.getByRole('button', { name: 'source.Missing (undocumented)', exact: true });
    await missing.focus();
    await page.keyboard.press('Enter');
    await centered('Inspect Entity source.Missing (undocumented)');
    await page.getByRole('button', { name: 'Close Entity details' }).click();
    assert.equal(await missing.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(requests, []);
  } finally {
    await browser.close();
  }
});

test('moving an Entity preserves unsaved Document changes and does not add undo history', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await newPage(browser, { offline: browserName !== 'webkit' });
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').click();
    await page.locator('#mode-edit').click();
    await openFind(page);
    await page.locator('#entity-results button[title="A"]').click();
    await openEntityEditor(page);
    await page.locator('#edit-entity-description').fill('Changed');
    await page.locator('#edit-entity-form button[type=submit]').click();
    const changed = await page.locator('#document-json').inputValue();
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /Unsaved/);
    await page.getByRole('button', { name: 'Move Entity', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#document-json').inputValue(), changed);
    assert.match((await page.locator('#unsaved-indicator').textContent())!, /Unsaved/);
    await page.locator('#undo-document').click();
    assert.equal(await page.locator('#unsaved-indicator').textContent(), '');
    assert.equal(await page.locator('#undo-document').isDisabled(), true);
  } finally {
    await browser.close();
  }
});

test('narrow touch layout keeps navigation and form editing reachable without dragging', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(browser, {
      offline: browserName !== 'webkit',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(viewer);
    await page.locator('#paste-json').fill('{"entities":[{"name":"A","dependencies":[]}]}');
    await page.locator('#open-paste').tap();
    await page.locator('#dismiss-small-screen').tap();
    await page.locator('#toggle-controls').tap();
    await page.locator('#mode-edit').tap();
    for (const selector of [
      '#entity-list summary',
      '#zoom-in',
      '#zoom-out',
      '#fit',
      '#edge-motion',
      '#add-entity-panel summary',
    ]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, selector);
    }
    await page.locator('#add-entity-panel summary').tap();
    await page.locator('#new-entity-name').fill('Touch Entity');
    await page.locator('#add-entity-form button[type=submit]').tap();
    assert.match((await page.locator('#graph-summary').textContent())!, /Touch Entity/);
    await page.locator('#add-entity-panel summary').tap();
    const card = page.locator('#inspector');
    assert.equal(await card.isVisible(), true);
    for (const selector of ['#move-inspector', '#move-entity', '#close-inspector']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390, selector);
    }
    await page.locator('#move-entity').tap();
    const moving = (await page.locator('#move-entity').boundingBox())!;
    assert.ok(moving.x >= 0 && moving.x + moving.width <= 390, 'active movement control');
    await page.keyboard.press('Escape');
    await context.close();
  } finally {
    await browser.close();
  }
});
