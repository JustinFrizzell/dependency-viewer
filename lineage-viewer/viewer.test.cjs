const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const template = () => fs.readFileSync('dist/lineage-viewer.html', 'utf8');

function open(html) {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      const context = new Proxy({
        measureText: text => ({ width: text.length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
      }, { get: (target, key) => key in target ? target[key] : () => {} });
      window.HTMLCanvasElement.prototype.getContext = () => context;
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 1000 });
      Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 600 });
      window.HTMLElement.prototype.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600,
      });
    },
  });
}

test('built template has one injection point and explains missing data', () => {
  const html = template();
  assert.equal(html.split('__LINEAGE_DATA_JSON__').length - 1, 1);
  const dom = open(html);
  const marker = dom.window.document.getElementById('lineage-data');
  assert.equal(marker.type, 'application/json');
  assert.equal(marker.textContent, '__LINEAGE_DATA_JSON__');
  assert.equal(dom.window.document.querySelectorAll('script[src], link[href], img[src], iframe[src]').length, 0);
  assert.match(dom.window.document.body.textContent, /lineage data has not been embedded/i);
  dom.window.close();
});

test('built demo embeds the demo dataset and displays its graph', () => {
  const html = fs.readFileSync('dist/lineage-demo.html', 'utf8');
  const expected = JSON.parse(fs.readFileSync('lineage-viewer/demo_data.json', 'utf8'));
  const dom = open(html);
  try {
    const document = dom.window.document;
    assert.deepEqual(JSON.parse(document.getElementById('lineage-data').textContent), expected);
    assert.equal(document.querySelectorAll('script[src], link[href], img[src], iframe[src]').length, 0);
    assert.equal(document.getElementById('status').textContent, '');
    assert.ok(document.querySelector('#graph canvas'));
    assert.match(document.getElementById('graph-summary').textContent, /workspace\.lakehouse\.bronze_raw\.orders/);
    const result = [...document.querySelectorAll('#table-results button')]
      .find(button => button.textContent === 'workspace.report.commerce_pulse');
    assert.ok(result);
    result.click();
    assert.equal(document.querySelector('#selection-status h2').textContent, 'workspace.report.commerce_pulse');
  } finally { dom.window.close(); }
});

function injected(value) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c');
  return template().replace('__LINEAGE_DATA_JSON__', json);
}

function clickGraph(dom, x, y) {
  const graph = dom.window.document.querySelector('#graph canvas');
  for (const type of ['mousedown', 'mouseup']) {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
    });
    Object.defineProperty(event, 'which', { value: 1 });
    graph.dispatchEvent(event);
  }
}

test('lineage views require a selection and focus transitively in each direction', () => {
  const dom = open(injected({ tables: [
    { name: 'a', inputs: [] }, { name: 'b', inputs: ['a'] },
    { name: 'c', inputs: ['b'] }, { name: 'd', inputs: ['c'] },
    { name: 'e', inputs: ['d'] }, { name: 'focus', inputs: ['e', 'branch'] },
    { name: 'branch', inputs: [] }, { name: 'child', inputs: ['focus'] },
    { name: 'other', inputs: [] },
  ] }));
  try {
    const document = dom.window.document;
    const button = name => [...document.querySelectorAll('#lineage-views button')].find(item => item.textContent === name);
    const summary = () => document.getElementById('graph-summary').textContent;
    assert.ok(button('Connected').disabled);
    assert.ok(button('Upstream').disabled);
    assert.ok(button('Downstream').disabled);
    assert.equal(button('All').disabled, false);
    const inspector = document.getElementById('selection-status');
    for (let y = 50; y < 600 && (!inspector.querySelector('h2') || inspector.querySelector('h2').textContent === 'other'); y += 25) {
      for (let x = 50; x < 1000 && (!inspector.querySelector('h2') || inspector.querySelector('h2').textContent === 'other'); x += 25) {
        clickGraph(dom, x, y);
      }
    }
    assert.ok(inspector.querySelector('h2'));
    while (inspector.querySelector('h2').textContent !== 'focus') {
      const current = inspector.querySelector('h2').textContent;
      const next = { a: 'b', b: 'c', c: 'd', d: 'e', e: 'focus', branch: 'focus', child: 'focus' }[current];
      assert.ok(next, current);
      const related = [...inspector.querySelectorAll('button')].find(item => item.textContent === next);
      assert.ok(related);
      related.click();
    }
    assert.equal(button('Upstream').disabled, false);
    button('Upstream').click();
    assert.match(summary(), /Tables: a, b, c, d, e, focus, branch/);
    assert.doesNotMatch(summary(), /child|other/);
    assert.equal(button('Upstream').getAttribute('aria-pressed'), 'true');
    button('Downstream').click();
    assert.match(summary(), /Tables: focus, child/);
    assert.doesNotMatch(summary(), /branch|other|a →/);
    button('Connected').click();
    assert.match(summary(), /Tables: a, b, c, d, e, focus, branch, child/);
    assert.doesNotMatch(summary(), /other/);
    button('All').click();
    assert.match(summary(), /other/);
    assert.match(inspector.querySelector('h2').textContent, /^focus$/);
  } finally { dom.window.close(); }
});

