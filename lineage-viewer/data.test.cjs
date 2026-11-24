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

test('additional properties retain entry order and do not overwrite normalized fields', () => {
  const graph = parseLineage('{"tables":[{"name":"a","inputs":["missing","missing"],"z":null,"10":10,"2":2,"documented":false,"__proto__":{"safe":true},"extras":"original"}]}');
  assert.equal(graph.tables[0].documented, true);
  assert.deepEqual(graph.tables[0].inputs, ['missing']);
  assert.deepEqual(graph.tables[0].extras, [
    ['2', 2], ['10', 10], ['z', null], ['documented', false],
    ['__proto__', { safe: true }], ['extras', 'original'],
  ]);
  assert.deepEqual(graph.tables[1], { name: 'missing', inputs: [], documented: false });
});
