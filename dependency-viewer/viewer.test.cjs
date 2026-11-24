const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { parseDependency } = require('./data');

const template = () => fs.readFileSync('dist/dependency-viewer.html', 'utf8');

function open(content, drawnText = [], realReader = false) {
  const dom = new JSDOM(typeof content === 'string' ? content : template(), {
    url: 'file:///dependency-viewer.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      if (!realReader) {
        window.FileReader = class {
          readAsText(file) {
            this.result = file.contents;
            this.onload();
          }
        };
      }
      const context = new Proxy({
        measureText: text => ({ width: text.length * 7 }),
        fillText: text => { drawnText.push(text); },
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
  if (typeof content !== 'string') loadFile(dom, content.raw);
  return dom;
}

function loadFile(dom, raw, name = 'dependencies.json') {
  const input = dom.window.document.getElementById('dependency-file');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, contents: raw }] });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

test('built viewer starts empty and has no external resources', () => {
  const html = template();
  assert.ok(!html.includes('__DEPENDENCY_DATA_JSON__'));
  const dom = open(html);
  assert.equal(dom.window.document.querySelectorAll('script[src], link[href], img[src], iframe[src]').length, 0);
  assert.match(dom.window.document.getElementById('status').textContent, /choose a json file/i);
  assert.equal(dom.window.document.getElementById('file-panel').hidden, false);
  const example = dom.window.document.getElementById('format-example').value;
  assert.equal(parseDependency(example).entities.length, 4);
  dom.window.close();
});

test('built viewer includes its project license and third-party notices', () => {
  const html = template();
  assert.ok(html.includes(fs.readFileSync('LICENSE', 'utf8')));
  assert.ok(html.includes(fs.readFileSync('THIRD_PARTY_NOTICES.txt', 'utf8')));
});

function dataset(value) {
  return { raw: JSON.stringify(value) };
}

test('new files reset the viewer, while invalid files preserve it', () => {
  const data = JSON.stringify({ entities: [
    { name: 'first', dependencies: [] }, { name: 'second', dependencies: ['first'] },
  ] });
  const dom = open(template());
  try {
    const document = dom.window.document;
    loadFile(dom, data, 'first.json');
    assert.equal(document.getElementById('file-panel').hidden, true);
    const fileButton = document.getElementById('toggle-file-panel');
    assert.equal(fileButton.previousElementSibling.dataset.view, 'downstream');
    assert.equal(fileButton.getAttribute('aria-expanded'), 'false');
    fileButton.click();
    assert.equal(document.getElementById('file-panel').hidden, false);
    assert.equal(fileButton.getAttribute('aria-expanded'), 'true');
    document.querySelector('#entity-results button').click();
    document.querySelector('[data-view="downstream"]').click();
    const search = document.getElementById('entity-search');
    search.value = 'first';
    search.dispatchEvent(new dom.window.Event('input'));
    const filter = document.getElementById('graph-filter');
    filter.value = 'first';
    filter.dispatchEvent(new dom.window.Event('input'));
    document.getElementById('colours-enabled').click();
    document.getElementById('edge-motion').click();
    const summary = document.getElementById('graph-summary').textContent;
    loadFile(dom, '{invalid', 'bad.json');
    assert.match(document.getElementById('file-error').textContent, /error/i);
    assert.equal(document.getElementById('file-panel').hidden, false);
    assert.equal(document.getElementById('file-name').textContent, 'first.json');
    assert.equal(document.getElementById('graph-summary').textContent, summary);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'first');
    assert.equal(document.querySelector('[data-view="downstream"]').getAttribute('aria-pressed'), 'true');
    loadFile(dom, data, 'first.json');
    assert.equal(document.getElementById('file-panel').hidden, true);
    assert.equal(document.getElementById('file-error').textContent, '');
    assert.equal(document.getElementById('entity-search').value, '');
    assert.equal(document.getElementById('graph-filter').value, '');
    assert.equal(document.getElementById('colours-enabled').checked, true);
    assert.equal(document.getElementById('edge-motion').textContent, 'Pause');
    assert.equal(document.querySelector('[data-view="all"]').getAttribute('aria-pressed'), 'true');
    assert.match(document.getElementById('selection-status').textContent, /no entity selected/i);
    loadFile(dom, JSON.stringify({ entities: [{ name: 'replacement', dependencies: [] }] }), 'second.json');
    assert.match(document.getElementById('graph-summary').textContent, /replacement/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /first|second/);
    loadFile(dom, '{"entities":[]}', 'empty.json');
    assert.match(document.getElementById('status').textContent, /no entities/i);
    assert.equal(document.querySelector('.controls').hidden, true);
    assert.equal(document.getElementById('file-panel').hidden, false);
    assert.equal(document.getElementById('toggle-file-panel').getAttribute('aria-expanded'), 'true');
    assert.equal(document.getElementById('dependency-views').hidden, true);
  } finally { dom.window.close(); }
});

