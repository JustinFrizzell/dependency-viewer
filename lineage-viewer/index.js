require('./style.css');
const cytoscape = require('cytoscape');
const dagre = require('cytoscape-dagre');
const { parseLineage } = require('./data');
const { setupEdgeMotion } = require('./edge-motion');
const { lineageEdgeStyle } = require('./edge-style');
const { setupColourSettings } = require('./colour-settings');
cytoscape.use(dagre);

const status = document.getElementById('status');
const embedded = document.getElementById('lineage-data').textContent.trim();
if (embedded === ['__LINEAGE', 'DATA', 'JSON__'].join('_')) {
  status.textContent = 'Lineage data has not been embedded in this template.';
} else {
  try {
    const data = parseLineage(embedded);
    if (!data.tables.length) {
      status.textContent = 'No tables in this lineage dataset.';
    } else {
      showGraph(data);
    }
  } catch (error) {
    status.textContent = `Error: unusable lineage data. ${error.message}`;
  }
}

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
  const ids = new Map(data.tables.map((table, index) => [table.name, `table-${index}`]));
  const elements = data.tables.map(table => ({
    data: { id: ids.get(table.name), name: table.name, label: nameParts(table.name).short },
    classes: table.documented ? '' : 'undocumented',
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
      { selector: 'edge', style: lineageEdgeStyle },
      { selector: '.filtered-out', style: { 'display': 'none' } },
    ],
    layout: { name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 80, fit: true, padding: 45, animate: false },
  });
  document.getElementById('inspector').addEventListener('toggle', () => graph.resize());
  setupColourSettings(document, graph);
  const tables = new Map(data.tables.map(table => [table.name, table]));
  const downstream = new Map(data.tables.map(table => [table.name, []]));
  for (const edge of data.edges) downstream.get(edge.source).push(edge.target);
  const search = document.getElementById('table-search');
  const results = document.getElementById('table-results');
  const searchStatus = document.getElementById('table-search-status');
  function updateResults() {
    const query = search.value.toLowerCase();
    const matches = data.tables.filter(table => table.name.toLowerCase().includes(query));
    results.replaceChildren();
    for (const table of matches) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const { short, prefix } = nameParts(table.name);
      const fullName = table.name + (table.documented ? '' : ' (undocumented)');
      button.title = fullName;
      button.setAttribute('aria-label', fullName);
      const label = document.createElement('span');
      label.className = 'table-result-name';
      label.textContent = short + (table.documented ? '' : ' (undocumented)');
      button.appendChild(label);
      if (prefix) {
        const detail = document.createElement('span');
        detail.className = 'table-result-prefix';
        detail.textContent = prefix;
        button.appendChild(detail);
      }
      button.addEventListener('click', () => {
        selectTable(table.name);
        const node = graph.getElementById(ids.get(table.name));
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
    searchStatus.textContent = matches.length ? '' : 'No matching tables.';
  }
  search.addEventListener('input', updateResults);
  updateResults();
  document.getElementById('table-list').hidden = false;
  const inspector = document.getElementById('selection-status');
  const views = document.getElementById('lineage-views');
  const graphFilter = document.getElementById('graph-filter');
  const filterStatus = document.getElementById('graph-filter-status');
  const viewButtons = [...views.querySelectorAll('button')];
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
    const visible = view === 'all' ? new Set(tables.keys()) : new Set([selected]);
    if (view === 'upstream' || view === 'connected') {
      for (const name of reachable(selected, name => tables.get(name).inputs)) visible.add(name);
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
    names.textContent = 'Tables: ' + data.tables.filter(table => visible.has(table.name))
      .map(table => table.name + (table.documented ? '' : ' (undocumented)')).join(', ');
    relationships.textContent = 'Relationships: ' + (data.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target))
      .map(edge => `${edge.source} → ${edge.target}`).join(', ') || 'none');
    filterStatus.textContent = query && !visible.size ? 'No matching tables.' : '';
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
  function selectTable(name) {
    const table = tables.get(name);
    const clearFilter = !name.toLowerCase().includes(filterQuery());
    if (clearFilter) graphFilter.value = '';
    selected = name;
    graph.nodes().removeClass('inspected');
    graph.getElementById(ids.get(name)).addClass('inspected');
    updateView(clearFilter || view !== 'all');
    inspector.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = table.name;
    inspector.appendChild(heading);
    if (!table.documented) {
      const badge = document.createElement('span');
      badge.className = 'undocumented-badge';
      badge.textContent = 'Undocumented input table';
      inspector.appendChild(badge);
    }
    const details = document.createElement('div');
    details.className = 'inspector-details';
    const description = document.createElement('section');
    const descriptionHeading = document.createElement('h3');
    descriptionHeading.textContent = 'Description';
    const descriptionText = document.createElement('p');
    descriptionText.textContent = table.documented ? (table.description || 'No description provided.') : 'Unknown';
    description.append(descriptionHeading, descriptionText);
    if (table.extras && table.extras.length) {
      const extras = document.createElement('dl');
      extras.className = 'table-extras';
      for (const [key, value] of table.extras) {
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
          button.className = 'related-table';
          button.textContent = relatedName + (tables.get(relatedName).documented ? '' : ' (undocumented)');
          button.addEventListener('click', () => selectTable(relatedName));
          item.appendChild(button);
          list.appendChild(item);
        }
        section.appendChild(list);
      }
      return section;
    }
    details.append(
      relationshipSection('Direct inputs', table.inputs, table.documented ? 'No input tables.' : 'Unknown'),
      relationshipSection('Direct downstream tables', downstream.get(name), 'No downstream tables.')
    );
    inspector.appendChild(details);
  }
  graph.on('tap', 'node', event => selectTable(event.target.data('name')));
  graph.on('mouseover', 'node', event => { graph.container().title = event.target.data('name'); });
  graph.on('mouseout', 'node', () => { graph.container().removeAttribute('title'); });
  const zoomLevel = document.getElementById('zoom-level');
  const updateZoom = () => { zoomLevel.textContent = `${Math.round(graph.zoom() * 100)}%`; };
  graph.on('zoom', updateZoom);
  updateZoom();
  document.querySelector('.controls').hidden = false;
  setupEdgeMotion(window, document, graph, document.getElementById('edge-motion'));
  document.getElementById('fit').addEventListener('click', () => {
    const visible = graph.elements().not('.filtered-out');
    if (visible.length) graph.fit(visible, 45);
  });
  function zoom(factor) {
    graph.zoom({ level: graph.zoom() * factor, renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  }
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.25));
}
