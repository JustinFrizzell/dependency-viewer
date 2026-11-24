const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupEdgeMotion } = require('./edge-motion');

class FakeButton {
  constructor() {
    this.disabled = false;
    this.textContent = '';
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  click() {
    this.listeners.get('click')();
  }
}

function fixture({ reducedMotion = false, hidden = false } = {}) {
  const frames = new Map();
  const motionListeners = new Map();
  const documentListeners = new Map();
  let frameId = 0;
  const offsets = [];
  const window = {
    matchMedia: () => ({
      matches: reducedMotion,
      addEventListener: (name, listener) => motionListeners.set(name, listener),
      removeEventListener: name => motionListeners.delete(name),
    }),
    requestAnimationFrame: callback => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const document = {
    hidden,
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    removeEventListener: name => documentListeners.delete(name),
  };
  const visibleEdges = {
    style: (property, value) => {
      assert.equal(property, 'line-dash-offset');
      offsets.push(value);
    },
  };
  const graph = {
    edges: () => ({
      not: selector => {
        assert.equal(selector, '.filtered-out');
        return visibleEdges;
      },
    }),
  };
  const button = new FakeButton();
  const cleanup = setupEdgeMotion(window, document, graph, button);

  const runFrame = timestamp => {
    const callback = [...frames.values()][0];
    assert.ok(callback);
    frames.clear();
    callback(timestamp);
  };
  return {
    button, document, frames, offsets, runFrame, cleanup, motionListeners, documentListeners,
    emitVisibility: hiddenNow => {
      document.hidden = hiddenNow;
      documentListeners.get('visibilitychange')();
    },
    emitMotionPreference: matches => motionListeners.get('change')({ matches }),
  };
}

test('edge motion advances visible-edge dash offsets at one cycle per second', () => {
  const view = fixture();
  assert.equal(view.button.textContent, 'Pause');
  view.runFrame(100);
  view.runFrame(350);
  assert.deepEqual(view.offsets, [0, -3.5]);
  view.runFrame(1100);
  assert.equal(view.offsets[2], 0);
});

test('edge motion pauses, resumes, and stops while the page is hidden', () => {
  const view = fixture();
  view.button.click();
  assert.equal(view.button.textContent, 'Resume');
  assert.equal(view.frames.size, 0);
  view.button.click();
  assert.equal(view.frames.size, 1);
  view.emitVisibility(true);
  assert.equal(view.frames.size, 0);
  view.emitVisibility(false);
  assert.equal(view.frames.size, 1);
});

test('reduced-motion preference blocks animation and changes with the preference', () => {
  const view = fixture({ reducedMotion: true });
  assert.equal(view.button.textContent, 'Motion disabled');
  assert.equal(view.button.disabled, true);
  assert.equal(view.frames.size, 0);
  view.emitMotionPreference(false);
  assert.equal(view.button.textContent, 'Pause');
  assert.equal(view.button.disabled, false);
  assert.equal(view.frames.size, 1);
});

test('cleanup cancels motion and removes global listeners', () => {
  const view = fixture();
  view.cleanup();
  assert.equal(view.frames.size, 0);
  assert.equal(view.documentListeners.size, 0);
  assert.equal(view.motionListeners.size, 0);
});
