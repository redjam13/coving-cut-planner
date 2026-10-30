const { test } = require('node:test');
const assert = require('node:assert/strict');
const Coving = require('./coving.js');
const Render = require('./render.js');

const RECT = [[80, 60], [260, 60], [260, 380], [80, 380]];
const WINDOW_ROOM = [[0, 0], [80, 0], [80, 30], [120, 30], [120, 0], [200, 0], [200, 200], [0, 200]];
const BOX = { x: 40, y: 60, w: 340, h: 340 };

const count = (s, re) => (s.match(re) || []).length;

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------- planGeometry: pure layout, easy to check ----------

test('plan geometry scales the room to fit inside the box', () => {
  const g = Render.planGeometry(Coving.analyzeRoom(WINDOW_ROOM), BOX);
  for (const p of g.outline) {
    assert.ok(p.x >= BOX.x - 1e-6 && p.x <= BOX.x + BOX.w + 1e-6, `x in box: ${p.x}`);
    assert.ok(p.y >= BOX.y - 1e-6 && p.y <= BOX.y + BOX.h + 1e-6, `y in box: ${p.y}`);
  }
  const xs = g.outline.map(p => p.x), ys = g.outline.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(w - BOX.w) < 1e-6 || Math.abs(h - BOX.h) < 1e-6, 'fills the box in one direction');
});

test('plan geometry has one badge per angle and one label per piece', () => {
  const g = Render.planGeometry(Coving.analyzeRoom(WINDOW_ROOM), BOX);
  assert.equal(g.badges.length, 16);
  assert.equal(g.pieces.length, 8);
  assert.deepEqual(g.badges.map(b => b.number), Array.from({ length: 16 }, (_, i) => i + 1));
});

test('angle badges sit outside the room', () => {
  for (const pts of [RECT, WINDOW_ROOM]) {
    const g = Render.planGeometry(Coving.analyzeRoom(pts), BOX);
    for (const b of g.badges) {
      assert.ok(!pointInPolygon(b, g.outline), `badge ${b.number} at ${b.x},${b.y} is inside the room`);
    }
  }
});

test('badge 1 is near the left end of the top wall, badge 2 near its right end', () => {
  const g = Render.planGeometry(Coving.analyzeRoom(RECT), BOX);
  const p1 = g.pieces[0];
  const b1 = g.badges[0], b2 = g.badges[1];
  assert.ok(b1.y < p1.start.y, 'badge 1 above the top wall');
  assert.ok(b1.x > p1.start.x && b1.x < (p1.start.x + p1.end.x) / 2, 'badge 1 in left half');
  assert.ok(b2.x < p1.end.x && b2.x > (p1.start.x + p1.end.x) / 2, 'badge 2 in right half');
});

test('the two badges that share an external corner do not overlap', () => {
  const g = Render.planGeometry(Coving.analyzeRoom(WINDOW_ROOM), BOX);
  const b4 = g.badges[3], b5 = g.badges[4];
  const dist = Math.hypot(b4.x - b5.x, b4.y - b5.y);
  assert.ok(dist >= 2 * g.badgeRadius, `badges 4 and 5 overlap: ${dist} < ${2 * g.badgeRadius}`);
});

test('piece labels sit inside the room', () => {
  const g = Render.planGeometry(Coving.analyzeRoom(RECT), BOX);
  for (const pc of g.pieces) {
    assert.ok(pointInPolygon(pc.label, g.outline), `label for piece ${pc.number} is outside the room`);
  }
});

// ---------- renderPlan: the SVG string ----------

test('renders a standalone svg document', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(RECT));
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trim().endsWith('</svg>'));
  assert.doesNotMatch(svg, /var\(--/, 'no CSS variables so the file stands alone');
});

test('plan marks every angle and piece', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(WINDOW_ROOM));
  assert.equal(count(svg, /data-angle="\d+"/g), 16);
  assert.equal(count(svg, /data-piece="\d+"/g), 8);
  assert.match(svg, />Piece 8</);
});

test('table has a row per angle carrying corner type, blade and keep side', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(WINDOW_ROOM));
  assert.equal(count(svg, /data-row="\d+"/g), 16);
  assert.match(svg, /data-row="3" data-corner="internal" data-blade="\/" data-keep="left"/);
  assert.match(svg, /data-row="4" data-corner="external" data-blade="\/" data-keep="right"/);
  assert.match(svg, /data-row="5" data-corner="external" data-blade="\\" data-keep="left"/);
  assert.match(svg, /data-row="8" data-corner="internal" data-blade="\\" data-keep="right"/);
});

test('table rows say it in words too', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(WINDOW_ROOM));
  assert.match(svg, />External 90°</);
  assert.match(svg, />Internal 90°</);
  assert.match(svg, />Left of blade</);
  assert.match(svg, />Right of blade</);
  assert.match(svg, />45° left</);
  assert.match(svg, />45° right</);
});

test('saw legend shows only the setups the room needs', () => {
  const rect = Render.renderPlan(Coving.analyzeRoom(RECT));
  assert.deepEqual(rect.match(/data-saw="[a-z-]+"/g), ['data-saw="internal-left"', 'data-saw="internal-right"']);
  const win = Render.renderPlan(Coving.analyzeRoom(WINDOW_ROOM));
  assert.equal(count(win, /data-saw="[a-z-]+"/g), 4);
});

test('saw legend lists which angles use each setup', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(WINDOW_ROOM));
  assert.match(svg, /data-saw="external-left" data-angles="5, 7"/);
  assert.match(svg, /data-saw="external-right" data-angles="4, 6"/);
  assert.match(svg, /data-saw="internal-left" data-angles="1, 3, 9, 11, 13, 15"/);
});

test('non-square corners show their real angle and mitre', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom([[0, 0], [100, 0], [150, 50], [150, 150], [0, 150]]));
  assert.match(svg, />Internal 135°</);
  assert.match(svg, />22\.5° (left|right)</);
});

test('typed corner angles show up in the table', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(RECT, 18, { wallAngles: { 1: 92 } }));
  assert.match(svg, />Internal 92°</);
  assert.match(svg, />44° right</);
  assert.match(svg, />44° left</);
});

test('the saw setup note at the bottom is its own boxed section with readable text', () => {
  const svg = Render.renderPlan(Coving.analyzeRoom(RECT));
  const m = svg.match(/<g data-section="howto">([\s\S]*?)<\/g>/);
  assert.ok(m, 'howto section present');
  const section = m[1];
  assert.match(section, /<rect /, 'has a background box');
  assert.match(section, /UPSIDE DOWN/);
  assert.match(section, /FACE UP/);
  const sizes = [...section.matchAll(/font-size="([\d.]+)"/g)].map(x => Number(x[1]));
  assert.ok(sizes.length >= 3, 'several lines of text');
  assert.ok(sizes.every(s => s >= 12), `all text at least 12px, got ${sizes}`);
});
