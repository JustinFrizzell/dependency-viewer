const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { setupImageExport } = require('./export-image');

function setup() {
  const dom = new JSDOM(`<select id="export-resolution"><option value="1">1</option><option value="2" selected>2</option><option value="4">4</option></select>
    <p id="export-dimensions"></p><button id="export-png"></button><p id="export-status"></p>`);
  const { window } = dom;
  const state = { visible: 1, width: 100, height: 50, options: null, resolve: null };
  window.Image = class {
    set src(value) { queueMicrotask(() => this.onload()); }
  };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect(...args) { state.fill = args; },
    drawImage(...args) { state.draw = args.slice(1); },
  });
  window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    state.canvasSize = [this.width, this.height];
    callback(new window.Blob());
  };
  const graph = {
    nodes: () => ({ not: () => ({ length: state.visible }) }),
    elements: () => ({ boundingBox: () => ({ w: state.width, h: state.height }) }),
    on: () => {},
    off: () => {},
    png: options => {
      state.options = options;
      return new Promise(resolve => { state.resolve = resolve; });
    },
  };
  const control = setupImageExport(window, window.document, graph);
  return { dom, state, control, document: window.document };
}

test('resolution and filtered bounds determine export size and limits', () => {
  const { dom, state, control, document } = setup();
  try {
    const resolution = document.getElementById('export-resolution');
    const button = document.getElementById('export-png');
    assert.equal(document.getElementById('export-dimensions').textContent, '360 × 260 px');
    resolution.value = '4';
    resolution.dispatchEvent(new dom.window.Event('change'));
    assert.equal(document.getElementById('export-dimensions').textContent, '720 × 520 px');
    state.visible = 0;
    control.update();
    assert.equal(button.disabled, true);
    state.visible = 1;
    state.width = 1969;
    control.update();
    assert.equal(button.disabled, true);
    assert.match(document.getElementById('export-status').textContent, /too large/i);
    state.width = 1920;
    state.height = 921;
    control.update();
    assert.equal(button.disabled, true);
    state.height = 920;
    control.update();
    assert.equal(button.disabled, false);
  } finally { control.cleanup(); dom.window.close(); }
});

test('exports a white full-graph PNG and keeps export disabled if the view becomes empty', async () => {
  const { dom, state, control, document } = setup();
  try {
    let download;
    dom.window.URL.createObjectURL = () => 'blob:test';
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = function () { download = this.download; };
    const button = document.getElementById('export-png');
    button.click();
    assert.equal(button.disabled, true);
    assert.deepEqual(state.options, {
      full: true, bg: '#ffffff', maxWidth: 200, maxHeight: 100, output: 'blob-promise',
    });
    state.visible = 0;
    control.update();
    state.resolve(new dom.window.Blob());
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(download, 'dependency-graph.png');
    assert.deepEqual(state.canvasSize, [360, 260]);
    assert.deepEqual(state.fill, [0, 0, 360, 260]);
    assert.deepEqual(state.draw, [80, 80]);
    assert.equal(button.disabled, true);
  } finally { control.cleanup(); dom.window.close(); }
});

test('reports export failures and suppresses downloads after the graph is replaced', async () => {
  const { dom, state, control, document } = setup();
  try {
    const button = document.getElementById('export-png');
    dom.window.URL.createObjectURL = () => { throw new Error('unavailable'); };
    button.click();
    state.resolve(new dom.window.Blob());
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.match(document.getElementById('export-status').textContent, /could not export/i);
    assert.equal(button.disabled, false);
    let downloaded = false;
    dom.window.URL.createObjectURL = () => { downloaded = true; return 'blob:test'; };
    button.click();
    control.cleanup();
    state.resolve(new dom.window.Blob());
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.equal(downloaded, false);
  } finally { control.cleanup(); dom.window.close(); }
});
