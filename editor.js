/*
 * Pure helpers for the room-drawing canvas (no DOM in here so it can be tested).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.Editor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * Snap a raw canvas position to the grid. With `ortho` on and a previous
   * point, the new point is forced onto the same row or column as that point,
   * whichever is closer to what was clicked.
   */
  function snapPoint(raw, last, canvas, ortho) {
    const g = canvas.grid;
    let x = clamp(Math.round(raw.x / g) * g, 0, canvas.w);
    let y = clamp(Math.round(raw.y / g) * g, 0, canvas.h);
    if (ortho && last) {
      if (Math.abs(raw.x - last.x) >= Math.abs(raw.y - last.y)) y = last.y;
      else x = last.x;
    }
    return { x, y };
  }

  function isCloseClick(snapped, points) {
    return points.length >= 3 && snapped.x === points[0].x && snapped.y === points[0].y;
  }

  const EXAMPLES = {
    rectangle: [[140, 60], [460, 60], [460, 380], [140, 380]],
    // Square room; a window box 4 cells wide and 2 deep sticks into it from the top wall.
    window: [[120, 60], [240, 60], [240, 100], [320, 100], [320, 60], [480, 60], [480, 400], [120, 400]],
  };

  const pointKey = p => `${p.x},${p.y}`;

  /**
   * Record a typed wall angle for a corner (keyed by its drawn position).
   * Typing the drawn angle back in removes the override. Returns false for
   * values that are not an angle between 0 and 180.
   */
  function setWallAngle(overrides, key, value, drawnDefault) {
    const v = Number(String(value).trim());
    if (!Number.isFinite(v) || v <= 0 || v >= 180) return false;
    if (Math.abs(v - drawnDefault) < 1e-9) delete overrides[key];
    else overrides[key] = v;
    return true;
  }

  /** Map position-keyed overrides onto the corner order Coving uses. */
  function overridesFor(normalizedPoints, overrides) {
    const out = {};
    normalizedPoints.forEach((p, i) => {
      const v = overrides[pointKey(p)];
      if (v != null) out[i] = v;
    });
    return out;
  }

  /** A corner is where the right end of one piece meets the left end of the next. */
  function cornerLabel(index, cornerCount) {
    const before = index === 0 ? 2 * cornerCount : 2 * index;
    return `Angles ${before} & ${2 * index + 1}`;
  }

  return { snapPoint, isCloseClick, EXAMPLES, pointKey, setWallAngle, overridesFor, cornerLabel };
});
