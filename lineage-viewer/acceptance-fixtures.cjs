const fs = require('node:fs');

const marker = '__LINEAGE_DATA_JSON__';
const template = fs.readFileSync('dist/lineage-viewer.html', 'utf8');
if (template.split(marker).length !== 2) {
  throw new Error('Expected exactly one lineage data marker in the built template.');
}

const name = index => index === 0 ? 'DB.Raw' : index === 1 ? 'db.raw' : `table_${index}`;
const tables = Array.from({ length: 200 }, (_, index) => ({
  name: name(index),
  inputs: index % 5 === 0 ? [] : [name(index - 1)],
}));
tables[4].inputs.push('missing', 'missing');
tables[4].description = 'Sales "quoted" 東京 </script><script>window.injectedMarkupRan = true</script><img src=x onerror="window.injectedMarkupRan = true">';

for (const [path, data] of [
  ['dist/lineage-acceptance.html', { tables }],
  ['dist/lineage-acceptance-empty.html', { tables: [] }],
]) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  fs.writeFileSync(path, template.replace(marker, () => json));
}
