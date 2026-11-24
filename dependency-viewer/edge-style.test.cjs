const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dependencyEdgeStyle } = require('./edge-style');

test('taxi edges follow the actual horizontal source-to-target direction', () => {
  assert.equal(dependencyEdgeStyle['curve-style'], 'taxi');
  assert.equal(dependencyEdgeStyle['taxi-direction'], 'horizontal');
  assert.equal(dependencyEdgeStyle['target-arrow-shape'], 'triangle');
});
