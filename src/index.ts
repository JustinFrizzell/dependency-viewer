import './style.css';
import type cytoscape = require('cytoscape');
import { parseDocument, deriveGraph } from './data';
import { createDocumentSession, type DocumentSession } from './document-session';
import * as documentEdits from './document-edits';
import { setupColourSettings, writeColourSettings } from './colour-settings';
import { setupPresentationSettings, writePresentationSettings } from './presentation-settings';
import { showGraph } from './graph-navigation';
import type { Graph } from './document-types';
import { mountVisualPrototype } from './prototype-visual';

if (
  process.env.NODE_ENV !== 'production' &&
  (new URLSearchParams(location.search).has('variant') || location.pathname.endsWith('/visual-prototype.html'))
) {
  window.addEventListener('load', mountVisualPrototype);
}

const fileInput = document.getElementById('dependency-file') as HTMLInputElement;
const fileError = document.getElementById('file-error') as HTMLElement;
const filePanel = document.getElementById('file-panel') as HTMLElement;
const mainTemplate = document.querySelector('main')!.cloneNode(true);
const footerTemplate = document.querySelector('footer')!.cloneNode(true);
(document.getElementById('status') as HTMLElement).textContent = 'Choose a JSON file to view dependencies.';
let cleanupGraph = () => {};
let resizeGraph = () => {};
let selection = 0;
let session: DocumentSession | null = null;
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
  inspection = null;
  newEntityRejected = false;
  documentName = name;
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
}

function renderGraph(graph: Graph, selectedName?: string) {
  cleanupGraph();
  inspection = null;
  document.querySelector('main')!.replaceWith(mainTemplate.cloneNode(true));
  document.querySelector('footer')!.replaceWith(footerTemplate.cloneNode(true));
  displayedGraph = JSON.stringify(graph);
  filePanel.hidden = graph.entities.length > 0;
  (document.getElementById('toggle-file-panel') as HTMLButtonElement).setAttribute(
    'aria-expanded',
    String(!filePanel.hidden),
  );
  if (graph.entities.length) {
    const navigation = showGraph(graph, selectedName, {
      session: session!,
      setupDocumentSettings,
      tooltipsEnabled: () => presentationControls.tooltipsEnabled(),
      requireNoConflictingFormDraft,
      updateDocumentControls,
      refreshDocument,
    });
    inspection = navigation.inspection;
    cleanupGraph = navigation.cleanup;
    resizeGraph = navigation.resize;
  } else {
    cleanupGraph = () => {};
    resizeGraph = () => {};
    (document.getElementById('status') as HTMLElement).textContent = 'No entities in this dependency dataset.';
    setupDocumentSettings({ nodes: () => [] } as unknown as cytoscape.Core);
  }
}

function updateDocumentControls() {
  if (!session) return;
  const metadataDraft = hasMetadataDraft();
  const formDraft = metadataDraft || hasEntityDraft() || hasDependencyDraft() || hasNewEntityDraft();
  const editor = document.getElementById('document-json') as HTMLTextAreaElement;
  if (editor.value !== session.draft()) editor.value = session.draft();
  editor.disabled = formDraft;
  (document.getElementById('unsaved-indicator') as HTMLElement).textContent = isUnsaved() ? '— Unsaved changes' : '';
  (document.getElementById('apply-document') as HTMLButtonElement).disabled = !session.hasDraft() || formDraft;
  (document.getElementById('discard-document') as HTMLButtonElement).disabled = !session.hasDraft();
  (document.getElementById('undo-document') as HTMLButtonElement).disabled = !session.canUndo() || formDraft;
  (document.getElementById('redo-document') as HTMLButtonElement).disabled = !session.canRedo() || formDraft;
  (document.getElementById('download-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  (document.getElementById('copy-document') as HTMLButtonElement).disabled = session.hasDraft() || formDraft;
  const status = document.getElementById('document-status') as HTMLElement;
  if (formDraft) status.textContent = 'Apply or discard the form draft before saving.';
  else if (status.textContent === 'Apply or discard the form draft before saving.') status.textContent = '';
  metadataEntity.disabled = metadataDraft;
  metadataProperty.disabled = metadataDraft;
  (document.getElementById('metadata-discard') as HTMLButtonElement).disabled = !metadataDraft;
  (document.getElementById('metadata-remove') as HTMLButtonElement).disabled =
    metadataDraft || metadataProperty.value === '';
}

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
  const file = fileInput.files![0];
  if (!file) return;
  fileInput.value = '';
  const current = ++selection;
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
