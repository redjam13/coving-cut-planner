/*
 * Renders a Coving.analyzeRoom() result as a standalone SVG string:
 * room plan with numbered angles, a table of cuts, and saw-setup diagrams.
 */
(function (root, factory) {
  if (typeof module === 'object' && module && module.exports) module.exports = factory(require('./coving.js'));
  else root.Render = factory(root.Coving);
})(typeof self !== 'undefined' ? self : this, function (Coving) {
  'use strict';

  const C = {
    text: '#1f1f1c',
    muted: '#6e6e68',
    wall: '#0f6e56',
    band: '#e1f5ee',
    badge: '#ffffff',
    blade: '#d85a30',
    fence: '#bdb6aa',
    offcut: '#8d8d86',
    rule: '#d9d6cf',
    zebra: '#f6f5f1',
  };
  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  const WIDTH = 960;
  const PLAN_BOX = { x: 40, y: 108, w: 380, h: 380 };
  const TABLE_TOP = 90;
  const TABLE_X = 470;
  const ROW_H = 26;
  const BADGE_R = 9;

  const n1 = v => Math.round(v * 10) / 10;
  const pt = p => `${n1(p.x)},${n1(p.y)}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------- small geometry helpers ----------

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function distToOutline(p, poly) {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
    return d;
  }

  // Nudge overlapping badges apart, never letting one end up inside the room
  // or sitting on a wall line. Needed where two walls meet at a tight
  // external corner (a window box or chimney breast).
  function spreadBadges(badges, outline, r) {
    const minD = 2 * r + 2;
    const ok = b => !pointInPolygon(b, outline) && distToOutline(b, outline) >= r + 1;
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < badges.length; i++) {
        for (let j = i + 1; j < badges.length; j++) {
          const a = badges[i], b = badges[j];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d >= minD) continue;
          if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
          const push = (minD - d) / 2 + 0.5;
          const ux = dx / d, uy = dy / d;
          const a2 = { x: a.x - ux * push, y: a.y - uy * push };
          const b2 = { x: b.x + ux * push, y: b.y + uy * push };
          const bFull = { x: b.x + ux * push * 2, y: b.y + uy * push * 2 };
          const aFull = { x: a.x - ux * push * 2, y: a.y - uy * push * 2 };
          if (ok(a2) && ok(b2)) { Object.assign(a, a2); Object.assign(b, b2); moved = true; }
          else if (ok(bFull)) { Object.assign(b, bFull); moved = true; }
          else if (ok(aFull)) { Object.assign(a, aFull); moved = true; }
        }
      }
      if (!moved) break;
    }
  }

  // ---------- plan layout ----------

  function planGeometry(room, box) {
    const pts = room.points;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rw = (maxX - minX) || 1, rh = (maxY - minY) || 1;
    const scale = Math.min(box.w / rw, box.h / rh);
    const ox = box.x + (box.w - rw * scale) / 2 - minX * scale;
    const oy = box.y + (box.h - rh * scale) / 2 - minY * scale;
    const outline = pts.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy }));

    const shortest = Math.min(...room.pieces.map(p => p.length)) * scale;
    const depth = Math.max(6, Math.min(18, shortest * 0.4));
    const scaled = Coving.analyzeRoom(outline, depth);

    const pieces = scaled.pieces.map(pc => {
      const mid = { x: (pc.start.x + pc.end.x) / 2, y: (pc.start.y + pc.end.y) / 2 };
      const label = { x: mid.x + pc.normal.x * depth / 2, y: mid.y + pc.normal.y * depth / 2 };
      let rot = Math.atan2(pc.dir.y, pc.dir.x) * 180 / Math.PI;
      if (rot > 90) rot -= 180;
      if (rot <= -90) rot += 180;
      return {
        number: pc.number,
        start: pc.start,
        end: pc.end,
        length: pc.length,
        polygon: pc.polygon,
        label,
        rotation: rot,
        text: pc.length >= 56 ? `Piece ${pc.number}` : `P${pc.number}`,
      };
    });

    const badges = scaled.angles.map(a => {
      const pc = scaled.pieces[a.piece - 1];
      const along = Math.min(26, pc.length * 0.3);
      const out = BADGE_R + 5;
      const base = a.end === 'left' ? pc.start : pc.end;
      const sign = a.end === 'left' ? 1 : -1;
      return {
        number: a.number,
        piece: a.piece,
        end: a.end,
        x: base.x + sign * pc.dir.x * along - pc.normal.x * out,
        y: base.y + sign * pc.dir.y * along - pc.normal.y * out,
      };
    });
    spreadBadges(badges, outline, BADGE_R);

    return { outline, pieces, badges, badgeRadius: BADGE_R, scale, depth };
  }

  // ---------- SVG primitives ----------

  function text(x, y, str, o) {
    o = o || {};
    const attrs = [`x="${n1(x)}"`, `y="${n1(y)}"`];
    if (o.anchor) attrs.push(`text-anchor="${o.anchor}"`);
    if (o.baseline) attrs.push(`dominant-baseline="${o.baseline}"`);
    attrs.push(`font-size="${o.size || 12}"`);
    if (o.weight) attrs.push(`font-weight="${o.weight}"`);
    attrs.push(`fill="${o.fill || C.text}"`);
    if (o.transform) attrs.push(`transform="${o.transform}"`);
    return `<text ${attrs.join(' ')}>${esc(str)}</text>`;
  }

  function badge(x, y, number, attrs) {
    return `<g ${attrs || ''}>` +
      `<circle cx="${n1(x)}" cy="${n1(y)}" r="${BADGE_R}" fill="${C.badge}" stroke="${C.wall}" stroke-width="1"/>` +
      text(x, y + 0.5, number, { anchor: 'middle', baseline: 'central', size: 10, weight: 600, fill: C.wall }) +
      `</g>`;
  }

  function bladeGlyph(x, y, blade) {
    const up = blade === '/';
    return `<line x1="${n1(x)}" y1="${n1(y + (up ? 6 : -6))}" x2="${n1(x + 14)}" y2="${n1(y + (up ? -6 : 6))}" ` +
      `stroke="${C.blade}" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  // Which wall-to-wall angle a joiner would quote: 90 for both a normal
  // corner and a chimney-breast corner, 135 for a bay.
  function wallAngle(a) {
    return a.wallAngle;
  }

  function usedSetups(angles) {
    const order = [['internal', 'left'], ['internal', 'right'], ['external', 'left'], ['external', 'right']];
    return order.map(([cornerType, end]) => {
      const list = angles.filter(a => a.cornerType === cornerType && a.end === end);
      if (!list.length) return null;
      const rule = Coving.cutRule(cornerType, end);
      return { key: `${cornerType}-${end}`, cornerType, end, blade: rule.blade, mitreDir: rule.mitreDir, keep: rule.keep, angles: list.map(a => a.number) };
    }).filter(Boolean);
  }

  // ---------- sections ----------

  function renderPlanSection(g) {
    const out = [];
    out.push(`<g data-section="plan">`);
    for (const pc of g.pieces) {
      out.push(`<polygon data-piece="${pc.number}" points="${pc.polygon.map(pt).join(' ')}" fill="${C.band}" stroke="${C.wall}" stroke-width="0.8"/>`);
    }
    out.push(`<polygon points="${g.outline.map(pt).join(' ')}" fill="none" stroke="${C.wall}" stroke-width="1.6"/>`);
    for (const pc of g.pieces) {
      const tr = `rotate(${n1(pc.rotation)} ${n1(pc.label.x)} ${n1(pc.label.y)})`;
      out.push(text(pc.label.x, pc.label.y + 0.5, pc.text, { anchor: 'middle', baseline: 'central', size: 10.5, weight: 600, fill: C.wall, transform: tr }));
    }
    for (const b of g.badges) out.push(badge(b.x, b.y, b.number, `data-angle="${b.number}"`));
    out.push(text(PLAN_BOX.x + PLAN_BOX.w / 2, PLAN_BOX.y + PLAN_BOX.h + 38, 'Room plan, angles clockwise from the top left', { anchor: 'middle', size: 11, fill: C.muted }));
    out.push(`</g>`);
    return out.join('');
  }

  function renderTable(room, top) {
    const col = { angle: 0, piece: 44, end: 104, corner: 168, side: 270, glyph: 378, blade: 400 };
    const out = [`<g data-section="table">`];
    const hy = top;
    const head = (x, s, o) => text(TABLE_X + x, hy, s, Object.assign({ size: 11, weight: 600, fill: C.muted }, o));
    out.push(head(col.angle, 'Angle'), head(col.piece, 'Piece'), head(col.end, 'End'), head(col.corner, 'Corner'), head(col.side, 'Coving side'), head(col.glyph, 'Blade'));
    out.push(`<line x1="${TABLE_X}" y1="${hy + 8}" x2="${WIDTH - 24}" y2="${hy + 8}" stroke="${C.rule}" stroke-width="1"/>`);
    room.angles.forEach((a, i) => {
      const y = hy + 14 + i * ROW_H + ROW_H / 2;
      out.push(`<g data-row="${a.number}" data-corner="${a.cornerType}" data-blade="${a.blade}" data-keep="${a.keep}">`);
      if (i % 2 === 1) out.push(`<rect x="${TABLE_X - 8}" y="${n1(y - ROW_H / 2)}" width="${WIDTH - 24 - TABLE_X + 8}" height="${ROW_H}" fill="${C.zebra}"/>`);
      out.push(badge(TABLE_X + col.angle + 12, y, a.number));
      const o = { baseline: 'central', size: 12 };
      out.push(text(TABLE_X + col.piece, y, `Piece ${a.piece}`, o));
      out.push(text(TABLE_X + col.end, y, `${cap(a.end)} end`, o));
      out.push(text(TABLE_X + col.corner, y, `${cap(a.cornerType)} ${wallAngle(a)}°`, o));
      out.push(text(TABLE_X + col.side, y, `${cap(a.keep)} of blade`, o));
      out.push(bladeGlyph(TABLE_X + col.glyph, y, a.blade));
      out.push(text(TABLE_X + col.blade, y, `${a.mitre}° ${a.mitreDir}`, o));
      out.push(`</g>`);
    });
    out.push(`</g>`);
    return { svg: out.join(''), height: 14 + room.angles.length * ROW_H + 10 };
  }

  function renderSaw(x0, y0, s) {
    const w = 150, bodyTop = y0 + 24, bodyH = 34, bodyBot = bodyTop + bodyH;
    const cx = x0 + w / 2;
    const sgn = s.blade === '/' ? 1 : -1;
    const xt = cx + sgn * 12, xb = cx - sgn * 12;
    const left = [[x0, bodyTop], [xt, bodyTop], [xb, bodyBot], [x0, bodyBot]];
    const right = [[xt, bodyTop], [x0 + w, bodyTop], [x0 + w, bodyBot], [xb, bodyBot]];
    const poly = (pts, keep) => `<polygon points="${pts.map(p => `${n1(p[0])},${n1(p[1])}`).join(' ')}" ` +
      (keep ? `fill="${C.band}" stroke="${C.wall}" stroke-width="0.8"/>` : `fill="none" stroke="${C.offcut}" stroke-width="0.8" stroke-dasharray="3 3"/>`);
    const out = [`<g data-saw="${s.key}" data-angles="${s.angles.join(', ')}">`];
    out.push(text(cx, y0, `${cap(s.cornerType)} corner, ${s.end} end`, { anchor: 'middle', size: 12, weight: 600 }));
    out.push(`<rect x="${x0}" y="${y0 + 12}" width="${w}" height="6" rx="1" fill="${C.fence}"/>`);
    out.push(text(x0 + w + 6, y0 + 15, 'fence', { baseline: 'central', size: 9, fill: C.muted }));
    out.push(poly(left, s.keep === 'left'));
    out.push(poly(right, s.keep === 'right'));
    out.push(`<line x1="${n1(cx + sgn * 16)}" y1="${n1(bodyTop - 6)}" x2="${n1(cx - sgn * 16)}" y2="${n1(bodyBot + 6)}" stroke="${C.blade}" stroke-width="2.5" stroke-linecap="round"/>`);
    out.push(text(cx, bodyBot + 12, 'you stand here', { anchor: 'middle', size: 8.5, fill: C.muted }));
    out.push(text(cx, bodyBot + 29, `Blade ${s.blade}  ·  mitre ${s.mitreDir}`, { anchor: 'middle', size: 11 }));
    out.push(text(cx, bodyBot + 45, `Keep the ${s.keep.toUpperCase()} piece`, { anchor: 'middle', size: 11, weight: 600 }));
    out.push(text(cx, bodyBot + 61, `Angles ${s.angles.join(', ')}`, { anchor: 'middle', size: 11, fill: C.muted }));
    out.push(`</g>`);
    return out.join('');
  }
  const SAW_H = 24 + 34 + 61; // title to last caption line

  // The how-to note at the bottom: boxed, dark text, big enough to read in a workshop.
  function renderNote(x, y, w, h) {
    const pad = 16, lh = 19;
    const out = [`<g data-section="howto">`];
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.zebra}" stroke="${C.rule}" stroke-width="1"/>`);
    out.push(text(x + pad, y + pad + 10, 'How to set up the saw', { size: 13.5, weight: 700 }));
    let ly = y + pad + 10 + lh + 4;
    out.push(text(x + pad, ly, 'Saw seen from above: fence at the back, you at the front. Left and right are yours as you stand at the saw.', { size: 12.5 }));
    ly += lh;
    out.push(`<text x="${x + pad}" y="${n1(ly)}" font-size="12.5" fill="${C.text}">Coving goes in <tspan font-weight="700">UPSIDE DOWN but FACE UP</tspan>: ceiling edge flat on the saw bed, wall edge against the fence.</text>`);
    ly += lh;
    out.push(text(x + pad, ly, 'The decorative face points towards you; the hollow back sits in the corner between bed and fence.', { size: 12.5 }));
    ly += lh;
    out.push(text(x + pad, ly, 'Test the first cut on an offcut before cutting a full length.', { size: 12.5 }));
    out.push(`</g>`);
    return out.join('');
  }

  // ---------- whole document ----------

  function renderPlan(room) {
    const g = planGeometry(room, PLAN_BOX);
    const setups = usedSetups(room.angles);

    const tableTop = TABLE_TOP;
    const table = renderTable(room, tableTop);
    const planBottom = PLAN_BOX.y + PLAN_BOX.h + 80;
    const legendTop = Math.max(planBottom, tableTop + table.height + 40);
    const sawTop = legendTop + 28;
    const noteTop = sawTop + SAW_H + 26;
    const NOTE_H = 118;
    const height = noteTop + NOTE_H + 28;

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" font-family="${FONT}">`);
    out.push(`<title>Coving cutting plan</title>`);
    out.push(`<rect width="${WIDTH}" height="${height}" fill="#ffffff"/>`);
    out.push(text(40, 38, 'Coving cutting plan', { size: 20, weight: 700 }));
    out.push(text(40, 58, `${room.pieces.length} pieces, ${room.angles.length} cuts. Odd angles are the left end of a piece, even angles the right end, as you face the wall.`, { size: 11.5, fill: C.muted }));

    out.push(renderPlanSection(g));
    out.push(table.svg);

    out.push(`<g data-section="legend">`);
    out.push(text(40, legendTop, 'Saw setups', { size: 13, weight: 700 }));
    const gap = 24, sawW = 150 + 40;
    setups.forEach((s, i) => out.push(renderSaw(40 + i * (sawW + gap), sawTop, s)));
    out.push(`</g>`);
    out.push(renderNote(40, noteTop, WIDTH - 80, NOTE_H));

    out.push(`</svg>`);
    return out.join('\n');
  }

  return { planGeometry, renderPlan, usedSetups, wallAngle };
});
