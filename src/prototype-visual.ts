import { deriveGraph, parseDocument } from './data';
import type { Graph, GraphEntity } from './document-types';

// Three visual variants on the viewer route, switched with ?variant=A, B or C.
const sample = {
  entities: [
    { name: 'raw.customers', description: 'Customer records from the production application.', dependencies: [], owner: 'Platform', freshness: 'Daily' },
    { name: 'raw.orders', description: 'Every order event received from the commerce platform.', dependencies: [], owner: 'Commerce', freshness: 'Hourly' },
    { name: 'raw.products', description: 'Product catalogue and pricing history.', dependencies: [], owner: 'Commerce' },
    { name: 'staging.orders', description: 'Cleaned and standardised order events.', dependencies: ['raw.orders', 'raw.products'], owner: 'Analytics' },
    { name: 'model.orders', description: 'A unified, trusted view of orders enriched with customer and product context.', dependencies: ['raw.customers', 'staging.orders'], owner: 'Analytics engineering', tier: 'Gold', updated: 'Today, 9:42 AM' },
    { name: 'report.revenue', description: 'Revenue reporting for the finance team.', dependencies: ['model.orders'], owner: 'Finance' },
    { name: 'report.customers', description: 'Customer-level lifetime value and retention.', dependencies: ['model.orders'], owner: 'Growth' },
  ],
};

