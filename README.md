# Coving cutting planner

Draw a room outline, get a cutting plan: a room plan with every piece and
cut angle numbered clockwise from the top left, a table saying which side of
the blade the coving sits and which way the blade is angled, and saw-from-above
diagrams for each setup the room needs. Handles external corners (chimney
breasts, window boxes) and non-square corners (bays).

Corners only need to be drawn roughly. Once the shape is closed, each corner
gets a box where you can type the wall-to-wall angle you measured (92, 135...)
and the mitre for both cuts at that corner updates.

## Run it

Open `index.html` in a browser. No server or build step.

For quick checks, `index.html#window` or `index.html#rectangle` loads a
ready-made room (the shapes live in `editor.js`).

## Cutting convention the output assumes

Coving is cut upside down but face up on a mitre saw: ceiling edge flat on the
saw bed, wall edge against the fence, decorative face towards you. That puts
the installed left end of a piece on your right at the saw ("back to front"). Saw pictured from above, fence at
the back, you at the front. `/` means the blade handle is swung to your left,
`\` to your right. Test on an offcut first.

## Files

- `coving.js`  geometry and cutting rules (pure, tested)
- `render.js`  turns the analysis into the SVG plan (pure, tested)
- `editor.js`  grid snapping helpers for the drawing canvas (pure, tested)
- `index.html` the page: drawing canvas and output

## Tests

    node --test coving.test.js render.test.js editor.test.js
