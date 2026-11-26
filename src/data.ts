import type { DependencyDocument, Graph, GraphEntity } from './document-types';

export function parseDependency(raw: string): Graph {
  const data = parseDocument(raw);
  return deriveGraph(data);
}

export function parseDocument(raw: string): DependencyDocument {
  const data = JSON.parse(raw);
  try {
    inspectJson(raw);
    JSON.stringify(data);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('JSON nesting is too deep to safely open and save; simplify the nested data.');
    }
    throw error;
  }
  deriveGraph(data);
  return data;
}

function inspectJson(raw: string) {
  let position = 0;
  const whitespace = () => {
    while (/\s/.test(raw[position] || '') && position < raw.length) position++;
  };
  function string() {
    const start = position++;
    while (raw[position] !== '"') {
      if (raw[position] === '\\') position++;
      position++;
    }
    position++;
    return JSON.parse(raw.slice(start, position));
  }
  function decimal(value: string) {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
    if (!match) throw new Error('Invalid JSON number.');
    let digits = (match[2] + (match[3] || '')).replace(/^0+/, '');
    if (!digits) return match[1] ? '-0' : '0';
    const trailing = (digits.match(/0+$/) || [''])[0].length;
    if (trailing) digits = digits.slice(0, -trailing);
    const exponent = BigInt(match[4] || '0') - BigInt((match[3] || '').length) + BigInt(trailing);
    return `${match[1]}${digits}e${exponent}`;
  }
  function value() {
    whitespace();
    const first = raw[position];
    if (first === '{') {
      position++;
      whitespace();
      const keys = new Set();
      while (raw[position] !== '}') {
        const key = string();
        if (keys.has(key)) throw new Error(`Duplicate JSON object key: ${key}`);
        keys.add(key);
        whitespace();
        position++;
        value();
        whitespace();
        if (raw[position] !== ',') break;
        position++;
        whitespace();
      }
      position++;
    } else if (first === '[') {
      position++;
      whitespace();
      while (raw[position] !== ']') {
        value();
        whitespace();
        if (raw[position] !== ',') break;
        position++;
      }
      position++;
    } else if (first === '"') {
      string();
    } else if (first === '-' || (first >= '0' && first <= '9')) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(position));
      if (!match) throw new Error('Invalid JSON number.');
      const number = match[0];
      position += number.length;
      const parsed = Number(number);
      if (!Number.isFinite(parsed) || decimal(number) !== decimal(JSON.stringify(parsed))) {
        throw new Error(`Number ${number} cannot be preserved accurately; change it or store it as a string.`);
      }
    } else {
      position += raw.startsWith('true', position) || raw.startsWith('null', position) ? 4 : 5;
    }
  }
  value();
}

export function deriveGraph(data: DependencyDocument): Graph {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.entities)) {
    throw new Error('Expected an object with an entities array.');
  }
  const names = new Set();
  const validName = (name: unknown) => typeof name === 'string' && name.length > 0 && name.trim() === name;
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
  const entities: GraphEntity[] = data.entities.map((entity) => ({
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
  const downstream = new Map<string, string[]>(entities.map((entity) => [entity.name, []]));
  for (const edge of edges) {
    incoming.set(edge.target, incoming.get(edge.target)! + 1);
    downstream.get(edge.source)!.push(edge.target);
  }
  const ready = entities.filter((entity) => incoming.get(entity.name) === 0).map((entity) => entity.name);
  for (let i = 0; i < ready.length; i++) {
    for (const target of downstream.get(ready[i])!) {
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  if (ready.length !== entities.length) throw new Error('Dependency graph contains a cycle.');
  return { entities, edges };
}
