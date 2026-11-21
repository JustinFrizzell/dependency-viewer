const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseLineage } = require('./data');

test('graph preserves case-sensitive tables and points distinct inputs to their outputs', () => {
  const graph = parseLineage(JSON.stringify({ tables: [
    { name: 'DB.Raw', inputs: [] },
    { name: 'db.raw', inputs: ['DB.Raw', 'missing', 'missing'] },
    { name: 'output', inputs: ['db.raw'] },
  ] }));
  assert.deepEqual(graph.tables.map(table => [table.name, table.documented]), [
    ['DB.Raw', true], ['db.raw', true], ['output', true], ['missing', false],
  ]);
  assert.deepEqual(graph.edges, [
    { source: 'DB.Raw', target: 'db.raw' },
    { source: 'missing', target: 'db.raw' },
    { source: 'db.raw', target: 'output' },
  ]);
});
