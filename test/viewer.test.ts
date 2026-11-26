import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { parseDependency } from '../src/data';

const template = () => fs.readFileSync('dist/dependency-viewer.html', 'utf8');

function open(content: string | { raw: string }, drawnText: string[] = [], realReader = false) {
  const dom = new JSDOM(typeof content === 'string' ? content : template(), {
    url: 'file:///dependency-viewer.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      if (!realReader) {
        window.FileReader = class {
          result!: string;
          onload!: () => void;
          readAsText(file: { contents: string }) {
            this.result = file.contents;
            this.onload();
          }
        } as unknown as typeof window.FileReader;
      }
      const context = new Proxy(
        {
          measureText: (text: string) => ({ width: text.length * 7 }),
          fillText: (text: string) => {
            drawnText.push(text);
          },
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
        },
        { get: (target, key) => (key in target ? Reflect.get(target, key) : () => {}) },
      );
      window.HTMLCanvasElement.prototype.getContext = (() =>
        context) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 1000 });
      Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 600 });
      window.HTMLElement.prototype.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 1000,
          bottom: 600,
          width: 1000,
          height: 600,
        }) as DOMRect;
    },
  });
  if (typeof content !== 'string') loadFile(dom, content.raw);
  return dom;
}

function loadFile(dom: JSDOM, raw: string, name = 'dependencies.json') {
  const input = dom.window.document.getElementById('dependency-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, contents: raw }] });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

test('built viewer starts empty and has no external resources', () => {
  const html = template();
  assert.ok(!html.includes('__DEPENDENCY_DATA_JSON__'));
  const dom = open(html);
  assert.equal(dom.window.document.querySelectorAll('script[src], link[href], img[src], iframe[src]').length, 0);
  assert.match((dom.window.document.getElementById('status') as HTMLElement).textContent, /choose a json file/i);
  assert.equal((dom.window.document.getElementById('file-panel') as HTMLElement).hidden, false);
  const example = (dom.window.document.getElementById('format-example') as HTMLTextAreaElement).value;
  assert.equal(parseDependency(example).entities.length, 4);
  dom.window.close();
});

test('built viewer includes its project license and third-party notices', () => {
  const html = template();
  assert.ok(html.includes(fs.readFileSync('LICENSE', 'utf8')));
  assert.ok(html.includes(fs.readFileSync('THIRD_PARTY_NOTICES.txt', 'utf8')));
});

function dataset(value: unknown) {
  return { raw: JSON.stringify(value) };
}

test('new files reset the viewer, while invalid files preserve it', () => {
  const data = JSON.stringify({
    entities: [
      { name: 'first', dependencies: [] },
      { name: 'second', dependencies: ['first'] },
    ],
  });
  const dom = open(template());
  try {
    const document = dom.window.document;
    loadFile(dom, data, 'first.json');
    assert.equal((document.getElementById('file-panel') as HTMLElement).hidden, true);
    const fileButton = document.getElementById('toggle-file-panel') as HTMLButtonElement;
    assert.equal((fileButton.previousElementSibling as HTMLElement).dataset.view, 'downstream');
    assert.equal(fileButton.getAttribute('aria-expanded'), 'false');
    fileButton.click();
    assert.equal((document.getElementById('file-panel') as HTMLElement).hidden, false);
    assert.equal(fileButton.getAttribute('aria-expanded'), 'true');
    (document.querySelector('#entity-results button') as HTMLButtonElement).click();
    (document.querySelector('[data-view="downstream"]') as HTMLElement).click();
    const search = document.getElementById('entity-search') as HTMLInputElement;
    search.value = 'first';
    search.dispatchEvent(new dom.window.Event('input'));
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    filter.value = 'first';
    filter.dispatchEvent(new dom.window.Event('input'));
    (document.getElementById('colours-enabled') as HTMLInputElement).click();
    (document.getElementById('edge-motion') as HTMLButtonElement).click();
    const summary = (document.getElementById('graph-summary') as HTMLElement).textContent;
    loadFile(dom, '{invalid', 'bad.json');
    assert.match((document.getElementById('file-error') as HTMLElement).textContent, /error/i);
    assert.equal((document.getElementById('file-panel') as HTMLElement).hidden, false);
    assert.equal((document.getElementById('file-name') as HTMLElement).textContent, 'first.json');
    assert.equal((document.getElementById('graph-summary') as HTMLElement).textContent, summary);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'first');
    assert.equal(
      (document.querySelector('[data-view="downstream"]') as HTMLElement).getAttribute('aria-pressed'),
      'true',
    );
    dom.window.confirm = () => true;
    loadFile(dom, data, 'first.json');
    assert.equal((document.getElementById('file-panel') as HTMLElement).hidden, true);
    assert.equal((document.getElementById('file-error') as HTMLElement).textContent, '');
    assert.equal((document.getElementById('entity-search') as HTMLInputElement).value, '');
    assert.equal((document.getElementById('graph-filter') as HTMLInputElement).value, '');
    assert.equal((document.getElementById('colours-enabled') as HTMLInputElement).checked, true);
    assert.equal((document.getElementById('edge-motion') as HTMLButtonElement).textContent, 'Pause');
    assert.equal((document.querySelector('[data-view="all"]') as HTMLElement).getAttribute('aria-pressed'), 'true');
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /no entity selected/i);
    loadFile(dom, JSON.stringify({ entities: [{ name: 'replacement', dependencies: [] }] }), 'second.json');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /replacement/);
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /first|second/);
    loadFile(dom, '{"entities":[]}', 'empty.json');
    assert.match((document.getElementById('status') as HTMLElement).textContent, /no entities/i);
    assert.equal((document.querySelector('.controls') as HTMLElement).hidden, true);
    assert.equal((document.getElementById('file-panel') as HTMLElement).hidden, false);
    assert.equal(
      (document.getElementById('toggle-file-panel') as HTMLButtonElement).getAttribute('aria-expanded'),
      'true',
    );
    assert.equal((document.getElementById('dependency-views') as HTMLElement).hidden, true);
  } finally {
    dom.window.close();
  }
});

test('reads an actual browser File and ignores stale asynchronous reads', async () => {
  const dom = open(template(), [], true);
  try {
    const document = dom.window.document;
    const input = document.getElementById('dependency-file') as HTMLInputElement;
    const file = new dom.window.File(['{"entities":[{"name":"actual","dependencies":[]}]}'], 'actual.json');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new dom.window.Event('change'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /actual/);
    const readers: { result: string; onload: () => void; onerror: () => void }[] = [];
    dom.window.FileReader = class {
      result!: string;
      onload!: () => void;
      onerror!: () => void;
      constructor() {
        readers.push(this);
      }
      readAsText() {}
    } as unknown as typeof dom.window.FileReader;
    loadFile(dom, '', 'old.json');
    loadFile(dom, '', 'new.json');
    readers[1].result = '{"entities":[{"name":"new","dependencies":[]}]}';
    readers[1].onload();
    readers[0].result = '{"entities":[{"name":"old","dependencies":[]}]}';
    readers[0].onload();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /new/);
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /old/);
    assert.equal((document.getElementById('file-name') as HTMLElement).textContent, 'new.json');
    loadFile(dom, '', 'unreadable.json');
    readers[2].onerror();
    assert.match((document.getElementById('file-error') as HTMLElement).textContent, /could not read/i);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /new/);
  } finally {
    dom.window.close();
  }
});

test('example copies to clipboard or remains selectable when clipboard is unavailable', async () => {
  const dom = open(template());
  try {
    const document = dom.window.document;
    const example = document.getElementById('format-example') as HTMLTextAreaElement;
    const button = document.getElementById('copy-example') as HTMLButtonElement;
    button.click();
    assert.match((document.getElementById('copy-status') as HTMLElement).textContent, /select and copy/i);
    let copied!: string;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
    });
    button.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.equal(copied, example.value);
    assert.equal((document.getElementById('copy-status') as HTMLElement).textContent, 'Copied.');
  } finally {
    dom.window.close();
  }
});

function clickGraph(dom: JSDOM, x: number, y: number) {
  const graph = dom.window.document.querySelector('#graph canvas') as HTMLElement;
  for (const type of ['mousedown', 'mouseup']) {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperty(event, 'which', { value: 1 });
    graph.dispatchEvent(event);
  }
}

test('exports the full filtered graph at the selected resolution', async () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'first', dependencies: [] },
        { name: 'second', dependencies: ['first'] },
        { name: 'third', dependencies: ['second'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const dimensions = document.getElementById('export-dimensions') as HTMLElement;
    const fullSize = dimensions.textContent;
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    filter.value = 'first';
    filter.dispatchEvent(new dom.window.Event('input'));
    assert.notEqual(dimensions.textContent, fullSize);
    const resolution = document.getElementById('export-resolution') as HTMLSelectElement;
    resolution.value = '4';
    resolution.dispatchEvent(new dom.window.Event('change'));
    const expected = dimensions.textContent!.match(/[\d,]+/g)!.map((value) => Number(value.replaceAll(',', '')));
    const rendered: number[][] = [];
    dom.window.HTMLCanvasElement.prototype.toBlob = function (callback) {
      rendered.push([this.width, this.height]);
      callback(new dom.window.Blob(['png'], { type: 'image/png' }));
    };
    dom.window.Image = class {
      onload!: () => void;
      set src(value: string) {
        void value;
        queueMicrotask(() => this.onload());
      }
    } as unknown as typeof dom.window.Image;
    dom.window.URL.createObjectURL = () => 'blob:test';
    dom.window.URL.revokeObjectURL = () => {};
    let downloaded;
    dom.window.HTMLAnchorElement.prototype.click = function () {
      downloaded = this.download;
    };
    (document.getElementById('export-png') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.deepEqual(
      rendered[0],
      expected.map((value) => value - 320),
    );
    assert.deepEqual(rendered[1], expected);
    assert.equal(downloaded, 'dependency-graph.png');
    filter.value = 'no matches';
    filter.dispatchEvent(new dom.window.Event('input'));
    assert.equal((document.getElementById('export-png') as HTMLButtonElement).disabled, true);
  } finally {
    dom.window.close();
  }
});

