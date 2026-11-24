// Three file-selection layouts on the existing viewer, switchable with ?variant=.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dist/dependency-viewer.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'prototype.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'prototype.js'), 'utf8');
const demo = fs.readFileSync(path.join(__dirname, 'demo_data.json'), 'utf8');
const injected = `<style>${css}</style><script>window.prototypeDemo = ${JSON.stringify(demo).replace(/</g, '\\u003c')};</script><script>${js}</script>`;

http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html.replace('</body>', `${injected}</body>`));
}).listen(4178, '127.0.0.1', () => {
  console.log('Prototype: http://127.0.0.1:4178/?variant=A');
});
