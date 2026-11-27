import './style.css';
import type cytoscape = require('cytoscape');
import { parseDocument, deriveGraph } from './data';
import { createDocumentSession, type DocumentSession } from './document-session';
import * as documentEdits from './document-edits';
import { setupColourSettings, writeColourSettings } from './colour-settings';
import { setupPresentationSettings, writePresentationSettings } from './presentation-settings';
import { showGraph } from './graph-navigation';
import { setupTheme } from './theme';
import type { Graph } from './document-types';

setupTheme(window, document);
const fileInput = document.getElementById('dependency-file') as HTMLInputElement;
const fileError = document.getElementById('file-error') as HTMLElement;
const filePanel = document.getElementById('file-panel') as HTMLElement;
const mainTemplate = document.querySelector('main')!.cloneNode(true);
const footerTemplate = document.querySelector('footer')!.cloneNode(true);
(document.getElementById('status') as HTMLElement).textContent = 'Choose a JSON file to view dependencies.';
const header = document.querySelector('header')!;
let toolbarObserver: ResizeObserver | undefined;
function positionSurfaces() {
  const top = header.getBoundingClientRect().bottom + 8;
  const toolbar = document.querySelector<HTMLElement>('.workspace-toolbar');
  document.documentElement.style.setProperty('--toolbar-top', `${top}px`);
  document.documentElement.style.setProperty('--editor-top', `${top + (toolbar?.offsetHeight || 0) + 8}px`);
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(positionSurfaces).observe(header);
let cleanupGraph = () => {};
let resizeGraph = () => {};
let selection = 0;
let session: DocumentSession | null = null;
let mode: 'view' | 'edit' = 'view';
let documentName = 'dependency-document.json';
const metadataEntity = document.getElementById('metadata-entity') as HTMLSelectElement;
const metadataProperty = document.getElementById('metadata-property') as HTMLSelectElement;
const metadataKey = document.getElementById('metadata-key') as HTMLInputElement;
const metadataValue = document.getElementById('metadata-value') as HTMLTextAreaElement;
const metadataError = document.getElementById('metadata-error') as HTMLElement;
let metadataBaseline = ['', ''];
let metadataKeys: string[] = [];
let metadataRejected = false;
let inspection: ReturnType<typeof showGraph>['inspection'] | null = null;
let newEntityRejected = false;
const hasMetadataDraft = () =>
  metadataRejected || metadataKey.value !== metadataBaseline[0] || metadataValue.value !== metadataBaseline[1];
const hasEntityDraft = () => inspection?.hasEntityDraft();
const hasDependencyDraft = () => inspection?.hasDependencyDraft();
const hasNewEntityDraft = () =>
  newEntityRejected ||
  (document.getElementById('new-entity-name') as HTMLInputElement).value !== '' ||
  (document.getElementById('new-entity-description') as HTMLTextAreaElement).value !== '';
const isUnsaved = () =>
  session &&
  (session.isUnsaved() || hasMetadataDraft() || hasEntityDraft() || hasDependencyDraft() || hasNewEntityDraft());
function requireNoConflictingFormDraft(owner?: string) {
  if (owner !== 'property' && hasMetadataDraft())
    throw new Error('Apply or discard the property draft before editing the Document.');
  if (owner !== 'entity' && hasEntityDraft())
    throw new Error('Apply or discard the Entity draft before editing the Document.');
  if (owner !== 'dependency' && hasDependencyDraft())
    throw new Error('Apply or discard the Direct dependency draft before editing the Document.');
  if (owner !== 'new-entity' && hasNewEntityDraft())
    throw new Error('Apply or discard the new Entity draft before editing the Document.');
}
let colourControls: ReturnType<typeof setupColourSettings>;
let presentationControls: ReturnType<typeof setupPresentationSettings>;
let displayedGraph: string;

function setupDocumentSettings(graph: cytoscape.Core) {
  colourControls = setupColourSettings(document, graph, {
    data: JSON.parse(session!.current()),
    change(enabled, rules) {
      requireNoConflictingFormDraft();
      const data = JSON.parse(session!.current());
      session!.replace(JSON.stringify(writeColourSettings(data, enabled, rules)));
      updateDocumentControls();
      (document.getElementById('document-status') as HTMLElement).textContent = '';
    },
  });
  presentationControls = setupPresentationSettings(document, graph, {
    data: JSON.parse(session!.current()),
    change(state) {
      requireNoConflictingFormDraft();
      const data = JSON.parse(session!.current());
      session!.replace(JSON.stringify(writePresentationSettings(data, state)));
      updateDocumentControls();
      (document.getElementById('document-status') as HTMLElement).textContent = '';
    },
  });
}

function openDocument(raw: string, name: string) {
  let nextDocument;
  let graph;
  try {
    nextDocument = parseDocument(raw);
    graph = deriveGraph(nextDocument);
  } catch (error) {
    fileError.textContent = `Error: unusable dependency data. ${(error as Error).message}`;
    return;
  }
  if (isUnsaved() && !window.confirm('Replace the Document and lose unsaved changes and drafts?')) return;
  session = createDocumentSession(nextDocument);
  mode = 'view';
  (document.getElementById('draft-resolution') as HTMLElement).hidden = true;
  for (const id of ['document-panel', 'add-entity-panel', 'metadata-panel']) {
    (document.getElementById(id) as HTMLDetailsElement).open = false;
  }
  inspection = null;
  newEntityRejected = false;
  document.body.dataset.loaded = 'true';
  documentName = name;
  (document.getElementById('document-name') as HTMLElement).textContent = name;
  (document.getElementById('document-name') as HTMLElement).title = name;
  (document.getElementById('open-prompt') as HTMLElement).hidden = true;
  (document.getElementById('file-document-actions') as HTMLElement).hidden = false;
  (document.getElementById('add-entity-form') as HTMLFormElement).reset();
  resetMetadata();
  updateDocumentControls();
  (document.getElementById('document-panel') as HTMLDetailsElement).hidden = false;
  (document.getElementById('add-entity-panel') as HTMLDetailsElement).hidden = false;
  (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
  (document.getElementById('document-status') as HTMLElement).textContent = '';
  (document.getElementById('document-error') as HTMLElement).textContent = '';
  renderGraph(graph);
  fileError.textContent = '';
  (document.getElementById('file-name') as HTMLElement).textContent = name;
  updateDocumentControls();
}

function renderGraph(graph: Graph, selectedName?: string) {
  cleanupGraph();
  inspection = null;
  toolbarObserver?.disconnect();
  document.querySelector('main')!.replaceWith(mainTemplate.cloneNode(true));
  if (typeof ResizeObserver !== 'undefined') {
    const toolbar = document.querySelector('.workspace-toolbar')!;
    toolbarObserver = new ResizeObserver(positionSurfaces);
    toolbarObserver.observe(toolbar);
  }
  document.querySelector('footer')!.replaceWith(footerTemplate.cloneNode(true));
  displayedGraph = JSON.stringify(graph);
  filePanel.hidden = true;
  (document.getElementById('toggle-file-panel') as HTMLButtonElement).setAttribute(
    'aria-expanded',
    String(!filePanel.hidden),
  );
  const navigation = showGraph(graph, selectedName, {
    session: session!,
    setupDocumentSettings,
    tooltipsEnabled: () => presentationControls.tooltipsEnabled(),
    requireNoConflictingFormDraft,
    updateDocumentControls,
    refreshDocument,
  });
  if (!graph.entities.length) {
    (document.getElementById('status') as HTMLElement).textContent = 'No entities in this dependency dataset.';
  }
  inspection = navigation.inspection;
  cleanupGraph = navigation.cleanup;
  resizeGraph = navigation.resize;
  updateDocumentControls();
}

function updateDocumentControls() {
  if (!session) return;
  const metadataDraft = hasMetadataDraft();
  const formDraft = metadataDraft || hasEntityDraft() || hasDependencyDraft() || hasNewEntityDraft();
  const editor = document.getElementById('document-json') as HTMLTextAreaElement;
  if (editor.value !== session.draft()) editor.value = session.draft();
  editor.disabled = formDraft;
  editor.readOnly = mode === 'view';
  document.body.dataset.mode = mode;
  (document.getElementById('mode-view') as HTMLButtonElement).setAttribute('aria-pressed', String(mode === 'view'));
  (document.getElementById('mode-edit') as HTMLButtonElement).setAttribute('aria-pressed', String(mode === 'edit'));
  (document.getElementById('mode-edit') as HTMLButtonElement).disabled = false;
  (document.getElementById('document-settings-fields') as HTMLFieldSetElement).disabled = mode === 'view';
  (document.getElementById('unsaved-indicator') as HTMLElement).textContent = isUnsaved() ? '— Unsaved changes' : '';
  (document.getElementById('apply-document') as HTMLButtonElement).disabled = !session.hasDraft() || formDraft;
  (document.getElementById('discard-document') as HTMLButtonElement).disabled = !session.hasDraft();
  (document.getElementById('undo-document') as HTMLButtonElement).disabled = !session.canUndo() || formDraft;
  (document.getElementById('redo-document') as HTMLButtonElement).disabled = !session.canRedo() || formDraft;
  (document.getElementById('download-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  (document.getElementById('copy-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  (document.getElementById('file-copy-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  (document.getElementById('file-download-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  const status = document.getElementById('document-status') as HTMLElement;
  if (formDraft) status.textContent = 'Apply or discard the form draft before saving.';
  else if (status.textContent === 'Apply or discard the form draft before saving.') status.textContent = '';
  metadataEntity.disabled = metadataDraft;
  metadataProperty.disabled = metadataDraft;
  (document.getElementById('metadata-discard') as HTMLButtonElement).disabled = !metadataDraft;
  (document.getElementById('metadata-remove') as HTMLButtonElement).disabled =
    metadataDraft || metadataProperty.value === '';
}

(document.getElementById('mode-edit') as HTMLButtonElement).addEventListener('click', () => {
  if (!session) return;
  resolutionPanel.hidden = true;
  mode = 'edit';
  updateDocumentControls();
});
const resolutionPanel = document.getElementById('draft-resolution') as HTMLElement;
const resolutionActions = document.getElementById('draft-resolution-actions') as HTMLElement;
const resolutionError = document.getElementById('draft-resolution-error') as HTMLElement;
function drafts() {
  return [
    {
      name: 'JSON',
      active: () => session!.hasDraft(),
      apply: '#apply-document',
      discard: '#discard-document',
      error: '#document-error',
    },
    {
      name: 'property',
      active: hasMetadataDraft,
      apply: '#metadata-form',
      discard: '#metadata-discard',
      error: '#metadata-error',
    },
    {
      name: 'Entity',
      active: hasEntityDraft,
      apply: '#edit-entity-form',
      discard: '#discard-entity-draft',
      error: '#edit-entity-error',
    },
    {
      name: 'Direct dependency',
      active: hasDependencyDraft,
      apply: '#add-dependency-form',
      discard: '#discard-dependency-draft',
      error: '#dependency-error',
    },
    {
      name: 'new Entity',
      active: hasNewEntityDraft,
      apply: '#add-entity-form',
      discard: '#discard-new-entity-draft',
      error: '#add-entity-error',
    },
  ].filter((draft) => draft.active());
}
function showDraftResolution() {
  const pending = drafts();
  resolutionActions.replaceChildren();
  if (!pending.length) {
    resolutionPanel.hidden = true;
    mode = 'view';
    updateDocumentControls();
    (document.getElementById('mode-view') as HTMLButtonElement).focus();
    return;
  }
  resolutionPanel.hidden = false;
  for (const draft of pending) {
    const row = document.createElement('div');
    for (const action of ['apply', 'discard'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${action === 'apply' ? 'Apply' : 'Discard'} ${draft.name} draft`;
      button.addEventListener('click', () => {
        resolutionError.textContent = '';
        if (!draft.active()) {
          showDraftResolution();
          return;
        }
        if (action === 'apply' && drafts().length > 1) {
          resolutionError.textContent = 'Discard conflicting drafts before applying another draft.';
          return;
        }
        const target = document.querySelector<HTMLElement>(draft[action])!;
        if (target instanceof HTMLFormElement) target.requestSubmit();
        else target.click();
        if (draft.active()) {
          resolutionError.textContent =
            document.querySelector<HTMLElement>(draft.error)?.textContent || 'Draft could not be applied.';
        } else {
          showDraftResolution();
        }
      });
      row.appendChild(button);
    }
    resolutionActions.appendChild(row);
  }
  resolutionActions.querySelector<HTMLButtonElement>('button')?.focus();
}
(document.getElementById('draft-stay') as HTMLButtonElement).addEventListener('click', () => {
  resolutionPanel.hidden = true;
  resolutionError.textContent = '';
  (document.getElementById('mode-edit') as HTMLButtonElement).focus();
});
(document.getElementById('mode-view') as HTMLButtonElement).addEventListener('click', () => {
  if (!session) return;
  resolutionError.textContent = '';
  showDraftResolution();
});

function refreshDocument(selectedName?: string) {
  resetMetadata(selectedName);
  updateDocumentControls();
  (document.getElementById('document-error') as HTMLElement).textContent = '';
  (document.getElementById('document-status') as HTMLElement).textContent = '';
  const graph = deriveGraph(parseDocument(session!.current()));
  if (JSON.stringify(graph) === displayedGraph) {
    colourControls.update(JSON.parse(session!.current()));
    presentationControls.update(JSON.parse(session!.current()));
  } else renderGraph(graph, selectedName);
}

function resetMetadata(selectedName = metadataEntity.value) {
  const data = parseDocument(session!.current());
  metadataEntity.replaceChildren();
  for (const entity of data.entities) {
    const option = document.createElement('option');
    option.value = entity.name;
    option.textContent = entity.name;
    metadataEntity.appendChild(option);
  }
  if (data.entities.some((entity) => entity.name === selectedName)) metadataEntity.value = selectedName;
  (document.getElementById('metadata-panel') as HTMLDetailsElement).hidden = !data.entities.length;
  resetMetadataProperties();
}

function resetMetadataProperties() {
  const entity = parseDocument(session!.current()).entities.find((item) => item.name === metadataEntity.value);
  metadataKeys = entity
    ? Object.keys(entity).filter((key) => !['name', 'dependencies', 'description'].includes(key))
    : [];
  metadataProperty.replaceChildren();
  const add = document.createElement('option');
  add.value = '';
  add.textContent = 'New property';
  metadataProperty.appendChild(add);
  metadataKeys.forEach((key, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = key;
    metadataProperty.appendChild(option);
  });
  resetMetadataDraft();
}

function resetMetadataDraft() {
  const entity = parseDocument(session!.current()).entities.find((item) => item.name === metadataEntity.value);
  const editing = metadataProperty.value !== '';
  metadataKey.value = editing ? metadataKeys[Number(metadataProperty.value)] : '';
  metadataKey.readOnly = editing;
  metadataValue.value = editing ? JSON.stringify(entity![metadataKey.value], null, 2) : '';
  metadataBaseline = [metadataKey.value, metadataValue.value];
  metadataRejected = false;
  metadataError.textContent = '';
  updateDocumentControls();
}

metadataEntity.addEventListener('change', resetMetadataProperties);
metadataProperty.addEventListener('change', resetMetadataDraft);
for (const input of [metadataKey, metadataValue]) {
  input.addEventListener('input', () => {
    metadataError.textContent = '';
    updateDocumentControls();
  });
}
(document.getElementById('metadata-discard') as HTMLButtonElement).addEventListener('click', resetMetadataDraft);
(document.getElementById('metadata-form') as HTMLFormElement).addEventListener('submit', (event) => {
  event.preventDefault();
  let validating = false;
  try {
    requireNoConflictingFormDraft('property');
    validating = true;
    const name = metadataEntity.value;
    documentEdits.setProperty(session!, name, metadataKey.value, metadataValue.value, metadataProperty.value === '');
    refreshDocument(name);
  } catch (error) {
    if (validating) metadataRejected = true;
    metadataError.textContent = `Error: ${(error as Error).message}`;
    updateDocumentControls();
  }
});
(document.getElementById('metadata-remove') as HTMLButtonElement).addEventListener('click', () => {
  try {
    requireNoConflictingFormDraft();
    const name = metadataEntity.value;
    documentEdits.removeProperty(session!, name, metadataKeys[Number(metadataProperty.value)]);
    refreshDocument(name);
  } catch (error) {
    metadataError.textContent = `Error: ${(error as Error).message}`;
  }
});

(document.getElementById('settings-entry') as HTMLButtonElement).addEventListener('click', () => {
  const panel = document.getElementById('colour-settings') as HTMLDetailsElement;
  panel.open = true;
  panel.querySelector('summary')!.focus();
});

(document.getElementById('add-entity-form') as HTMLFormElement).addEventListener('submit', (event) => {
  event.preventDefault();
  const name = (document.getElementById('new-entity-name') as HTMLInputElement).value;
  const description = (document.getElementById('new-entity-description') as HTMLTextAreaElement).value;
  let validating = false;
  try {
    requireNoConflictingFormDraft('new-entity');
    if (session!.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
    validating = true;
    documentEdits.addEntity(session!, name, description);
    (event.target as HTMLFormElement).reset();
    newEntityRejected = false;
    (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
    refreshDocument(name);
  } catch (error) {
    if (validating) newEntityRejected = true;
    (document.getElementById('add-entity-error') as HTMLElement).textContent = `Error: ${(error as Error).message}`;
    updateDocumentControls();
  }
});
(document.getElementById('add-entity-form') as HTMLFormElement).addEventListener('input', () => {
  newEntityRejected = false;
  (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
  updateDocumentControls();
});
(document.getElementById('discard-new-entity-draft') as HTMLButtonElement).addEventListener('click', () => {
  (document.getElementById('add-entity-form') as HTMLFormElement).reset();
  newEntityRejected = false;
  (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
  updateDocumentControls();
});

(document.getElementById('document-json') as HTMLTextAreaElement).addEventListener('input', (event) => {
  session!.setDraft((event.target as HTMLTextAreaElement).value);
  (document.getElementById('document-error') as HTMLElement).textContent = '';
  (document.getElementById('document-status') as HTMLElement).textContent = '';
  updateDocumentControls();
});
(document.getElementById('apply-document') as HTMLButtonElement).addEventListener('click', () => {
  try {
    session!.apply();
    (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
    refreshDocument();
  } catch (error) {
    (document.getElementById('document-error') as HTMLElement).textContent = `Error: ${(error as Error).message}`;
  }
});
(document.getElementById('discard-document') as HTMLButtonElement).addEventListener('click', () => {
  session!.discard();
  (document.getElementById('add-entity-error') as HTMLElement).textContent = '';
  const dependencyError = document.getElementById('dependency-error') as HTMLElement | null;
  if (dependencyError) dependencyError.textContent = '';
  (document.getElementById('document-error') as HTMLElement).textContent = '';
  updateDocumentControls();
});
for (const action of ['undo', 'redo'] as const) {
  document.getElementById(`${action}-document`)!.addEventListener('click', () => {
    session![action]();
    refreshDocument();
  });
}
window.addEventListener('beforeunload', (event) => {
  if (!isUnsaved()) return;
  event.preventDefault();
  event.returnValue = '';
});

(document.getElementById('open-paste') as HTMLButtonElement).addEventListener('click', () => {
  selection++;
  openDocument((document.getElementById('paste-json') as HTMLTextAreaElement).value, 'pasted-document.json');
});

(document.getElementById('copy-document') as HTMLButtonElement).addEventListener('click', async () => {
  const output = document.getElementById('document-json') as HTMLTextAreaElement;
  const status = document.getElementById('document-status') as HTMLElement;
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

(document.getElementById('download-document') as HTMLButtonElement).addEventListener('click', () => {
  if (
    !session ||
    session.hasDraft() ||
    hasMetadataDraft() ||
    hasEntityDraft() ||
    hasDependencyDraft() ||
    hasNewEntityDraft()
  )
    return;
  const url = URL.createObjectURL(new Blob([session.current()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = documentName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  session.markSaved();
  updateDocumentControls();
  (document.getElementById('document-status') as HTMLElement).textContent = 'Document download started.';
});

fileInput.addEventListener('change', () => {
  const current = ++selection;
  const file = fileInput.files![0];
  if (!file) return;
  fileInput.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    if (current !== selection) return;
    openDocument(reader.result as string, file.name);
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
fileInput.addEventListener('cancel', () => {
  selection++;
});

(document.getElementById('file-view-document') as HTMLButtonElement).addEventListener('click', () => {
  filePanel.hidden = true;
  (document.getElementById('toggle-file-panel') as HTMLButtonElement).setAttribute('aria-expanded', 'false');
  (document.getElementById('document-panel') as HTMLDetailsElement).open = true;
  (document.getElementById('document-json') as HTMLTextAreaElement).focus();
});

for (const action of ['copy', 'download']) {
  document.getElementById(`file-${action}-document`)!.addEventListener('click', () => {
    if (action === 'copy') {
      filePanel.hidden = true;
      (document.getElementById('toggle-file-panel') as HTMLButtonElement).setAttribute('aria-expanded', 'false');
      (document.getElementById('document-panel') as HTMLDetailsElement).open = true;
    }
    (document.getElementById(`${action}-document`) as HTMLButtonElement).click();
  });
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest('#toggle-file-panel');
  if (!button) return;
  filePanel.hidden = !filePanel.hidden;
  button.setAttribute('aria-expanded', String(!filePanel.hidden));
  resizeGraph();
});
filePanel.querySelector('details')!.addEventListener('toggle', () => resizeGraph());

(document.getElementById('copy-example') as HTMLButtonElement).addEventListener('click', async () => {
  const example = document.getElementById('format-example') as HTMLTextAreaElement;
  const copyStatus = document.getElementById('copy-status') as HTMLElement;
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
