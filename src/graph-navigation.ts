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
  resolveSelectionDraft: (name: string) => void;
  editProperties: (name: string) => void;
  createEntityAt: (x: number, y: number) => void;
  hasOtherEntityDraft: () => boolean;
  cardState?: { name: string; left: number; top: number };
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
    resolveSelectionDraft,
    editProperties,
    createEntityAt,
    hasOtherEntityDraft,
    cardState,
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
  const graphStyles = (dark: boolean): cytoscape.StylesheetJson => [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        shape: 'round-rectangle',
        width: compact ? 150 : 200,
        height: compact ? 40 : 54,
        'background-color': dark ? '#253d48' : '#ffffff',
        'border-color': dark ? '#a6c1c7' : '#607d87',
        'border-width': 2,
        color: dark ? '#edf5f5' : '#172b3a',
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
        'border-color': dark ? '#f5cb78' : '#956000',
        'background-color': dark ? '#3d3426' : '#fff9ec',
      },
    },
    { selector: 'node.inspected', style: { 'border-color': dark ? '#65ddca' : '#087c72', 'border-width': 5 } },
    {
      selector: 'edge',
      style: {
        ...dependencyEdgeStyle,
        'line-color': dark ? '#a6c1c7' : '#607d87',
        'target-arrow-color': dark ? '#a6c1c7' : '#607d87',
      },
    },
    { selector: '.filtered-out', style: { display: 'none' } },
  ];
  const graph = cytoscape({
    container: document.getElementById('graph') as HTMLElement,
    elements,
    autounselectify: true,
    minZoom: 0.01,
    maxZoom: 4,
    style: graphStyles(document.documentElement.dataset.theme === 'dark'),
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
  const applyGraphTheme = () =>
    graph
      .style()
      .fromJson(graphStyles(document.documentElement.dataset.theme === 'dark'))
      .update();
  document.addEventListener('themechange', applyGraphTheme);
  setupDocumentSettings(graph);
  const imageExport = setupImageExport(window, document, graph, (options) => {
    graph.style().fromJson(graphStyles(false)).update();
    try {
      return graph.png(options);
    } finally {
      applyGraphTheme();
    }
  });
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
    editProperties,
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
      button.addEventListener('focus', () => {
        if (moved) inspectAutomatically(entity.name);
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
  const card = document.getElementById('inspector') as HTMLElement;
  const cardHeader = card.querySelector<HTMLElement>('.inspector-header')!;
  const moveButton = document.getElementById('move-inspector') as HTMLButtonElement;
  let invokingControl: HTMLElement | null = null;
  let moved = false;
  let persistent = false;
  let displayedName: string | null = null;
  let keyboardStart: { left: number; top: number; moved: boolean; persistent: boolean } | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  function moveCard(left: number, top: number) {
    card.style.left = `${Math.max(0, Math.min(graph.width() - card.offsetWidth, left))}px`;
    card.style.top = `${Math.max(0, Math.min(graph.height() - card.offsetHeight, top))}px`;
  }
  function inspectAutomatically(name: string) {
    if (inspection.hasEntityDraft() || inspection.hasDependencyDraft() || hasOtherEntityDraft()) return;
    inspection.showEntity(name);
    displayedName = name;
    card.hidden = false;
    if (!moved) positionCard(name);
  }
  function positionCard(name: string) {
    const node = graph.getElementById(ids.get(name)!);
    const position = node.renderedPosition();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    card.style.left = `${Math.max(8, Math.min(graph.width() - width - 8, position.x + node.renderedWidth() / 2 + 12))}px`;
    card.style.top = `${Math.max(8, Math.min(graph.height() - height - 8, position.y - 20))}px`;
  }
  cardHeader.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const left = card.offsetLeft;
    const top = card.offsetTop;
    cardHeader.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      if (Math.abs(move.clientX - startX) + Math.abs(move.clientY - startY) < 3) return;
      moved = true;
      persistent = true;
      moveCard(left + move.clientX - startX, top + move.clientY - startY);
    };
    const onEnd = () => {
      cardHeader.removeEventListener('pointermove', onMove);
      cardHeader.removeEventListener('pointerup', onEnd);
      cardHeader.removeEventListener('pointercancel', onEnd);
    };
    cardHeader.addEventListener('pointermove', onMove);
    cardHeader.addEventListener('pointerup', onEnd);
    cardHeader.addEventListener('pointercancel', onEnd);
  });
  moveButton.addEventListener('click', () => {
    keyboardStart = { left: card.offsetLeft, top: card.offsetTop, moved, persistent };
    moveButton.setAttribute('aria-pressed', 'true');
    moveButton.textContent = 'Moving card: arrows, Enter to finish, Escape to cancel';
  });
  moveButton.addEventListener('keydown', (event) => {
    if (!keyboardStart) return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    };
    if (delta[event.key]) {
      event.preventDefault();
      moved = true;
      persistent = true;
      moveCard(card.offsetLeft + delta[event.key][0], card.offsetTop + delta[event.key][1]);
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      if (event.key === 'Escape') {
        moveCard(keyboardStart.left, keyboardStart.top);
        moved = keyboardStart.moved;
        persistent = keyboardStart.persistent;
      }
      keyboardStart = null;
      moveButton.removeAttribute('aria-pressed');
      moveButton.textContent = 'Move card';
    }
  });
  (document.getElementById('close-inspector') as HTMLButtonElement).addEventListener('click', () => {
    if (!inspection.canChangeSelection()) return;
    clearTimeout(dismissTimer);
    card.hidden = true;
    moved = false;
    persistent = false;
    displayedName = null;
    if (invokingControl?.isConnected) invokingControl.focus();
    else document.querySelector<HTMLElement>('#entity-list summary')?.focus();
    invokingControl = null;
  });
  const viewButtons = [...views.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const graphEntities = document.getElementById('graph-entities') as HTMLElement;
  const entityButtons = new Map<string, HTMLButtonElement>();
  for (const entity of data.entities) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-entity';
    button.textContent = entity.name;
    button.setAttribute('aria-label', `Inspect Entity ${entity.name}${entity.documented ? '' : ' (undocumented)'}`);
    button.addEventListener('focus', () => {
      if (moved) inspectAutomatically(entity.name);
    });
    button.addEventListener('click', () => selectEntity(entity.name));
    graphEntities.appendChild(button);
    entityButtons.set(entity.name, button);
  }
  function positionEntityButtons() {
    for (const [name, button] of entityButtons) {
      const position = graph.getElementById(ids.get(name)!).renderedPosition();
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
    }
    if (!moved && !card.hidden && displayedName) positionCard(displayedName);
  }
  graph.on('pan zoom resize', positionEntityButtons);
  positionEntityButtons();
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
      entityButtons.get(node.data('name'))!.hidden = !visible.has(node.data('name'));
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
    if (hasOtherEntityDraft()) {
      resolveSelectionDraft(name);
      return false;
    }
    if (displayedName === name && (inspection.hasEntityDraft() || inspection.hasDependencyDraft())) {
      card.hidden = false;
      persistent = true;
      return true;
    }
    if (!inspection.canChangeSelection()) {
      resolveSelectionDraft(name);
      return false;
    }
    if (document.activeElement instanceof HTMLElement && !card.contains(document.activeElement))
      invokingControl = document.activeElement;
    const clearFilter = !name.toLowerCase().includes(filterQuery());
    if (clearFilter) graphFilter.value = '';
    selected = name;
    graph.nodes().removeClass('inspected');
    graph.getElementById(ids.get(name)!).addClass('inspected');
    updateView(clearFilter || view !== 'all');
    inspection.showEntity(name);
    displayedName = name;
    (document.getElementById('inspection-announcement') as HTMLElement).textContent = `Entity ${name} selected.`;
    card.hidden = false;
    persistent = true;
    if (!moved) positionCard(name);
    return true;
  }
  graph.on('tap', 'node', (event) => selectEntity(event.target.data('name')));
  let canvasPress: { x: number; y: number; moved: boolean } | null = null;
  const trackMouse = (event: MouseEvent) => {
    if (canvasPress && Math.hypot(event.clientX - canvasPress.x, event.clientY - canvasPress.y) > 5)
      canvasPress.moved = true;
  };
  const cancelCanvasPress = () => {
    canvasPress = null;
  };
  const cancelCanvasPressOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancelCanvasPress();
  };
  window.addEventListener('mousemove', trackMouse);
  window.addEventListener('blur', cancelCanvasPress);
  window.addEventListener('pointercancel', cancelCanvasPress);
  window.addEventListener('keydown', cancelCanvasPressOnEscape);
  graph.on('mousedown', (event) => {
    const original = event.originalEvent as MouseEvent;
    if (
      document.body.dataset.mode === 'edit' &&
      event.target === graph &&
      original.type === 'mousedown' &&
      original.button === 0
    )
      canvasPress = { x: original.clientX, y: original.clientY, moved: false };
  });
  graph.on('mouseup', (event) => {
    const original = event.originalEvent as MouseEvent;
    trackMouse(original);
    if (
      canvasPress &&
      !canvasPress.moved &&
      event.target === graph &&
      original.type === 'mouseup' &&
      original.button === 0 &&
      document.body.dataset.mode === 'edit'
    )
      createEntityAt(original.clientX, original.clientY);
    cancelCanvasPress();
  });
  window.addEventListener('mouseup', cancelCanvasPress);
  graph.on('mouseover', 'node', (event) => {
    if (!tooltipsEnabled() || (!moved && persistent)) return;
    clearTimeout(dismissTimer);
    inspectAutomatically(event.target.data('name'));
  });
  graph.on('mouseout', 'node', () => {
    if (!moved && !persistent) {
      dismissTimer = setTimeout(() => {
        if (!moved && !persistent && !inspection.hasEntityDraft() && !inspection.hasDependencyDraft())
          card.hidden = true;
      }, 200);
    }
  });
  card.addEventListener('pointerenter', () => clearTimeout(dismissTimer));
  card.addEventListener('pointerleave', () => {
    if (!moved && !persistent && !inspection.hasEntityDraft() && !inspection.hasDependencyDraft()) card.hidden = true;
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
  const initialName = selectedName || cardState?.name;
  if (initialName && entities.has(initialName)) selectEntity(initialName);
  if (cardState && !card.hidden) {
    moved = true;
    moveCard(cardState.left, cardState.top);
  }
  return {
    inspection,
    selectEntity: (name: string) => {
      const selected = selectEntity(name);
      if (selected) graph.center(graph.getElementById(ids.get(name)!));
      return selected;
    },
    cardState: () =>
      moved && displayedName && !card.hidden
        ? { name: displayedName, left: card.offsetLeft, top: card.offsetTop }
        : undefined,
    resize: () => graph.resize(),
    cleanup: () => {
      clearTimeout(dismissTimer);
      document.removeEventListener('themechange', applyGraphTheme);
      window.removeEventListener('mousemove', trackMouse);
      window.removeEventListener('mouseup', cancelCanvasPress);
      window.removeEventListener('blur', cancelCanvasPress);
      window.removeEventListener('pointercancel', cancelCanvasPress);
      window.removeEventListener('keydown', cancelCanvasPressOnEscape);
      stopEdgeMotion();
      imageExport.cleanup();
      graph.destroy();
    },
  };
}
