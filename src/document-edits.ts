import { parseDocument, deriveGraph } from './data';
import type { DependencyDocument, Entity } from './document-types';
import type { DocumentSession } from './document-session';

function editDocument(session: DocumentSession, edit: (data: DependencyDocument) => void) {
  const data = parseDocument(session.current());
  edit(data);
  session.replace(JSON.stringify(data));
}

function validName(name: string, kind: string) {
  if (!name || name.trim() !== name)
    throw new Error(`${kind} name must be nonblank and have no surrounding whitespace.`);
}

export function addEntity(session: DocumentSession, name: string, description: string) {
  validName(name, 'Entity');
  editDocument(session, (data) => {
    if (data.entities.some((entity) => entity.name === name))
      throw new Error('An Entity with this name already exists.');
    const entity: Entity = { name, dependencies: [] };
    if (description) entity.description = description;
    data.entities.push(entity);
  });
}

export function editEntity(session: DocumentSession, name: string, newName: string, description: string | undefined) {
  validName(newName, 'Entity');
  editDocument(session, (data) => {
    if (newName !== name && deriveGraph(data).entities.some((entity) => entity.name === newName))
      throw new Error('An Entity with this name already exists.');
    const record = data.entities.find((entity) => entity.name === name);
    if (record) {
      record.name = newName;
      if (description !== (record.description || '')) record.description = description;
    }
    for (const entity of data.entities) {
      entity.dependencies = entity.dependencies.map((dependency) => (dependency === name ? newName : dependency));
    }
  });
}

export function removeEntity(session: DocumentSession, name: string, removeReferences: boolean) {
  editDocument(session, (data) => {
    data.entities = data.entities.filter((entity) => entity.name !== name);
    if (removeReferences) {
      for (const entity of data.entities)
        entity.dependencies = entity.dependencies.filter((dependency) => dependency !== name);
    }
  });
}

export function setProperty(session: DocumentSession, name: string, key: string, value: string, isNew: boolean) {
  editDocument(session, (data) => {
    const entity = data.entities.find((item) => item.name === name)!;
    if (['name', 'dependencies', 'description'].includes(key))
      throw new Error('Required Entity fields cannot be edited as properties.');
    if (isNew && Object.hasOwn(entity, key)) throw new Error('This property already exists; select it to change it.');
    JSON.parse(value);
    const parsed = parseDocument(`{"entities":[{"name":"validation","dependencies":[],"value":${value}}]}`);
    Object.defineProperty(entity, key, {
      value: parsed.entities[0].value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
}

export function removeProperty(session: DocumentSession, name: string, key: string) {
  editDocument(session, (data) => {
    const entity = data.entities.find((item) => item.name === name)!;
    delete entity[key];
  });
}

export function editDependency(session: DocumentSession, name: string, dependency: string, add: boolean) {
  if (add) validName(dependency, 'Dependency');
  editDocument(session, (data) => {
    const record = data.entities.find((entity) => entity.name === name)!;
    if (add) {
      if (record.dependencies.includes(dependency)) throw new Error('This Direct dependency already exists.');
      record.dependencies.push(dependency);
    } else {
      record.dependencies = record.dependencies.filter((item) => item !== dependency);
    }
  });
}
