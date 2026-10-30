const { test } = require('node:test');
const assert = require('node:assert/strict');
const Coving = require('./coving.js');

// Screen coordinates throughout: x to the right, y DOWN (as in SVG).
// "Clockwise" means visually clockwise on screen.

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const nearPt = (p, [x, y], msg) => { near(p.x, x, msg + '.x'); near(p.y, y, msg + '.y'); };

// ---------- cutRule: the heart of the thing ----------
// Convention: coving cut upside down (ceiling edge on the saw bed, wall edge
// against the fence), saw viewed from above with the fence at the back.
// "/" = blade handle swung to the operator's LEFT, "\" = swung to the RIGHT.

test('internal corner, left end of piece: blade / , keep the left piece', () => {
  const r = Coving.cutRule('internal', 'left');
  assert.equal(r.blade, '/');
  assert.equal(r.mitreDir, 'left');
  assert.equal(r.keep, 'left');
});

test('internal corner, right end of piece: blade \\ , keep the right piece', () => {
  const r = Coving.cutRule('internal', 'right');
  assert.equal(r.blade, '\\');
  assert.equal(r.mitreDir, 'right');
  assert.equal(r.keep, 'right');
});

test('external corner, left end of piece: blade \\ , still keep the left piece', () => {
  const r = Coving.cutRule('external', 'left');
  assert.equal(r.blade, '\\');
  assert.equal(r.mitreDir, 'right');
  assert.equal(r.keep, 'left');
});

test('external corner, right end of piece: blade / , still keep the right piece', () => {
  const r = Coving.cutRule('external', 'right');
  assert.equal(r.blade, '/');
  assert.equal(r.mitreDir, 'left');
  assert.equal(r.keep, 'right');
});

// ---------- normalizeRoom ----------

test('anticlockwise input is reversed to clockwise, starting at the top-left corner', () => {
  // bottom-right -> top-right -> top-left -> bottom-left (anticlockwise on screen)
  const pts = Coving.normalizeRoom([[200, 100], [200, 0], [0, 0], [0, 100]]);
  assert.deepEqual(pts.map(p => [p.x, p.y]), [[0, 0], [200, 0], [200, 100], [0, 100]]);
});

test('top-left means smallest y, then smallest x', () => {
  // starts at top-right; must rotate to the top-left
  const pts = Coving.normalizeRoom([[200, 0], [200, 100], [0, 100], [0, 0]]);
  assert.deepEqual(pts.map(p => [p.x, p.y]), [[0, 0], [200, 0], [200, 100], [0, 100]]);
});

test('points in the middle of a straight wall are dropped, including across the wrap-around', () => {
  const pts = Coving.normalizeRoom([[100, 0], [200, 0], [200, 100], [0, 100], [0, 0]]);
  assert.deepEqual(pts.map(p => [p.x, p.y]), [[0, 0], [200, 0], [200, 100], [0, 100]]);
});

test('duplicate consecutive points are dropped', () => {
  const pts = Coving.normalizeRoom([[0, 0], [0, 0], [200, 0], [200, 100], [200, 100], [0, 100]]);
  assert.deepEqual(pts.map(p => [p.x, p.y]), [[0, 0], [200, 0], [200, 100], [0, 100]]);
});

test('fewer than three usable corners is an error', () => {
  assert.throws(() => Coving.normalizeRoom([[0, 0], [100, 0]]), /three/i);
  assert.throws(() => Coving.normalizeRoom([[0, 0], [100, 0], [200, 0]]), /three/i);
});

test('a self-crossing outline is an error', () => {
  assert.throws(() => Coving.normalizeRoom([[0, 0], [100, 100], [100, 0], [0, 100]]), /cross/i);
});

// ---------- analyzeRoom: the rectangle from the original SVG ----------

const RECT = [[80, 60], [260, 60], [260, 380], [80, 380]];

test('rectangle: four pieces, piece 1 is the top wall running left to right', () => {
  const room = Coving.analyzeRoom(RECT, 18);
  assert.equal(room.pieces.length, 4);
  nearPt(room.pieces[0].start, [80, 60], 'p1.start');
  nearPt(room.pieces[0].end, [260, 60], 'p1.end');
  nearPt(room.pieces[1].start, [260, 60], 'p2.start');
  nearPt(room.pieces[3].end, [80, 60], 'p4.end');
});