test('entity details can be collapsed while selection continues to update', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'first', dependencies: [] },
        { name: 'second', dependencies: ['first'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('inspector') as HTMLDetailsElement;
    const summary = inspector.querySelector('summary') as HTMLElement;
    assert.equal(inspector.open, true);
    summary.click();
    assert.equal(inspector.open, false);
    [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')]
      .find((button) => button.title === 'second')!
      .click();
    assert.equal(inspector.open, false);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'second');
    summary.click();
    assert.equal(inspector.open, true);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'second');
  } finally {
    dom.window.close();
  }
});

test('dependency views require a selection and focus transitively in each direction', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'a', dependencies: [] },
        { name: 'b', dependencies: ['a'] },
        { name: 'c', dependencies: ['b'] },
        { name: 'd', dependencies: ['c'] },
        { name: 'e', dependencies: ['d'] },
        { name: 'focus', dependencies: ['e', 'branch'] },
        { name: 'branch', dependencies: [] },
        { name: 'child', dependencies: ['focus'] },
        { name: 'other', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const button = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('#dependency-views button')].find(
        (item) => item.textContent === name,
      )!;
    const summary = () => (document.getElementById('graph-summary') as HTMLElement).textContent;
    assert.ok(button('Connected').disabled);
    assert.ok(button('Upstream').disabled);
    assert.ok(button('Downstream').disabled);
    assert.equal(button('All').disabled, false);
    const inspector = document.getElementById('selection-status') as HTMLElement;
    for (
      let y = 50;
      y < 600 &&
      (!(inspector.querySelector('h2') as HTMLElement) ||
        (inspector.querySelector('h2') as HTMLElement).textContent === 'other');
      y += 25
    ) {
      for (
        let x = 50;
        x < 1000 &&
        (!(inspector.querySelector('h2') as HTMLElement) ||
          (inspector.querySelector('h2') as HTMLElement).textContent === 'other');
        x += 25
      ) {
        clickGraph(dom, x, y);
      }
    }
    assert.ok(inspector.querySelector('h2') as HTMLElement);
    while ((inspector.querySelector('h2') as HTMLElement).textContent !== 'focus') {
      const current = (inspector.querySelector('h2') as HTMLElement).textContent;
      const next = { a: 'b', b: 'c', c: 'd', d: 'e', e: 'focus', branch: 'focus', child: 'focus' }[current];
      assert.ok(next, current);
      const related = [...inspector.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent === next,
      )!;
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
    assert.match((inspector.querySelector('h2') as HTMLElement).textContent, /^focus$/);
  } finally {
    dom.window.close();
  }
});

test('changing selection refocuses and fits the active view and All fits without clearing it', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'input', dependencies: [] },
        { name: 'middle', dependencies: ['input'] },
        { name: 'output', dependencies: ['middle'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const view = (name: string) => document.querySelector(`[data-view="${name}"]`) as HTMLElement;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    const summary = document.getElementById('graph-summary') as HTMLElement;
    const zoom = document.getElementById('zoom-level') as HTMLOutputElement;
    clickGraph(dom, 500, 300);
    assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, 'middle');
    view('upstream').click();
    assert.match(summary.textContent, /Entities: input, middle/);
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    const zoomBeforeNavigation = zoom.textContent;
    [...inspector.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'output')!.click();
    assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, 'output');
    assert.match(summary.textContent, /Entities: input, middle, output/);
    assert.notEqual(zoom.textContent, zoomBeforeNavigation);
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    const zoomBeforeAll = zoom.textContent;
    view('all').click();
    assert.notEqual(zoom.textContent, zoomBeforeAll);
    assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, 'output');
    assert.equal(view('all').getAttribute('aria-pressed'), 'true');
  } finally {
    dom.window.close();
  }
});

test('searching for another entity refocuses, fits, and centers the active dependency view', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'input', dependencies: [] },
        { name: 'middle', dependencies: ['input'] },
        { name: 'output', dependencies: ['middle'] },
        { name: 'isolated', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const result = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')].find(
        (button) => button.textContent === name,
      )!;
    result('middle').click();
    (document.querySelector('[data-view="upstream"]') as HTMLElement).click();
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    const zoom = (document.getElementById('zoom-level') as HTMLOutputElement).textContent;
    result('output').click();
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'output');
    assert.match(
      (document.getElementById('graph-summary') as HTMLElement).textContent,
      /Entities: input, middle, output/,
    );
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /isolated/);
    assert.notEqual((document.getElementById('zoom-level') as HTMLOutputElement).textContent, zoom);
    clickGraph(dom, 500, 300);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'output');
  } finally {
    dom.window.close();
  }
});

test('filtered search centers an endpoint while keeping its multi-hop dependency on canvas', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'a', dependencies: [] },
        { name: 'b', dependencies: ['a'] },
        { name: 'c', dependencies: ['b'] },
        { name: 'd', dependencies: ['c'] },
        { name: 'e', dependencies: ['d'] },
        { name: 'isolated', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const result = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')].find(
        (button) => button.textContent === name,
      )!;
    const selected = () => (document.querySelector('#selection-status h2') as HTMLElement).textContent;
    result('d').click();
    (document.querySelector('[data-view="upstream"]') as HTMLElement).click();
    const hit = (x: number, y: number) => {
      result('e').click();
      clickGraph(dom, x, y);
      return selected();
    };
    assert.equal(hit(500, 300), 'e');
    const seen = new Set();
    for (let x = 1; x < 1000; x += 10) seen.add(hit(x, 300));
    for (const name of ['a', 'b', 'c', 'd', 'e']) assert.ok(seen.has(name), `${name} is on canvas`);
    for (const [x, y] of [
      [1, 300],
      [999, 300],
      [500, 1],
      [500, 599],
    ]) {
      assert.equal(hit(x, y), 'e', 'dependency does not touch the canvas boundary');
    }
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /Entities: a, b, c, d, e/);
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /isolated/);
  } finally {
    dom.window.close();
  }
});

test('entity search matches full names case-insensitively without merging identities', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'DB.Raw.Orders', dependencies: ['external.Source'] },
        { name: 'db.raw.orders', dependencies: [] },
        { name: 'other', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const search = document.getElementById('entity-search') as HTMLInputElement;
    const results = document.getElementById('entity-results') as HTMLElement;
    const searchFor = (value: string) => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const resultNames = () => [...results.querySelectorAll<HTMLButtonElement>('button')].map((button) => button.title);
    searchFor('RAW.ORDER');
    assert.deepEqual(resultNames(), ['DB.Raw.Orders', 'db.raw.orders']);
    searchFor('EXTERNAL.source');
    assert.deepEqual(resultNames(), ['external.Source (undocumented)']);
    searchFor('not present');
    assert.equal(resultNames().length, 0);
    assert.match((document.getElementById('entity-search-status') as HTMLElement).textContent, /no matching entities/i);
    searchFor('');
    assert.equal(resultNames().length, 4);
  } finally {
    dom.window.close();
  }
});

test('graph name filter intersects dependency views and hides edges to nonmatching entities', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'DB.Raw.Orders', dependencies: [] },
        { name: 'db.mart.orders', dependencies: ['DB.Raw.Orders'] },
        { name: 'db.mart.customers', dependencies: ['db.mart.orders'] },
        { name: 'other.orders', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    const summary = document.getElementById('graph-summary') as HTMLElement;
    const status = document.getElementById('graph-filter-status') as HTMLElement;
    const setFilter = (value: string) => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const result = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')].find(
        (button) => button.title === name,
      )!;
    result('db.mart.orders').click();
    (document.querySelector('[data-view="connected"]') as HTMLElement).click();
    setFilter('  ORDERS  ');
    assert.match(summary.textContent, /Entities: DB\.Raw\.Orders, db\.mart\.orders/);
    assert.match(summary.textContent, /DB\.Raw\.Orders → db\.mart\.orders/);
    assert.doesNotMatch(summary.textContent, /customers|other\.orders/);
    assert.equal(document.querySelectorAll<HTMLButtonElement>('#entity-results button').length, 4);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'db.mart.orders');
    (document.querySelector('[data-view="downstream"]') as HTMLElement).click();
    assert.equal(filter.value, '  ORDERS  ');
    assert.match(summary.textContent, /Entities: db\.mart\.ordersRelationships: none/);
    setFilter('customers');
    assert.match(summary.textContent, /Entities: db\.mart\.customersRelationships: none/);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'db.mart.orders');
    (document.querySelector('[data-view="upstream"]') as HTMLElement).click();
    assert.equal(status.textContent, 'No matching entities.');
    (document.getElementById('fit') as HTMLButtonElement).click();
    setFilter('   ');
    assert.equal(status.textContent, '');
    assert.match(summary.textContent, /Entities: DB\.Raw\.Orders, db\.mart\.orders/);
  } finally {
    dom.window.close();
  }
});

test('selecting a nonmatching entity clears the graph filter from either navigation panel', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'input', dependencies: [] },
        { name: 'output', dependencies: ['input'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    const setFilter = (value: string) => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const result = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')].find(
        (button) => button.title === name,
      )!;
    setFilter('input');
    result('output').click();
    assert.equal(filter.value, '');
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'output');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /input → output/);
    setFilter('output');
    (document.querySelector('#selection-status .related-entity') as HTMLElement).click();
    assert.equal(filter.value, '');
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'input');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /input → output/);
    setFilter('input');
    result('input').click();
    assert.equal(filter.value, 'input');
  } finally {
    dom.window.close();
  }
});

test('filtering fits the matching graph node and leaves zoom unchanged when no entities match', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'first', dependencies: [] },
        { name: 'second', dependencies: ['first'] },
        { name: 'third', dependencies: ['second'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    const setFilter = (value: string) => {
      filter.value = value;
      filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    (document.getElementById('zoom-out') as HTMLButtonElement).click();
    const before = (document.getElementById('zoom-level') as HTMLOutputElement).textContent;
    setFilter('third');
    const fitted = (document.getElementById('zoom-level') as HTMLOutputElement).textContent;
    assert.notEqual(fitted, before);
    clickGraph(dom, 500, 300);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'third');
    setFilter('absent');
    assert.equal((document.getElementById('zoom-level') as HTMLOutputElement).textContent, fitted);
    assert.equal((document.getElementById('graph-filter-status') as HTMLElement).textContent, 'No matching entities.');
  } finally {
    dom.window.close();
  }
});

