const { test } = require('node:test');
const assert = require('node:assert/strict');
const Editor = require('./editor.js');

const CANVAS = { w: 600, h: 440, grid: 20 };

test('snapPoint rounds to the nearest grid intersection', () => {
  assert.deepEqual(Editor.snapPoint({ x: 107, y: 213 }, null, CANVAS, false), { x: 100, y: 220 });
  assert.deepEqual(Editor.snapPoint({ x: 110, y: 230 }, null, CANVAS, false), { x: 120, y: 240 });
});

test('snapPoint keeps the point inside the canvas', () => {
  assert.deepEqual(Editor.snapPoint({ x: -30, y: 900 }, null, CANVAS, false), { x: 0, y: 440 });
});

test('with right angles on, the new point lines up with the previous point along the dominant axis', () => {
  const last = { x: 100, y: 100 };
  assert.deepEqual(Editor.snapPoint({ x: 207, y: 118 }, last, CANVAS, true), { x: 200, y: 100 });
  assert.deepEqual(Editor.snapPoint({ x: 118, y: 207 }, last, CANVAS, true), { x: 100, y: 200 });
});

test('with right angles off, no alignment happens', () => {
  const last = { x: 100, y: 100 };
  assert.deepEqual(Editor.snapPoint({ x: 207, y: 118 }, last, CANVAS, false), { x: 200, y: 120 });
});

test('isCloseClick is true only when there are at least three points and the click lands on the first', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(Editor.isCloseClick({ x: 0, y: 0 }, pts), true);
  assert.equal(Editor.isCloseClick({ x: 20, y: 0 }, pts), false);
  assert.equal(Editor.isCloseClick({ x: 0, y: 0 }, pts.slice(0, 2)), false);
});

test('example rooms are valid and the window room has two external corners', () => {
  const Coving = require('./coving.js');
  const rect = Coving.analyzeRoom(Editor.EXAMPLES.rectangle);
  assert.equal(rect.pieces.length, 4);
  const win = Coving.analyzeRoom(Editor.EXAMPLES.window);
  assert.equal(win.corners.filter(c => c.type === 'external').length, 2);
  assert.equal(win.pieces.length, 8);
});

test('setWallAngle stores a typed angle, drops it when it matches the drawn angle, and rejects bad values', () => {
  const overrides = {};
  assert.equal(Editor.setWallAngle(overrides, '80,60', '92', 90), true);
  assert.deepEqual(overrides, { '80,60': 92 });
  assert.equal(Editor.setWallAngle(overrides, '80,60', '90', 90), true);
  assert.deepEqual(overrides, {});
  assert.equal(Editor.setWallAngle(overrides, '80,60', 'abc', 90), false);
  assert.equal(Editor.setWallAngle(overrides, '80,60', '180', 90), false);
  assert.equal(Editor.setWallAngle(overrides, '80,60', '0', 90), false);
  assert.deepEqual(overrides, {});
});

test('overridesFor maps stored angles onto the normalized corner order and ignores stale keys', () => {
  const pts = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
  assert.deepEqual(Editor.overridesFor(pts, { '200,0': 92, '9,9': 50 }), { 1: 92 });
});

test('cornerLabel names a corner by the two angle numbers that meet there', () => {
  assert.equal(Editor.cornerLabel(0, 4), 'Angles 8 & 1');
  assert.equal(Editor.cornerLabel(1, 4), 'Angles 2 & 3');
  assert.equal(Editor.cornerLabel(3, 8), 'Angles 6 & 7');
});
