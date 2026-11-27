import cytoscape = require('cytoscape');
import dagre = require('cytoscape-dagre');
import { setupEdgeMotion } from './edge-motion';
import { dependencyEdgeStyle } from './edge-style';
import { readPresentationSettings } from './presentation-settings';
import { setupImageExport } from './export-image';
import { setupEntityInspection } from './entity-inspection';
import type { DocumentSession } from './document-session';
import type { Graph } from './document-types';

cytoscape.use(dagre);

type GraphOptions = {
  session: DocumentSession;
  setupDocumentSettings: (graph: cytoscape.Core) => void;
  tooltipsEnabled: () => boolean;
  requireNoConflictingFormDraft: (owner?: string) => void;
  updateDocumentControls: () => void;
  refreshDocument: (selectedName?: string) => void;
};

export function showGraph(
  data: Graph,
  selectedName: string | undefined,
  {
    session,
    setupDocumentSettings,
    tooltipsEnabled,
    requireNoConflictingFormDraft,
    updateDocumentControls,
    refreshDocument,
  }: GraphOptions,
) {
  const summary = document.getElementById('graph-summary') as HTMLElement;
  const names = document.createElement('p');
  summary.appendChild(names);
  const relationships = document.createElement('p');
  summary.appendChild(relationships);

  function nameParts(name: string) {
    const dot = name.lastIndexOf('.');
    return dot < 0 || dot === name.length - 1
      ? { short: name, prefix: '' }
      : { short: name.slice(dot + 1), prefix: name.slice(0, dot) };
  }
  const ids = new Map(data.entities.map((entity, index) => [entity.name, `entity-${index}`]));
  const elements: cytoscape.ElementDefinition[] = [
    ...data.entities.map((entity) => ({
      data: { id: ids.get(entity.name)!, name: entity.name, label: nameParts(entity.name).short },
      classes: entity.documented ? '' : 'undocumented',
    })),
    ...data.edges.map((edge, index) => ({
      data: { id: `edge-${index}`, source: ids.get(edge.source)!, target: ids.get(edge.target)! },
    })),
  ];
  let compact = false;
  try {
    compact = readPresentationSettings(JSON.parse(session.current())).compact;
  } catch {
    // Conflicting settings are reported by the controls; use the default presentation.
  }
  const graph = cytoscape({
    container: document.getElementById('graph') as HTMLElement,
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
          'text-max-width': (compact ? 130 : 180) as unknown as string,
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
    } as dagre.DagreLayoutOptions,
  });
  (document.getElementById('inspector') as HTMLDetailsElement).addEventListener('toggle', () => graph.resize());
  setupDocumentSettings(graph);
  const imageExport = setupImageExport(window, document, graph);
  const entities = new Map(data.entities.map((entity) => [entity.name, entity]));
  const downstream = new Map<string, string[]>(data.entities.map((entity) => [entity.name, []]));
  for (const edge of data.edges) downstream.get(edge.source)!.push(edge.target);
  const inspection = setupEntityInspection({
    session,
    entities,
    downstream,
    selectEntity,
    requireNoConflictingFormDraft,
    updateDocumentControls,
    refreshDocument,
  });
  const search = document.getElementById('entity-search') as HTMLInputElement;
  const results = document.getElementById('entity-results') as HTMLElement;
  const searchStatus = document.getElementById('entity-search-status') as HTMLElement;
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
        if (!selectEntity(entity.name)) return;
        const node = graph.getElementById(ids.get(entity.name)!);
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
  (document.getElementById('entity-list') as HTMLDetailsElement).hidden = false;
  const views = document.getElementById('dependency-views') as HTMLElement;
  const graphFilter = document.getElementById('graph-filter') as HTMLInputElement;
  const filterStatus = document.getElementById('graph-filter-status') as HTMLElement;
  const clearFilterButton = document.getElementById('clear-graph-filter') as HTMLButtonElement;
  const graphCount = document.getElementById('graph-count') as HTMLElement;
  const viewButtons = [...views.querySelectorAll<HTMLButtonElement>('[data-view]')];
  let selected: string | null = null;
  let view: string | undefined = 'all';
  const filterQuery = () => graphFilter.value.trim().toLowerCase();
  function reachable(start: string, neighbors: (name: string) => string[]) {
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
  function updateView(fit: boolean) {
    const visible = view === 'all' ? new Set(entities.keys()) : new Set([selected!]);
    if (view === 'upstream' || view === 'connected') {
      for (const name of reachable(selected!, (name) => entities.get(name)!.dependencies)) visible.add(name);
    }
    if (view === 'downstream' || view === 'connected') {
      for (const name of reachable(selected!, (name) => downstream.get(name)!)) visible.add(name);
    }
    const query = filterQuery();
    for (const name of visible) {
      if (!name.toLowerCase().includes(query)) visible.delete(name);
    }
    graph.nodes().forEach((node) => {
      node.toggleClass('filtered-out', !visible.has(node.data('name')));
    });
    graph.edges().forEach((edge) => {
      edge.toggleClass(
        'filtered-out',
        !visible.has(edge.source().data('name')) || !visible.has(edge.target().data('name')),
      );
    });
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
    clearFilterButton.hidden = !graphFilter.value;
    const activeFilter = document.getElementById('active-filter') as HTMLElement;
    activeFilter.textContent = graphFilter.value.trim();
    activeFilter.title = graphFilter.value.trim();
    const connections = data.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)).length;
    graphCount.textContent = `${visible.size} ${visible.size === 1 ? 'Entity' : 'Entities'} · ${connections} ${connections === 1 ? 'connection' : 'connections'}`;
    imageExport.update();
    for (const button of viewButtons) {
      button.disabled = button.dataset.view !== 'all' && selected === null;
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    if (fit && visible.size) graph.fit(graph.elements().not('.filtered-out'), 45);
  }
  graphFilter.addEventListener('input', () => updateView(true));
  clearFilterButton.addEventListener('click', () => {
    graphFilter.value = '';
    updateView(true);
    graphFilter.focus();
  });
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      view = button.dataset.view;
      updateView(true);
    });
  }
  views.hidden = false;
  updateView(false);
  function selectEntity(name: string) {
    if (!inspection.canChangeSelection()) return false;
    const clearFilter = !name.toLowerCase().includes(filterQuery());
    if (clearFilter) graphFilter.value = '';
    selected = name;
    graph.nodes().removeClass('inspected');
    graph.getElementById(ids.get(name)!).addClass('inspected');
    updateView(clearFilter || view !== 'all');
    inspection.showEntity(name);
    return true;
  }
  graph.on('tap', 'node', (event) => selectEntity(event.target.data('name')));
  graph.on('mouseover', 'node', (event) => {
    if (!tooltipsEnabled()) return;
    const entity = entities.get(event.target.data('name'))!;
    const lines = [
      entity.name,
      entity.documented ? `Description: ${entity.description || 'No description provided.'}` : 'Undocumented entity',
      `Direct dependencies: ${entity.documented ? entity.dependencies.join(', ') || 'None' : 'Unknown'}`,
      `Direct downstream entities: ${downstream.get(entity.name)!.join(', ') || 'None'}`,
    ];
    for (const [key, value] of entity.extras || []) {
      lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
    graph.container()!.title = lines.join('\n');
  });
  graph.on('mouseout', 'node', () => {
    graph.container()!.removeAttribute('title');
  });
  const zoomLevel = document.getElementById('zoom-level') as HTMLOutputElement;
  const updateZoom = () => {
    zoomLevel.textContent = `${Math.round(graph.zoom() * 100)}%`;
  };
  graph.on('zoom', updateZoom);
  updateZoom();
  document.querySelector<HTMLElement>('.controls')!.hidden = false;
  const stopEdgeMotion = setupEdgeMotion(
    window,
    document,
    graph,
    document.getElementById('edge-motion') as HTMLButtonElement,
  );
  (document.getElementById('fit') as HTMLButtonElement).addEventListener('click', () => {
    const visible = graph.elements().not('.filtered-out');
    if (visible.length) graph.fit(visible, 45);
  });
  function zoom(factor: number) {
    graph.zoom({
      level: graph.zoom() * factor,
      renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
    });
  }
  (document.getElementById('zoom-in') as HTMLButtonElement).addEventListener('click', () => zoom(1.25));
  (document.getElementById('zoom-out') as HTMLButtonElement).addEventListener('click', () => zoom(1 / 1.25));
  if (selectedName && entities.has(selectedName)) selectEntity(selectedName);
  return {
    inspection,
    resize: () => graph.resize(),
    cleanup: () => {
      stopEdgeMotion();
      imageExport.cleanup();
      graph.destroy();
    },
  };
}