test('reads an actual browser File and ignores stale asynchronous reads', async () => {
  const dom = open(template(), [], true);
  try {
    const document = dom.window.document;
    const input = document.getElementById('dependency-file');
    const file = new dom.window.File(['{"entities":[{"name":"actual","dependencies":[]}]}'], 'actual.json');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new dom.window.Event('change'));
    await new Promise(resolve => dom.window.setTimeout(resolve, 50));
    assert.match(document.getElementById('graph-summary').textContent, /actual/);
    const readers = [];
    dom.window.FileReader = class {
      constructor() { readers.push(this); }
      readAsText() {}
    };
    loadFile(dom, '', 'old.json');
    loadFile(dom, '', 'new.json');
    readers[1].result = '{"entities":[{"name":"new","dependencies":[]}]}';
    readers[1].onload();
    readers[0].result = '{"entities":[{"name":"old","dependencies":[]}]}';
    readers[0].onload();
    assert.match(document.getElementById('graph-summary').textContent, /new/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /old/);
    assert.equal(document.getElementById('file-name').textContent, 'new.json');
    loadFile(dom, '', 'unreadable.json');
    readers[2].onerror();
    assert.match(document.getElementById('file-error').textContent, /could not read/i);
    assert.match(document.getElementById('graph-summary').textContent, /new/);
  } finally { dom.window.close(); }
});

test('example copies to clipboard or remains selectable when clipboard is unavailable', async () => {
  const dom = open(template());
  try {
    const document = dom.window.document;
    const example = document.getElementById('format-example');
    const button = document.getElementById('copy-example');
    button.click();
    assert.match(document.getElementById('copy-status').textContent, /select and copy/i);
    let copied;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: { writeText: async text => { copied = text; } },
    });
    button.click();
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(copied, example.value);
    assert.equal(document.getElementById('copy-status').textContent, 'Copied.');
  } finally { dom.window.close(); }
});

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

test('entity details can be collapsed while selection continues to update', () => {
  const dom = open(dataset({ entities: [
    { name: 'first', dependencies: [] }, { name: 'second', dependencies: ['first'] },
  ] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('inspector');
    const summary = inspector.querySelector('summary');
    assert.equal(inspector.open, true);
    summary.click();
    assert.equal(inspector.open, false);
    [...document.querySelectorAll('#entity-results button')].find(button => button.title === 'second').click();
    assert.equal(inspector.open, false);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'second');
    summary.click();
    assert.equal(inspector.open, true);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'second');
  } finally { dom.window.close(); }
});

test('dependency views require a selection and focus transitively in each direction', () => {
  const dom = open(dataset({ entities: [
    { name: 'a', dependencies: [] }, { name: 'b', dependencies: ['a'] },
    { name: 'c', dependencies: ['b'] }, { name: 'd', dependencies: ['c'] },
    { name: 'e', dependencies: ['d'] }, { name: 'focus', dependencies: ['e', 'branch'] },
    { name: 'branch', dependencies: [] }, { name: 'child', dependencies: ['focus'] },
    { name: 'other', dependencies: [] },
  ] }));
  try {
    const document = dom.window.document;
    const button = name => [...document.querySelectorAll('#dependency-views button')].find(item => item.textContent === name);
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
    assert.match(summary(), /Entities: a, b, c, d, e, focus, branch/);
    assert.doesNotMatch(summary(), /child|other/);
    assert.equal(button('Upstream').getAttribute('aria-pressed'), 'true');
    button('Downstream').click();
    assert.match(summary(), /Entities: focus, child/);
    assert.doesNotMatch(summary(), /branch|other|a →/);
    button('Connected').click();
    assert.match(summary(), /Entities: a, b, c, d, e, focus, branch, child/);
    assert.doesNotMatch(summary(), /other/);
    button('All').click();
    assert.match(summary(), /other/);
    assert.match(inspector.querySelector('h2').textContent, /^focus$/);
  } finally { dom.window.close(); }
});

