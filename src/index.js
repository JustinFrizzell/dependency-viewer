require('./style.css');
const cytoscape = require('cytoscape');
const dagre = require('cytoscape-dagre');
const { parseDocument, deriveGraph } = require('./data');
const { createDocumentSession } = require('./document-session');
const { setupEdgeMotion } = require('./edge-motion');
const { dependencyEdgeStyle } = require('./edge-style');
const { setupColourSettings, writeColourSettings } = require('./colour-settings');
const {
  readPresentationSettings,
  setupPresentationSettings,
  writePresentationSettings,
} = require('./presentation-settings');
const { setupImageExport } = require('./export-image');
cytoscape.use(dagre);

const fileInput = document.getElementById('dependency-file');
const fileError = document.getElementById('file-error');
const filePanel = document.getElementById('file-panel');
const mainTemplate = document.querySelector('main').cloneNode(true);
const footerTemplate = document.querySelector('footer').cloneNode(true);
document.getElementById('status').textContent = 'Choose a JSON file to view dependencies.';
let cleanupGraph = () => {};
let resizeGraph = () => {};
let selection = 0;
let session = null;
let documentName = 'dependency-document.json';
let colourControls;
let presentationControls;
let displayedGraph;

function setupDocumentColours(graph) {
  colourControls = setupColourSettings(document, graph, {
    data: JSON.parse(session.current()),
    change(enabled, rules) {
      const data = JSON.parse(session.current());
      session.replace(JSON.stringify(writeColourSettings(data, enabled, rules)));
      updateDocumentControls();
      document.getElementById('document-status').textContent = '';
    },
  });
  presentationControls = setupPresentationSettings(document, graph, {
    data: JSON.parse(session.current()),
    change(state) {
      const data = JSON.parse(session.current());
      session.replace(JSON.stringify(writePresentationSettings(data, state)));
      updateDocumentControls();
      document.getElementById('document-status').textContent = '';
    },
  });
}

function openDocument(raw, name) {
  let nextDocument;
  let graph;
  try {
    nextDocument = parseDocument(raw);
    graph = deriveGraph(nextDocument);
  } catch (error) {
    fileError.textContent = `Error: unusable dependency data. ${error.message}`;
    return;
  }
  if (session && session.isUnsaved() && !window.confirm('Replace the Document and lose unsaved changes and drafts?'))
    return;
  session = createDocumentSession(nextDocument);
  documentName = name;
  updateDocumentControls();
  document.getElementById('document-panel').hidden = false;
  document.getElementById('add-entity-panel').hidden = false;
  document.getElementById('add-entity-form').reset();
  document.getElementById('add-entity-error').textContent = '';
  document.getElementById('document-status').textContent = '';
  document.getElementById('document-error').textContent = '';
  renderGraph(graph);
  fileError.textContent = '';
  document.getElementById('file-name').textContent = name;
}

function renderGraph(graph, selectedName) {
  cleanupGraph();
  document.querySelector('main').replaceWith(mainTemplate.cloneNode(true));
  document.querySelector('footer').replaceWith(footerTemplate.cloneNode(true));
  displayedGraph = JSON.stringify(graph);
  filePanel.hidden = graph.entities.length > 0;
  document.getElementById('toggle-file-panel').setAttribute('aria-expanded', String(!filePanel.hidden));
  if (graph.entities.length) cleanupGraph = showGraph(graph, selectedName);
  else {
    cleanupGraph = () => {};
    resizeGraph = () => {};
    document.getElementById('status').textContent = 'No entities in this dependency dataset.';
    setupDocumentColours({ nodes: () => [] });
  }
}

function updateDocumentControls() {
  if (!session) return;
  const editor = document.getElementById('document-json');
  if (editor.value !== session.draft()) editor.value = session.draft();
  document.getElementById('unsaved-indicator').textContent = session.isUnsaved() ? '— Unsaved changes' : '';
  document.getElementById('apply-document').disabled = !session.hasDraft();
  document.getElementById('discard-document').disabled = !session.hasDraft();
  document.getElementById('undo-document').disabled = !session.canUndo();
  document.getElementById('redo-document').disabled = !session.canRedo();
  document.getElementById('download-document').disabled = session.hasDraft();
  document.getElementById('copy-document').disabled = session.hasDraft();
}