const css = `
:host { all: initial; --bg:#f7f8fa; --panel:#fff; --text:#1b1e29; --muted:#777d8d; --subtle:#a2a8b5; --line:#e4e6eb; --accent:#4f46e5; --accent-soft:#eeedff; --grid:#d9dce6; --shadow:0 12px 40px #18203612,0 2px 8px #1820360a; display:block; font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); }
:host([data-theme=dark]) { --bg:#0e1016; --panel:#191c24; --text:#f2f3f8; --muted:#a3a8b7; --subtle:#747b8d; --line:#303440; --accent:#a59bff; --accent-soft:#302d50; --grid:#292e3a; --shadow:0 16px 40px #0007,0 2px 8px #0005; }
* { box-sizing:border-box; }
button,input { font:inherit; }
button { cursor:pointer; color:inherit; }
button:focus-visible,input:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
.app { position:fixed; inset:0; overflow:hidden; background:var(--bg); color:var(--text); }
.canvas { position:absolute; inset:0; overflow:hidden; background-color:var(--bg); background-image:radial-gradient(var(--grid) .85px,transparent .85px); background-size:22px 22px; }
.canvas::after { content:""; position:absolute; inset:0; pointer-events:none; background:radial-gradient(ellipse at center,transparent 35%,var(--bg) 100%); opacity:.5; }
.world { position:absolute; width:100%; height:100%; transform-origin:center; transition:transform .18s ease; z-index:1; }
.wires { position:absolute; width:100%; height:100%; overflow:visible; pointer-events:none; }
.wire { stroke:var(--subtle); opacity:.55; stroke-width:1.6; fill:none; vector-effect:non-scaling-stroke; }
.wire.selected { stroke:var(--accent); opacity:.9; stroke-width:2; }
.node { position:absolute; transform:translate(-50%,-50%); width:182px; min-height:64px; display:flex; text-align:left; align-items:center; gap:10px; padding:11px 12px; border:1px solid var(--line); border-radius:11px; background:var(--panel); box-shadow:0 4px 12px #1118270a; }
.node:hover { border-color:var(--accent); }
.node.current { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft),var(--shadow); }
.node.unknown { border-style:dashed; }
.node-icon { width:32px; height:32px; flex:none; display:grid; place-items:center; border-radius:8px; background:var(--accent-soft); color:var(--accent); font-weight:750; font-size:15px; }
.node-copy { min-width:0; display:grid; gap:1px; }
.node-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:700; letter-spacing:-.01em; }
.node-prefix { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-size:11px; }
.node-port { position:absolute; top:50%; width:9px; height:9px; border-radius:50%; border:2px solid var(--panel); background:var(--accent); transform:translateY(-50%); }
.node-port.left { left:-5px; }.node-port.right { right:-5px; }
.floating { position:absolute; z-index:4; background:var(--panel); border:1px solid var(--line); box-shadow:var(--shadow); }
.bar { display:flex; align-items:center; gap:8px; padding:8px; border-radius:14px; }
.brand { display:flex; align-items:center; gap:9px; font-weight:750; letter-spacing:-.025em; white-space:nowrap; }
.logo { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; background:#4f46e5; color:white; font-size:16px; }
.muted { color:var(--muted); }.tiny { color:var(--muted); font-size:11px; }.grow { flex:1; }
.separator { width:1px; align-self:stretch; background:var(--line); margin:3px 4px; }
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid transparent; background:transparent; color:var(--muted); min-height:32px; padding:5px 9px; border-radius:8px; font-size:12px; font-weight:600; white-space:nowrap; }
.btn:hover { color:var(--text); background:var(--accent-soft); }
.btn.active { color:var(--text); background:var(--panel); box-shadow:0 1px 3px #0002; }
.btn.primary { color:white; background:#4f46e5; }
.btn.outline { color:var(--text); border-color:var(--line); background:var(--panel); }
.btn:disabled { opacity:.45; cursor:not-allowed; }
.segmented { display:flex; background:var(--bg); border:1px solid var(--line); padding:3px; border-radius:10px; }
.search { display:flex; align-items:center; gap:8px; color:var(--subtle); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:0 10px; height:34px; }
.search input { width:120px; border:0; outline:0; background:transparent; color:var(--text); font-size:12px; }
.status { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; }.dot { width:7px; height:7px; background:#34b88a; border-radius:50%; }
.detail { width:340px; max-height:calc(100vh - 170px); display:flex; flex-direction:column; border-radius:15px; overflow:hidden; }
.detail-top { display:flex; align-items:center; gap:8px; padding:13px 15px; border-bottom:1px solid var(--line); }
.a .detail-top { cursor:move; touch-action:none; }
.eyebrow { color:var(--muted); font-size:10px; font-weight:750; text-transform:uppercase; letter-spacing:.09em; }
.detail-body { padding:18px; min-height:0; max-height:min(65vh,490px); overflow:auto; }
.detail-title { display:flex; align-items:flex-start; gap:10px; }
.detail-icon { display:grid; place-items:center; flex:none; width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent); font-size:18px; font-weight:700; }
.detail h2 { margin:0; font-size:17px; letter-spacing:-.025em; overflow-wrap:anywhere; }
.detail h3 { margin:19px 0 9px; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.07em; }
.detail p { color:var(--muted); font-size:12px; line-height:1.65; margin:14px 0; overflow-wrap:anywhere; }
.pill { display:inline-flex; align-items:center; gap:5px; padding:3px 7px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--muted); font-size:10px; font-weight:650; }
.detail-row { display:flex; align-items:center; gap:8px; min-height:34px; padding:6px 0; border-top:1px solid var(--line); font-size:12px; overflow-wrap:anywhere; }
.detail-row .key { width:86px; flex:none; color:var(--muted); }.detail-row .value { min-width:0; }
.rel { display:flex; width:100%; text-align:left; align-items:center; gap:8px; border:1px solid var(--line); border-radius:8px; background:var(--panel); padding:7px 9px; margin:6px 0; font-size:11px; }
.rel:hover { border-color:var(--accent); }.rel b { color:var(--accent); }
.detail-footer { padding:10px 14px; border-top:1px solid var(--line); display:flex; gap:6px; }
.zoom { display:flex; align-items:center; gap:3px; border-radius:10px; padding:4px; }
.prototype-bar { position:absolute; z-index:20; bottom:14px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:8px; padding:5px 7px; border-radius:99px; background:#191b26; color:#fff; box-shadow:0 8px 26px #0004; font-size:11px; white-space:nowrap; }
.prototype-bar button { border:0; background:#353848; color:#fff; border-radius:99px; padding:5px 10px; }
.prototype-bar strong { min-width:132px; text-align:center; }
.prototype-note { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#adb2c2; }
.file-input { display:none; }
.notice { position:absolute; z-index:9; top:95px; left:50%; transform:translateX(-50%); max-width:80%; padding:10px 15px; border-radius:9px; color:var(--text); background:var(--panel); border:1px solid var(--line); box-shadow:var(--shadow); font-size:12px; }
.notice:empty { display:none; }
/* A: small floating controls and an on-canvas, node-adjacent card. */
.a .topbar { top:18px; left:20px; right:20px; }
.a .detail { top:100px; left:50%; }
.a .zoom { bottom:22px; right:22px; }.a .summary { bottom:24px; left:24px; }
/* B: left navigation rail and a persistent right-hand inspector floating over the canvas. */
.b .topbar { top:16px; left:82px; right:20px; }
.b .rail { top:16px; bottom:16px; left:16px; width:50px; border-radius:15px; display:flex; flex-direction:column; align-items:center; gap:8px; padding:9px 5px; }
.b .rail .btn { width:38px; font-size:16px; }
.b .detail { top:86px; right:20px; bottom:70px; width:360px; display:flex; flex-direction:column; }
.b .detail-body { max-height:none; flex:1; }
.b .zoom { bottom:19px; right:20px; }.b .summary { bottom:24px; left:86px; }
.b .node.current { background:var(--accent-soft); }
/* C: compact command strip, entity browser, and a wide horizontal contextual card. */
.c .topbar { top:18px; left:50%; transform:translateX(-50%); }
.c .browser { top:18px; left:18px; width:216px; border-radius:14px; overflow:hidden; }
.browser-head { padding:14px; border-bottom:1px solid var(--line); }
.browser-list { padding:8px; max-height:38vh; overflow:auto; }
.browser-item { display:flex; gap:8px; align-items:center; width:100%; border:0; background:transparent; border-radius:7px; padding:8px; text-align:left; font-size:11px; color:var(--muted); }
.browser-item.current { background:var(--accent-soft); color:var(--accent); font-weight:700; }
.c .detail { top:100px; left:50%; width:490px; }
.c .detail-body { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; max-height:42vh; }
.c .detail-body .overview { grid-row:span 2; }.c .detail-body h3:first-child { margin-top:0; }
.c .zoom { bottom:20px; right:20px; }.c .summary { bottom:24px; left:22px; }
@media (max-width:1000px) { .a .detail { left:auto; right:15px; }.c .browser { width:180px; }.c .topbar { left:auto; right:12px; transform:none; }.b .detail { width:300px; }.node { width:150px; } }
@media (max-width:680px) { .detail,.b .detail,.c .detail { width:calc(100% - 32px); left:16px; right:16px; top:auto; bottom:75px; max-height:48vh; }.detail-body,.b .detail-body,.c .detail-body { max-height:32vh; overflow:auto; }.c .browser { display:none; }.topbar .optional { display:none; }.topbar .search { display:none; }.prototype-bar { bottom:9px; }.summary { display:none; } }
`;

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function mountVisualPrototype() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}</style><div class="app"></div>`;
  const app = root.querySelector('.app') as HTMLElement;
  const labels = { A: 'Anchored canvas', B: 'Inspector dock', C: 'Context workspace' } as const;
  type Variant = keyof typeof labels;
  const requested = new URLSearchParams(location.search).get('variant');
  let variant: Variant = requested === 'B' || requested === 'C' ? requested : 'A';
  let graph: Graph = deriveGraph(sample);
  let documentName = 'commerce-lineage.json';
  let theme = 'light';
  let mode = 'view';
  let selected = 'model.orders';
  let persistent = true;
  let draggedPosition: { x: number; y: number } | null = null;
  let drag: { pointerId: number; startX: number; startY: number; cardX: number; cardY: number; moved: boolean } | null = null;
  let pointer = { x: 0, y: 0 };
  let closePreviewTimer = 0;
  let zoom = 100;
  let filter = '';
  let notice = '';

  function detail(entity: GraphEntity) {
    const downstream = graph.entities.filter(item => item.dependencies.includes(entity.name));
    const extra = entity.extras || [];
    const links = (names: string[]) => names.length
      ? names.map(name => `<button class="rel" data-select="${escape(name)}"><b>↗</b><span>${escape(name)}</span><span class="grow"></span><span class="muted">›</span></button>`).join('')
      : '<span class="tiny">None</span>';
    return `<section class="detail floating" aria-label="Entity details">
      <div class="detail-top"><span class="eyebrow">${persistent ? 'Selected on canvas' : 'Hover preview'}</span><span class="grow"></span>${variant === 'A' ? `<span class="tiny">${draggedPosition ? 'Hover to inspect · ' : ''}⠿ Drag to move</span>` : ''}<button class="btn" data-action="close" aria-label="Close details">✕</button></div>
      <div class="detail-body">
        <div class="overview"><div class="detail-title"><div class="detail-icon">▦</div><div><h2>${escape(entity.name)}</h2><span class="tiny">${entity.documented ? 'Documented Entity' : 'Undocumented dependency'}</span></div></div>
        <p>${escape(entity.description || (entity.documented ? 'No description provided.' : 'This dependency has no Entity record.'))}</p>
        <span class="pill">● ${entity.documented ? 'Documented' : 'Undocumented'}</span>
        ${extra.map(([key, value]) => `<div class="detail-row"><span class="key">${escape(key)}</span><span class="value">${escape(typeof value === 'string' ? value : JSON.stringify(value))}</span></div>`).join('')}</div>
        <div><h3>Dependencies · ${entity.dependencies.length}</h3>${links(entity.dependencies)}<h3>Used by · ${downstream.length}</h3>${links(downstream.map(item => item.name))}</div>
      </div>
      <div class="detail-footer"><button class="btn outline" data-action="upstream">↖ Upstream</button><button class="btn outline" data-action="downstream">↗ Downstream</button><span class="grow"></span>${mode === 'edit' ? '<button class="btn primary" data-action="edit">Edit Entity</button>' : '<span class="tiny">Click a related Entity to navigate</span>'}</div>
    </section>`;
  }

  function graphMarkup() {
    const entities = graph.entities.slice(0, 35);
    const map = new Map(entities.map(entity => [entity.name, entity]));
    const ranks = new Map<string, number>();
    function rank(name: string, visiting = new Set<string>()): number {
      if (ranks.has(name)) return ranks.get(name)!;
      if (visiting.has(name)) return 0;
      visiting.add(name);
      const deps = map.get(name)?.dependencies.filter(dep => map.has(dep)) || [];
      const value = deps.length ? Math.max(...deps.map(dep => rank(dep, new Set(visiting)))) + 1 : 0;
      ranks.set(name, value);
      return value;
    }
    entities.forEach(entity => rank(entity.name));
    const maxRank = Math.max(2, ...ranks.values());
    const cols = new Map<number, GraphEntity[]>();
    entities.forEach(entity => { const r = ranks.get(entity.name)!; cols.set(r, [...(cols.get(r) || []), entity]); });
    const positions = new Map<string, { x: number; y: number }>();
    cols.forEach((column, r) => column.forEach((entity, index) => {
      const x = 25 + r / maxRank * 46;
      const y = 33 + (index + 1) / (column.length + 1) * 38;
      positions.set(entity.name, { x, y });
    }));
    const wires = graph.edges.map(edge => {
      const from = positions.get(edge.source), to = positions.get(edge.target);
      if (!from || !to) return '';
      const offset = (innerWidth <= 1000 ? 75 : 91) / innerWidth * 100;
      const start = from.x + offset, end = to.x - offset;
      return `<path class="wire ${edge.source === selected || edge.target === selected ? 'selected' : ''}" marker-end="url(#wire-arrow)" d="M ${start} ${from.y} C ${start + 5} ${from.y}, ${end - 5} ${to.y}, ${end} ${to.y}"/>`;
    }).join('');
    const nodes = entities.map(entity => {
      const p = positions.get(entity.name)!;
      const pieces = entity.name.split('.'); const short = pieces.pop() || entity.name;
      const faded = filter && !entity.name.toLowerCase().includes(filter.toLowerCase());
      return `<button class="node ${entity.name === selected ? 'current' : ''} ${entity.documented ? '' : 'unknown'}" data-node="${escape(entity.name)}" style="left:${p.x}%;top:${p.y}%;${faded ? 'opacity:.22' : ''}" aria-label="${escape(entity.name)}">
        ${mode === 'edit' ? '<span class="node-port left"></span><span class="node-port right"></span>' : ''}
        <span class="node-icon">▦</span><span class="node-copy"><span class="node-name">${escape(short)}</span><span class="node-prefix">${escape(pieces.join('.') || 'Entity')}</span></span></button>`;
    }).join('');
    return `<div class="world" style="transform:scale(${zoom / 100})"><svg class="wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="wire-arrow" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L5 2.5 L0 5 Z" fill="var(--subtle)"/></marker></defs>${wires}</svg>${nodes}</div>`;
  }

  function browser() {
    return `<div class="browser floating"><div class="browser-head"><div class="brand"><span class="logo">⌘</span> Dependency viewer</div><p class="tiny">YOUR DOCUMENT</p><strong style="font-size:12px">${escape(documentName)}</strong><div class="tiny">${graph.entities.length} entities</div></div><div class="browser-list"><div class="eyebrow" style="padding:6px 8px">Entities</div>${graph.entities.slice(0, 20).map(entity => `<button class="browser-item ${entity.name === selected ? 'current' : ''}" data-select="${escape(entity.name)}"><span>▦</span>${escape(entity.name)}</button>`).join('')}</div></div>`;
  }
  function toolbar() {
    const brand = `<div class="brand optional"><span class="logo">⌘</span><span>Dependency viewer</span></div><span class="separator optional"></span>`;
    const documentControl = `<button class="btn outline optional" data-action="file">▤ ${escape(documentName)} ▾</button>`;
    const search = `<label class="search optional">⌕ <input aria-label="Filter entities" placeholder="Find an Entity..." value="${escape(filter)}"></label>`;
    const modes = `<div class="segmented"><button class="btn ${mode === 'view' ? 'active' : ''}" data-mode="view">View</button><button class="btn ${mode === 'edit' ? 'active' : ''}" data-mode="edit">Edit</button></div>`;
    const themeButton = `<button class="btn" data-action="theme" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} mode">${theme === 'light' ? '☾' : '☀'}</button>`;
    if (variant === 'A') return `<div class="topbar bar floating">${brand}${documentControl}<span class="grow"></span>${search}${modes}<button class="btn outline optional" data-action="export">Export ↗</button>${themeButton}</div>`;
    if (variant === 'B') return `<div class="rail floating"><div class="logo">⌘</div><button class="btn active" title="Graph">⌘</button><button class="btn" data-action="file" title="Open Document">▤</button><button class="btn" data-action="search" title="Find Entity">⌕</button><span class="grow"></span>${themeButton}</div><div class="topbar bar floating"><div><strong style="font-size:12px">${escape(documentName)}</strong><div class="tiny">${graph.entities.length} entities · local Document</div></div><span class="grow"></span>${search}${modes}<button class="btn outline optional" data-action="export">Export ↗</button></div>`;
    return `${browser()}<div class="topbar bar floating">${search}${modes}<button class="btn outline optional" data-action="file">Open</button>${themeButton}</div>`;
  }
  function render() {
    host.setAttribute('data-theme', theme);
    app.className = `app ${variant.toLowerCase()}`;
    const entity = graph.entities.find(item => item.name === selected);
    app.innerHTML = `<div class="canvas" aria-label="Dependency graph">${graphMarkup()}</div>${toolbar()}
      ${entity ? detail(entity) : ''}
      <div class="summary floating bar"><span class="status"><span class="dot"></span>${graph.entities.length} entities <span>·</span> ${graph.edges.length} connections <span>·</span> ${escape(mode)} mode</span></div>
      <div class="zoom floating"><button class="btn" data-action="zoom-out" aria-label="Zoom out">−</button><span class="tiny">${zoom}%</span><button class="btn" data-action="zoom-in" aria-label="Zoom in">＋</button><button class="btn" data-action="fit">Fit</button></div>
      <div class="notice" role="status">${escape(notice)}</div>
      <input class="file-input" type="file" accept=".json,application/json">
      <div class="prototype-bar"><span class="prototype-note">Prototype</span><button data-action="previous" aria-label="Previous variant">←</button><strong>${variant} · ${labels[variant]}</strong><button data-action="next" aria-label="Next variant">→</button></div>`;
    if (entity && variant !== 'B' && innerWidth > 680) {
      const node = [...root.querySelectorAll<HTMLElement>('[data-node]')].find(item => item.dataset.node === selected);
      const card = root.querySelector<HTMLElement>('.detail');
      if (node && card) {
        const anchor = node.getBoundingClientRect();
        const cardBounds = card.getBoundingClientRect();
        const preferredX = anchor.right + 18 + cardBounds.width <= innerWidth - 16
          ? anchor.right + 18
          : anchor.left - cardBounds.width - 18;
        const preferredY = anchor.top - 100;
        const x = variant === 'A' && draggedPosition ? draggedPosition.x : preferredX;
        const y = variant === 'A' && draggedPosition ? draggedPosition.y : preferredY;
        const moved = variant === 'A' && draggedPosition;
        card.style.left = `${Math.max(moved ? 0 : 16, Math.min(innerWidth - cardBounds.width - (moved ? 0 : 16), x))}px`;
        card.style.top = `${Math.max(moved ? 0 : 90, Math.min(innerHeight - cardBounds.height - (moved ? 0 : 70), y))}px`;
      }
    }
  }
  function changeVariant(direction: number) {
    const options: Variant[] = ['A', 'B', 'C'];
    variant = options[(options.indexOf(variant) + direction + options.length) % options.length];
    const url = new URL(location.href); url.searchParams.set('variant', variant); history.replaceState(null, '', url);
    notice = ''; render();
  }
  app.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const select = target.closest<HTMLElement>('[data-select], [data-node]');
    if (select) { selected = select.dataset.select || select.dataset.node || ''; persistent = true; notice = ''; render(); return; }
    const modeTarget = target.closest<HTMLElement>('[data-mode]');
    if (modeTarget) { mode = modeTarget.dataset.mode!; notice = mode === 'edit' ? 'Visual preview only: try actual graph editing in the separate interaction prototype.' : ''; render(); return; }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'previous' || action === 'next') { changeVariant(action === 'next' ? 1 : -1); return; }
    if (action === 'file') { (root.querySelector('.file-input') as HTMLInputElement).click(); return; }
    if (action === 'search') { (root.querySelector('.search input') as HTMLInputElement | null)?.focus(); return; }
    if (action === 'theme') theme = theme === 'light' ? 'dark' : 'light';
    else if (action === 'close') { selected = ''; persistent = false; draggedPosition = null; }
    else if (action === 'zoom-in') zoom = Math.min(140, zoom + 10);
    else if (action === 'zoom-out') zoom = Math.max(70, zoom - 10);
    else if (action === 'fit') zoom = 100;
    else if (action === 'export' || action === 'edit' || action === 'upstream' || action === 'downstream') notice = 'This is a visual prototype; the production viewer retains this capability.';
    render();
  });
  app.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.matches('.search input')) {
      filter = input.value;
      root.querySelectorAll<HTMLElement>('[data-node]').forEach(node => { node.style.opacity = !filter || node.dataset.node?.toLowerCase().includes(filter.toLowerCase()) ? '1' : '.22'; });
    }
  });
  app.addEventListener('change', async event => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('.file-input') || !input.files?.[0]) return;
    try {
      graph = deriveGraph(parseDocument(await input.files[0].text()));
      documentName = input.files[0].name; selected = graph.entities[0]?.name || ''; persistent = true; draggedPosition = null;
      notice = graph.entities.length > 35 ? 'Visual prototype shows the first 35 entities; the production viewer is not limited to 35.' : '';
    } catch (error) { notice = `Could not open Document: ${(error as Error).message}`; }
    render();
  });
  app.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    const header = target.closest<HTMLElement>('.detail-top');
    const card = target.closest<HTMLElement>('.detail');
    if (variant !== 'A' || !header || !card || target.closest('button') || event.button !== 0) return;
    const bounds = card.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, cardX: bounds.x, cardY: bounds.y, moved: false };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  app.addEventListener('pointermove', event => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!drag || drag.pointerId !== event.pointerId) return;
    const card = root.querySelector<HTMLElement>('.detail');
    if (!card) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < 3 && !drag.moved) return;
    drag.moved = true;
    persistent = true;
    draggedPosition = {
      x: Math.max(0, Math.min(innerWidth - card.offsetWidth, drag.cardX + dx)),
      y: Math.max(0, Math.min(innerHeight - card.offsetHeight, drag.cardY + dy)),
    };
    card.style.left = `${draggedPosition.x}px`;
    card.style.top = `${draggedPosition.y}px`;
    const label = card.querySelector<HTMLElement>('.eyebrow');
    if (label) label.textContent = 'Selected on canvas';
  });
  app.addEventListener('pointerup', event => {
    if (drag?.pointerId === event.pointerId) drag = null;
  });
  app.addEventListener('pointercancel', () => { drag = null; });
  app.addEventListener('pointerover', event => {
    if ((event.target as HTMLElement).closest('[data-node], .detail')) clearTimeout(closePreviewTimer);
    if (drag || (persistent && !(variant === 'A' && draggedPosition))) return;
    const node = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
    if (node && node.dataset.node !== selected) { selected = node.dataset.node || ''; render(); }
  });
  app.addEventListener('focusin', event => {
    if (variant !== 'A' || !draggedPosition) return;
    const node = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
    if (node && node.dataset.node !== selected) {
      selected = node.dataset.node || '';
      render();
      [...root.querySelectorAll<HTMLElement>('[data-node]')].find(item => item.dataset.node === selected)?.focus();
    }
  });
  app.addEventListener('pointerout', event => {
    if (persistent || drag || !(event.target as HTMLElement).closest('[data-node], .detail')) return;
    clearTimeout(closePreviewTimer);
    closePreviewTimer = window.setTimeout(() => {
      const current = root.elementFromPoint(pointer.x, pointer.y);
      if (!persistent && !drag && !current?.closest('[data-node], .detail')) { selected = ''; render(); }
    }, 250);
  });
  document.addEventListener('keydown', event => {
    const focused = root.activeElement as HTMLElement | null;
    if (focused && (['INPUT', 'TEXTAREA'].includes(focused.tagName) || focused.isContentEditable)) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeVariant(event.key === 'ArrowRight' ? 1 : -1); }
  });
  render();
}
