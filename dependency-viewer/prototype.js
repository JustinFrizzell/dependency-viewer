// PROTOTYPE ONLY: three layouts on the actual dependency viewer.
const variants = [
  { key: 'A', name: 'Compact toolbar' },
  { key: 'B', name: 'Data sidebar' },
  { key: 'C', name: 'Floating workspace' },
];
let current = Math.max(0, variants.findIndex(variant => variant.key === new URLSearchParams(location.search).get('variant')));
const panel = document.querySelector('.file-panel');
const demo = document.createElement('button');
demo.type = 'button';
demo.textContent = 'Load sample data';
demo.className = 'prototype-demo';
panel.insertBefore(demo, panel.querySelector('details'));
demo.addEventListener('click', () => {
  const input = document.getElementById('dependency-file');
  const transfer = new DataTransfer();
  transfer.items.add(new File([window.prototypeDemo], 'demo-data.json', { type: 'application/json' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

const bar = document.createElement('div');
bar.className = 'prototype-switcher';
bar.innerHTML = '<button type="button" aria-label="Previous variant">←</button><span></span><button type="button" aria-label="Next variant">→</button><small></small>';
document.body.appendChild(bar);
const label = bar.querySelector('span');
const state = bar.querySelector('small');
function update() {
  document.body.classList.remove('prototype-a', 'prototype-b', 'prototype-c');
  const variant = variants[current];
  document.body.classList.add(`prototype-${variant.key.toLowerCase()}`);
  label.textContent = `PROTOTYPE · ${variant.key}: ${variant.name}`;
  state.textContent = `Data: ${document.getElementById('file-name').textContent || 'none'}`;
  const url = new URL(location.href);
  url.searchParams.set('variant', variant.key);
  history.replaceState(null, '', url);
  window.dispatchEvent(new Event('resize'));
}
function move(offset) {
  current = (current + offset + variants.length) % variants.length;
  update();
}
bar.querySelector('[aria-label="Previous variant"]').addEventListener('click', () => move(-1));
bar.querySelector('[aria-label="Next variant"]').addEventListener('click', () => move(1));
document.addEventListener('keydown', event => {
  if (event.target.matches('input, textarea, select, [contenteditable], [contenteditable] *')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
new MutationObserver(update).observe(document.getElementById('file-name'), { childList: true });
update();