test('selecting a search result opens its details and centers that exact entity', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'DB.Raw', dependencies: ['missing'], description: 'Uppercase entity' },
        { name: 'db.raw', dependencies: [], description: 'Lowercase entity' },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')];
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    const zoom = (document.getElementById('zoom-level') as HTMLOutputElement).textContent;
    for (const [name, description] of [
      ['db.raw', 'Lowercase entity'],
      ['DB.Raw', 'Uppercase entity'],
      ['missing (undocumented)', 'Unknown'],
    ]) {
      buttons.find((button) => button.title === name)!.click();
      assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, name.replace(' (undocumented)', ''));
      assert.match(inspector.textContent, new RegExp(description));
      assert.equal((document.getElementById('zoom-level') as HTMLOutputElement).textContent, zoom);
      clickGraph(dom, 500, 300);
      assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, name.replace(' (undocumented)', ''));
    }
  } finally {
    dom.window.close();
  }
});

test('qualified entity labels stay short while preserving distinct identities and full names', async () => {
  const drawnText: string[] = [];
  const longName = 'a_very_long_table_name_that_will_not_fit_in_the_node';
  const dom = open(
    dataset({
      entities: [
        { name: 'sales.orders', dependencies: [] },
        { name: 'support.orders', dependencies: ['sales.orders'] },
        { name: `warehouse.schema.${longName}`, dependencies: [] },
      ],
    }),
    drawnText,
  );
  try {
    const document = dom.window.document;
    await new Promise((resolve) => dom.window.setTimeout(resolve, 100));
    assert.ok(drawnText.includes('orders'));
    assert.ok(drawnText.some((text) => text.endsWith('…') && longName.startsWith(text.slice(0, -1))));
    assert.ok(!drawnText.includes('sales.orders'));
    const results = [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')];
    assert.deepEqual(
      results.map((button) => (button.querySelector('.entity-result-name') as HTMLElement).textContent),
      ['orders', 'orders', longName],
    );
    assert.deepEqual(
      results.map((button) => (button.querySelector('.entity-result-prefix') as HTMLElement).textContent),
      ['sales', 'support', 'warehouse.schema'],
    );
    assert.equal(results[1].getAttribute('aria-label'), 'support.orders');
    assert.equal(results[1].title, 'support.orders');
    results[1].click();
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'support.orders');
    (document.querySelector('[data-view="upstream"]') as HTMLElement).click();
    assert.match(
      (document.getElementById('graph-summary') as HTMLElement).textContent,
      /sales\.orders → support\.orders/,
    );
    clickGraph(dom, 500, 300);
    assert.ok(
      ['sales.orders', 'support.orders'].includes(
        (document.querySelector('#selection-status h2') as HTMLElement).textContent,
      ),
    );
  } finally {
    dom.window.close();
  }
});

test('entity list can be collapsed and reopened without losing the search', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'orders', dependencies: [] },
        { name: 'customers', dependencies: [] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const list = document.getElementById('entity-list') as HTMLDetailsElement;
    const search = document.getElementById('entity-search') as HTMLInputElement;
    search.value = 'orders';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(list.open, true);
    (list.querySelector('summary') as HTMLElement).click();
    assert.equal(list.open, false);
    (list.querySelector('summary') as HTMLElement).click();
    assert.equal(list.open, true);
    assert.equal(search.value, 'orders');
    assert.deepEqual(
      [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')].map((button) => button.textContent),
      ['orders'],
    );
  } finally {
    dom.window.close();
  }
});

test('selecting a graph entity opens its inspector without changing the view', () => {
  const dom = open(
    dataset({
      entities: [{ name: 'warehouse.orders', dependencies: [], description: 'Order facts' }],
    }),
  );
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    assert.match(inspector.textContent, /select.*entity/i);
    const graph = document.getElementById('graph') as HTMLElement;
    const canvas = graph.querySelector('canvas') as HTMLElement;
    canvas.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 300 }));
    assert.match(graph.title, /warehouse\.orders/);
    assert.match(graph.title, /Order facts/);
    canvas.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }));
    assert.equal(graph.hasAttribute('title'), false);
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    const zoom = (document.getElementById('zoom-level') as HTMLOutputElement).textContent;
    clickGraph(dom, 500, 300);
    assert.match(inspector.textContent, /warehouse\.orders/);
    assert.match(inspector.textContent, /Order facts/);
    assert.equal((document.getElementById('zoom-level') as HTMLOutputElement).textContent, zoom);
  } finally {
    dom.window.close();
  }
});

test('Entity tooltips and accessible details show metadata as text', () => {
  const hostile = '<img src=x onerror="window.injected=true">';
  const dom = open(dataset({ entities: [{ name: hostile, description: hostile, owner: hostile, dependencies: [] }] }));
  try {
    const document = dom.window.document;
    const graph = document.getElementById('graph') as HTMLElement;
    graph
      .querySelector('canvas')!
      .dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 300 }));
    assert.match(graph.title, /Description: <img/);
    assert.match(graph.title, /owner: <img/);
    (document.querySelector('#entity-results button') as HTMLButtonElement).click();
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /owner/);
    assert.equal(document.querySelectorAll('#selection-status img').length, 0);
    assert.equal(dom.window.injected, undefined);
  } finally {
    dom.window.close();
  }
});

test('inspector displays ordered extra properties as safe text beneath a missing description', () => {
  const hostileKey = '<img src=x onerror="window.injectedMarkupRan=true">';
  const hostileValue = '</script><script>window.injectedMarkupRan=true</script>\n東京';
  const entity = JSON.parse(
    `{"name":"sales","dependencies":["missing"],"z":"plain text","10":10,"2":2,"documented":false,"empty":"","nil":null,"flag":true,"array":[1,"two"],"object":{"nested":[false,null]},"__proto__":"safe"}`,
  );
  entity[hostileKey] = hostileValue;
  const dom = open(dataset({ entities: [entity, { name: 'report', dependencies: ['sales'] }] }));
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    [...document.querySelectorAll<HTMLButtonElement>('#entity-results button')]
      .find((button) => button.title === 'sales')!
      .click();
    const description = inspector.querySelector('.inspector-details > section') as HTMLElement;
    assert.equal((description.querySelector('p') as HTMLElement).textContent, 'No description provided.');
    const extras = description.querySelector('.entity-extras') as HTMLElement;
    assert.deepEqual(
      [...extras.children].map((element) => [element.tagName, element.textContent]),
      [
        ['DT', '2'],
        ['DD', '2'],
        ['DT', '10'],
        ['DD', '10'],
        ['DT', 'z'],
        ['DD', 'plain text'],
        ['DT', 'documented'],
        ['DD', 'false'],
        ['DT', 'empty'],
        ['DD', ''],
        ['DT', 'nil'],
        ['DD', 'null'],
        ['DT', 'flag'],
        ['DD', 'true'],
        ['DT', 'array'],
        ['DD', '[1,"two"]'],
        ['DT', 'object'],
        ['DD', '{"nested":[false,null]}'],
        ['DT', '__proto__'],
        ['DD', 'safe'],
        ['DT', hostileKey],
        ['DD', hostileValue],
      ],
    );
    assert.equal(dom.window.getComputedStyle(extras.querySelector('dd') as HTMLElement).overflowWrap, 'anywhere');
    assert.equal(inspector.querySelectorAll('img, script').length, 0);
    assert.equal(dom.window.injectedMarkupRan, undefined);
    assert.equal(inspector.querySelector('.undocumented-badge') as HTMLElement, null);
    const related = (name: string) =>
      [...inspector.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent.includes(name))!;
    assert.ok(related('report'));
    related('missing').click();
    assert.match(inspector.textContent, /description.*unknown/i);
    assert.match(inspector.textContent, /dependencies.*unknown/i);
    assert.equal(inspector.querySelector('.entity-extras') as HTMLElement, null);
    related('sales').click();
    assert.equal(
      (inspector.querySelector('.entity-extras') as HTMLElement).lastElementChild!.textContent,
      hostileValue,
    );
    related('report').click();
    assert.equal(inspector.querySelector('.entity-extras') as HTMLElement, null);
  } finally {
    dom.window.close();
  }
});

