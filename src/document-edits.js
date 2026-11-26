const { parseDocument, deriveGraph } = require('./data');

function editDocument(session, edit) {
  const data = parseDocument(session.current());
  edit(data);
  session.replace(JSON.stringify(data));
}

function validName(name, kind) {
  if (!name || name.trim() !== name)
    throw new Error(`${kind} name must be nonblank and have no surrounding whitespace.`);
}

function addEntity(session, name, description) {
  validName(name, 'Entity');
  editDocument(session, (data) => {
    if (data.entities.some((entity) => entity.name === name))
      throw new Error('An Entity with this name already exists.');
    const entity = { name, dependencies: [] };
    if (description) entity.description = description;
    data.entities.push(entity);
  });
}

function editEntity(session, name, newName, description) {
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

function removeEntity(session, name, removeReferences) {
  editDocument(session, (data) => {
    data.entities = data.entities.filter((entity) => entity.name !== name);
    if (removeReferences) {
      for (const entity of data.entities)
        entity.dependencies = entity.dependencies.filter((dependency) => dependency !== name);
    }
  });
}

function setProperty(session, name, key, value, isNew) {
  editDocument(session, (data) => {
    const entity = data.entities.find((item) => item.name === name);
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

function removeProperty(session, name, key) {
  editDocument(session, (data) => {
    const entity = data.entities.find((item) => item.name === name);
    delete entity[key];
  });
}

function editDependency(session, name, dependency, add) {
  if (add) validName(dependency, 'Dependency');
  editDocument(session, (data) => {
    const record = data.entities.find((entity) => entity.name === name);
    if (add) {
      if (record.dependencies.includes(dependency)) throw new Error('This Direct dependency already exists.');
      record.dependencies.push(dependency);
    } else {
      record.dependencies = record.dependencies.filter((item) => item !== dependency);
    }
  });
}

module.exports = { addEntity, editEntity, removeEntity, setProperty, removeProperty, editDependency };
