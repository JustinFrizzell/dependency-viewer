import type { Core } from 'cytoscape';
import type { DependencyDocument, JsonValue } from './document-types';

interface PresentationState {
  compact: boolean;
  tooltips: boolean;
}

interface PresentationSettings {
  [key: string]: JsonValue | undefined;
  appearance?: { compact?: boolean };
  tooltips?: { enabled?: boolean };
}

const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function readPresentationSettings(data: DependencyDocument): PresentationState {
  const settings = data.settings as PresentationSettings | undefined;
  if (has(data, 'settings') && !isObject(settings)) {
    throw new Error('Document settings conflict with presentation settings; existing data is preserved.');
  }
  for (const [section, key] of [
    ['appearance', 'compact'],
    ['tooltips', 'enabled'],
  ]) {
    const sectionValue = settings?.[section];
    if (
      settings &&
      has(settings, section) &&
      (!isObject(sectionValue) ||
        Object.keys(sectionValue).some((name) => name !== key) ||
        (has(sectionValue, key) && typeof sectionValue[key] !== 'boolean'))
    ) {
      throw new Error(`Document settings.${section} conflicts with presentation settings; existing data is preserved.`);
    }
  }
  return {
    compact: settings?.appearance?.compact ?? false,
    tooltips: settings?.tooltips?.enabled ?? true,
  };
}

export function writePresentationSettings(data: DependencyDocument, state: PresentationState) {
  readPresentationSettings(data);
  if (state.compact || !state.tooltips) {
    if (!has(data, 'settings')) data.settings = {};
  }
  if (data.settings) {
    const settings = data.settings as PresentationSettings;
    if (state.compact) settings.appearance = { compact: true };
    else delete settings.appearance;
    if (!state.tooltips) settings.tooltips = { enabled: false };
    else delete settings.tooltips;
    if (!Object.keys(settings).length) delete data.settings;
  }
  return data;
}

export function setupPresentationSettings(
  document: Document,
  graph: Core,
  options: { data: DependencyDocument; change: (state: PresentationState) => void },
) {
  const compact = document.getElementById('compact-nodes') as HTMLInputElement;
  const tooltips = document.getElementById('tooltips-enabled') as HTMLInputElement;
  const reset = document.getElementById('reset-presentation') as HTMLButtonElement;
  const error = document.getElementById('presentation-error')!;
  let state: PresentationState;
  function apply() {
    graph.nodes().forEach((node) => {
      node.style({
        width: state.compact ? 150 : 182,
        height: state.compact ? 46 : 64,
        'text-max-width': state.compact ? 95 : 125,
      });
    });
    if (!state.tooltips && graph.container) graph.container()!.removeAttribute('title');
  }
  function update(data: DependencyDocument) {
    let conflict = false;
    try {
      state = readPresentationSettings(data);
      error.textContent = '';
    } catch (problem) {
      state = { compact: false, tooltips: true };
      error.textContent = (problem as Error).message;
      conflict = true;
    }
    compact.checked = state.compact;
    tooltips.checked = state.tooltips;
    compact.disabled = tooltips.disabled = reset.disabled = conflict;
    apply();
  }
  function change(next: PresentationState) {
    try {
      options.change(next);
      state = next;
      compact.checked = state.compact;
      tooltips.checked = state.tooltips;
      error.textContent = '';
      apply();
    } catch (problem) {
      compact.checked = state.compact;
      tooltips.checked = state.tooltips;
      error.textContent = (problem as Error).message;
    }
  }
  compact.addEventListener('change', () => change({ ...state, compact: compact.checked }));
  tooltips.addEventListener('change', () => change({ ...state, tooltips: tooltips.checked }));
  reset.addEventListener('click', () => change({ compact: false, tooltips: true }));
  update(options.data);
  return { update, tooltipsEnabled: () => state.tooltips };
}
