function parseDependency(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.entities)) {
    throw new Error('Expected an object with an entities array.');
  }
  const names = new Set();
  const validName = (name) => typeof name === 'string' && name.length > 0 && name.trim() === name;
  for (const entity of data.entities) {
    if (
      !entity ||
      typeof entity !== 'object' ||
      Array.isArray(entity) ||
      !validName(entity.name) ||
      !Array.isArray(entity.dependencies) ||
      !entity.dependencies.every(validName) ||
      ('description' in entity && typeof entity.description !== 'string')
    ) {
      throw new Error(
        'Each entity needs a valid name, an array of valid dependency names, and an optional string description.',
      );
    }
    if (names.has(entity.name)) throw new Error(`Duplicate entity: ${entity.name}`);
    names.add(entity.name);
  }
  const entities = data.entities.map((entity) => ({
    name: entity.name,
    description: entity.description,
    dependencies: [...new Set(entity.dependencies)],
    documented: true,
    extras: Object.entries(entity).filter(([key]) => !['name', 'description', 'dependencies'].includes(key)),
  }));
  const edges = [];
  for (const entity of entities.slice()) {
    for (const dependency of entity.dependencies) {
      if (!names.has(dependency)) {
        names.add(dependency);
        entities.push({ name: dependency, dependencies: [], documented: false });
      }
      edges.push({ source: dependency, target: entity.name });
    }
  }
  const incoming = new Map(entities.map((entity) => [entity.name, 0]));
  const downstream = new Map(entities.map((entity) => [entity.name, []]));
  for (const edge of edges) {
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    downstream.get(edge.source).push(edge.target);
  }
  const ready = entities.filter((entity) => incoming.get(entity.name) === 0).map((entity) => entity.name);
  for (let i = 0; i < ready.length; i++) {
    for (const target of downstream.get(ready[i])) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  if (ready.length !== entities.length) throw new Error('Dependency graph contains a cycle.');
  return { entities, edges };
}

module.exports = { parseDependency };
