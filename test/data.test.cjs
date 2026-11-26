const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseDependency } = require('../src/data');

test('demo revenue report connects to the documented daily revenue entity', () => {
  const graph = parseDependency(fs.readFileSync('test/fixtures/demo_data.json', 'utf8'));
  const name = 'workspace1.lakehouse.gold_mart.daily_revenue';
  const entity = graph.entities.find((item) => item.name === name);
  assert.equal(entity.documented, true);
  assert.deepEqual(entity.dependencies, ['workspace1.lakehouse.silver_intermediate.order_revenue']);
  assert.ok(graph.edges.some((edge) => edge.source === name && edge.target === 'workspace1.report.commerce_pulse'));
});

test('graph preserves case-sensitive entities and points distinct dependencies to their dependents', () => {
  const graph = parseDependency(
    JSON.stringify({
      entities: [
        { name: 'DB.Raw', dependencies: [] },
        { name: 'db.raw', dependencies: ['DB.Raw', 'missing', 'missing'] },
        { name: 'output', dependencies: ['db.raw'] },
      ],
    }),
  );
  assert.deepEqual(
    graph.entities.map((entity) => [entity.name, entity.documented]),
    [
      ['DB.Raw', true],
      ['db.raw', true],
      ['output', true],
      ['missing', false],
    ],
  );
  assert.deepEqual(graph.edges, [
    { source: 'DB.Raw', target: 'db.raw' },
    { source: 'missing', target: 'db.raw' },
    { source: 'db.raw', target: 'output' },
  ]);
});

test('entities can represent different kinds of things without special treatment', () => {
  const graph = parseDependency(
    JSON.stringify({
      entities: [
        { name: 'source table', dependencies: [] },
        { name: 'nightly process', dependencies: ['source table'] },
        { name: 'output table', dependencies: ['nightly process'] },
      ],
    }),
  );
  assert.deepEqual(graph.edges, [
    { source: 'source table', target: 'nightly process' },
    { source: 'nightly process', target: 'output table' },
  ]);
});

test('rejects the old schema and circular dependencies', () => {
  assert.throws(() => parseDependency('{"tables":[]}'), /entities array/);
  assert.throws(() => parseDependency('{"entities":[{"name":"a","inputs":[]}]}'), /dependency names/);
  assert.throws(
    () => parseDependency('{"entities":[{"name":"a","dependencies":["b"]},{"name":"b","dependencies":["a"]}]}'),
    /cycle/,
  );
});

test('additional properties retain entry order and do not overwrite normalized fields', () => {
  const graph = parseDependency(
    '{"entities":[{"name":"a","dependencies":["missing","missing"],"z":null,"10":10,"2":2,"documented":false,"__proto__":{"safe":true},"extras":"original"}]}',
  );
  assert.equal(graph.entities[0].documented, true);
  assert.deepEqual(graph.entities[0].dependencies, ['missing']);
  assert.deepEqual(graph.entities[0].extras, [
    ['2', 2],
    ['10', 10],
    ['z', null],
    ['documented', false],
    ['__proto__', { safe: true }],
    ['extras', 'original'],
  ]);
  assert.deepEqual(graph.entities[1], { name: 'missing', dependencies: [], documented: false });
});

test('rejects duplicate JSON keys and numbers that cannot round-trip accurately', () => {
  for (const raw of [
    '{"entities":[],"metadata":{"key":1,"\\u006bey":2}}',
    '{"entities":[],"number":9007199254740993}',
    '{"entities":[],"number":1e-400}',
  ]) {
    assert.throws(() => parseDependency(raw), /duplicate|number|precision/i);
  }
});

test('Document round-trips metadata and repeated dependencies without inventing Entity records', () => {
  const { parseDocument, deriveGraph } = require('../src/data');
  const raw =
    '{"__proto__":{"safe":true},"entities":[{"name":"A","dependencies":["missing","missing"],"metadata":{"constructor":[null,0.1,true]}}],"other":1.25}';
  const document = parseDocument(raw);
  assert.deepEqual(JSON.parse(JSON.stringify(document)), JSON.parse(raw));
  const graph = deriveGraph(document);
  assert.equal(graph.entities.length, 2);
  assert.deepEqual(graph.edges, [{ source: 'missing', target: 'A' }]);
  assert.equal(document.entities.length, 1);
  assert.deepEqual(document.entities[0].dependencies, ['missing', 'missing']);
});

test('excessively nested metadata is rejected with an actionable error', () => {
  const raw = '{"entities":[],"metadata":' + '['.repeat(12000) + 'null' + ']'.repeat(12000) + '}';
  assert.throws(() => parseDependency(raw), /nesting.*deep/i);
});
