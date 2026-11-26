const defaults = [
  { name: 'bronze', colour: '#e9c9ad', text: 'bronze' },
  { name: 'silver', colour: '#dce3e8', text: 'silver' },
  { name: 'gold', colour: '#f9e3a1', text: 'gold' },
  { name: 'blue', colour: '#cce4f4', text: '' },
  { name: 'green', colour: '#d1eacb', text: '' },
  { name: 'purple', colour: '#e6d8f2', text: '' },
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function readColourSettings(data) {
  const settings = data.settings;
  if (has(data, 'settings') && !isObject(settings)) throw new Error('Document settings conflict with colour settings.');
  const colours = settings && settings.colours;
  if (settings && has(settings, 'colours')) {
    if (
      !isObject(colours) ||
      Object.keys(colours).some((key) => !['enabled', 'order', 'texts'].includes(key)) ||
      (has(colours, 'enabled') && typeof colours.enabled !== 'boolean') ||
      (has(colours, 'order') &&
        (!Array.isArray(colours.order) ||
          colours.order.length !== defaults.length ||
          colours.order.some((name) => !defaults.some((item) => item.name === name)) ||
          new Set(colours.order).size !== defaults.length)) ||
      (has(colours, 'texts') &&
        (!isObject(colours.texts) ||
          Object.entries(colours.texts).some(
            ([name, text]) => !defaults.some((item) => item.name === name) || typeof text !== 'string',
          )))
    ) {
      throw new Error('Document settings.colours conflicts with colour settings; existing data is preserved.');
    }
  }
  return {
    enabled: colours && has(colours, 'enabled') ? colours.enabled : true,
    rules: (colours && has(colours, 'order') ? colours.order : defaults.map((rule) => rule.name)).map((name) => {
      const rule = defaults.find((item) => item.name === name);
      return { ...rule, text: colours && colours.texts && has(colours.texts, name) ? colours.texts[name] : rule.text };
    }),
  };
}

function writeColourSettings(data, enabled, rules) {
  readColourSettings(data);
  const override = {};
  if (!enabled) override.enabled = false;
  const order = rules.map((rule) => rule.name);
  if (JSON.stringify(order) !== JSON.stringify(defaults.map((rule) => rule.name))) override.order = order;
  const texts = {};
  for (const rule of rules) {
    if (rule.text !== defaults.find((item) => item.name === rule.name).text) texts[rule.name] = rule.text;
  }
  if (Object.keys(texts).length) override.texts = texts;
  if (Object.keys(override).length) {
    if (!has(data, 'settings')) data.settings = {};
    data.settings.colours = override;
  } else if (data.settings && has(data.settings, 'colours')) {
    delete data.settings.colours;
    if (!Object.keys(data.settings).length) delete data.settings;
  }
  return data;
}

function setupColourSettings(document, graph, options = {}) {
  const panel = document.getElementById('colour-settings');
  const list = document.getElementById('colour-rules');
  const enabled = document.getElementById('colours-enabled');
  const error = document.getElementById('colour-error');
  let rules = defaults.map((rule) => ({ ...rule }));
  let conflict = false;

  function commit() {
    try {
      if (options.change) options.change(enabled.checked, rules);
      error.textContent = '';
      return true;
    } catch (problem) {
      error.textContent = problem.message;
      return false;
    }
  }

  function applyColours() {
    const active = enabled.checked
      ? rules.map((rule) => ({ colour: rule.colour, text: rule.text.trim().toLowerCase() })).filter((rule) => rule.text)
      : [];
    graph.nodes().forEach((node) => {
      const name = node.data('name').toLowerCase();
      const match = active.find((rule) => name.includes(rule.text));
      if (match) node.style('background-color', match.colour);
      else node.removeStyle('background-color');
    });
  }

  function renderRules(focusName, focusDirection) {
    list.replaceChildren();
    let focusTarget;
    for (const [index, rule] of rules.entries()) {
      const row = document.createElement('div');
      row.className = 'colour-rule';
      const swatch = document.createElement('span');
      swatch.className = 'colour-rule-swatch';
      swatch.style.backgroundColor = rule.colour;
      swatch.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = rule.text;
      input.placeholder = 'Add matching text';
      input.setAttribute('aria-label', `Text for ${rule.name} colour`);
      input.addEventListener('input', () => {
        const previous = rule.text;
        rule.text = input.value;
        if (commit()) applyColours();
        else input.value = rule.text = previous;
      });
      input.disabled = conflict;
      row.append(swatch, input);
      for (const [direction, offset, symbol] of [
        ['up', -1, '↑'],
        ['down', 1, '↓'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = symbol;
        button.setAttribute('aria-label', `Move ${rule.name} colour ${direction}`);
        button.disabled = conflict || index + offset < 0 || index + offset >= rules.length;
        button.addEventListener('click', () => {
          [rules[index], rules[index + offset]] = [rules[index + offset], rules[index]];
          if (!commit()) {
            [rules[index], rules[index + offset]] = [rules[index + offset], rules[index]];
            return;
          }
          renderRules(rule.name, direction);
          applyColours();
        });
        row.appendChild(button);
        if (rule.name === focusName && direction === focusDirection && !button.disabled) {
          focusTarget = button;
        }
      }
      list.appendChild(row);
      if (
        rule.name === focusName &&
        ((focusDirection === 'up' && index === 0) || (focusDirection === 'down' && index === rules.length - 1))
      ) {
        focusTarget = input;
      }
    }
    if (focusTarget) focusTarget.focus();
  }

  enabled.addEventListener('change', () => {
    if (commit()) applyColours();
    else enabled.checked = !enabled.checked;
  });
  document.getElementById('reset-colours').addEventListener('click', () => {
    const previous = rules;
    const previousEnabled = enabled.checked;
    rules = defaults.map((rule) => ({ ...rule }));
    enabled.checked = true;
    if (!commit()) {
      rules = previous;
      enabled.checked = previousEnabled;
      return;
    }
    renderRules();
    applyColours();
  });
  function update(data = {}) {
    try {
      const state = readColourSettings(data);
      rules = state.rules;
      enabled.checked = state.enabled;
      conflict = false;
      error.textContent = '';
    } catch (problem) {
      rules = defaults.map((rule) => ({ ...rule }));
      enabled.checked = true;
      conflict = true;
      error.textContent = problem.message;
    }
    enabled.disabled = conflict;
    document.getElementById('reset-colours').disabled = conflict;
    renderRules();
    applyColours();
  }
  update(options.data);
  panel.hidden = false;
  return { update };
}

module.exports = { setupColourSettings, writeColourSettings };