function refreshDocument(selectedName) {
  updateDocumentControls();
  document.getElementById('document-error').textContent = '';
  document.getElementById('document-status').textContent = '';
  const graph = deriveGraph(parseDocument(session.current()));
  if (JSON.stringify(graph) === displayedGraph) {
    colourControls.update(JSON.parse(session.current()));
    presentationControls.update(JSON.parse(session.current()));
  } else renderGraph(graph, selectedName);
}

document.getElementById('settings-entry').addEventListener('click', () => {
  const panel = document.getElementById('colour-settings');
  panel.open = true;
  panel.querySelector('summary').focus();
});

document.getElementById('add-entity-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('new-entity-name').value;
  const description = document.getElementById('new-entity-description').value;
  try {
    const documentData = parseDocument(session.current());
    if (!name || name.trim() !== name)
      throw new Error('Entity name must be nonblank and have no surrounding whitespace.');
    if (documentData.entities.some((entity) => entity.name === name))
      throw new Error('An Entity with this name already exists.');
    const entity = { name, dependencies: [] };
    if (description) entity.description = description;
    documentData.entities.push(entity);
    session.replace(JSON.stringify(documentData));
    event.target.reset();
    document.getElementById('add-entity-error').textContent = '';
    refreshDocument(name);
  } catch (error) {
    document.getElementById('add-entity-error').textContent = `Error: ${error.message}`;
  }
});
document.getElementById('add-entity-form').addEventListener('input', () => {
  document.getElementById('add-entity-error').textContent = '';
});

document.getElementById('document-json').addEventListener('input', (event) => {
  session.setDraft(event.target.value);
  document.getElementById('document-error').textContent = '';
  document.getElementById('document-status').textContent = '';
  updateDocumentControls();
});
document.getElementById('apply-document').addEventListener('click', () => {
  try {
    session.apply();
    document.getElementById('add-entity-error').textContent = '';
    refreshDocument();
  } catch (error) {
    document.getElementById('document-error').textContent = `Error: ${error.message}`;
  }
});
document.getElementById('discard-document').addEventListener('click', () => {
  session.discard();
  document.getElementById('add-entity-error').textContent = '';
  const dependencyError = document.getElementById('dependency-error');
  if (dependencyError) dependencyError.textContent = '';
  document.getElementById('document-error').textContent = '';
  updateDocumentControls();
});
for (const action of ['undo', 'redo']) {
  document.getElementById(`${action}-document`).addEventListener('click', () => {
    session[action]();
    refreshDocument();
  });
}
window.addEventListener('beforeunload', (event) => {
  if (!session || !session.isUnsaved()) return;
  event.preventDefault();
  event.returnValue = '';
});

document.getElementById('open-paste').addEventListener('click', () => {
  selection++;
  openDocument(document.getElementById('paste-json').value, 'pasted-document.json');
});

document.getElementById('copy-document').addEventListener('click', async () => {
  const output = document.getElementById('document-json');
  const status = document.getElementById('document-status');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'Document copied.';
  } catch {
    output.focus();
    output.select();
    status.textContent = 'Select and copy the Document JSON above.';
  }
});