test('changing selection refocuses and fits the active view and All fits without clearing it', () => {
  const dom = open(injected({ tables: [
    { name: 'input', inputs: [] }, { name: 'middle', inputs: ['input'] },
    { name: 'output', inputs: ['middle'] },
  ] }));
  try {
    const document = dom.window.document;
    const view = name => document.querySelector(`[data-view="${name}"]`);
    const inspector = document.getElementById('selection-status');
    const summary = document.getElementById('graph-summary');
    const zoom = document.getElementById('zoom-level');
    clickGraph(dom, 500, 300);
    assert.equal(inspector.querySelector('h2').textContent, 'middle');
    view('upstream').click();
    assert.match(summary.textContent, /Tables: input, middle/);
    document.getElementById('zoom-in').click();
    const zoomBeforeNavigation = zoom.textContent;
    [...inspector.querySelectorAll('button')].find(item => item.textContent === 'output').click();
    assert.equal(inspector.querySelector('h2').textContent, 'output');
    assert.match(summary.textContent, /Tables: input, middle, output/);
    assert.notEqual(zoom.textContent, zoomBeforeNavigation);
    document.getElementById('zoom-in').click();
    const zoomBeforeAll = zoom.textContent;
    view('all').click();
    assert.notEqual(zoom.textContent, zoomBeforeAll);
    assert.equal(inspector.querySelector('h2').textContent, 'output');
    assert.equal(view('all').getAttribute('aria-pressed'), 'true');
  } finally { dom.window.close(); }
});

test('searching for another table refocuses, fits, and centers the active lineage view', () => {
  const dom = open(injected({ tables: [
    { name: 'input', inputs: [] }, { name: 'middle', inputs: ['input'] },
    { name: 'output', inputs: ['middle'] }, { name: 'isolated', inputs: [] },
  ] }));
  try {
    const document = dom.window.document;
    const result = name => [...document.querySelectorAll('#table-results button')].find(button => button.textContent === name);
    result('middle').click();
    document.querySelector('[data-view="upstream"]').click();
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    result('output').click();
    assert.equal(document.querySelector('#selection-status h2').textContent, 'output');
    assert.match(document.getElementById('graph-summary').textContent, /Tables: input, middle, output/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /isolated/);
    assert.notEqual(document.getElementById('zoom-level').textContent, zoom);
    clickGraph(dom, 500, 300);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'output');
  } finally { dom.window.close(); }
});

test('filtered search centers an endpoint while keeping its multi-hop lineage on canvas', () => {
  const dom = open(injected({ tables: [
    { name: 'a', inputs: [] }, { name: 'b', inputs: ['a'] },
    { name: 'c', inputs: ['b'] }, { name: 'd', inputs: ['c'] },
    { name: 'e', inputs: ['d'] }, { name: 'isolated', inputs: [] },
  ] }));
  try {
    const document = dom.window.document;
    const result = name => [...document.querySelectorAll('#table-results button')].find(button => button.textContent === name);
    const selected = () => document.querySelector('#selection-status h2').textContent;
    result('d').click();
    document.querySelector('[data-view="upstream"]').click();
    const hit = (x, y) => {
      result('e').click();
      clickGraph(dom, x, y);
      return selected();
    };
    assert.equal(hit(500, 300), 'e');
    const seen = new Set();
    for (let x = 1; x < 1000; x += 10) seen.add(hit(x, 300));
    for (const name of ['a', 'b', 'c', 'd', 'e']) assert.ok(seen.has(name), `${name} is on canvas`);
    for (const [x, y] of [[1, 300], [999, 300], [500, 1], [500, 599]]) {
      assert.equal(hit(x, y), 'e', 'lineage does not touch the canvas boundary');
    }
    assert.match(document.getElementById('graph-summary').textContent, /Tables: a, b, c, d, e/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /isolated/);
  } finally { dom.window.close(); }
});

