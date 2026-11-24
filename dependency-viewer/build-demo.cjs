const fs = require('node:fs');
const path = require('node:path');
const { parseDependency } = require('./data');

const dist = path.resolve(__dirname, '../dist');
const template = fs.readFileSync(path.join(dist, 'dependency-viewer.html'), 'utf8');
const raw = fs.readFileSync(path.join(__dirname, 'demo_data.json'), 'utf8');
const marker = '__DEPENDENCY_DATA_JSON__';

parseDependency(raw);
if (template.split(marker).length !== 2) {
  throw new Error('Expected exactly one dependency data marker in the built template.');
}

const json = JSON.stringify(JSON.parse(raw)).replace(/</g, '\\u003c');
fs.writeFileSync(path.join(dist, 'dependency-demo.html'), template.replace(marker, () => json));
