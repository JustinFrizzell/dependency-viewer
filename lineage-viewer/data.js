function parseLineage(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.tables)) {
    throw new Error('Expected an object with a tables array.');
  }
  const names = new Set();
  const validName = name => typeof name === 'string' && name.length > 0 && name.trim() === name;
  for (const table of data.tables) {
    if (!table || typeof table !== 'object' || Array.isArray(table) || !validName(table.name) || !Array.isArray(table.inputs) || !table.inputs.every(validName) || ('description' in table && typeof table.description !== 'string')) {
      throw new Error('Each table needs a valid name, an array of valid input names, and an optional string description.');
    }
    if (names.has(table.name)) throw new Error(`Duplicate table: ${table.name}`);
    names.add(table.name);
  }
  const tables = data.tables.map(table => ({
    name: table.name,
    description: table.description,
    inputs: [...new Set(table.inputs)],
    documented: true,
    extras: Object.entries(table).filter(([key]) => !['name', 'description', 'inputs'].includes(key)),
  }));
  const edges = [];
  for (const table of tables.slice()) {
    for (const input of table.inputs) {
      if (!names.has(input)) {
        names.add(input);
        tables.push({ name: input, inputs: [], documented: false });
      }
      edges.push({ source: input, target: table.name });
    }
  }
  const incoming = new Map(tables.map(table => [table.name, 0]));
  const downstream = new Map(tables.map(table => [table.name, []]));
  for (const edge of edges) {
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    downstream.get(edge.source).push(edge.target);
  }
  const ready = tables.filter(table => incoming.get(table.name) === 0).map(table => table.name);
  for (let i = 0; i < ready.length; i++) {
    for (const target of downstream.get(ready[i])) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  if (ready.length !== tables.length) throw new Error('Lineage contains a cycle.');
  return { tables, edges };
}

module.exports = { parseLineage };
