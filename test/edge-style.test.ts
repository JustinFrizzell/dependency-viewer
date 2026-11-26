import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { dependencyEdgeStyle } from '../src/edge-style';

test('taxi edges follow the actual horizontal source-to-target direction', () => {
  assert.equal(dependencyEdgeStyle['curve-style'], 'taxi');
  assert.equal(dependencyEdgeStyle['taxi-direction'], 'horizontal');
  assert.equal(dependencyEdgeStyle['target-arrow-shape'], 'triangle');
});
