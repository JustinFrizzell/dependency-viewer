import cytoscape = require('cytoscape');
import dagre = require('cytoscape-dagre');
import { setupEdgeMotion } from './edge-motion';
import { dependencyEdgeStyle } from './edge-style';
import { readPresentationSettings } from './presentation-settings';
import { setupImageExport } from './export-image';
import { setupEntityInspection } from './entity-inspection';
import { editDependency } from './document-edits';
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
  createEntityAt: (x: number, y: number, position: cytoscape.Position) => void;
  hasOtherEntityDraft: () => boolean;
  cardState?: { name: string; left: number; top: number };
  navigationState?: { selected: string | null; view: string | undefined; filter: string };
  selectEditedEntity?: boolean;
  layoutState?: {
    positions: Map<string, cytoscape.Position>;
    zoom: number;
    pan: cytoscape.Position;
  };
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
    navigationState,
    layoutState,
    selectEditedEntity,
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
      classes: `${entity.documented ? '' : 'undocumented'} ${nameParts(entity.name).prefix ? 'has-prefix' : ''}`,
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
        width: compact ? 174 : 210,
        height: compact ? 46 : 64,
        'background-color': dark ? '#191c24' : '#ffffff',
        'border-color': dark ? '#596170' : '#c9cdd5',
        'border-width': 1,
        color: dark ? '#edf5f5' : '#172b3a',
        'font-size': 13,
        'font-weight': 600,
        'text-wrap': 'ellipsis',
        'text-max-width': (compact ? 119 : 153) as unknown as string,
        'text-margin-x': 20,
        'text-halign': 'center',
        'text-valign': 'center',
      },
    },
    { selector: 'node.has-prefix', style: { 'text-margin-y': -8 } },
    {
      selector: 'node.undocumented',
      style: {
        'border-style': 'dashed',
        'border-color': dark ? '#f5cb78' : '#956000',
        'border-width': 2,
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
    {
      selector: 'edge.inspected',
      style: { 'line-color': dark ? '#65ddca' : '#087c72', 'target-arrow-color': dark ? '#65ddca' : '#087c72' },
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
  if (!layoutState && graph.zoom() > 1) {
    graph.zoom(1);
    graph.center();
  }
  const applyGraphTheme = () =>
    graph
      .style()
      .fromJson(graphStyles(document.documentElement.dataset.theme === 'dark'))
      .update();
  document.addEventListener('themechange', applyGraphTheme);
  setupDocumentSettings(graph);
  const imageExport = setupImageExport(window, document, graph, (options) => {
    graph.style().fromJson(graphStyles(false)).update();
    const qualified = graph.nodes('.has-prefix');
    qualified.forEach((node) => {
      const { short, prefix } = nameParts(node.data('name'));
      node.style({ label: `${short}\n${prefix}`, 'text-wrap': 'wrap', 'text-margin-y': 0 });
    });
    try {
      return graph.png(options);
    } finally {
      qualified.removeStyle('label text-wrap text-margin-y');
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
    selectEntity: (name) => {
      if (!selectEntity(name)) return false;
      graph.center(graph.getElementById(ids.get(name)!));
      card.focus();
      return true;
    },
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
        if (!selectEntity(entity.name, button)) return;
        const node = graph.getElementById(ids.get(entity.name)!);
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
  const moveEntityButton = document.getElementById('move-entity') as HTMLButtonElement;
  const entityMoveInstructions = document.getElementById('entity-move-instructions') as HTMLElement;
  const announcement = document.getElementById('inspection-announcement') as HTMLElement;
  let invokingControl: HTMLElement | null = null;
  let moved = false;
  let persistent = false;
  let displayedName: string | null = null;
  let keyboardStart: { left: number; top: number; moved: boolean; persistent: boolean } | null = null;
  let entityMove: { name: string; x: number; y: number } | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  function moveCard(left: number, top: number) {
    card.style.left = `${Math.max(0, Math.min(graph.width() - card.offsetWidth, left))}px`;
    card.style.top = `${Math.max(0, Math.min(graph.height() - card.offsetHeight, top))}px`;
  }
  function inspectAutomatically(name: string) {
    if (
      keyboardStart ||
      entityMove ||
      card.classList.contains('editor-open') ||
      inspection.hasEntityDraft() ||
      inspection.hasDependencyDraft() ||
      hasOtherEntityDraft()
    )
      return;
    inspection.showEntity(name);
    displayedName = name;
    moveEntityButton.hidden = name !== selected;
    card.hidden = false;
    if (!moved) positionCard(name);
  }
  function positionCard(name: string) {
    const node = graph.getElementById(ids.get(name)!);
    const position = node.renderedPosition();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const toolbarBottom =
      graph.width() <= 600
        ? document.querySelector<HTMLElement>('.workspace-toolbar')!.getBoundingClientRect().bottom -
          graph.container()!.getBoundingClientRect().top +
          8
        : 8;
    card.style.left = `${Math.max(8, Math.min(graph.width() - width - 8, position.x + node.renderedWidth() / 2 + 12))}px`;
    card.style.top = `${Math.max(toolbarBottom, Math.min(graph.height() - height - 8, position.y - 20))}px`;
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
    moveButton.focus();
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
  moveButton.addEventListener('blur', () => {
    if (!keyboardStart) return;
    moveCard(keyboardStart.left, keyboardStart.top);
    moved = keyboardStart.moved;
    persistent = keyboardStart.persistent;
    keyboardStart = null;
    moveButton.removeAttribute('aria-pressed');
    moveButton.textContent = 'Move card';
  });
  function finishEntityMove(cancel: boolean) {
    if (!entityMove) return;
    const { name, x, y } = entityMove;
    if (cancel) graph.getElementById(ids.get(name)!).position({ x, y });
    entityMove = null;
    moveEntityButton.removeAttribute('aria-pressed');
    moveEntityButton.textContent = 'Move Entity';
    entityMoveInstructions.hidden = true;
    announcement.textContent = cancel ? `Movement of Entity ${name} cancelled.` : `Entity ${name} moved.`;
  }
  moveEntityButton.addEventListener('click', () => {
    if (!selected || entityMove) return;
    moveEntityButton.focus();
    const { x, y } = graph.getElementById(ids.get(selected)!).position();
    entityMove = { name: selected, x, y };
    moveEntityButton.setAttribute('aria-pressed', 'true');
    moveEntityButton.textContent = 'Moving Entity';
    entityMoveInstructions.hidden = false;
    announcement.textContent = `Moving Entity ${selected}. Use arrow keys, Enter to finish, or Escape to cancel.`;
  });
  moveEntityButton.addEventListener('keydown', (event) => {
    if (!entityMove) return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    };
    if (delta[event.key]) {
      event.preventDefault();
      const node = graph.getElementById(ids.get(entityMove.name)!);
      const { x, y } = node.position();
      node.position({ x: x + delta[event.key][0] / graph.zoom(), y: y + delta[event.key][1] / graph.zoom() });
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      finishEntityMove(event.key === 'Escape');
    }
  });
  moveEntityButton.addEventListener('blur', () => finishEntityMove(true));
  (document.getElementById('close-inspector') as HTMLButtonElement).addEventListener('click', () => {
    if (!inspection.canChangeSelection()) {
      if (!card.classList.contains('editor-open'))
        card.querySelector<HTMLButtonElement>('.entity-editor-toggle')?.click();
      const draftInput = inspection.hasEntityDraft() ? '#edit-entity-name' : '#new-dependency-name';
      card.querySelector<HTMLInputElement>(draftInput)?.focus();
      return;
    }
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
  const decorations = new Map<string, HTMLElement>();
  const handles = new Map<string, { source: HTMLButtonElement; target: HTMLButtonElement }>();
  const connectionStatus = document.getElementById('connection-status') as HTMLElement;
  const relationshipActions = document.getElementById('relationship-actions') as HTMLElement;
  const removeRelationship = document.getElementById('remove-relationship') as HTMLButtonElement;
  let selectedRelationship: { source: string; target: string } | null = null;
  function clearRelationship() {
    selectedRelationship = null;
    relationshipActions.hidden = true;
    graph.edges().removeClass('inspected');
  }
  function onModeChange() {
    cancelConnection();
    clearRelationship();
  }
  document.addEventListener('modechange', onModeChange);
  graph.on('tap', (event) => {
    if (event.target === graph || event.target.isNode()) clearRelationship();
  });
  graph.on('tap', 'edge', (event) => {
    if (document.body.dataset.mode !== 'edit') return;
    const edge = event.target as cytoscape.EdgeSingular;
    selectedRelationship = { source: edge.source().data('name'), target: edge.target().data('name') };
    graph.edges().removeClass('inspected');
    edge.addClass('inspected');
    removeRelationship.textContent = `Remove Direct dependency ${selectedRelationship.source} from ${selectedRelationship.target}`;
    relationshipActions.style.left = `${Math.max(0, Math.min(graph.width() - 260, event.renderedPosition.x))}px`;
    relationshipActions.style.top = `${Math.max(0, Math.min(graph.height() - 45, event.renderedPosition.y))}px`;
    relationshipActions.hidden = false;
  });
  removeRelationship.addEventListener('click', () => {
    if (!selectedRelationship || document.body.dataset.mode !== 'edit') return;
    const { source, target } = selectedRelationship;
    try {
      requireNoConflictingFormDraft();
      if (session.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
      editDependency(session, target, source, false);
      refreshDocument(target);
      (document.getElementById('connection-status') as HTMLElement).textContent =
        `Removed ${source} as a Direct dependency of ${target}.`;
    } catch (reason) {
      connectionStatus.textContent = `Error: ${(reason as Error).message}`;
    }
  });
  let connection: { source: string; pointerId: number } | null = null;
  function cancelConnection() {
    connection = null;
  }
  function endConnection(event: PointerEvent) {
    if (!connection || event.pointerId !== connection.pointerId) return;
    const source = connection.source;
    cancelConnection();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>('.connection-target');
    if (document.body.dataset.mode !== 'edit' || !target || target.hidden) return;
    const dependent = target.dataset.entity!;
    try {
      requireNoConflictingFormDraft();
      if (session.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
      if (!entities.get(dependent)?.documented) throw new Error('The dependent must be a documented Entity.');
      editDependency(session, dependent, source, true);
      refreshDocument(dependent);
      (document.getElementById('connection-status') as HTMLElement).textContent =
        `Added ${source} as a Direct dependency of ${dependent}.`;
    } catch (reason) {
      connectionStatus.textContent = `Error: ${(reason as Error).message}`;
    }
  }
  function cancelOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') cancelConnection();
  }
  window.addEventListener('pointerup', endConnection);
  window.addEventListener('pointercancel', cancelConnection);
  window.addEventListener('blur', cancelConnection);
  window.addEventListener('keydown', cancelOnEscape);
  for (const entity of data.entities) {
    const decoration = document.createElement('div');
    decoration.className = 'graph-entity-decoration';
    const icon = document.createElement('span');
    icon.className = 'graph-entity-icon';
    icon.textContent = '▦';
    const prefix = document.createElement('span');
    prefix.className = 'graph-entity-prefix';
    prefix.textContent = nameParts(entity.name).prefix;
    decoration.append(icon, prefix);
    decoration.setAttribute('aria-hidden', 'true');
    graphEntities.appendChild(decoration);
    decorations.set(entity.name, decoration);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-entity';
    button.textContent = entity.name;
    button.setAttribute('aria-label', `Inspect Entity ${entity.name}${entity.documented ? '' : ' (undocumented)'}`);
    button.addEventListener('focus', () => {
      if (moved) inspectAutomatically(entity.name);
    });
    button.addEventListener('click', () => selectEntity(entity.name, button));
    graphEntities.appendChild(button);
    entityButtons.set(entity.name, button);
    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'connection-handle connection-source edit-only';
    source.tabIndex = -1;
    source.setAttribute('aria-label', `Start dependency from ${entity.name}`);
    source.title = 'Drag from this dependency to the dependent Entity’s left handle';
    source.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || document.body.dataset.mode !== 'edit') return;
      event.preventDefault();
      event.stopPropagation();
      connectionStatus.textContent = '';
      connection = { source: entity.name, pointerId: event.pointerId };
    });
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'connection-handle connection-target edit-only';
    target.tabIndex = -1;
    target.dataset.entity = entity.name;
    target.setAttribute('aria-label', `Connect to dependent ${entity.name}`);
    target.title = 'Drop a dependency here';
    graphEntities.append(source, target);
    handles.set(entity.name, { source, target });
  }
  function positionEntityButtons() {
    for (const [name, button] of entityButtons) {
      const node = graph.getElementById(ids.get(name)!);
      const position = node.renderedPosition();
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
      const decoration = decorations.get(name)!;
      decoration.style.left = `${position.x}px`;
      decoration.style.top = `${position.y}px`;
      decoration.style.width = `${node.width()}px`;
      decoration.style.height = `${node.height()}px`;
      decoration.style.transform = `translate(-50%, -50%) scale(${graph.zoom()})`;
      decoration.style.color = node.style('color');
      const pair = handles.get(name)!;
      pair.source.style.left = `${position.x + node.renderedWidth() / 2}px`;
      pair.target.style.left = `${position.x - node.renderedWidth() / 2}px`;
      pair.source.style.top = pair.target.style.top = `${position.y}px`;
    }
    if (!moved && !card.hidden && displayedName) positionCard(displayedName);
  }
  graph.on('pan zoom resize', positionEntityButtons);
  graph.on('position', 'node', positionEntityButtons);
  graph.on('style', 'node', (event) => {
    const node = event.target as cytoscape.NodeSingular;
    const decoration = decorations.get(node.data('name'));
    if (decoration) {
      decoration.style.width = `${node.width()}px`;
      decoration.style.height = `${node.height()}px`;
      decoration.style.color = node.style('color');
    }
  });
  positionEntityButtons();
  let selected: string | null = null;
  let initializingSelection = true;
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
    clearRelationship();
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
      decorations.get(node.data('name'))!.hidden = !visible.has(node.data('name'));
      const pair = handles.get(node.data('name'))!;
      pair.source.hidden = pair.target.hidden = !visible.has(node.data('name'));
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
  function selectEntity(name: string, trigger?: HTMLElement) {
    finishEntityMove(true);
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
    if (!initializingSelection) (document.getElementById('document-panel') as HTMLDetailsElement).open = false;
    if (trigger) invokingControl = trigger;
    else if (document.activeElement instanceof HTMLElement && !card.contains(document.activeElement))
      invokingControl = document.activeElement;
    const clearFilter = !name.toLowerCase().includes(filterQuery());
    if (clearFilter) graphFilter.value = '';
    selected = name;
    graph.nodes().removeClass('inspected');
    graph.getElementById(ids.get(name)!).addClass('inspected');
    updateView(clearFilter || view !== 'all');
    inspection.showEntity(name);
    displayedName = name;
    moveEntityButton.hidden = false;
    announcement.textContent = `Entity ${name} selected.`;
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
      createEntityAt(original.clientX, original.clientY, event.position);
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
    if (visible.length) {
      graph.fit(visible, 45);
      if (graph.zoom() > 1) {
        graph.zoom(1);
        graph.center(visible);
      }
    }
  });
  function zoom(factor: number) {
    graph.zoom({
      level: graph.zoom() * factor,
      renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
    });
  }
  const graphContainer = document.getElementById('graph') as HTMLElement;
  graphContainer.addEventListener('keydown', (event) => {
    if (
      event.target !== graphContainer ||
      keyboardStart ||
      entityMove ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [40, 0],
      ArrowRight: [-40, 0],
      ArrowUp: [0, 40],
      ArrowDown: [0, -40],
    };
    if (pan[event.key]) {
      event.preventDefault();
      graph.panBy({ x: pan[event.key][0], y: pan[event.key][1] });
    } else if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoom(event.key === '+' || event.key === '=' ? 1.25 : 1 / 1.25);
    }
  });
  (document.getElementById('zoom-in') as HTMLButtonElement).addEventListener('click', () => zoom(1.25));
  (document.getElementById('zoom-out') as HTMLButtonElement).addEventListener('click', () => zoom(1 / 1.25));
  const previousSelection = navigationState?.selected;
  const initialName =
    (!selectEditedEntity && previousSelection && entities.has(previousSelection) ? previousSelection : selectedName) ||
    cardState?.name;
  if (initialName && entities.has(initialName)) selectEntity(initialName);
  initializingSelection = false;
  if (navigationState) {
    graphFilter.value = navigationState.filter;
    view = selected ? navigationState.view : 'all';
    updateView(true);
  }
  if (layoutState) {
    graph.nodes().forEach((node) => {
      const position = layoutState.positions.get(node.data('name'));
      if (position) node.position(position);
    });
    graph.minZoom(Math.min(graph.minZoom(), layoutState.zoom));
    graph.zoom(layoutState.zoom);
    graph.pan(layoutState.pan);
  }
  if (cardState && !card.hidden) {
    moved = true;
    moveCard(cardState.left, cardState.top);
  }
  return {
    inspection,
    navigationState: () => ({ selected, view, filter: graphFilter.value }),
    layoutState: () => ({
      positions: new Map(graph.nodes().map((node) => [node.data('name') as string, { ...node.position() }])),
      zoom: graph.zoom(),
      pan: { ...graph.pan() },
    }),
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
      document.removeEventListener('modechange', onModeChange);
      window.removeEventListener('pointerup', endConnection);
      window.removeEventListener('pointercancel', cancelConnection);
      window.removeEventListener('blur', cancelConnection);
      window.removeEventListener('keydown', cancelOnEscape);
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