test('inspector navigates direct relationships and identifies undocumented dependencies', () => {
  const description = 'Sales "quoted" 東京 </script><img src=x onerror=alert(1)>';
  const dom = open(
    dataset({
      entities: [
        { name: 'sales', dependencies: ['missing', 'missing'], description },
        { name: 'report', dependencies: ['sales'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    clickGraph(dom, 500, 300);
    assert.ok(inspector.textContent.includes(description));
    assert.equal(inspector.querySelectorAll('img').length, 0);
    const related = (name: string) =>
      [...inspector.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent.includes(name))!;
    const section = (name: string) =>
      [...inspector.querySelectorAll('section')].find(
        (item) => (item.querySelector('h3') as HTMLElement).textContent === name,
      )!;
    assert.match(section('Direct dependencies').textContent, /missing.*undocumented/i);
    assert.doesNotMatch(section('Direct dependencies').textContent, /report/);
    assert.match(section('Direct downstream entities').textContent, /report/);
    assert.doesNotMatch(section('Direct downstream entities').textContent, /missing/);
    assert.equal(
      [...inspector.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
        button.textContent.includes('missing'),
      ).length,
      1,
    );
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
  } finally {
    dom.window.close();
  }
});

test('empty dependency has an informative empty state', () => {
  const dom = open(dataset({ entities: [] }));
  assert.match((dom.window.document.getElementById('status') as HTMLElement).textContent, /no entities/i);
  dom.window.close();
});

test('unusable dependency file displays an error', () => {
  for (const html of [
    dataset({
      entities: [
        { name: 'good', dependencies: [] },
        { name: 'bad', dependencies: null },
      ],
    }),
    { raw: '{invalid' },
  ]) {
    const dom = open(html);
    assert.match((dom.window.document.getElementById('file-error') as HTMLElement).textContent, /error/i);
    dom.window.close();
  }
});

test('cyclic and invalid entity records show an error instead of a partial graph', () => {
  const invalid = [
    {
      entities: [
        { name: 'a', dependencies: ['b'] },
        { name: 'b', dependencies: ['a'] },
      ],
    },
    { entities: [{ name: 'a', dependencies: ['a'] }] },
    {
      entities: [
        { name: 'a', dependencies: [] },
        { name: 'a', dependencies: [] },
      ],
    },
    { entities: [{ name: ' a', dependencies: [] }] },
    { entities: [{ name: 'a', dependencies: [''] }] },
    { entities: [{ name: 'a', dependencies: [], description: null }] },
    { entities: null },
  ];
  for (const data of invalid) {
    const dom = open(dataset(data));
    assert.match(
      (dom.window.document.getElementById('file-error') as HTMLElement).textContent,
      /error/i,
      JSON.stringify(data),
    );
    dom.window.close();
  }
});

test('loaded dependency exposes the complete directed graph without a selection', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'DB.Raw', dependencies: [] },
        { name: 'db.raw', dependencies: ['DB.Raw', 'missing', 'missing'] },
        { name: 'output', dependencies: ['db.raw'] },
      ],
    }),
  );
  const summary = dom.window.document.getElementById('graph-summary') as HTMLElement;
  assert.ok(summary);
  assert.match(summary.textContent, /DB.Raw → db.raw/);
  assert.equal(summary.textContent.split('missing → db.raw').length - 1, 1);
  assert.match(summary.textContent, /missing \(undocumented\)/);
  assert.match(
    (dom.window.document.getElementById('selection-status') as HTMLElement).textContent,
    /no entity selected/i,
  );
  assert.equal((dom.window.document.getElementById('status') as HTMLElement).textContent, '');
  assert.equal((dom.window.document.querySelector('.controls') as HTMLElement).hidden, false);
  assert.ok(dom.window.document.querySelector('#graph canvas') as HTMLElement);
  dom.window.close();
});

test('zoom controls and reset change and restore the fitted view', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'input', dependencies: [] },
        { name: 'output', dependencies: ['input'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const zoom = document.getElementById('zoom-level') as HTMLOutputElement;
    assert.ok(zoom);
    const initial = zoom.textContent;
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    assert.ok(parseInt(zoom.textContent, 10) > parseInt(initial, 10));
    (document.getElementById('zoom-out') as HTMLButtonElement).click();
    assert.equal(zoom.textContent, initial);
    (document.getElementById('zoom-in') as HTMLButtonElement).click();
    (document.getElementById('fit') as HTMLButtonElement).click();
    assert.equal(zoom.textContent, initial);
  } finally {
    dom.window.close();
  }
});

test('wheel zoom changes the graph view', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'input', dependencies: [] },
        { name: 'output', dependencies: ['input'] },
      ],
    }),
  );
  try {
    const document = dom.window.document;
    const zoom = document.getElementById('zoom-level') as HTMLOutputElement;
    const initial = zoom.textContent;
    (document.getElementById('graph') as HTMLElement).dispatchEvent(
      new dom.window.WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: 500,
        clientY: 300,
        deltaY: -120,
      }),
    );
    assert.notEqual(zoom.textContent, initial);
  } finally {
    dom.window.close();
  }
});

test('loading retains Unicode and markup-like names without creating elements', () => {
  const name = '東京 "quoted" </script><img src=x onerror=alert(1)>';
  const dom = open(dataset({ entities: [{ name, dependencies: [], description: 'quote " and </script> é' }] }));
  try {
    const document = dom.window.document;
    assert.equal((document.getElementById('status') as HTMLElement).textContent, '');
    assert.ok((document.getElementById('graph-summary') as HTMLElement).textContent.includes(name));
    assert.equal(document.querySelectorAll('img').length, 0);
  } finally {
    dom.window.close();
  }
});

test('generated acceptance files support representative search and dependency navigation', () => {
  execFileSync(process.execPath, ['--import', 'tsx', 'test/acceptance-fixtures.ts']);
  const dom = open({ raw: fs.readFileSync('dist/dependency-acceptance.json', 'utf8') });
  try {
    const document = dom.window.document;
    assert.equal((document.getElementById('status') as HTMLElement).textContent, '');
    const search = document.getElementById('entity-search') as HTMLInputElement;
    const results = document.getElementById('entity-results') as HTMLElement;
    const inspector = document.getElementById('selection-status') as HTMLElement;
    const summary = document.getElementById('graph-summary') as HTMLElement;
    const searchFor = (value: string) => {
      search.value = value;
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const select = (name: string) =>
      [...results.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.title === name)!.click();

    assert.equal(results.querySelectorAll<HTMLButtonElement>('button').length, 201);
    assert.match(summary.textContent, /table_198 → table_199/);
    searchFor('db.raw');
    assert.deepEqual(
      [...results.querySelectorAll<HTMLButtonElement>('button')].map((button) => button.title),
      ['DB.Raw', 'db.raw'],
    );
    select('DB.Raw');
    (document.querySelector('[data-view="downstream"]') as HTMLElement).click();
    assert.match(summary.textContent, /table_3 → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    searchFor('table_4');
    select('table_4');
    const description =
      'Sales "quoted" 東京 </script><script>window.injectedMarkupRan = true</script><img src=x onerror="window.injectedMarkupRan = true">';
    assert.ok(inspector.textContent.includes(description));
    assert.equal(document.querySelectorAll('img').length, 0);
    assert.equal(dom.window.injectedMarkupRan, undefined);
    assert.equal(
      [...inspector.querySelectorAll<HTMLButtonElement>('button')].filter(
        (button) => button.textContent === 'missing (undocumented)',
      ).length,
      1,
    );
    (document.querySelector('[data-view="upstream"]') as HTMLElement).click();
    assert.match(summary.textContent, /DB.Raw → db.raw/);
    assert.match(summary.textContent, /table_3 → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    (document.querySelector('[data-view="connected"]') as HTMLElement).click();
    assert.match(summary.textContent, /DB.Raw → db.raw/);
    assert.match(summary.textContent, /missing → table_4/);
    assert.doesNotMatch(summary.textContent, /table_5/);
    [...inspector.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'missing (undocumented)')!
      .click();
    assert.match(inspector.textContent, /unknown/i);
    (document.querySelector('[data-view="downstream"]') as HTMLElement).click();
    assert.match(summary.textContent, /missing → table_4/);
    (document.querySelector('[data-view="all"]') as HTMLElement).click();
    assert.match(summary.textContent, /table_198 → table_199/);
    assert.equal((inspector.querySelector('h2') as HTMLElement).textContent, 'missing');
  } finally {
    dom.window.close();
  }

  const empty = open({ raw: fs.readFileSync('dist/dependency-acceptance-empty.json', 'utf8') });
  try {
    assert.match((empty.window.document.getElementById('status') as HTMLElement).textContent, /no entities/i);
  } finally {
    empty.window.close();
  }
});

test('pasting a Document exposes its unchanged JSON and invalid input preserves it', async () => {
  const dom = open(template());
  try {
    const document = dom.window.document;
    const raw =
      '{"entities":[{"name":"A","dependencies":["missing","missing"],"__proto__":{"safe":true}}],"meta":[null,0.1]}';
    const input = document.getElementById('paste-json') as HTMLTextAreaElement;
    input.value = raw;
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    const output = document.getElementById('document-json') as HTMLTextAreaElement;
    assert.deepEqual(JSON.parse(output.value), JSON.parse(raw));
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing/);
    let copied!: string;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
    });
    (document.getElementById('copy-document') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(copied), JSON.parse(raw));
    input.value = '{"entities":[],"x":1,"x":2}';
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    assert.match((document.getElementById('file-error') as HTMLElement).textContent, /duplicate/i);
    assert.deepEqual(JSON.parse(output.value), JSON.parse(raw));
  } finally {
    dom.window.close();
  }
});

test('paste supersedes pending file reads and download reloads the same empty Document', async () => {
  const dom = open(template(), [], true);
  try {
    const { document, FileReader } = dom.window;
    const readers: { result: string; onload: () => void }[] = [];
    dom.window.FileReader = class {
      result!: string;
      onload!: () => void;
      readAsText() {
        readers.push(this);
      }
    } as unknown as typeof dom.window.FileReader;
    loadFile(dom, '', 'old.json');
    const raw = '{"entities":[],"metadata":{"nested":[false,"yes",1e2]}}';
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = raw;
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    readers[0].result = '{"entities":[{"name":"stale","dependencies":[]}]}';
    readers[0].onload();
    assert.match((document.getElementById('status') as HTMLElement).textContent, /no entities/i);
    let blob!: Blob;
    let filename;
    dom.window.URL.createObjectURL = (value) => {
      blob = value as Blob;
      return 'blob:document';
    };
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = function () {
      filename = this.download;
    };
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal(filename, 'pasted-document.json');
    const saved = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    assert.deepEqual(JSON.parse(saved), JSON.parse(raw));
    loadFile(dom, '', filename);
    readers[1].result = saved;
    readers[1].onload();
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value),
      JSON.parse(raw),
    );
  } finally {
    dom.window.close();
  }
});

test('applying a JSON draft updates the graph and can be undone and redone', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const document = dom.window.document;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{"entities":[{"name":"B","dependencies":["missing"],"description":"Changed"}],"extra":true}';
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing → B/);
    (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /Changed/);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing → B/);
    assert.equal(JSON.parse(editor.value).extra, true);
  } finally {
    dom.window.close();
  }
});

test('invalid drafts cannot replace or be saved, and discarding restores the Document', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const document = dom.window.document;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{"entities":[],"n":9007199254740993}';
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('document-error') as HTMLElement).textContent, /accurately/i);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    assert.equal((document.getElementById('copy-document') as HTMLButtonElement).disabled, true);
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('discard-document') as HTMLButtonElement).click();
    assert.equal(JSON.parse(editor.value).entities[0].name, 'A');
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
  } finally {
    dom.window.close();
  }
});