test('table search matches full names case-insensitively without merging identities', () => {
  const dom = open(injected({ tables: [
    { name: 'DB.Raw.Orders', inputs: ['external.Source'] },
    { name: 'db.raw.orders', inputs: [] },
    { name: 'other', inputs: [] },
  ] }));
  try {
    const document = dom.window.document;
    const search = document.getElementById('table-search');
    const results = document.getElementById('table-results');
    const searchFor = value => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const resultNames = () => [...results.querySelectorAll('button')].map(button => button.textContent);
    searchFor('RAW.ORDER');
    assert.deepEqual(resultNames(), ['DB.Raw.Orders', 'db.raw.orders']);
    searchFor('EXTERNAL.source');
    assert.deepEqual(resultNames(), ['external.Source (undocumented)']);
    searchFor('not present');
    assert.equal(resultNames().length, 0);
    assert.match(document.getElementById('table-search-status').textContent, /no matching tables/i);
    searchFor('');
    assert.equal(resultNames().length, 4);
  } finally { dom.window.close(); }
});

test('selecting a search result opens its details and centers that exact table', () => {
  const dom = open(injected({ tables: [
    { name: 'DB.Raw', inputs: ['missing'], description: 'Uppercase table' },
    { name: 'db.raw', inputs: [], description: 'Lowercase table' },
  ] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    const buttons = [...document.querySelectorAll('#table-results button')];
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    for (const [name, description] of [
      ['db.raw', 'Lowercase table'], ['DB.Raw', 'Uppercase table'], ['missing (undocumented)', 'Unknown'],
    ]) {
      buttons.find(button => button.textContent === name).click();
      assert.equal(inspector.querySelector('h2').textContent, name.replace(' (undocumented)', ''));
      assert.match(inspector.textContent, new RegExp(description));
      assert.equal(document.getElementById('zoom-level').textContent, zoom);
      clickGraph(dom, 500, 300);
      assert.equal(inspector.querySelector('h2').textContent, name.replace(' (undocumented)', ''));
    }
  } finally { dom.window.close(); }
});

test('table list can be collapsed and reopened without losing the search', () => {
  const dom = open(injected({ tables: [{ name: 'orders', inputs: [] }, { name: 'customers', inputs: [] }] }));
  try {
    const document = dom.window.document;
    const list = document.getElementById('table-list');
    const search = document.getElementById('table-search');
    search.value = 'orders';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(list.open, true);
    list.querySelector('summary').click();
    assert.equal(list.open, false);
    list.querySelector('summary').click();
    assert.equal(list.open, true);
    assert.equal(search.value, 'orders');
    assert.deepEqual([...document.querySelectorAll('#table-results button')].map(button => button.textContent), ['orders']);
  } finally { dom.window.close(); }
});

test('selecting a graph table opens its inspector without changing the view', () => {
  const dom = open(injected({ tables: [{ name: 'warehouse.orders', inputs: [], description: 'Order facts' }] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    assert.match(inspector.textContent, /select.*table/i);
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    clickGraph(dom, 500, 300);
    assert.match(inspector.textContent, /warehouse\.orders/);
    assert.match(inspector.textContent, /Order facts/);
    assert.equal(document.getElementById('zoom-level').textContent, zoom);
  } finally { dom.window.close(); }
});

test('inspector navigates direct relationships and identifies undocumented inputs', () => {
  const description = 'Sales "quoted" 東京 </script><img src=x onerror=alert(1)>';
  const dom = open(injected({ tables: [
    { name: 'sales', inputs: ['missing', 'missing'], description },
    { name: 'report', inputs: ['sales'] },
  ] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    clickGraph(dom, 500, 300);
    assert.ok(inspector.textContent.includes(description));
    assert.equal(inspector.querySelectorAll('img').length, 0);
    const related = name => [...inspector.querySelectorAll('button')].find(button => button.textContent.includes(name));
    const section = name => [...inspector.querySelectorAll('section')].find(item => item.querySelector('h3').textContent === name);
    assert.match(section('Direct inputs').textContent, /missing.*undocumented/i);
    assert.doesNotMatch(section('Direct inputs').textContent, /report/);
    assert.match(section('Direct downstream tables').textContent, /report/);
    assert.doesNotMatch(section('Direct downstream tables').textContent, /missing/);
    assert.equal([...inspector.querySelectorAll('button')].filter(button => button.textContent.includes('missing')).length, 1);
    assert.ok(related('report'));
    related('missing').click();
    assert.match(inspector.textContent, /missing/);
    assert.match(inspector.textContent, /undocumented/i);
    assert.match(inspector.textContent, /description.*unknown/i);
    assert.match(inspector.textContent, /inputs.*unknown/i);
    related('sales').click();
    assert.ok(inspector.textContent.includes(description));
    related('report').click();
    assert.match(inspector.textContent, /no description/i);
    assert.match(inspector.textContent, /no downstream/i);
    clickGraph(dom, 500, 300);
    assert.ok(inspector.textContent.includes(description));
  } finally { dom.window.close(); }
});

test('empty lineage has an informative empty state', () => {
  const dom = open(injected({ tables: [] }));
  assert.match(dom.window.document.getElementById('status').textContent, /no tables/i);
  dom.window.close();
});

test('unusable embedded lineage displays an error', () => {
  for (const html of [injected({ tables: [{ name: 'good', inputs: [] }, { name: 'bad', inputs: null }] }), template().replace('__LINEAGE_DATA_JSON__', '{invalid')]) {
    const dom = open(html);
    assert.match(dom.window.document.getElementById('status').textContent, /error/i);
    dom.window.close();
  }
});

test('cyclic and invalid table records show an error instead of a partial graph', () => {
  const invalid = [
    { tables: [{ name: 'a', inputs: ['b'] }, { name: 'b', inputs: ['a'] }] },
    { tables: [{ name: 'a', inputs: ['a'] }] },
    { tables: [{ name: 'a', inputs: [] }, { name: 'a', inputs: [] }] },
    { tables: [{ name: ' a', inputs: [] }] },
    { tables: [{ name: 'a', inputs: [''] }] },
    { tables: [{ name: 'a', inputs: [], description: null }] },
    { tables: null },
  ];
  for (const data of invalid) {
    const dom = open(injected(data));
    assert.match(dom.window.document.getElementById('status').textContent, /error/i, JSON.stringify(data));
    dom.window.close();
  }
});

test('injected lineage exposes the complete directed graph without a selection', () => {
  const dom = open(injected({ tables: [
    { name: 'DB.Raw', inputs: [] },
    { name: 'db.raw', inputs: ['DB.Raw', 'missing', 'missing'] },
    { name: 'output', inputs: ['db.raw'] },
  ] }));
  const summary = dom.window.document.getElementById('graph-summary');
  assert.ok(summary);
  assert.match(summary.textContent, /DB.Raw → db.raw/);
  assert.equal(summary.textContent.split('missing → db.raw').length - 1, 1);
  assert.match(summary.textContent, /missing \(undocumented\)/);
  assert.match(dom.window.document.getElementById('selection-status').textContent, /no table selected/i);
  assert.equal(dom.window.document.getElementById('status').textContent, '');
  assert.equal(dom.window.document.querySelector('.controls').hidden, false);
  assert.ok(dom.window.document.querySelector('#graph canvas'));
  dom.window.close();
});

test('zoom controls and reset change and restore the fitted view', () => {
  const dom = open(injected({ tables: [{ name: 'input', inputs: [] }, { name: 'output', inputs: ['input'] }] }));
  try {
    const document = dom.window.document;
    const zoom = document.getElementById('zoom-level');
    assert.ok(zoom);
    const initial = zoom.textContent;
    document.getElementById('zoom-in').click();
    assert.ok(parseInt(zoom.textContent, 10) > parseInt(initial, 10));
    document.getElementById('zoom-out').click();
    assert.equal(zoom.textContent, initial);
    document.getElementById('zoom-in').click();
    document.getElementById('fit').click();
    assert.equal(zoom.textContent, initial);
  } finally { dom.window.close(); }
});

test('wheel zoom changes the graph view', () => {
  const dom = open(injected({ tables: [{ name: 'input', inputs: [] }, { name: 'output', inputs: ['input'] }] }));
  try {
    const document = dom.window.document;
    const zoom = document.getElementById('zoom-level');
    const initial = zoom.textContent;
    document.getElementById('graph').dispatchEvent(new dom.window.WheelEvent('wheel', {
      bubbles: true, cancelable: true, clientX: 500, clientY: 300, deltaY: -120,
    }));
    assert.notEqual(zoom.textContent, initial);
  } finally { dom.window.close(); }
});

test('safe injection retains Unicode and markup-like names without creating elements', () => {
  const name = '東京 "quoted" </script><img src=x onerror=alert(1)>';
  const dom = open(injected({ tables: [{ name, inputs: [], description: 'quote " and </script> é' }] }));
  try {
    const document = dom.window.document;
    assert.equal(document.getElementById('status').textContent, '');
    assert.ok(document.getElementById('graph-summary').textContent.includes(name));
    assert.equal(document.querySelectorAll('img').length, 0);
  } finally { dom.window.close(); }
});

test('generated acceptance files support representative search and lineage navigation', () => {
  execFileSync(process.execPath, ['lineage-viewer/acceptance-fixtures.cjs']);
  const dom = open(fs.readFileSync('dist/lineage-acceptance.html', 'utf8'));
  try {
    const document = dom.window.document;
    assert.equal(document.getElementById('status').textContent, '');
    const search = document.getElementById('table-search');
    const results = document.getElementById('table-results');
    const inspector = document.getElementById('selection-status');
    const summary = document.getElementById('graph-summary');
    const searchFor = value => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const select = name => [...results.querySelectorAll('button')]
      .find(button => button.textContent === name).click();

    assert.equal(results.querySelectorAll('button').length, 201);
    assert.match(summary.textContent, /table_198 → table_199/);
    searchFor('db.raw');
    assert.deepEqual([...results.querySelectorAll('button')].map(button => button.textContent), ['DB.Raw', 'db.raw']);
    select('DB.Raw');
    document.querySelector('[data-view="downstream"]').click();
    assert.match(summary.textContent, /table_3 → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    searchFor('table_4');
    select('table_4');
    const description = 'Sales "quoted" 東京 </script><script>window.injectedMarkupRan = true</script><img src=x onerror="window.injectedMarkupRan = true">';
    assert.ok(inspector.textContent.includes(description));
    assert.equal(document.querySelectorAll('img').length, 0);
    assert.equal(dom.window.injectedMarkupRan, undefined);
    assert.equal([...inspector.querySelectorAll('button')].filter(button => button.textContent === 'missing (undocumented)').length, 1);
    document.querySelector('[data-view="upstream"]').click();
    assert.match(summary.textContent, /DB.Raw → db.raw/);
    assert.match(summary.textContent, /table_3 → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    document.querySelector('[data-view="connected"]').click();
    assert.match(summary.textContent, /DB.Raw → db.raw/);
    assert.match(summary.textContent, /missing → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    [...inspector.querySelectorAll('button')].find(button => button.textContent === 'missing (undocumented)').click();
    assert.match(inspector.textContent, /unknown/i);
    document.querySelector('[data-view="downstream"]').click();
    assert.match(summary.textContent, /missing → table_4/);
    document.querySelector('[data-view="all"]').click();
    assert.match(summary.textContent, /table_198 → table_199/);
    assert.equal(inspector.querySelector('h2').textContent, 'missing');
  } finally { dom.window.close(); }

  const empty = open(fs.readFileSync('dist/lineage-acceptance-empty.html', 'utf8'));
  try {
    assert.match(empty.window.document.getElementById('status').textContent, /no tables/i);
  } finally { empty.window.close(); }
});