test('changing selection refocuses and fits the active view and All fits without clearing it', () => {
  const dom = open(dataset({ entities: [
    { name: 'input', dependencies: [] }, { name: 'middle', dependencies: ['input'] },
    { name: 'output', dependencies: ['middle'] },
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
    assert.match(summary.textContent, /Entities: input, middle/);
    document.getElementById('zoom-in').click();
    const zoomBeforeNavigation = zoom.textContent;
    [...inspector.querySelectorAll('button')].find(item => item.textContent === 'output').click();
    assert.equal(inspector.querySelector('h2').textContent, 'output');
    assert.match(summary.textContent, /Entities: input, middle, output/);
    assert.notEqual(zoom.textContent, zoomBeforeNavigation);
    document.getElementById('zoom-in').click();
    const zoomBeforeAll = zoom.textContent;
    view('all').click();
    assert.notEqual(zoom.textContent, zoomBeforeAll);
    assert.equal(inspector.querySelector('h2').textContent, 'output');
    assert.equal(view('all').getAttribute('aria-pressed'), 'true');
  } finally { dom.window.close(); }
});

test('searching for another entity refocuses, fits, and centers the active dependency view', () => {
  const dom = open(dataset({ entities: [
    { name: 'input', dependencies: [] }, { name: 'middle', dependencies: ['input'] },
    { name: 'output', dependencies: ['middle'] }, { name: 'isolated', dependencies: [] },
  ] }));
  try {
    const document = dom.window.document;
    const result = name => [...document.querySelectorAll('#entity-results button')].find(button => button.textContent === name);
    result('middle').click();
    document.querySelector('[data-view="upstream"]').click();
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    result('output').click();
    assert.equal(document.querySelector('#selection-status h2').textContent, 'output');
    assert.match(document.getElementById('graph-summary').textContent, /Entities: input, middle, output/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /isolated/);
    assert.notEqual(document.getElementById('zoom-level').textContent, zoom);
    clickGraph(dom, 500, 300);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'output');
  } finally { dom.window.close(); }
});

test('filtered search centers an endpoint while keeping its multi-hop dependency on canvas', () => {
  const dom = open(dataset({ entities: [
    { name: 'a', dependencies: [] }, { name: 'b', dependencies: ['a'] },
    { name: 'c', dependencies: ['b'] }, { name: 'd', dependencies: ['c'] },
    { name: 'e', dependencies: ['d'] }, { name: 'isolated', dependencies: [] },
  ] }));
  try {
    const document = dom.window.document;
    const result = name => [...document.querySelectorAll('#entity-results button')].find(button => button.textContent === name);
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
      assert.equal(hit(x, y), 'e', 'dependency does not touch the canvas boundary');
    }
    assert.match(document.getElementById('graph-summary').textContent, /Entities: a, b, c, d, e/);
    assert.doesNotMatch(document.getElementById('graph-summary').textContent, /isolated/);
  } finally { dom.window.close(); }
});

test('entity search matches full names case-insensitively without merging identities', () => {
  const dom = open(dataset({ entities: [
    { name: 'DB.Raw.Orders', dependencies: ['external.Source'] },
    { name: 'db.raw.orders', dependencies: [] },
    { name: 'other', dependencies: [] },
  ] }));
  try {
    const document = dom.window.document;
    const search = document.getElementById('entity-search');
    const results = document.getElementById('entity-results');
    const searchFor = value => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const resultNames = () => [...results.querySelectorAll('button')].map(button => button.title);
    searchFor('RAW.ORDER');
    assert.deepEqual(resultNames(), ['DB.Raw.Orders', 'db.raw.orders']);
    searchFor('EXTERNAL.source');
    assert.deepEqual(resultNames(), ['external.Source (undocumented)']);
    searchFor('not present');
    assert.equal(resultNames().length, 0);
    assert.match(document.getElementById('entity-search-status').textContent, /no matching entities/i);
    searchFor('');
    assert.equal(resultNames().length, 4);
  } finally { dom.window.close(); }
});

test('graph name filter intersects dependency views and hides edges to nonmatching entities', () => {
  const dom = open(dataset({ entities: [
    { name: 'DB.Raw.Orders', dependencies: [] },
    { name: 'db.mart.orders', dependencies: ['DB.Raw.Orders'] },
    { name: 'db.mart.customers', dependencies: ['db.mart.orders'] },
    { name: 'other.orders', dependencies: [] },
  ] }));
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter');
    const summary = document.getElementById('graph-summary');
    const status = document.getElementById('graph-filter-status');
    const setFilter = value => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const result = name => [...document.querySelectorAll('#entity-results button')].find(button => button.title === name);
    result('db.mart.orders').click();
    document.querySelector('[data-view="connected"]').click();
    setFilter('  ORDERS  ');
    assert.match(summary.textContent, /Entities: DB\.Raw\.Orders, db\.mart\.orders/);
    assert.match(summary.textContent, /DB\.Raw\.Orders → db\.mart\.orders/);
    assert.doesNotMatch(summary.textContent, /customers|other\.orders/);
    assert.equal(document.querySelectorAll('#entity-results button').length, 4);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'db.mart.orders');
    document.querySelector('[data-view="downstream"]').click();
    assert.equal(filter.value, '  ORDERS  ');
    assert.match(summary.textContent, /Entities: db\.mart\.ordersRelationships: none/);
    setFilter('customers');
    assert.match(summary.textContent, /Entities: db\.mart\.customersRelationships: none/);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'db.mart.orders');
    document.querySelector('[data-view="upstream"]').click();
    assert.equal(status.textContent, 'No matching entities.');
    document.getElementById('fit').click();
    setFilter('   ');
    assert.equal(status.textContent, '');
    assert.match(summary.textContent, /Entities: DB\.Raw\.Orders, db\.mart\.orders/);
  } finally { dom.window.close(); }
});

