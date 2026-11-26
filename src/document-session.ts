import { parseDocument } from './data';
import type { DependencyDocument } from './document-types';

export function createDocumentSession(document: DependencyDocument) {
  const serialize = (value: DependencyDocument) => JSON.stringify(value, null, 2);
  let history = [serialize(document)];
  let index = 0;
  let saved = history[0];
  let draft = history[0];
  const current = () => history[index];
  const hasDraft = () => draft !== current();
  function replace(raw: string) {
    if (hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
    const next = serialize(parseDocument(raw));
    if (next === current()) return;
    history = history.slice(0, index + 1);
    history.push(next);
    index++;
    draft = next;
  }
  return {
    current,
    draft: () => draft,
    setDraft: (value: string) => {
      draft = value;
    },
    hasDraft,
    isUnsaved: () => hasDraft() || current() !== saved,
    canUndo: () => !hasDraft() && index > 0,
    canRedo: () => !hasDraft() && index < history.length - 1,
    apply() {
      const next = serialize(parseDocument(draft));
      draft = current();
      replace(next);
    },
    discard: () => {
      draft = current();
    },
    replace,
    undo() {
      if (!hasDraft() && index > 0) draft = history[--index];
    },
    redo() {
      if (!hasDraft() && index < history.length - 1) draft = history[++index];
    },
    markSaved() {
      if (hasDraft()) throw new Error('Apply or discard the JSON draft before downloading.');
      saved = current();
    },
  };
}

export type DocumentSession = ReturnType<typeof createDocumentSession>;
