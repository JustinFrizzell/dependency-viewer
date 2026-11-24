const fs = require('node:fs');

const marker = '__DEPENDENCY_DATA_JSON__';
const template = fs.readFileSync('dist/dependency-viewer.html', 'utf8');
if (template.split(marker).length !== 2) {
  throw new Error('Expected exactly one dependency data marker in the built template.');
}

const name = index => index === 0 ? 'DB.Raw' : index === 1 ? 'db.raw' : `table_${index}`;
const entities = Array.from({ length: 200 }, (_, index) => ({
  name: name(index),
  dependencies: index % 5 === 0 ? [] : [name(index - 1)],
}));
entities[4].dependencies.push('missing', 'missing');
entities[4].description = 'Sales "quoted" 東京 </script><script>window.injectedMarkupRan = true</script><img src=x onerror="window.injectedMarkupRan = true">';

for (const [path, data] of [
  ['dist/dependency-acceptance.html', { entities }],
  ['dist/dependency-acceptance-empty.html', { entities: [] }],
]) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  fs.writeFileSync(path, template.replace(marker, () => json));
}
