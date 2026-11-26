const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentSession } = require('../src/document-session');

const documentWith = (name) => JSON.stringify({ entities: [{ name, dependencies: [] }] });

test('shared graph edits must resolve a draft and participate in history and saved state', () => {
  const session = createDocumentSession(JSON.parse(documentWith('A')));
  session.setDraft('{invalid');
  assert.throws(() => session.replace(documentWith('B')), /apply or discard/i);
  assert.throws(() => session.markSaved(), /apply or discard/i);
  assert.equal(session.draft(), '{invalid');
  assert.equal(JSON.parse(session.current()).entities[0].name, 'A');
  session.discard();
  session.replace(documentWith('B'));
  session.markSaved();
  session.replace(documentWith('C'));
  session.undo();
  assert.equal(session.isUnsaved(), false);
  session.undo();
  session.replace(documentWith('D'));
  assert.equal(session.canRedo(), false);
  assert.equal(session.isUnsaved(), true);
  assert.throws(() => session.replace('{"entities":[{"name":"x","dependencies":["x"]}]}'), /cycle/i);
  assert.equal(JSON.parse(session.current()).entities[0].name, 'D');
});
