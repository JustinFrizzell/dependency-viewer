require('./style.css');
const cytoscape = require('cytoscape');
const dagre = require('cytoscape-dagre');
const { parseDependency } = require('./data');
const { setupEdgeMotion } = require('./edge-motion');
const { dependencyEdgeStyle } = require('./edge-style');
const { setupColourSettings } = require('./colour-settings');
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

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = '';
  const current = ++selection;
  const reader = new FileReader();
  reader.onload = () => {
    if (current !== selection) return;
    let data;
    try {
      data = parseDependency(reader.result);
    } catch (error) {
      fileError.textContent = `Error: unusable dependency data. ${error.message}`;
      return;
    }
    cleanupGraph();
    document.querySelector('main').replaceWith(mainTemplate.cloneNode(true));
    document.querySelector('footer').replaceWith(footerTemplate.cloneNode(true));
    filePanel.hidden = data.entities.length > 0;
    document.getElementById('toggle-file-panel').setAttribute('aria-expanded', String(!filePanel.hidden));
    fileError.textContent = '';
    document.getElementById('file-name').textContent = file.name;
    if (data.entities.length) cleanupGraph = showGraph(data);
    else {
      cleanupGraph = () => {};
      document.getElementById('status').textContent = 'No entities in this dependency dataset.';
    }
  };
  reader.onerror = () => {
    if (current === selection) fileError.textContent = 'Error: could not read the selected file.';
  };
  reader.readAsText(file);
});

document.addEventListener('click', event => {
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

function showGraph(data) {
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
  const elements = data.entities.map(entity => ({
    data: { id: ids.get(entity.name), name: entity.name, label: nameParts(entity.name).short },
    classes: entity.documented ? '' : 'undocumented',
  })).concat(data.edges.map((edge, index) => ({
    data: { id: `edge-${index}`, source: ids.get(edge.source), target: ids.get(edge.target) },
  })));
  const graph = cytoscape({
    container: document.getElementById('graph'),
    elements,
    autounselectify: true,
    minZoom: 0.01,
    maxZoom: 4,
    style: [
      { selector: 'node', style: { 'label': 'data(label)', 'shape': 'round-rectangle', 'width': 200, 'height': 54, 'background-color': '#ffffff', 'border-color': '#c9dade', 'border-width': 2, 'color': '#204152', 'font-size': 12, 'text-wrap': 'ellipsis', 'text-max-width': 180, 'text-halign': 'center', 'text-valign': 'center' } },
      { selector: 'node.undocumented', style: { 'border-style': 'dashed', 'border-color': '#c08b3a', 'background-color': '#fff9ec' } },
      { selector: 'node.inspected', style: { 'border-color': '#168a80', 'border-width': 4 } },
      { selector: 'edge', style: dependencyEdgeStyle },
      { selector: '.filtered-out', style: { 'display': 'none' } },
    ],
    layout: { name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 80, fit: true, padding: 45, animate: false },
  });
  resizeGraph = () => graph.resize();
  document.getElementById('inspector').addEventListener('toggle', () => graph.resize());
  setupColourSettings(document, graph);
  const imageExport = setupImageExport(window, document, graph);
  const entities = new Map(data.entities.map(entity => [entity.name, entity]));
  const downstream = new Map(data.entities.map(entity => [entity.name, []]));
  for (const edge of data.edges) downstream.get(edge.source).push(edge.target);
  const search = document.getElementById('entity-search');
  const results = document.getElementById('entity-results');
  const searchStatus = document.getElementById('entity-search-status');
  function updateResults() {
    const query = search.value.toLowerCase();
    const matches = data.entities.filter(entity => entity.name.toLowerCase().includes(query));
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
          const zoom = Math.min(graph.zoom(),
            (graph.width() / 2 - padding) / halfWidth,
            (graph.height() / 2 - padding) / halfHeight);
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
      for (const name of reachable(selected, name => entities.get(name).dependencies)) visible.add(name);
    }
    if (view === 'downstream' || view === 'connected') {
      for (const name of reachable(selected, name => downstream.get(name))) visible.add(name);
    }
    const query = filterQuery();
    for (const name of visible) {
      if (!name.toLowerCase().includes(query)) visible.delete(name);
    }
    graph.nodes().forEach(node => node.toggleClass('filtered-out', !visible.has(node.data('name'))));
    graph.edges().forEach(edge => edge.toggleClass('filtered-out',
      !visible.has(edge.source().data('name')) || !visible.has(edge.target().data('name'))));
    names.textContent = 'Entities: ' + data.entities.filter(entity => visible.has(entity.name))
      .map(entity => entity.name + (entity.documented ? '' : ' (undocumented)')).join(', ');
    relationships.textContent = 'Relationships: ' + (data.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target))
      .map(edge => `${edge.source} → ${edge.target}`).join(', ') || 'none');
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
    const details = document.createElement('div');
    details.className = 'inspector-details';
    const description = document.createElement('section');
    const descriptionHeading = document.createElement('h3');
    descriptionHeading.textContent = 'Description';
    const descriptionText = document.createElement('p');
    descriptionText.textContent = entity.documented ? (entity.description || 'No description provided.') : 'Unknown';
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
    function relationshipSection(title, names, emptyText) {
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
          list.appendChild(item);
        }
        section.appendChild(list);
      }
      return section;
    }
    details.append(
      relationshipSection('Direct dependencies', entity.dependencies, entity.documented ? 'No dependencies.' : 'Unknown'),
      relationshipSection('Direct downstream entities', downstream.get(name), 'No downstream entities.')
    );
    inspector.appendChild(details);
  }
  graph.on('tap', 'node', event => selectEntity(event.target.data('name')));
  graph.on('mouseover', 'node', event => { graph.container().title = event.target.data('name'); });
  graph.on('mouseout', 'node', () => { graph.container().removeAttribute('title'); });
  const zoomLevel = document.getElementById('zoom-level');
  const updateZoom = () => { zoomLevel.textContent = `${Math.round(graph.zoom() * 100)}%`; };
  graph.on('zoom', updateZoom);
  updateZoom();
  document.querySelector('.controls').hidden = false;
  const stopEdgeMotion = setupEdgeMotion(window, document, graph, document.getElementById('edge-motion'));
  document.getElementById('fit').addEventListener('click', () => {
    const visible = graph.elements().not('.filtered-out');
    if (visible.length) graph.fit(visible, 45);
  });
  function zoom(factor) {
    graph.zoom({ level: graph.zoom() * factor, renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  }
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.25));
  return () => {
    stopEdgeMotion();
    imageExport.cleanup();
    graph.destroy();
    resizeGraph = () => {};
  };
}