test('selecting a nonmatching entity clears the graph filter from either navigation panel', () => {
  const dom = open(dataset({ entities: [
    { name: 'input', dependencies: [] }, { name: 'output', dependencies: ['input'] },
  ] }));
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter');
    const setFilter = value => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const result = name => [...document.querySelectorAll('#entity-results button')].find(button => button.title === name);
    setFilter('input');
    result('output').click();
    assert.equal(filter.value, '');
    assert.equal(document.querySelector('#selection-status h2').textContent, 'output');
    assert.match(document.getElementById('graph-summary').textContent, /input → output/);
    setFilter('output');
    document.querySelector('#selection-status .related-entity').click();
    assert.equal(filter.value, '');
    assert.equal(document.querySelector('#selection-status h2').textContent, 'input');
    assert.match(document.getElementById('graph-summary').textContent, /input → output/);
    setFilter('input');
    result('input').click();
    assert.equal(filter.value, 'input');
  } finally { dom.window.close(); }
});

test('filtering fits the matching graph node and leaves zoom unchanged when no entities match', () => {
  const dom = open(dataset({ entities: [
    { name: 'first', dependencies: [] }, { name: 'second', dependencies: ['first'] },
    { name: 'third', dependencies: ['second'] },
  ] }));
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter');
    const setFilter = value => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    document.getElementById('zoom-out').click();
    const before = document.getElementById('zoom-level').textContent;
    setFilter('third');
    const fitted = document.getElementById('zoom-level').textContent;
    assert.notEqual(fitted, before);
    clickGraph(dom, 500, 300);
    assert.equal(document.querySelector('#selection-status h2').textContent, 'third');
    setFilter('absent');
    assert.equal(document.getElementById('zoom-level').textContent, fitted);
    assert.equal(document.getElementById('graph-filter-status').textContent, 'No matching entities.');
  } finally { dom.window.close(); }
});

