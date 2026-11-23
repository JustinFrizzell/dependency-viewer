const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');
const { setupColourSettings } = require('./colour-settings');

function open(t) {
  const dom = new JSDOM(fs.readFileSync('lineage-viewer/index.html', 'utf8'));
  const graph = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { data: { id: 'overlap', name: 'workspace.BRONZE.gold.orders' }, classes: 'undocumented inspected' },
      { data: { id: 'silver', name: 'workspace.silver.orders' } },
      { data: { id: 'other', name: 'workspace.raw.orders' }, classes: 'undocumented' },
    ],
    style: [
      { selector: 'node', style: { 'background-color': '#ffffff', 'border-color': '#c9dade', 'border-width': 2 } },
      { selector: 'node.undocumented', style: { 'background-color': '#fff9ec', 'border-color': '#c08b3a', 'border-style': 'dashed' } },
      { selector: 'node.inspected', style: { 'border-color': '#168a80', 'border-width': 4 } },
    ],
  });
  setupColourSettings(dom.window.document, graph);
  t.after(() => { graph.destroy(); dom.window.close(); });
  return { dom, document: dom.window.document, graph };
}

function input(dom, label, value) {
  const element = dom.window.document.querySelector(`input[aria-label="${label}"]`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function click(document, label) {
  document.querySelector(`button[aria-label="${label}"]`).click();
}

test('colours match full names case-insensitively and preserve status borders', t => {
  const { dom, document, graph } = open(t);
  const overlap = graph.getElementById('overlap');
  const other = graph.getElementById('other');
  assert.equal(document.getElementById('colour-settings').hidden, false);
  assert.equal(overlap.style('background-color'), 'rgb(233,201,173)');
  assert.equal(overlap.style('border-style'), 'dashed');
  assert.equal(overlap.style('border-color'), 'rgb(22,138,128)');
  assert.equal(other.style('background-color'), 'rgb(255,249,236)');

  input(dom, 'Text for blue colour', '  RAW  ');
  assert.equal(other.style('background-color'), 'rgb(204,228,244)');
  input(dom, 'Text for blue colour', '   ');
  assert.equal(other.style('background-color'), 'rgb(255,249,236)');
  input(dom, 'Text for blue colour', 'raw.*');
  assert.equal(other.style('background-color'), 'rgb(255,249,236)');
});

test('reordering changes priority and moves each colour with its text', t => {
  const { dom, document, graph } = open(t);
  const overlap = graph.getElementById('overlap');
  input(dom, 'Text for gold colour', 'GOLD');
  click(document, 'Move gold colour up');
  click(document, 'Move gold colour up');
  assert.equal(overlap.style('background-color'), 'rgb(249,227,161)');
  assert.equal(document.querySelector('#colour-rules input').value, 'GOLD');
  assert.equal(document.querySelector('button[aria-label="Move gold colour up"]').disabled, true);

  document.getElementById('reset-colours').click();
  assert.equal(overlap.style('background-color'), 'rgb(233,201,173)');
  assert.equal(document.querySelector('#colour-rules input').value, 'bronze');
  assert.equal(document.querySelector('input[aria-label="Text for gold colour"]').value, 'gold');
});

test('turning colours off restores existing fills and reset turns them back on', t => {
  const { document, graph } = open(t);
  const overlap = graph.getElementById('overlap');
  const silver = graph.getElementById('silver');
  document.getElementById('colours-enabled').click();
  assert.equal(overlap.style('background-color'), 'rgb(255,249,236)');
  assert.equal(silver.style('background-color'), 'rgb(255,255,255)');
  document.getElementById('reset-colours').click();
  assert.equal(document.getElementById('colours-enabled').checked, true);
  assert.equal(overlap.style('background-color'), 'rgb(233,201,173)');
});
