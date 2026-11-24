const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDependency } = require('./data');

test('graph preserves case-sensitive entities and points distinct dependencies to their dependents', () => {
  const graph = parseDependency(JSON.stringify({ entities: [
    { name: 'DB.Raw', dependencies: [] },
    { name: 'db.raw', dependencies: ['DB.Raw', 'missing', 'missing'] },
    { name: 'output', dependencies: ['db.raw'] },
  ] }));
  assert.deepEqual(graph.entities.map(entity => [entity.name, entity.documented]), [
    ['DB.Raw', true], ['db.raw', true], ['output', true], ['missing', false],
  ]);
  assert.deepEqual(graph.edges, [
    { source: 'DB.Raw', target: 'db.raw' },
    { source: 'missing', target: 'db.raw' },
    { source: 'db.raw', target: 'output' },
  ]);
});

test('entities can represent different kinds of things without special treatment', () => {
  const graph = parseDependency(JSON.stringify({ entities: [
    { name: 'source table', dependencies: [] },
    { name: 'nightly process', dependencies: ['source table'] },
    { name: 'output table', dependencies: ['nightly process'] },
  ] }));
  assert.deepEqual(graph.edges, [
    { source: 'source table', target: 'nightly process' },
    { source: 'nightly process', target: 'output table' },
  ]);
});

test('rejects the old schema and circular dependencies', () => {
  assert.throws(() => parseDependency('{"tables":[]}'), /entities array/);
  assert.throws(() => parseDependency('{"entities":[{"name":"a","inputs":[]}]}'), /dependency names/);
  assert.throws(() => parseDependency('{"entities":[{"name":"a","dependencies":["b"]},{"name":"b","dependencies":["a"]}]}'), /cycle/);
});

test('additional properties retain entry order and do not overwrite normalized fields', () => {
  const graph = parseDependency('{"entities":[{"name":"a","dependencies":["missing","missing"],"z":null,"10":10,"2":2,"documented":false,"__proto__":{"safe":true},"extras":"original"}]}');
  assert.equal(graph.entities[0].documented, true);
  assert.deepEqual(graph.entities[0].dependencies, ['missing']);
  assert.deepEqual(graph.entities[0].extras, [
    ['2', 2], ['10', 10], ['z', null], ['documented', false],
    ['__proto__', { safe: true }], ['extras', 'original'],
  ]);
  assert.deepEqual(graph.entities[1], { name: 'missing', dependencies: [], documented: false });
});