test('selecting a search result opens its details and centers that exact entity', () => {
  const dom = open(dataset({ entities: [
    { name: 'DB.Raw', dependencies: ['missing'], description: 'Uppercase entity' },
    { name: 'db.raw', dependencies: [], description: 'Lowercase entity' },
  ] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    const buttons = [...document.querySelectorAll('#entity-results button')];
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    for (const [name, description] of [
      ['db.raw', 'Lowercase entity'], ['DB.Raw', 'Uppercase entity'], ['missing (undocumented)', 'Unknown'],
    ]) {
      buttons.find(button => button.title === name).click();
      assert.equal(inspector.querySelector('h2').textContent, name.replace(' (undocumented)', ''));
      assert.match(inspector.textContent, new RegExp(description));
      assert.equal(document.getElementById('zoom-level').textContent, zoom);
      clickGraph(dom, 500, 300);
      assert.equal(inspector.querySelector('h2').textContent, name.replace(' (undocumented)', ''));
    }
  } finally { dom.window.close(); }
});

test('qualified entity labels stay short while preserving distinct identities and full names', async () => {
  const drawnText = [];
  const longName = 'a_very_long_table_name_that_will_not_fit_in_the_node';
  const dom = open(dataset({ entities: [
    { name: 'sales.orders', dependencies: [] },
    { name: 'support.orders', dependencies: ['sales.orders'] },
    { name: `warehouse.schema.${longName}`, dependencies: [] },
  ] }), drawnText);
  try {
    const document = dom.window.document;
    await new Promise(resolve => dom.window.setTimeout(resolve, 100));
    assert.ok(drawnText.includes('orders'));
    assert.ok(drawnText.some(text => text.endsWith('…') && longName.startsWith(text.slice(0, -1))));
    assert.ok(!drawnText.includes('sales.orders'));
    const results = [...document.querySelectorAll('#entity-results button')];
    assert.deepEqual(results.map(button => button.querySelector('.entity-result-name').textContent),
      ['orders', 'orders', longName]);
    assert.deepEqual(results.map(button => button.querySelector('.entity-result-prefix').textContent),
      ['sales', 'support', 'warehouse.schema']);
    assert.equal(results[1].getAttribute('aria-label'), 'support.orders');
    assert.equal(results[1].title, 'support.orders');
    results[1].click();
    assert.equal(document.querySelector('#selection-status h2').textContent, 'support.orders');
    document.querySelector('[data-view="upstream"]').click();
    assert.match(document.getElementById('graph-summary').textContent, /sales\.orders → support\.orders/);
    clickGraph(dom, 500, 300);
    assert.ok(['sales.orders', 'support.orders'].includes(document.querySelector('#selection-status h2').textContent));
  } finally { dom.window.close(); }
});

test('entity list can be collapsed and reopened without losing the search', () => {
  const dom = open(dataset({ entities: [{ name: 'orders', dependencies: [] }, { name: 'customers', dependencies: [] }] }));
  try {
    const document = dom.window.document;
    const list = document.getElementById('entity-list');
    const search = document.getElementById('entity-search');
    search.value = 'orders';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(list.open, true);
    list.querySelector('summary').click();
    assert.equal(list.open, false);
    list.querySelector('summary').click();
    assert.equal(list.open, true);
    assert.equal(search.value, 'orders');
    assert.deepEqual([...document.querySelectorAll('#entity-results button')].map(button => button.textContent), ['orders']);
  } finally { dom.window.close(); }
});

test('selecting a graph entity opens its inspector without changing the view', () => {
  const dom = open(dataset({ entities: [{ name: 'warehouse.orders', dependencies: [], description: 'Order facts' }] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    assert.match(inspector.textContent, /select.*entity/i);
    const graph = document.getElementById('graph');
    const canvas = graph.querySelector('canvas');
    canvas.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 300 }));
    assert.equal(graph.title, 'warehouse.orders');
    canvas.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }));
    assert.equal(graph.hasAttribute('title'), false);
    document.getElementById('zoom-in').click();
    const zoom = document.getElementById('zoom-level').textContent;
    clickGraph(dom, 500, 300);
    assert.match(inspector.textContent, /warehouse\.orders/);
    assert.match(inspector.textContent, /Order facts/);
    assert.equal(document.getElementById('zoom-level').textContent, zoom);
  } finally { dom.window.close(); }
});