test('download, undo and copy reflect saved state; replacement and leaving protect drafts', async () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    const setDraft = (value: string) => {
      editor.value = value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dirty = () => (document.getElementById('unsaved-indicator') as HTMLElement).textContent;
    let copied!: string;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => {
          copied = value;
        },
      },
    });
    dom.window.URL.createObjectURL = () => 'blob:document';
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    setDraft('{"entities":[{"name":"B","dependencies":[]}]}');
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    (document.getElementById('copy-document') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.equal(JSON.parse(copied).entities[0].name, 'B');
    assert.match(dirty(), /unsaved/i);
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal(dirty(), '');
    setDraft('{"entities":[{"name":"C","dependencies":[]}]}');
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    assert.match(dirty(), /unsaved/i);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal(dirty(), '');
    setDraft('{invalid');
    const leave = new Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(leave);
    assert.equal(leave.defaultPrevented, true);
    let confirmations = 0;
    dom.window.confirm = () => {
      confirmations++;
      return false;
    };
    loadFile(dom, '{"entities":[{"name":"D","dependencies":[]}]}', 'replacement.json');
    assert.equal(confirmations, 1);
    assert.equal(editor.value, '{invalid');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B/);
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = '{bad';
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    assert.equal(confirmations, 1);
    assert.equal(editor.value, '{invalid');
    dom.window.confirm = () => true;
    loadFile(dom, '{"entities":[]}', 'replacement.json');
    assert.equal((document.getElementById('undo-document') as HTMLButtonElement).disabled, true);
    assert.equal(dirty(), '');
    const cleanLeave = new Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(cleanLeave);
    assert.equal(cleanLeave.defaultPrevented, false);
  } finally {
    dom.window.close();
  }
});

test('Entity drafts block saving and selection until applied or discarded', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const input = document.getElementById('edit-entity-name') as HTMLInputElement;
    input.value = 'B';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    assert.match((document.getElementById('document-status') as HTMLElement).textContent, /apply or discard/i);
    (document.getElementById('inspector') as HTMLDetailsElement).open = false;
    (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
    assert.equal((document.getElementById('edit-entity-name') as HTMLInputElement).value, 'B');
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /apply or discard/i);
    assert.equal((document.getElementById('inspector') as HTMLDetailsElement).open, true);
    (document.getElementById('discard-entity-draft') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
    (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'B');
  } finally {
    dom.window.close();
  }
});

test('Direct dependency drafts remain accessible and block saving and other edits', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":["B"]},{"name":"B","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const input = document.getElementById('new-dependency-name') as HTMLInputElement;
    input.value = ' B';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
    assert.equal((document.getElementById('new-dependency-name') as HTMLInputElement).value, ' B');
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /apply or discard/i);
    (document.querySelector('button[aria-label="Remove Direct dependency B"]') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].dependencies,
      ['B'],
    );
    (document.getElementById('discard-dependency-draft') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
    (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'B');
  } finally {
    dom.window.close();
  }
});

test('replacing a Document preserves or clears inspector drafts with the confirmation decision', () => {
  for (const draftId of ['edit-entity-name', 'new-dependency-name']) {
    const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
    try {
      const { document, Event } = dom.window;
      (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
      const draft = document.getElementById(draftId) as HTMLInputElement;
      draft.value = 'draft';
      draft.dispatchEvent(new Event('input', { bubbles: true }));
      let confirmations = 0;
      dom.window.confirm = () => {
        confirmations++;
        return false;
      };
      loadFile(dom, '{"entities":[{"name":"B","dependencies":[]}]}');
      assert.equal(confirmations, 1);
      assert.equal((document.getElementById(draftId) as HTMLInputElement).value, 'draft');
      assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);

      dom.window.confirm = () => true;
      loadFile(dom, '{"entities":[{"name":"B","dependencies":[]}]}');
      assert.equal((document.getElementById('document-json') as HTMLTextAreaElement).disabled, false);
      assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
      assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
      (document.querySelector('#entity-results button[title="B"]') as HTMLButtonElement).click();
      const newDraft = document.getElementById(draftId) as HTMLInputElement;
      newDraft.value = 'another draft';
      newDraft.dispatchEvent(new Event('input', { bubbles: true }));
      assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    } finally {
      dom.window.close();
    }
  }
});

test('new Entity drafts block saving and survive graph edits until discarded', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const input = document.getElementById('new-entity-name') as HTMLInputElement;
    input.value = ' invalid ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    document
      .querySelector('#add-dependency-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /apply or discard/i);
    assert.equal(input.value, ' invalid ');
    (document.getElementById('discard-new-entity-draft') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
  } finally {
    dom.window.close();
  }
});

test('rejected empty form drafts warn on replacement and block saving until discarded', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    document
      .getElementById('add-dependency-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /nonblank/i);
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    const leave = new Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(leave);
    assert.equal(leave.defaultPrevented, true);
    let warned = false;
    dom.window.confirm = () => {
      warned = true;
      return false;
    };
    loadFile(dom, '{"entities":[]}');
    assert.equal(warned, true);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    (document.getElementById('discard-dependency-draft') as HTMLButtonElement).click();
    (document.getElementById('add-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    (document.getElementById('discard-new-entity-draft') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
  } finally {
    dom.window.close();
  }
});

test('Entity and Direct dependency editors keep validation and history independent', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const submit = (id: string) =>
      document.getElementById(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'B';
    submit('edit-entity-form');
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /already exists/i);
    submit('add-dependency-form');
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /apply or discard/i);
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /already exists/i);
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'Renamed';
    submit('edit-entity-form');
    (document.getElementById('new-dependency-name') as HTMLInputElement).value = 'B';
    submit('add-dependency-form');
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0], {
      name: 'Renamed',
      dependencies: ['B'],
    });
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0], {
      name: 'Renamed',
      dependencies: [],
    });
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].name,
      'A',
    );
  } finally {
    dom.window.close();
  }
});

test('adding Direct dependencies updates the graph and preserves undocumented references', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]},{"name":"B","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const add = (name: string) => {
      (document.getElementById('new-dependency-name') as HTMLInputElement).value = name;
      document
        .getElementById('add-dependency-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };
    add('B');
    add('missing');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B → A/);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing \(undocumented\)/);
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /missing \(undocumented\)/);
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [
        { name: 'A', dependencies: ['B', 'missing'] },
        { name: 'B', dependencies: [] },
      ],
    });
  } finally {
    dom.window.close();
  }
});

test('removing a Direct dependency removes its repeated entries but preserves other entries and metadata', () => {
  const raw =
    '{"entities":[{"name":"A","dependencies":["missing","B","missing","B"],"meta":{"x":1}},{"name":"B","dependencies":[]}],"other":true}';
  const dom = open({ raw });
  try {
    const document = dom.window.document;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    (document.querySelector('button[aria-label="Remove Direct dependency missing"]') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [
        { name: 'A', dependencies: ['B', 'B'], meta: { x: 1 } },
        { name: 'B', dependencies: [] },
      ],
      other: true,
    });
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /missing/);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B → A/);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value),
      JSON.parse(raw),
    );
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].dependencies,
      ['B', 'B'],
    );
  } finally {
    dom.window.close();
  }
});

test('invalid, duplicate and cyclic Direct dependencies leave the Document unchanged', () => {
  const raw =
    '{"entities":[{"name":"A","dependencies":["B","B"]},{"name":"B","dependencies":[]},{"name":"C","dependencies":["A"]}]}';
  const dom = open({ raw });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    const initial = editor.value;
    const input = document.getElementById('new-dependency-name') as HTMLInputElement;
    const form = document.getElementById('add-dependency-form') as HTMLFormElement;
    const submit = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };
    for (const invalid of ['', ' ', ' B', 'B ']) {
      submit(invalid);
      assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /nonblank.*whitespace/i);
      assert.equal(editor.value, initial);
    }
    submit('B');
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /already exists/i);
    for (const cycle of ['A', 'C']) {
      submit(cycle);
      assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /cycle/i);
      assert.equal(editor.value, initial);
    }
    submit('b');
    assert.deepEqual(JSON.parse(editor.value).entities[0].dependencies, ['B', 'B', 'b']);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /b \(undocumented\)/);
  } finally {
    dom.window.close();
  }
});

test('an unapplied JSON draft blocks adding and removing Direct dependencies', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":["B"]},{"name":"B","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{invalid';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('new-dependency-name') as HTMLInputElement).value = 'C';
    document
      .getElementById('add-dependency-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    (document.querySelector('button[aria-label="Remove Direct dependency B"]') as HTMLButtonElement).click();
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    assert.equal(editor.value, '{invalid');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B → A/);
    (document.getElementById('discard-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('dependency-error') as HTMLElement).textContent, '');
    (document.getElementById('discard-dependency-draft') as HTMLButtonElement).click();
    (document.querySelector('button[aria-label="Remove Direct dependency B"]') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse(editor.value).entities[0].dependencies, []);
  } finally {
    dom.window.close();
  }
});

test('Direct dependency edits survive copy, download, undo, redo and reload', async () => {
  const raw =
    '{"entities":[{"name":"A","dependencies":["B","B"],"metadata":[1,true]},{"name":"B","dependencies":[]}],"extra":{"kept":true}}';
  const dom = open(template(), [], true);
  try {
    const { document, Event, FileReader } = dom.window;
    const fileInput = document.getElementById('dependency-file') as HTMLInputElement;
    const load = (text: string) => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [new dom.window.File([text], 'dependencies.json', { type: 'application/json' })],
      });
      fileInput.dispatchEvent(new Event('change'));
    };
    load(raw);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    (document.getElementById('new-dependency-name') as HTMLInputElement).value = 'missing';
    document
      .getElementById('add-dependency-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const expected = JSON.parse(raw);
    expected.entities[0].dependencies.push('missing');
    let copied!: string;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: { writeText: async (value: string) => (copied = value) },
    });
    (document.getElementById('copy-document') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(copied), expected);
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    let blob!: Blob;
    dom.window.URL.createObjectURL = (value) => ((blob = value as Blob), 'blob:document');
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const saved = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    assert.deepEqual(JSON.parse(saved), expected);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value),
      JSON.parse(raw),
    );
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    load(saved);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), expected);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing \(undocumented\)/);
    assert.equal((document.getElementById('undo-document') as HTMLButtonElement).disabled, true);
  } finally {
    dom.window.close();
  }
});

