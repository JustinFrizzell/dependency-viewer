const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readPresentationSettings(data) {
  const settings = data.settings;
  if (has(data, 'settings') && !isObject(settings)) {
    throw new Error('Document settings conflict with presentation settings; existing data is preserved.');
  }
  for (const [section, key] of [
    ['appearance', 'compact'],
    ['tooltips', 'enabled'],
  ]) {
    if (
      settings &&
      has(settings, section) &&
      (!isObject(settings[section]) ||
        Object.keys(settings[section]).some((name) => name !== key) ||
        (has(settings[section], key) && typeof settings[section][key] !== 'boolean'))
    ) {
      throw new Error(`Document settings.${section} conflicts with presentation settings; existing data is preserved.`);
    }
  }
  return {
    compact: settings?.appearance?.compact ?? false,
    tooltips: settings?.tooltips?.enabled ?? true,
  };
}

function writePresentationSettings(data, state) {
  readPresentationSettings(data);
  if (state.compact || !state.tooltips) {
    if (!has(data, 'settings')) data.settings = {};
  }
  if (data.settings) {
    if (state.compact) data.settings.appearance = { compact: true };
    else delete data.settings.appearance;
    if (!state.tooltips) data.settings.tooltips = { enabled: false };
    else delete data.settings.tooltips;
    if (!Object.keys(data.settings).length) delete data.settings;
  }
  return data;
}

function setupPresentationSettings(document, graph, options) {
  const compact = document.getElementById('compact-nodes');
  const tooltips = document.getElementById('tooltips-enabled');
  const reset = document.getElementById('reset-presentation');
  const error = document.getElementById('presentation-error');
  let state;
  function apply() {
    graph.nodes().forEach((node) => {
      node.style({
        width: state.compact ? 150 : 200,
        height: state.compact ? 40 : 54,
        'text-max-width': state.compact ? 130 : 180,
      });
    });
    if (!state.tooltips && graph.container) graph.container().removeAttribute('title');
  }
  function update(data) {
    let conflict = false;
    try {
      state = readPresentationSettings(data);
      error.textContent = '';
    } catch (problem) {
      state = { compact: false, tooltips: true };
      error.textContent = problem.message;
      conflict = true;
    }
    compact.checked = state.compact;
    tooltips.checked = state.tooltips;
    compact.disabled = tooltips.disabled = reset.disabled = conflict;
    apply();
  }
  function change(next) {
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
      error.textContent = problem.message;
    }
  }
  compact.addEventListener('change', () => change({ ...state, compact: compact.checked }));
  tooltips.addEventListener('change', () => change({ ...state, tooltips: tooltips.checked }));
  reset.addEventListener('click', () => change({ compact: false, tooltips: true }));
  update(options.data);
  return { update, tooltipsEnabled: () => state.tooltips };
}

module.exports = { readPresentationSettings, setupPresentationSettings, writePresentationSettings };