document.getElementById('download-document').addEventListener('click', () => {
  if (!session || session.hasDraft()) return;
  const url = URL.createObjectURL(new Blob([session.current()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = documentName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  session.markSaved();
  updateDocumentControls();
  document.getElementById('document-status').textContent = 'Document download started.';
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  const current = ++selection;
  const reader = new FileReader();
  reader.onload = () => {
    if (current !== selection) return;
    openDocument(reader.result, file.name);
  };
  reader.onerror = () => {
    if (current === selection) fileError.textContent = 'Error: could not read the selected file.';
  };
  try {
    reader.readAsText(file);
  } catch {
    if (current === selection) fileError.textContent = 'Error: could not read the selected file. Choose it again.';
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('#toggle-file-panel');
  if (!button) return;
  filePanel.hidden = !filePanel.hidden;
  button.setAttribute('aria-expanded', String(!filePanel.hidden));
  resizeGraph();
});
filePanel.querySelector('details').addEventListener('toggle', () => resizeGraph());

document.getElementById('copy-example').addEventListener('click', async () => {
  const example = document.getElementById('format-example');
  const copyStatus = document.getElementById('copy-status');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(example.value);
    copyStatus.textContent = 'Copied.';
  } catch {
    example.focus();
    example.select();
    copyStatus.textContent = 'Select and copy the example above.';
  }
});

function showGraph(data, selectedName) {
  const summary = document.getElementById('graph-summary');
  const names = document.createElement('p');
  summary.appendChild(names);
  const relationships = document.createElement('p');
  summary.appendChild(relationships);

  function nameParts(name) {
    const dot = name.lastIndexOf('.');
    return dot < 0 || dot === name.length - 1
      ? { short: name, prefix: '' }
      : { short: name.slice(dot + 1), prefix: name.slice(0, dot) };
  }
  const ids = new Map(data.entities.map((entity, index) => [entity.name, `entity-${index}`]));
  const elements = data.entities
    .map((entity) => ({
      data: { id: ids.get(entity.name), name: entity.name, label: nameParts(entity.name).short },
      classes: entity.documented ? '' : 'undocumented',
    }))
    .concat(
      data.edges.map((edge, index) => ({
        data: { id: `edge-${index}`, source: ids.get(edge.source), target: ids.get(edge.target) },
      })),
    );
  let compact = false;
  try {
    compact = readPresentationSettings(JSON.parse(session.current())).compact;
  } catch {
    // Conflicting settings are reported by the controls; use the default presentation.
  }
  const graph = cytoscape({
    container: document.getElementById('graph'),
    elements,
    autounselectify: true,
    minZoom: 0.01,
    maxZoom: 4,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          shape: 'round-rectangle',
          width: compact ? 150 : 200,
          height: compact ? 40 : 54,
          'background-color': '#ffffff',
          'border-color': '#a8c6ce',
          'border-width': 2,
          color: '#204152',
          'font-size': 13,
          'font-weight': 600,
          'text-wrap': 'ellipsis',
          'text-max-width': compact ? 130 : 180,
          'text-halign': 'center',
          'text-valign': 'center',
        },
      },
      {
        selector: 'node.undocumented',
        style: {
          'border-style': 'dashed',
          'border-color': '#c08b3a',
          'background-color': '#fff9ec',
        },
      },
      { selector: 'node.inspected', style: { 'border-color': '#168a80', 'border-width': 4 } },
      { selector: 'edge', style: dependencyEdgeStyle },
      { selector: '.filtered-out', style: { display: 'none' } },
    ],
    layout: {
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 30,
      rankSep: 80,
      fit: true,
      padding: 45,
      animate: false,
    },
  });
  resizeGraph = () => graph.resize();
  document.getElementById('inspector').addEventListener('toggle', () => graph.resize());
  setupDocumentColours(graph);
  const imageExport = setupImageExport(window, document, graph);
  const entities = new Map(data.entities.map((entity) => [entity.name, entity]));
  const downstream = new Map(data.entities.map((entity) => [entity.name, []]));
  for (const edge of data.edges) downstream.get(edge.source).push(edge.target);
  const search = document.getElementById('entity-search');
  const results = document.getElementById('entity-results');
  const searchStatus = document.getElementById('entity-search-status');
  function updateResults() {
    const query = search.value.toLowerCase();
    const matches = data.entities.filter((entity) => entity.name.toLowerCase().includes(query));
    results.replaceChildren();
    for (const entity of matches) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const { short, prefix } = nameParts(entity.name);
      const fullName = entity.name + (entity.documented ? '' : ' (undocumented)');
      button.title = fullName;
      button.setAttribute('aria-label', fullName);
      const label = document.createElement('span');
      label.className = 'entity-result-name';
      label.textContent = short + (entity.documented ? '' : ' (undocumented)');
      button.appendChild(label);
      if (prefix) {
        const detail = document.createElement('span');
        detail.className = 'entity-result-prefix';
        detail.textContent = prefix;
        button.appendChild(detail);
      }
      button.addEventListener('click', () => {
        selectEntity(entity.name);
        const node = graph.getElementById(ids.get(entity.name));
        if (view !== 'all') {
          const bounds = graph.elements().not('.filtered-out').boundingBox();
          const { x, y } = node.position();
          const padding = Math.min(45, graph.width() / 4, graph.height() / 4);
          const halfWidth = Math.max(x - bounds.x1, bounds.x2 - x);
          const halfHeight = Math.max(y - bounds.y1, bounds.y2 - y);
          const zoom = Math.min(
            graph.zoom(),
            (graph.width() / 2 - padding) / halfWidth,
            (graph.height() / 2 - padding) / halfHeight,
          );
          graph.minZoom(Math.min(graph.minZoom(), zoom));
          graph.zoom(zoom);
        }
        graph.center(node);
      });
      item.appendChild(button);
      results.appendChild(item);
    }
    searchStatus.textContent = matches.length ? '' : 'No matching entities.';
  }
  search.addEventListener('input', updateResults);
  updateResults();
  document.getElementById('entity-list').hidden = false;
  const inspector = document.getElementById('selection-status');
  const views = document.getElementById('dependency-views');
  const graphFilter = document.getElementById('graph-filter');
  const filterStatus = document.getElementById('graph-filter-status');
  const viewButtons = [...views.querySelectorAll('[data-view]')];
  let selected = null;
  let view = 'all';
  const filterQuery = () => graphFilter.value.trim().toLowerCase();
  function reachable(start, neighbors) {
    const visited = new Set([start]);
    const pending = [start];
    for (let i = 0; i < pending.length; i++) {
      for (const name of neighbors(pending[i])) {
        if (!visited.has(name)) {
          visited.add(name);
          pending.push(name);
        }
      }
    }
    return visited;
  }
  function updateView(fit) {
    const visible = view === 'all' ? new Set(entities.keys()) : new Set([selected]);
    if (view === 'upstream' || view === 'connected') {
      for (const name of reachable(selected, (name) => entities.get(name).dependencies)) visible.add(name);
    }
    if (view === 'downstream' || view === 'connected') {
      for (const name of reachable(selected, (name) => downstream.get(name))) visible.add(name);
    }
    const query = filterQuery();
    for (const name of visible) {
      if (!name.toLowerCase().includes(query)) visible.delete(name);
    }
    graph.nodes().forEach((node) => node.toggleClass('filtered-out', !visible.has(node.data('name'))));
    graph
      .edges()
      .forEach((edge) =>
        edge.toggleClass(
          'filtered-out',
          !visible.has(edge.source().data('name')) || !visible.has(edge.target().data('name')),
        ),
      );
    names.textContent =
      'Entities: ' +
      data.entities
        .filter((entity) => visible.has(entity.name))
        .map((entity) => entity.name + (entity.documented ? '' : ' (undocumented)'))
        .join(', ');
    relationships.textContent =
      'Relationships: ' +
      (data.edges
        .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
        .map((edge) => `${edge.source} → ${edge.target}`)
        .join(', ') || 'none');
    filterStatus.textContent = query && !visible.size ? 'No matching entities.' : '';
    imageExport.update();
    for (const button of viewButtons) {
      button.disabled = button.dataset.view !== 'all' && selected === null;
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    if (fit && visible.size) graph.fit(graph.elements().not('.filtered-out'), 45);
  }
  graphFilter.addEventListener('input', () => updateView(true));
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      view = button.dataset.view;
      updateView(true);
    });
  }
  views.hidden = false;
  updateView(false);
  function selectEntity(name) {
    const entity = entities.get(name);
    const clearFilter = !name.toLowerCase().includes(filterQuery());
    if (clearFilter) graphFilter.value = '';
    selected = name;
    graph.nodes().removeClass('inspected');
    graph.getElementById(ids.get(name)).addClass('inspected');
    updateView(clearFilter || view !== 'all');
    inspector.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = entity.name;
    inspector.appendChild(heading);
    if (!entity.documented) {
      const badge = document.createElement('span');
      badge.className = 'undocumented-badge';
      badge.textContent = 'Undocumented entity';
      inspector.appendChild(badge);
    }
    const form = document.createElement('form');
    form.id = 'edit-entity-form';
    form.noValidate = true;
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'edit-entity-name';
    nameLabel.textContent = 'Entity name';
    const nameInput = document.createElement('input');
    nameInput.id = 'edit-entity-name';
    nameInput.value = name;
    nameInput.setAttribute('aria-describedby', 'edit-entity-error');
    form.append(nameLabel, nameInput);
    let descriptionInput;
    if (entity.documented) {
      const descriptionLabel = document.createElement('label');
      descriptionLabel.htmlFor = 'edit-entity-description';
      descriptionLabel.textContent = 'Description';
      descriptionInput = document.createElement('textarea');
      descriptionInput.id = 'edit-entity-description';
      descriptionInput.value = entity.description || '';
      descriptionInput.setAttribute('aria-describedby', 'edit-entity-error');
      form.append(descriptionLabel, descriptionInput);
    }
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Apply Entity changes';
    const error = document.createElement('p');
    error.id = 'edit-entity-error';
    error.setAttribute('role', 'alert');
    form.append(save, error);
    form.addEventListener('input', () => {
      error.textContent = '';
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const newName = nameInput.value;
        if (!newName || newName.trim() !== newName)
          throw new Error('Entity name must be nonblank and have no surrounding whitespace.');
        if (newName !== name && entities.has(newName)) throw new Error('An Entity with this name already exists.');
        const data = parseDocument(session.current());
        const record = data.entities.find((item) => item.name === name);
        if (record) {
          record.name = newName;
          if (descriptionInput.value !== (record.description || '')) record.description = descriptionInput.value;
        }
        for (const item of data.entities) {
          item.dependencies = item.dependencies.map((dependency) => (dependency === name ? newName : dependency));
        }
        session.replace(JSON.stringify(data));
        refreshDocument(newName);
        document.getElementById('edit-entity-name').focus();
      } catch (reason) {
        error.textContent = `Error: ${reason.message}`;
      }
    });
    inspector.appendChild(form);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.id = 'delete-entity';
    deleteButton.textContent = 'Remove Entity';
    const confirmation = document.createElement('fieldset');
    confirmation.hidden = true;
    const prompt = document.createElement('legend');
    prompt.textContent =
      entity.documented && downstream.get(name).length
        ? 'Remove this Entity and retain or remove its references?'
        : 'Remove this Entity and its references?';
    confirmation.appendChild(prompt);
    function choice(id, label, action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `delete-entity-${id}`;
      button.textContent = label;
      button.addEventListener('click', action);
      confirmation.appendChild(button);
    }
    function removeEntity(removeReferences) {
      try {
        const data = parseDocument(session.current());
        data.entities = data.entities.filter((item) => item.name !== name);
        if (removeReferences) {
          for (const item of data.entities)
            item.dependencies = item.dependencies.filter((dependency) => dependency !== name);
        }
        session.replace(JSON.stringify(data));
        refreshDocument();
        const target = document.getElementById('entity-list').hidden
          ? document.querySelector('#add-entity-panel summary')
          : document.querySelector('#entity-list summary');
        target.focus();
      } catch (reason) {
        error.textContent = `Error: ${reason.message}`;
      }
    }
    if (entity.documented && downstream.get(name).length) {
      choice('retain', 'Retain references as undocumented', () => removeEntity(false));
    }
    choice(
      'remove',
      entity.documented && downstream.get(name).length ? 'Remove references too' : 'Confirm removal',
      () => removeEntity(true),
    );
    choice('cancel', 'Cancel', () => {
      confirmation.hidden = true;
      deleteButton.focus();
    });
    deleteButton.addEventListener('click', () => {
      if (session.hasDraft()) {
        error.textContent = 'Error: Apply or discard the JSON draft before editing the graph.';
        return;
      }
      error.textContent = '';
      confirmation.hidden = false;
      confirmation.querySelector('button').focus();
    });
    inspector.append(deleteButton, confirmation);
    const details = document.createElement('div');
    details.className = 'inspector-details';
    const description = document.createElement('section');
    const descriptionHeading = document.createElement('h3');
    descriptionHeading.textContent = 'Description';
    const descriptionText = document.createElement('p');
    descriptionText.textContent = entity.documented ? entity.description || 'No description provided.' : 'Unknown';
    description.append(descriptionHeading, descriptionText);
    if (entity.extras && entity.extras.length) {
      const extras = document.createElement('dl');
      extras.className = 'entity-extras';
      for (const [key, value] of entity.extras) {
        const label = document.createElement('dt');
        label.textContent = key;
        const content = document.createElement('dd');
        content.textContent = typeof value === 'string' ? value : JSON.stringify(value);
        extras.append(label, content);
      }
      description.appendChild(extras);
    }
    details.appendChild(description);
    function relationshipSection(title, names, emptyText, remove) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      section.appendChild(heading);
      if (!names.length) {
        const empty = document.createElement('p');
        empty.textContent = emptyText;
        section.appendChild(empty);
      } else {
        const list = document.createElement('ul');
        for (const relatedName of names) {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'related-entity';
          button.textContent = relatedName + (entities.get(relatedName).documented ? '' : ' (undocumented)');
          button.addEventListener('click', () => selectEntity(relatedName));
          item.appendChild(button);
          if (remove) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.textContent = 'Remove';
            removeButton.setAttribute('aria-label', `Remove Direct dependency ${relatedName}`);
            removeButton.addEventListener('click', () => remove(relatedName));
            item.appendChild(removeButton);
          }
          list.appendChild(item);
        }
        section.appendChild(list);
      }
      return section;
    }
    const dependencyError = document.createElement('p');
    dependencyError.id = 'dependency-error';
    dependencyError.setAttribute('role', 'alert');
    const removeDependency = entity.documented
      ? (dependency) => {
          try {
            if (session.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
            const documentData = parseDocument(session.current());
            const record = documentData.entities.find((item) => item.name === name);
            record.dependencies = record.dependencies.filter((item) => item !== dependency);
            session.replace(JSON.stringify(documentData));
            refreshDocument(name);
            document.getElementById('new-dependency-name').focus();
          } catch (problem) {
            dependencyError.textContent = `Error: ${problem.message}`;
          }
        }
      : null;
    const dependencies = relationshipSection(
      'Direct dependencies',
      entity.dependencies,
      entity.documented ? 'No dependencies.' : 'Unknown',
      removeDependency,
    );
    if (entity.documented) {
      const form = document.createElement('form');
      form.id = 'add-dependency-form';
      form.noValidate = true;
      const label = document.createElement('label');
      label.htmlFor = 'new-dependency-name';
      label.textContent = 'Direct dependency name';
      const input = document.createElement('input');
      input.id = 'new-dependency-name';
      input.type = 'text';
      input.autocomplete = 'off';
      input.setAttribute('aria-describedby', 'dependency-error');
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Add dependency';
      form.append(label, input, submit, dependencyError);
      form.addEventListener('input', () => (dependencyError.textContent = ''));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
          if (session.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
          const dependency = input.value;
          if (!dependency || dependency.trim() !== dependency)
            throw new Error('Dependency name must be nonblank and have no surrounding whitespace.');
          const documentData = parseDocument(session.current());
          const record = documentData.entities.find((item) => item.name === name);
          if (record.dependencies.includes(dependency)) throw new Error('This Direct dependency already exists.');
          record.dependencies.push(dependency);
          session.replace(JSON.stringify(documentData));
          refreshDocument(name);
          document.getElementById('new-dependency-name').focus();
        } catch (problem) {
          dependencyError.textContent = `Error: ${problem.message}`;
        }
      });
      dependencies.appendChild(form);
    }
    details.append(
      dependencies,
      relationshipSection('Direct downstream entities', downstream.get(name), 'No downstream entities.'),
    );
    inspector.appendChild(details);
  }
  graph.on('tap', 'node', (event) => selectEntity(event.target.data('name')));
  graph.on('mouseover', 'node', (event) => {
    if (!presentationControls.tooltipsEnabled()) return;
    const entity = entities.get(event.target.data('name'));
    const lines = [
      entity.name,
      entity.documented ? `Description: ${entity.description || 'No description provided.'}` : 'Undocumented entity',
      `Direct dependencies: ${entity.documented ? entity.dependencies.join(', ') || 'None' : 'Unknown'}`,
      `Direct downstream entities: ${downstream.get(entity.name).join(', ') || 'None'}`,
    ];
    for (const [key, value] of entity.extras || []) {
      lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
    graph.container().title = lines.join('\n');
  });
  graph.on('mouseout', 'node', () => {
    graph.container().removeAttribute('title');
  });
  const zoomLevel = document.getElementById('zoom-level');
  const updateZoom = () => {
    zoomLevel.textContent = `${Math.round(graph.zoom() * 100)}%`;
  };
  graph.on('zoom', updateZoom);
  updateZoom();
  document.querySelector('.controls').hidden = false;
  const stopEdgeMotion = setupEdgeMotion(window, document, graph, document.getElementById('edge-motion'));
  document.getElementById('fit').addEventListener('click', () => {
    const visible = graph.elements().not('.filtered-out');
    if (visible.length) graph.fit(visible, 45);
  });
  function zoom(factor) {
    graph.zoom({
      level: graph.zoom() * factor,
      renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
    });
  }
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.25));
  if (selectedName && entities.has(selectedName)) selectEntity(selectedName);
  return () => {
    stopEdgeMotion();
    imageExport.cleanup();
    graph.destroy();
    resizeGraph = () => {};
  };
}