test('rectangle: every corner is internal, 90 degrees, mitre 45', () => {
  const room = Coving.analyzeRoom(RECT, 18);
  assert.equal(room.corners.length, 4);
  for (const c of room.corners) {
    assert.equal(c.type, 'internal');
    near(c.interiorAngle, 90, 'interior');
    near(c.mitre, 45, 'mitre');
  }
});

test('rectangle: eight angles, odd = left end with / and keep left, even = right end with \\ and keep right', () => {
  const room = Coving.analyzeRoom(RECT, 18);
  assert.equal(room.angles.length, 8);
  room.angles.forEach((a, i) => {
    assert.equal(a.number, i + 1);
    assert.equal(a.piece, Math.floor(i / 2) + 1, `angle ${a.number} piece`);
    if (a.number % 2 === 1) {
      assert.equal(a.end, 'left');
      assert.equal(a.blade, '/');
      assert.equal(a.keep, 'left');
    } else {
      assert.equal(a.end, 'right');
      assert.equal(a.blade, '\\');
      assert.equal(a.keep, 'right');
    }
  });
});

test('rectangle: angle 1 and angle 8 share the top-left corner', () => {
  const room = Coving.analyzeRoom(RECT, 18);
  assert.equal(room.angles[0].cornerIndex, 0);
  assert.equal(room.angles[7].cornerIndex, 0);
  assert.equal(room.angles[1].cornerIndex, 1);
  assert.equal(room.angles[2].cornerIndex, 1);
});

test('rectangle: the coving band is inset by the depth and the inner edge is shorter at internal corners', () => {
  const room = Coving.analyzeRoom(RECT, 18);
  const p1 = room.pieces[0];
  // polygon: start, end, innerEnd, innerStart
  nearPt(p1.polygon[0], [80, 60], 'outer start');
  nearPt(p1.polygon[1], [260, 60], 'outer end');
  nearPt(p1.polygon[2], [242, 78], 'inner end');
  nearPt(p1.polygon[3], [98, 78], 'inner start');
});

// ---------- analyzeRoom: square room with a window box sticking into it ----------
// 200x200 square; a box 40 wide and 30 deep sticks into the room from the top wall.

const WINDOW_ROOM = [[0, 0], [80, 0], [80, 30], [120, 30], [120, 0], [200, 0], [200, 200], [0, 200]];

test('window room: eight pieces and sixteen angles', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10);
  assert.equal(room.pieces.length, 8);
  assert.equal(room.angles.length, 16);
});

test('window room: the two inner corners of the box are external, the rest internal', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10);
  const types = room.corners.map(c => c.type);
  assert.deepEqual(types, ['internal', 'internal', 'external', 'external', 'internal', 'internal', 'internal', 'internal']);
  near(room.corners[2].interiorAngle, 270, 'external interior angle');
  near(room.corners[2].mitre, 45, 'external mitre');
});

test('window room: angles at external corners flip the blade but not the side you keep', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10);
  const by = n => room.angles[n - 1];
  // piece 2 is the left side of the box, running down into the room
  assert.equal(by(3).piece, 2); assert.equal(by(3).end, 'left');  assert.equal(by(3).cornerType, 'internal'); assert.equal(by(3).blade, '/');  assert.equal(by(3).keep, 'left');
  assert.equal(by(4).piece, 2); assert.equal(by(4).end, 'right'); assert.equal(by(4).cornerType, 'external'); assert.equal(by(4).blade, '/');  assert.equal(by(4).keep, 'right');
  // piece 3 is the face of the box, both ends external
  assert.equal(by(5).piece, 3); assert.equal(by(5).end, 'left');  assert.equal(by(5).cornerType, 'external'); assert.equal(by(5).blade, '\\'); assert.equal(by(5).keep, 'left');
  assert.equal(by(6).piece, 3); assert.equal(by(6).end, 'right'); assert.equal(by(6).cornerType, 'external'); assert.equal(by(6).blade, '/');  assert.equal(by(6).keep, 'right');
  // piece 4 is the right side of the box, running back up to the wall
  assert.equal(by(7).piece, 4); assert.equal(by(7).end, 'left');  assert.equal(by(7).cornerType, 'external'); assert.equal(by(7).blade, '\\'); assert.equal(by(7).keep, 'left');
  assert.equal(by(8).piece, 4); assert.equal(by(8).end, 'right'); assert.equal(by(8).cornerType, 'internal'); assert.equal(by(8).blade, '\\'); assert.equal(by(8).keep, 'right');
});

