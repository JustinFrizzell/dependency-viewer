const defaults = [
  { name: 'bronze', colour: '#e9c9ad', text: 'bronze' },
  { name: 'silver', colour: '#dce3e8', text: 'silver' },
  { name: 'gold', colour: '#f9e3a1', text: 'gold' },
  { name: 'blue', colour: '#cce4f4', text: '' },
  { name: 'green', colour: '#d1eacb', text: '' },
  { name: 'purple', colour: '#e6d8f2', text: '' },
];

function setupColourSettings(document, graph) {
  const panel = document.getElementById('colour-settings');
  const list = document.getElementById('colour-rules');
  const enabled = document.getElementById('colours-enabled');
  let rules = defaults.map(rule => ({ ...rule }));

  function applyColours() {
    const active = enabled.checked
      ? rules.map(rule => ({ colour: rule.colour, text: rule.text.trim().toLowerCase() })).filter(rule => rule.text)
      : [];
    graph.nodes().forEach(node => {
      const name = node.data('name').toLowerCase();
      const match = active.find(rule => name.includes(rule.text));
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
        rule.text = input.value;
        applyColours();
      });
      row.append(swatch, input);
      for (const [direction, offset, symbol] of [['up', -1, '↑'], ['down', 1, '↓']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = symbol;
        button.setAttribute('aria-label', `Move ${rule.name} colour ${direction}`);
        button.disabled = index + offset < 0 || index + offset >= rules.length;
        button.addEventListener('click', () => {
          [rules[index], rules[index + offset]] = [rules[index + offset], rules[index]];
          renderRules(rule.name, direction);
          applyColours();
        });
        row.appendChild(button);
        if (rule.name === focusName && direction === focusDirection && !button.disabled) {
          focusTarget = button;
        }
      }
      list.appendChild(row);
      if (rule.name === focusName &&
          ((focusDirection === 'up' && index === 0) || (focusDirection === 'down' && index === rules.length - 1))) {
        focusTarget = input;
      }
    }
    if (focusTarget) focusTarget.focus();
  }

  enabled.addEventListener('change', applyColours);
  document.getElementById('reset-colours').addEventListener('click', () => {
    rules = defaults.map(rule => ({ ...rule }));
    enabled.checked = true;
    renderRules();
    applyColours();
  });
  renderRules();
  applyColours();
  panel.hidden = false;
}

module.exports = { setupColourSettings };