test('adding an Entity to an empty Document immediately updates graph, details and JSON', () => {
  const dom = open({ raw: '{"entities":[],"extra":{"kept":true}}' });
  try {
    const { document, Event } = dom.window;
    (document.getElementById('new-entity-name') as HTMLInputElement).value = 'New';
    (document.getElementById('new-entity-description') as HTMLTextAreaElement).value = 'A description';
    (document.getElementById('add-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /New/);
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /A description/);
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [{ name: 'New', dependencies: [], description: 'A description' }],
      extra: { kept: true },
    });
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
  } finally {
    dom.window.close();
  }
});

test('Entity names must be nonblank, untrimmed and unique with case-sensitive matching', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const name = document.getElementById('new-entity-name') as HTMLInputElement;
    const form = document.getElementById('add-entity-form') as HTMLFormElement;
    const error = document.getElementById('add-entity-error') as HTMLElement;
    const submit = (value: string) => {
      name.value = value;
      name.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };
    for (const invalid of ['', ' ', ' A', 'A ']) {
      submit(invalid);
      assert.match(error.textContent, /nonblank.*whitespace/i);
      assert.deepEqual(
        JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities.map(
          (e: { name: string }) => e.name,
        ),
        ['A'],
      );
    }
    submit('A');
    assert.match(error.textContent, /already.*exist/i);
    submit('a');
    assert.equal(error.textContent, '');
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities.map(
        (e: { name: string }) => e.name,
      ),
      ['A', 'a'],
    );
  } finally {
    dom.window.close();
  }
});

test('an unapplied JSON draft blocks adding an Entity until the draft is resolved', () => {
  const dom = open({ raw: '{"entities":[{"name":"A","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{"entities":[{"name":"B","dependencies":[]}]}';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('new-entity-name') as HTMLInputElement).value = 'C';
    const form = document.getElementById('add-entity-form') as HTMLFormElement;
    const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit();
    assert.match((document.getElementById('add-entity-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    assert.equal(editor.value, '{"entities":[{"name":"B","dependencies":[]}]}');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    (document.getElementById('discard-new-entity-draft') as HTMLButtonElement).click();
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('add-entity-error') as HTMLElement).textContent, '');
    (document.getElementById('new-entity-name') as HTMLInputElement).value = 'C';
    submit();
    assert.deepEqual(
      JSON.parse(editor.value).entities.map((entity: { name: string }) => entity.name),
      ['B', 'C'],
    );
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse(editor.value).entities.map((entity: { name: string }) => entity.name),
      ['B'],
    );
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.deepEqual(
      JSON.parse(editor.value).entities.map((entity: { name: string }) => entity.name),
      ['B', 'C'],
    );
  } finally {
    dom.window.close();
  }
});

test('adding a documented Entity round-trips existing data and saved state', async () => {
  const raw = '{"entities":[{"name":"A","dependencies":["missing","missing"],"extra":{"x":1}}],"other":[true]}';
  const dom = open(template(), [], true);
  try {
    const { document, Event, FileReader } = dom.window;
    const input = document.getElementById('dependency-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new dom.window.File([raw], 'original.json', { type: 'application/json' })],
    });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    (document.getElementById('new-entity-name') as HTMLInputElement).value = 'missing';
    (document.getElementById('new-entity-description') as HTMLTextAreaElement).value =
      '<img src=x onerror=alert(1)> is text';
    (document.getElementById('add-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.equal(document.querySelector('#selection-status img') as HTMLElement, null);
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /<img src=x/);
    const expected = {
      entities: [
        { name: 'A', dependencies: ['missing', 'missing'], extra: { x: 1 } },
        { name: 'missing', dependencies: [], description: '<img src=x onerror=alert(1)> is text' },
      ],
      other: [true],
    };
    let copied!: string;
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: { writeText: async (value: string) => (copied = value) },
    });
    (document.getElementById('copy-document') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(copied), expected);
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    let blob!: Blob;
    dom.window.URL.createObjectURL = (value) => ((blob = value as Blob), 'blob:document');
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const saved = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    assert.deepEqual(JSON.parse(saved), expected);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /missing \(undocumented\)/);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    dom.window.confirm = () => true;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new dom.window.File([saved], 'saved.json', { type: 'application/json' })],
    });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), expected);
    (document.querySelector('#entity-results button[title="missing"]') as HTMLButtonElement).click();
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /<img src=x/);
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
  } finally {
    dom.window.close();
  }
});

test('editing a documented Entity updates references, details and JSON', () => {
  const dom = open(
    dataset({
      entities: [
        { name: 'A', description: 'Old', dependencies: [], extra: { keep: true } },
        { name: 'B', dependencies: ['A', 'A'] },
      ],
      metadata: 42,
    }),
  );
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'New';
    (document.getElementById('edit-entity-description') as HTMLTextAreaElement).value = 'Updated';
    (document.getElementById('edit-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [
        { name: 'New', description: 'Updated', dependencies: [], extra: { keep: true } },
        { name: 'B', dependencies: ['New', 'New'] },
      ],
      metadata: 42,
    });
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /New → B/);
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /Updated/);
  } finally {
    dom.window.close();
  }
});

test('deleting a referenced Entity offers retain, remove and cancel choices', () => {
  for (const choice of ['cancel', 'retain', 'remove']) {
    const original = {
      entities: [
        { name: 'A', dependencies: [], extra: 'preserved until deletion' },
        { name: 'B', dependencies: ['A', 'missing', 'A'], extra: [1, 2] },
      ],
      extra: { preserved: true },
    };
    const dom = open(dataset(original));
    try {
      const { document } = dom.window;
      (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
      (document.getElementById('delete-entity') as HTMLButtonElement).click();
      document.getElementById(`delete-entity-${choice}`)!.click();
      const result = JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value);
      if (choice === 'cancel') assert.deepEqual(result, original);
      else {
        assert.deepEqual(result, {
          entities: [
            { name: 'B', dependencies: choice === 'retain' ? ['A', 'missing', 'A'] : ['missing'], extra: [1, 2] },
          ],
          extra: { preserved: true },
        });
        if (choice === 'retain')
          assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A \(undocumented\)/);
      }
    } finally {
      dom.window.close();
    }
  }
});

test('renaming an undocumented Entity rejects invalid and occupied names without creating a record', () => {
  const original = {
    entities: [{ name: 'A', dependencies: ['missing', 'missing', 'other'], extra: 7 }],
    metadata: ['kept'],
  };
  const dom = open(dataset(original));
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="missing (undocumented)"]') as HTMLButtonElement).click();
    const input = document.getElementById('edit-entity-name') as HTMLInputElement;
    const form = document.getElementById('edit-entity-form') as HTMLFormElement;
    const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (const name of ['', ' ', ' invalid', 'invalid ', 'A', 'other']) {
      input.value = name;
      submit();
      assert.match(
        (document.getElementById('edit-entity-error') as HTMLElement).textContent,
        /nonblank|already exists/i,
      );
      assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    }
    input.value = 'a';
    submit();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [{ name: 'A', dependencies: ['a', 'a', 'other'], extra: 7 }],
      metadata: ['kept'],
    });
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /undocumented/i);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /a \(undocumented\)/);
  } finally {
    dom.window.close();
  }
});

test('removing an undocumented Entity requires confirmation and removes all references', () => {
  const original = {
    entities: [
      { name: 'A', dependencies: ['missing', 'other', 'missing'], extra: 1 },
      { name: 'B', dependencies: ['missing'] },
    ],
    metadata: { kept: true },
  };
  const dom = open(dataset(original));
  try {
    const { document } = dom.window;
    (document.querySelector('#entity-results button[title="missing (undocumented)"]') as HTMLButtonElement).click();
    (document.getElementById('delete-entity') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    (document.getElementById('delete-entity-cancel') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    (document.getElementById('delete-entity') as HTMLButtonElement).click();
    (document.getElementById('delete-entity-remove') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), {
      entities: [
        { name: 'A', dependencies: ['other'], extra: 1 },
        { name: 'B', dependencies: [] },
      ],
      metadata: { kept: true },
    });
    assert.doesNotMatch((document.getElementById('graph-summary') as HTMLElement).textContent, /missing/);
  } finally {
    dom.window.close();
  }
});

test('a JSON draft blocks Entity edits and removals until resolved', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{invalid';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'B';
    (document.getElementById('edit-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    (document.getElementById('delete-entity') as HTMLButtonElement).click();
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    assert.equal(editor.value, '{invalid');
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    (document.getElementById('discard-document') as HTMLButtonElement).click();
    (document.getElementById('edit-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B/);
  } finally {
    dom.window.close();
  }
});

test('downloaded Entity edits reload with saved state and support undo and redo', async () => {
  const original = { entities: [{ name: 'A', dependencies: ['missing'], extra: { x: 1 } }], metadata: true };
  const dom = open(template(), [], true);
  try {
    const { document, Event, FileReader } = dom.window;
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = JSON.stringify(original);
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    (document.querySelector('#entity-results button[title="missing (undocumented)"]') as HTMLButtonElement).click();
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'renamed';
    (document.getElementById('edit-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    const expected = { entities: [{ name: 'A', dependencies: ['renamed'], extra: { x: 1 } }], metadata: true };
    let blob!: Blob;
    dom.window.URL.createObjectURL = (value) => ((blob = value as Blob), 'blob:document');
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const saved = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const input = document.getElementById('dependency-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new dom.window.File([saved], 'saved.json', { type: 'application/json' })],
    });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), expected);
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /renamed \(undocumented\)/);
  } finally {
    dom.window.close();
  }
});

test('adding a JSON-valued Entity property updates details and the Document', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const document = dom.window.document;
    (document.getElementById('metadata-entity') as HTMLSelectElement).value = 'A';
    (document.getElementById('metadata-entity') as HTMLSelectElement).dispatchEvent(new dom.window.Event('change'));
    (document.getElementById('metadata-key') as HTMLInputElement).value = 'tags';
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    value.value = '["one", true, null, 2]';
    value.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (document.getElementById('metadata-form') as HTMLFormElement).dispatchEvent(
      new dom.window.Event('submit', { cancelable: true }),
    );
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].tags,
      ['one', true, null, 2],
    );
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /tags/);
  } finally {
    dom.window.close();
  }
});