test('window room: at an external corner the inner edge of the band extends past the corner', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10);
  const p3 = room.pieces[2]; // face of the box, (80,30) -> (120,30), room is below it
  nearPt(p3.polygon[0], [80, 30], 'outer start');
  nearPt(p3.polygon[1], [120, 30], 'outer end');
  nearPt(p3.polygon[2], [130, 40], 'inner end sticks out past the corner');
  nearPt(p3.polygon[3], [70, 40], 'inner start sticks out past the corner');
});

// ---------- non-square corners ----------

test('a 45 degree chamfer is an internal corner of 135 degrees with a 22.5 degree mitre', () => {
  const room = Coving.analyzeRoom([[0, 0], [100, 0], [150, 50], [150, 150], [0, 150]], 10);
  const c = room.corners[1];
  assert.equal(c.type, 'internal');
  near(c.interiorAngle, 135, 'interior');
  near(c.mitre, 22.5, 'mitre');
  assert.equal(room.angles[1].mitre, 22.5);
});

test('analyzeRoom accepts input in any order and normalizes it first', () => {
  const room = Coving.analyzeRoom([[200, 100], [200, 0], [0, 0], [0, 100]], 10);
  nearPt(room.pieces[0].start, [0, 0], 'p1.start');
  nearPt(room.pieces[0].end, [200, 0], 'p1.end');
});

// ---------- typed corner angles override what was drawn ----------

test('a typed wall angle on an internal corner changes its mitre and both angles that meet there', () => {
  const room = Coving.analyzeRoom(RECT, 18, { wallAngles: { 1: 92 } });
  const c = room.corners[1];
  assert.equal(c.type, 'internal');
  near(c.wallAngle, 92, 'wall angle');
  near(c.interiorAngle, 92, 'interior');
  near(c.mitre, 44, 'mitre');
  assert.equal(c.typed, true);
  assert.equal(room.angles[1].mitre, 44); // angle 2, right end of piece 1
  assert.equal(room.angles[2].mitre, 44); // angle 3, left end of piece 2
  assert.equal(room.angles[0].mitre, 45); // untouched
  assert.equal(room.corners[0].typed, false);
});

test('a typed wall angle on an external corner keeps it external and measures the outside of the corner', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10, { wallAngles: { 2: 88 } });
  const c = room.corners[2];
  assert.equal(c.type, 'external');
  near(c.wallAngle, 88, 'wall angle');
  near(c.interiorAngle, 272, 'interior');
  near(c.mitre, 46, 'mitre');
  assert.equal(room.angles[3].mitre, 46); // angle 4
  assert.equal(room.angles[4].mitre, 46); // angle 5
  assert.equal(room.angles[3].blade, '/'); // cut direction unchanged
});

test('every corner reports the wall angle a joiner would measure, 90 for a square corner either way round', () => {
  const room = Coving.analyzeRoom(WINDOW_ROOM, 10);
  for (const c of room.corners) near(c.wallAngle, 90, `corner ${c.index}`);
  const bay = Coving.analyzeRoom([[0, 0], [100, 0], [150, 50], [150, 150], [0, 150]], 10);
  near(bay.corners[1].wallAngle, 135, 'bay');
});

test('typed wall angles must be between 0 and 180 exclusive', () => {
  assert.throws(() => Coving.analyzeRoom(RECT, 18, { wallAngles: { 0: 0 } }), /between/);
  assert.throws(() => Coving.analyzeRoom(RECT, 18, { wallAngles: { 0: 180 } }), /between/);
  assert.throws(() => Coving.analyzeRoom(RECT, 18, { wallAngles: { 0: 'abc' } }), /between/);
});