test('inspector displays ordered extra properties as safe text beneath a missing description', () => {
  const hostileKey = '<img src=x onerror="window.injectedMarkupRan=true">';
  const hostileValue = '</script><script>window.injectedMarkupRan=true</script>\n東京';
  const entity = JSON.parse(`{"name":"sales","dependencies":["missing"],"z":"plain text","10":10,"2":2,"documented":false,"empty":"","nil":null,"flag":true,"array":[1,"two"],"object":{"nested":[false,null]},"__proto__":"safe"}`);
  entity[hostileKey] = hostileValue;
  const dom = open(dataset({ entities: [entity, { name: 'report', dependencies: ['sales'] }] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    [...document.querySelectorAll('#entity-results button')].find(button => button.title === 'sales').click();
    const description = inspector.querySelector('.inspector-details > section');
    assert.equal(description.querySelector('p').textContent, 'No description provided.');
    const extras = description.querySelector('.entity-extras');
    assert.deepEqual([...extras.children].map(element => [element.tagName, element.textContent]), [
      ['DT', '2'], ['DD', '2'], ['DT', '10'], ['DD', '10'],
      ['DT', 'z'], ['DD', 'plain text'], ['DT', 'documented'], ['DD', 'false'],
      ['DT', 'empty'], ['DD', ''], ['DT', 'nil'], ['DD', 'null'],
      ['DT', 'flag'], ['DD', 'true'], ['DT', 'array'], ['DD', '[1,"two"]'],
      ['DT', 'object'], ['DD', '{"nested":[false,null]}'],
      ['DT', '__proto__'], ['DD', 'safe'], ['DT', hostileKey], ['DD', hostileValue],
    ]);
    assert.equal(dom.window.getComputedStyle(extras.querySelector('dd')).overflowWrap, 'anywhere');
    assert.equal(inspector.querySelectorAll('img, script').length, 0);
    assert.equal(dom.window.injectedMarkupRan, undefined);
    assert.equal(inspector.querySelector('.undocumented-badge'), null);
    const related = name => [...inspector.querySelectorAll('button')].find(button => button.textContent.includes(name));
    assert.ok(related('report'));
    related('missing').click();
    assert.match(inspector.textContent, /description.*unknown/i);
    assert.match(inspector.textContent, /dependencies.*unknown/i);
    assert.equal(inspector.querySelector('.entity-extras'), null);
    related('sales').click();
    assert.equal(inspector.querySelector('.entity-extras').lastElementChild.textContent, hostileValue);
    related('report').click();
    assert.equal(inspector.querySelector('.entity-extras'), null);
  } finally { dom.window.close(); }
});

test('inspector navigates direct relationships and identifies undocumented dependencies', () => {
  const description = 'Sales "quoted" 東京 </script><img src=x onerror=alert(1)>';
  const dom = open(dataset({ entities: [
    { name: 'sales', dependencies: ['missing', 'missing'], description },
    { name: 'report', dependencies: ['sales'] },
  ] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status');
    clickGraph(dom, 500, 300);
    assert.ok(inspector.textContent.includes(description));
    assert.equal(inspector.querySelectorAll('img').length, 0);
    const related = name => [...inspector.querySelectorAll('button')].find(button => button.textContent.includes(name));
    const section = name => [...inspector.querySelectorAll('section')].find(item => item.querySelector('h3').textContent === name);
    assert.match(section('Direct dependencies').textContent, /missing.*undocumented/i);
    assert.doesNotMatch(section('Direct dependencies').textContent, /report/);
    assert.match(section('Direct downstream entities').textContent, /report/);
    assert.doesNotMatch(section('Direct downstream entities').textContent, /missing/);
    assert.equal([...inspector.querySelectorAll('button')].filter(button => button.textContent.includes('missing')).length, 1);
    assert.ok(related('report'));
    related('missing').click();
    assert.match(inspector.textContent, /missing/);
    assert.match(inspector.textContent, /undocumented/i);
    assert.match(inspector.textContent, /description.*unknown/i);
    assert.match(inspector.textContent, /dependencies.*unknown/i);
    related('sales').click();
    assert.ok(inspector.textContent.includes(description));
    related('report').click();
    assert.match(inspector.textContent, /no description/i);
    assert.match(inspector.textContent, /no downstream/i);
    clickGraph(dom, 500, 300);
    assert.ok(inspector.textContent.includes(description));
  } finally { dom.window.close(); }
});

test('empty dependency has an informative empty state', () => {
  const dom = open(dataset({ entities: [] }));
  assert.match(dom.window.document.getElementById('status').textContent, /no entities/i);
  dom.window.close();
});

test('unusable dependency file displays an error', () => {
  for (const html of [dataset({ entities: [{ name: 'good', dependencies: [] }, { name: 'bad', dependencies: null }] }), { raw: '{invalid' }]) {
    const dom = open(html);
    assert.match(dom.window.document.getElementById('file-error').textContent, /error/i);
    dom.window.close();
  }
});

test('cyclic and invalid entity records show an error instead of a partial graph', () => {
  const invalid = [
    { entities: [{ name: 'a', dependencies: ['b'] }, { name: 'b', dependencies: ['a'] }] },
    { entities: [{ name: 'a', dependencies: ['a'] }] },
    { entities: [{ name: 'a', dependencies: [] }, { name: 'a', dependencies: [] }] },
    { entities: [{ name: ' a', dependencies: [] }] },
    { entities: [{ name: 'a', dependencies: [''] }] },
    { entities: [{ name: 'a', dependencies: [], description: null }] },
    { entities: null },
  ];
  for (const data of invalid) {
    const dom = open(dataset(data));
    assert.match(dom.window.document.getElementById('file-error').textContent, /error/i, JSON.stringify(data));
    dom.window.close();
  }
});

test('loaded dependency exposes the complete directed graph without a selection', () => {
  const dom = open(dataset({ entities: [
    { name: 'DB.Raw', dependencies: [] },
    { name: 'db.raw', dependencies: ['DB.Raw', 'missing', 'missing'] },
    { name: 'output', dependencies: ['db.raw'] },
  ] }));
  const summary = dom.window.document.getElementById('graph-summary');
  assert.ok(summary);
  assert.match(summary.textContent, /DB.Raw → db.raw/);
  assert.equal(summary.textContent.split('missing → db.raw').length - 1, 1);
  assert.match(summary.textContent, /missing \(undocumented\)/);
  assert.match(dom.window.document.getElementById('selection-status').textContent, /no entity selected/i);
  assert.equal(dom.window.document.getElementById('status').textContent, '');
  assert.equal(dom.window.document.querySelector('.controls').hidden, false);
  assert.ok(dom.window.document.querySelector('#graph canvas'));
  dom.window.close();
});

test('zoom controls and reset change and restore the fitted view', () => {
  const dom = open(dataset({ entities: [{ name: 'input', dependencies: [] }, { name: 'output', dependencies: ['input'] }] }));
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
  const dom = open(dataset({ entities: [{ name: 'input', dependencies: [] }, { name: 'output', dependencies: ['input'] }] }));
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

test('loading retains Unicode and markup-like names without creating elements', () => {
  const name = '東京 "quoted" </script><img src=x onerror=alert(1)>';
  const dom = open(dataset({ entities: [{ name, dependencies: [], description: 'quote " and </script> é' }] }));
  try {
    const document = dom.window.document;
    assert.equal(document.getElementById('status').textContent, '');
    assert.ok(document.getElementById('graph-summary').textContent.includes(name));
    assert.equal(document.querySelectorAll('img').length, 0);
  } finally { dom.window.close(); }
});

test('generated acceptance files support representative search and dependency navigation', () => {
  execFileSync(process.execPath, ['dependency-viewer/acceptance-fixtures.cjs']);
  const dom = open({ raw: fs.readFileSync('dist/dependency-acceptance.json', 'utf8') });
  try {
    const document = dom.window.document;
    assert.equal(document.getElementById('status').textContent, '');
    const search = document.getElementById('entity-search');
    const results = document.getElementById('entity-results');
    const inspector = document.getElementById('selection-status');
    const summary = document.getElementById('graph-summary');
    const searchFor = value => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const select = name => [...results.querySelectorAll('button')]
      .find(button => button.title === name).click();

    assert.equal(results.querySelectorAll('button').length, 201);
    assert.match(summary.textContent, /table_198 → table_199/);
    searchFor('db.raw');
    assert.deepEqual([...results.querySelectorAll('button')].map(button => button.title), ['DB.Raw', 'db.raw']);
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

  const empty = open({ raw: fs.readFileSync('dist/dependency-acceptance-empty.json', 'utf8') });
  try {
    assert.match(empty.window.document.getElementById('status').textContent, /no entities/i);
  } finally { empty.window.close(); }
});