test('invalid property drafts cannot be applied or downloaded', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const document = dom.window.document;
    const initial = (document.getElementById('document-json') as HTMLTextAreaElement).value;
    const key = document.getElementById('metadata-key') as HTMLInputElement;
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    const form = document.getElementById('metadata-form') as HTMLFormElement;
    key.value = 'metadata';
    key.dispatchEvent(new dom.window.Event('input'));
    for (const raw of ['1,"other":2', '{"x":1,"x":2}', '9007199254740993', '{']) {
      value.value = raw;
      value.dispatchEvent(new dom.window.Event('input'));
      form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      assert.match((document.getElementById('metadata-error') as HTMLElement).textContent, /error/i);
      assert.equal((document.getElementById('document-json') as HTMLTextAreaElement).value, initial);
      assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
      assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    }
    (document.getElementById('metadata-discard') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
  } finally {
    dom.window.close();
  }
});

test('a rejected empty property draft remains unsaved until discarded', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const document = dom.window.document;
    (document.getElementById('metadata-form') as HTMLFormElement).dispatchEvent(
      new dom.window.Event('submit', { cancelable: true }),
    );
    assert.match((document.getElementById('metadata-error') as HTMLElement).textContent, /error/i);
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, true);
    (document.getElementById('metadata-discard') as HTMLButtonElement).click();
    assert.equal((document.getElementById('download-document') as HTMLButtonElement).disabled, false);
  } finally {
    dom.window.close();
  }
});

test('properties preserve unusual keys and types through edit, removal and history', () => {
  const raw =
    '{"top":{"n":12.5},"entities":[{"name":"A","dependencies":["missing","missing"],"keep":true,"__proto__":{"x":1}},{"name":"B","dependencies":[],"untouched":null}]}';
  const dom = open({ raw });
  try {
    const { document, Event } = dom.window;
    const key = document.getElementById('metadata-key') as HTMLInputElement;
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    const property = document.getElementById('metadata-property') as HTMLSelectElement;
    const form = document.getElementById('metadata-form') as HTMLFormElement;
    const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
    const choose = (name: string) => {
      property.value = [...property.options].find((option) => option.textContent === name)!.value;
      property.dispatchEvent(new Event('change'));
    };
    const current = () => JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value);
    choose('__proto__');
    value.value = '{"html":"<img src=x onerror=alert(1)>","nested":[false,null,3.5]}';
    value.dispatchEvent(new Event('input'));
    submit();
    assert.deepEqual(current().entities[0].__proto__, {
      html: '<img src=x onerror=alert(1)>',
      nested: [false, null, 3.5],
    });
    assert.equal(document.querySelector('#selection-status img') as HTMLElement, null);
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /<img src=x/);
    choose('__proto__');
    (document.getElementById('metadata-remove') as HTMLButtonElement).click();
    assert.equal(Object.hasOwn(current().entities[0], '__proto__'), false);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal(Object.hasOwn(current().entities[0], '__proto__'), true);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal(Object.hasOwn(current().entities[0], '__proto__'), false);
    key.value = '__proto__';
    key.dispatchEvent(new Event('input'));
    value.value = '"new"';
    value.dispatchEvent(new Event('input'));
    submit();
    assert.equal(current().entities[0].__proto__, 'new');
    assert.deepEqual(current().entities[0].dependencies, ['missing', 'missing']);
    assert.deepEqual(current().entities[1], { name: 'B', dependencies: [], untouched: null });
    assert.deepEqual(current().top, { n: 12.5 });
  } finally {
    dom.window.close();
  }
});

test('property edits reject reserved and duplicate keys and conflict with JSON drafts', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [], existing: 1 }] }));
  try {
    const { document, Event } = dom.window;
    const key = document.getElementById('metadata-key') as HTMLInputElement;
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    const form = document.getElementById('metadata-form') as HTMLFormElement;
    const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
    value.value = 'false';
    value.dispatchEvent(new Event('input'));
    for (const name of ['name', 'dependencies', 'description', 'existing']) {
      key.value = name;
      key.dispatchEvent(new Event('input'));
      submit();
      assert.match((document.getElementById('metadata-error') as HTMLElement).textContent, /cannot|already exists/i);
      assert.equal(
        JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].name,
        'A',
      );
    }
    (document.getElementById('metadata-discard') as HTMLButtonElement).click();
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{"entities":[{"name":"B","dependencies":[]}]}';
    editor.dispatchEvent(new Event('input'));
    key.value = 'ok';
    key.dispatchEvent(new Event('input'));
    value.value = 'true';
    value.dispatchEvent(new Event('input'));
    submit();
    assert.match((document.getElementById('metadata-error') as HTMLElement).textContent, /apply or discard.*draft/i);
    assert.equal((document.getElementById('apply-document') as HTMLButtonElement).disabled, true);
    (document.getElementById('metadata-discard') as HTMLButtonElement).click();
    (document.getElementById('apply-document') as HTMLButtonElement).click();
    assert.equal(JSON.parse(editor.value).entities[0].name, 'B');
  } finally {
    dom.window.close();
  }
});

test('JSON-valued properties survive download and reload without changing unrelated data', async () => {
  const raw = '{"meta":{"value":0.125},"entities":[{"name":"A","dependencies":["missing","missing"],"keep":"yes"}]}';
  const dom = open(template(), [], true);
  try {
    const { document, Event, FileReader } = dom.window;
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = raw;
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    const key = document.getElementById('metadata-key') as HTMLInputElement;
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    for (const [name, json] of [
      ['', '"text"'],
      ['number', '42.5'],
      ['constructor', 'false'],
      ['nil', 'null'],
      ['array', '[1,"x"]'],
      ['object', '{"nested":true}'],
    ]) {
      key.value = name;
      key.dispatchEvent(new Event('input'));
      value.value = json;
      value.dispatchEvent(new Event('input'));
      (document.getElementById('metadata-form') as HTMLFormElement).dispatchEvent(
        new Event('submit', { cancelable: true }),
      );
      assert.equal((document.getElementById('metadata-error') as HTMLElement).textContent, '');
    }
    let blob!: Blob;
    dom.window.URL.createObjectURL = (data) => ((blob = data as Blob), 'blob:document');
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    (document.getElementById('download-document') as HTMLButtonElement).click();
    const saved = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    const expected = {
      meta: { value: 0.125 },
      entities: [
        {
          name: 'A',
          dependencies: ['missing', 'missing'],
          keep: 'yes',
          '': 'text',
          number: 42.5,
          constructor: false,
          nil: null,
          array: [1, 'x'],
          object: { nested: true },
        },
      ],
    };
    assert.deepEqual(JSON.parse(saved), expected);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = saved;
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), expected);
  } finally {
    dom.window.close();
  }
});

test('property drafts protect against replacement, leaving and other graph edits', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const { document, Event } = dom.window;
    (document.getElementById('metadata-value') as HTMLTextAreaElement).value = '{';
    (document.getElementById('metadata-value') as HTMLTextAreaElement).dispatchEvent(new Event('input'));
    const leaving = new Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(leaving);
    assert.equal(leaving.defaultPrevented, true);
    dom.window.confirm = () => false;
    (document.getElementById('paste-json') as HTMLTextAreaElement).value = '{"entities":[]}';
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /A/);
    (document.getElementById('new-entity-name') as HTMLInputElement).value = 'B';
    (document.getElementById('add-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    assert.match((document.getElementById('add-entity-error') as HTMLElement).textContent, /property draft/i);
    (document.getElementById('metadata-discard') as HTMLButtonElement).click();
    (document.getElementById('add-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    assert.match((document.getElementById('graph-summary') as HTMLElement).textContent, /B/);
  } finally {
    dom.window.close();
  }
});

test('property drafts block Entity edits and settings changes', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: [] }] }));
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    (document.getElementById('metadata-value') as HTMLTextAreaElement).value = '{';
    (document.getElementById('metadata-value') as HTMLTextAreaElement).dispatchEvent(new Event('input'));
    (document.getElementById('edit-entity-name') as HTMLInputElement).value = 'B';
    (document.getElementById('edit-entity-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /property draft/i);
    (document.getElementById('delete-entity') as HTMLButtonElement).click();
    (document.getElementById('delete-entity-remove') as HTMLButtonElement).click();
    assert.match((document.getElementById('edit-entity-error') as HTMLElement).textContent, /property draft/i);
    (document.getElementById('colours-enabled') as HTMLInputElement).click();
    assert.match((document.getElementById('colour-error') as HTMLElement).textContent, /property draft/i);
    (document.getElementById('compact-nodes') as HTMLInputElement).click();
    assert.match((document.getElementById('presentation-error') as HTMLElement).textContent, /property draft/i);
    assert.equal(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].name,
      'A',
    );
    assert.equal((document.getElementById('metadata-value') as HTMLTextAreaElement).value, '{');
  } finally {
    dom.window.close();
  }
});

