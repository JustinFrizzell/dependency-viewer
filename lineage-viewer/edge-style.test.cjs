const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lineageEdgeStyle } = require('./edge-style');

test('taxi edges follow the actual horizontal source-to-target direction', () => {
  assert.equal(lineageEdgeStyle['curve-style'], 'taxi');
  assert.equal(lineageEdgeStyle['taxi-direction'], 'horizontal');
  assert.equal(lineageEdgeStyle['target-arrow-shape'], 'triangle');
});
