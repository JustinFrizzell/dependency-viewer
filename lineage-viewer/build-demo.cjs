const fs = require('node:fs');
const path = require('node:path');
const { parseLineage } = require('./data');

const dist = path.resolve(__dirname, '../dist');
const template = fs.readFileSync(path.join(dist, 'lineage-viewer.html'), 'utf8');
const raw = fs.readFileSync(path.join(__dirname, 'demo_data.json'), 'utf8');
const marker = '__LINEAGE_DATA_JSON__';

parseLineage(raw);
if (template.split(marker).length !== 2) {
  throw new Error('Expected exactly one lineage data marker in the built template.');
}

const json = JSON.stringify(JSON.parse(raw)).replace(/</g, '\\u003c');
fs.writeFileSync(path.join(dist, 'lineage-demo.html'), template.replace(marker, () => json));