test('property drafts block Direct dependency edits without losing the draft', () => {
  const dom = open(dataset({ entities: [{ name: 'A', dependencies: ['missing'] }] }));
  try {
    const { document, Event } = dom.window;
    (document.querySelector('#entity-results button[title="A"]') as HTMLButtonElement).click();
    const value = document.getElementById('metadata-value') as HTMLTextAreaElement;
    value.value = '{';
    value.dispatchEvent(new Event('input'));
    (document.getElementById('new-dependency-name') as HTMLInputElement).value = 'other';
    (document.getElementById('add-dependency-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /property draft/i);
    (document.querySelector('[aria-label="Remove Direct dependency missing"]') as HTMLElement).click();
    assert.match((document.getElementById('dependency-error') as HTMLElement).textContent, /property draft/i);
    assert.equal(value.value, '{');
    assert.deepEqual(
      JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value).entities[0].dependencies,
      ['missing'],
    );
  } finally {
    dom.window.close();
  }
});

test('typing in the middle of a JSON draft keeps the caret in place', () => {
  const dom = open({ raw: '{"entities":[]}' });
  try {
    const editor = dom.window.document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{"entities":[]}';
    editor.setSelectionRange(2, 2);
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(editor.selectionStart, 2);
  } finally {
    dom.window.close();
  }
});

test('appearance and tooltip preferences are Document edits restored on reopen and reset', () => {
  const dom = open(dataset({ entities: [{ name: 'one', description: 'detail', dependencies: [] }] }));
  try {
    const document = dom.window.document;
    (document.getElementById('settings-entry') as HTMLButtonElement).click();
    (document.getElementById('compact-nodes') as HTMLInputElement).click();
    (document.getElementById('tooltips-enabled') as HTMLInputElement).click();
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    const saved = editor.value;
    assert.deepEqual(JSON.parse(saved).settings, { appearance: { compact: true }, tooltips: { enabled: false } });
    const graph = document.getElementById('graph') as HTMLElement;
    graph
      .querySelector('canvas')!
      .dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 300 }));
    assert.equal(graph.hasAttribute('title'), false);
    (document.querySelector('#entity-results button') as HTMLButtonElement).click();
    assert.match((document.getElementById('selection-status') as HTMLElement).textContent, /detail/);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('tooltips-enabled') as HTMLInputElement).checked, true);
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('tooltips-enabled') as HTMLInputElement).checked, false);
    dom.window.confirm = () => true;
    loadFile(dom, saved);
    assert.equal((document.getElementById('compact-nodes') as HTMLInputElement).checked, true);
    assert.equal((document.getElementById('tooltips-enabled') as HTMLInputElement).checked, false);
    (document.getElementById('reset-presentation') as HTMLButtonElement).click();
    assert.equal(JSON.parse(editor.value).settings, undefined);
  } finally {
    dom.window.close();
  }
});

test('presentation settings protect drafts and conflicting existing JSON', () => {
  const dom = open(dataset({ entities: [], settings: { other: 7 } }));
  try {
    const document = dom.window.document;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value += ' ';
    editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (document.getElementById('compact-nodes') as HTMLInputElement).click();
    assert.equal((document.getElementById('compact-nodes') as HTMLInputElement).checked, false);
    assert.match((document.getElementById('presentation-error') as HTMLElement).textContent, /apply or discard/i);
    assert.ok(editor.value.endsWith(' '));
    (document.getElementById('discard-document') as HTMLButtonElement).click();
    (document.getElementById('compact-nodes') as HTMLInputElement).click();
    assert.deepEqual(JSON.parse(editor.value).settings, { other: 7, appearance: { compact: true } });
    (document.getElementById('reset-presentation') as HTMLButtonElement).click();
    assert.deepEqual(JSON.parse(editor.value).settings, { other: 7 });

    dom.window.confirm = () => true;
    for (const settings of ['foreign', { appearance: { custom: 1 } }, { tooltips: { enabled: 'yes' } }]) {
      const original = { entities: [], settings };
      loadFile(dom, JSON.stringify(original));
      assert.match((document.getElementById('presentation-error') as HTMLElement).textContent, /conflict.*preserved/i);
      assert.equal((document.getElementById('compact-nodes') as HTMLInputElement).disabled, true);
      assert.equal((document.getElementById('tooltips-enabled') as HTMLInputElement).disabled, true);
      assert.equal((document.getElementById('reset-presentation') as HTMLButtonElement).disabled, true);
      assert.deepEqual(JSON.parse(editor.value), original);
    }
  } finally {
    dom.window.close();
  }
});

test('colour changes are saved in the Document and restored when reopened offline', () => {
  const dom = open({ raw: '{"entities":[{"name":"raw","dependencies":[]}],"extra":{"keep":true}}' });
  try {
    const { document, Event } = dom.window;
    (document.getElementById('settings-entry') as HTMLButtonElement).click();
    const blue = document.querySelector('input[aria-label="Text for blue colour"]') as HTMLInputElement;
    blue.value = 'raw';
    blue.dispatchEvent(new Event('input', { bubbles: true }));
    const saved = (document.getElementById('document-json') as HTMLTextAreaElement).value;
    assert.deepEqual(JSON.parse(saved).extra, { keep: true });
    assert.deepEqual(JSON.parse(saved).settings.colours, { texts: { blue: 'raw' } });
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    dom.window.confirm = () => true;
    loadFile(dom, saved);
    (document.getElementById('settings-entry') as HTMLButtonElement).click();
    assert.equal((document.querySelector('input[aria-label="Text for blue colour"]') as HTMLInputElement).value, 'raw');
  } finally {
    dom.window.close();
  }
});

test('colour edits require resolving a JSON draft and retain the draft on rejection', () => {
  const dom = open({ raw: '{"entities":[{"name":"raw","dependencies":[]}]}' });
  try {
    const { document, Event } = dom.window;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    editor.value = '{invalid';
    editor.dispatchEvent(new Event('input'));
    const blue = document.querySelector('input[aria-label="Text for blue colour"]') as HTMLInputElement;
    blue.value = 'raw';
    blue.dispatchEvent(new Event('input'));
    assert.equal(blue.value, '');
    assert.equal(editor.value, '{invalid');
    assert.match((document.getElementById('colour-error') as HTMLElement).textContent, /apply or discard/i);
    (document.getElementById('discard-document') as HTMLButtonElement).click();
    blue.value = 'raw';
    blue.dispatchEvent(new Event('input'));
    assert.equal(JSON.parse(editor.value).settings.colours.texts.blue, 'raw');
  } finally {
    dom.window.close();
  }
});

test('colour priority and reset participate in history without persisting view state', () => {
  const dom = open({ raw: '{"entities":[{"name":"bronze.gold","dependencies":[]}],"settings":{"other":42}}' });
  try {
    const { document, Event } = dom.window;
    const editor = document.getElementById('document-json') as HTMLTextAreaElement;
    const json = () => JSON.parse(editor.value);
    (document.querySelector('#entity-results button') as HTMLButtonElement).click();
    const filter = document.getElementById('graph-filter') as HTMLInputElement;
    filter.value = 'bronze';
    filter.dispatchEvent(new Event('input'));
    (document.querySelector('button[aria-label="Move gold colour up"]') as HTMLButtonElement).click();
    (document.querySelector('button[aria-label="Move gold colour up"]') as HTMLButtonElement).click();
    assert.equal(json().settings.colours.order[0], 'gold');
    assert.equal(json().settings.other, 42);
    assert.equal(json().filter, undefined);
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'bronze.gold');
    assert.equal(filter.value, 'bronze');
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal(json().settings.colours.order[0], 'bronze');
    assert.equal((document.querySelector('#selection-status h2') as HTMLElement).textContent, 'bronze.gold');
    (document.getElementById('redo-document') as HTMLButtonElement).click();
    assert.equal(json().settings.colours.order[0], 'gold');
    (document.getElementById('reset-colours') as HTMLButtonElement).click();
    assert.deepEqual(json().settings, { other: 42 });
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal(json().settings.colours.order[0], 'gold');
    (document.getElementById('reset-colours') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
  } finally {
    dom.window.close();
  }
});

test('conflicting settings are explained and never overwritten', () => {
  for (const settings of ['foreign', { colours: { custom: 'data' }, other: 7 }, { colours: { rules: [] } }]) {
    const original = { entities: [], settings, extra: ['preserve'] };
    const dom = open({ raw: JSON.stringify(original) });
    try {
      const { document } = dom.window;
      (document.getElementById('settings-entry') as HTMLButtonElement).click();
      assert.match((document.getElementById('colour-error') as HTMLElement).textContent, /conflict/i);
      assert.equal((document.getElementById('colours-enabled') as HTMLInputElement).disabled, true);
      assert.equal((document.getElementById('reset-colours') as HTMLButtonElement).disabled, true);
      assert.deepEqual(JSON.parse((document.getElementById('document-json') as HTMLTextAreaElement).value), original);
    } finally {
      dom.window.close();
    }
  }
});

test('downloaded colour overrides reload offline and undo returns to the saved state', async () => {
  const dom = open(template(), [], true);
  try {
    const { document, FileReader } = dom.window;
    (document.getElementById('paste-json') as HTMLTextAreaElement).value =
      '{"entities":[{"name":"gold","dependencies":[]}]}';
    (document.getElementById('open-paste') as HTMLButtonElement).click();
    let blob!: Blob;
    let copied!: string;
    dom.window.URL.createObjectURL = (value) => {
      blob = value as Blob;
      return 'blob:document';
    };
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => {
          copied = value;
        },
      },
    });
    (document.getElementById('colours-enabled') as HTMLInputElement).click();
    (document.getElementById('copy-document') as HTMLButtonElement).click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(copied).settings.colours, { enabled: false });
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('download-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const reader = new FileReader();
    const downloaded = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    assert.deepEqual(JSON.parse(downloaded), JSON.parse(copied));
    (document.getElementById('reset-colours') as HTMLButtonElement).click();
    assert.match((document.getElementById('unsaved-indicator') as HTMLElement).textContent, /unsaved/i);
    (document.getElementById('undo-document') as HTMLButtonElement).click();
    assert.equal((document.getElementById('unsaved-indicator') as HTMLElement).textContent, '');
    const input = document.getElementById('dependency-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new dom.window.File([downloaded], 'colours.json')],
    });
    input.dispatchEvent(new dom.window.Event('change'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    assert.equal((document.getElementById('colours-enabled') as HTMLInputElement).checked, false);
  } finally {
    dom.window.close();
  }
});
