/*
 * Coving cutting geometry.
 *
 * Coordinates are screen coordinates: x to the right, y DOWN (like SVG).
 * A room outline is "clockwise" when it reads clockwise on screen.
 *
 * Cutting convention (the one the output assumes):
 *   - Coving is cut UPSIDE DOWN and BACK TO FRONT on a mitre saw:
 *     ceiling edge flat on the saw bed, wall edge against the fence.
 *   - The saw is pictured from above with the fence at the back and you at
 *     the front. "/" means the blade handle is swung to YOUR LEFT,
 *     "\" means swung to YOUR RIGHT.
 *   - "left end" / "right end" of a piece are as you stand in the room
 *     facing that wall.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.Coving = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const toPt = p => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
  const round2 = v => Math.round(v * 100) / 100;

  // z-component of (a - o) x (b - o)
  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function onSegment(p, a, b) {
    return Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS &&
           Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS;
  }

  function segmentsIntersect(a, b, c, d) {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
        ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
    if (Math.abs(d1) < EPS && onSegment(a, c, d)) return true;
    if (Math.abs(d2) < EPS && onSegment(b, c, d)) return true;
    if (Math.abs(d3) < EPS && onSegment(c, a, b)) return true;
    if (Math.abs(d4) < EPS && onSegment(d, a, b)) return true;
    return false;
  }

  function selfIntersects(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const adjacent = j === i + 1 || (i === 0 && j === n - 1);
        if (adjacent) continue;
        if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  function signedArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2; // positive = clockwise on screen (y down)
  }

  // Drop duplicate points and points that sit on a straight line between
  // their neighbours. Repeats until nothing changes so wrap-around cases work.
  function removeDegenerate(input) {
    const out = input.slice();
    let changed = true;
    while (changed && out.length >= 3) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const prev = out[(i - 1 + out.length) % out.length];
        const cur = out[i];
        const next = out[(i + 1) % out.length];
        if (Math.abs(cross(prev, cur, next)) < EPS) {
          out.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return out;
  }

  /**
   * Clean up a drawn outline: drop degenerate points, reject bad shapes,
   * make it clockwise and start it at the top-left corner.
   */
  function normalizeRoom(points) {
    let pts = removeDegenerate(points.map(toPt));
    if (pts.length < 3) {
      throw new Error('Need at least three corners that are not in a straight line.');
    }
    if (selfIntersects(pts)) {
      throw new Error('The outline crosses itself. Redraw it so the walls do not cross.');
    }
    if (signedArea(pts) < 0) pts.reverse();
    let start = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], s = pts[start];
      if (p.y < s.y - EPS || (Math.abs(p.y - s.y) < EPS && p.x < s.x)) start = i;
    }
    return pts.slice(start).concat(pts.slice(0, start));
  }

  /**
   * Which way to set the saw for one end of one piece.
   * Because the coving is upside down AND back to front, the end you are
   * cutting sits on the opposite side of the saw, so the piece you keep is
   * always on the same side as the end name. Internal corners need the wall
   * edge (fence side) longer; external corners need the ceiling edge (bed
   * side) longer, which flips the blade.
   */
  function cutRule(cornerType, end) {
    const internal = cornerType === 'internal';
    const leftEnd = end === 'left';
    const mitreDir = (internal === leftEnd) ? 'left' : 'right';
    return { blade: mitreDir === 'left' ? '/' : '\\', mitreDir, keep: end };
  }

  /**
   * Full analysis of a room outline.
   * depth = how far the coving comes out from the wall, in drawing units.
   */
  function analyzeRoom(points, depth, options) {
    depth = depth == null ? 18 : depth;
    const typed = (options && options.wallAngles) || {};
    const pts = normalizeRoom(points);
    const n = pts.length;

    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      const dx = q.x - p.x, dy = q.y - p.y;
      const length = Math.hypot(dx, dy);
      const dir = { x: dx / length, y: dy / length };
      const normal = { x: -dir.y, y: dir.x }; // points into the room
      return { start: p, end: q, length, dir, normal };
    });

    const corners = pts.map((p, i) => {
      const ein = edges[(i - 1 + n) % n], eout = edges[i];
      const cr = ein.dir.x * eout.dir.y - ein.dir.y * eout.dir.x;
      const dot = ein.dir.x * eout.dir.x + ein.dir.y * eout.dir.y;
      const turn = Math.atan2(cr, dot) * 180 / Math.PI; // + = right turn = internal
      const type = cr > 0 ? 'internal' : 'external';
      // The angle a joiner measures between the two wall faces: 90 for a
      // square corner whether internal or external, 135 for a bay. A typed
      // measurement overrides what was drawn; the drawing is only a sketch.
      const drawnWallAngle = round2(180 - Math.abs(turn));
      let wallAngle = drawnWallAngle, isTyped = false;
      if (typed[i] != null && typed[i] !== '') {
        const v = Number(typed[i]);
        if (!Number.isFinite(v) || v <= 0 || v >= 180) {
          throw new Error('Corner angle must be between 0 and 180 degrees.');
        }
        wallAngle = round2(v);
        isTyped = true;
      }
      const n1 = ein.normal, n2 = eout.normal;
      const k = depth / (1 + (n1.x * n2.x + n1.y * n2.y));
      return {
        index: i,
        point: p,
        type,
        wallAngle,
        drawnWallAngle,
        typed: isTyped,
        interiorAngle: round2(type === 'internal' ? wallAngle : 360 - wallAngle),
        mitre: round2((180 - wallAngle) / 2),
        inner: { x: p.x + k * (n1.x + n2.x), y: p.y + k * (n1.y + n2.y) },
      };
    });

    const pieces = edges.map((e, i) => {
      const startCorner = i, endCorner = (i + 1) % n;
      return {
        number: i + 1,
        start: e.start,
        end: e.end,
        length: e.length,
        dir: e.dir,
        normal: e.normal,
        startCorner,
        endCorner,
        polygon: [e.start, e.end, corners[endCorner].inner, corners[startCorner].inner],
      };
    });

    const angles = [];
    for (const pc of pieces) {
      for (const end of ['left', 'right']) {
        const cornerIndex = end === 'left' ? pc.startCorner : pc.endCorner;
        const c = corners[cornerIndex];
        const rule = cutRule(c.type, end);
        angles.push({
          number: angles.length + 1,
          piece: pc.number,
          end,
          cornerIndex,
          cornerType: c.type,
          interiorAngle: c.interiorAngle,
          wallAngle: c.wallAngle,
          typed: c.typed,
          mitre: c.mitre,
          blade: rule.blade,
          mitreDir: rule.mitreDir,
          keep: rule.keep,
        });
      }
    }

    return { points: pts, corners, pieces, angles, depth };
  }

  return { cutRule, normalizeRoom, analyzeRoom };
});
