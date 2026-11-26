import * as fs from 'node:fs';
import type { Entity } from '../src/document-types';

const name = (index: number) => (index === 0 ? 'DB.Raw' : index === 1 ? 'db.raw' : `table_${index}`);
const entities: Entity[] = Array.from({ length: 200 }, (_, index) => ({
  name: name(index),
  dependencies: index % 5 === 0 ? [] : [name(index - 1)],
}));
entities[4].dependencies.push('missing', 'missing');
entities[4].description =
  'Sales "quoted" 東京 </script><script>window.injectedMarkupRan = true</script><img src=x onerror="window.injectedMarkupRan = true">';

for (const [path, data] of [
  ['dist/dependency-acceptance.json', { entities }],
  ['dist/dependency-acceptance-empty.json', { entities: [] }],
] as const) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}
