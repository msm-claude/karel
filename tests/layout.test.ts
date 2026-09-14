// The fit must leave room for Karel standing on the tallest stack in the back corner, and keep the front
// corner's floor inside the canvas: a task map once cut Karel's head off under the PRED label.
import { describe, expect, it } from 'vitest';
import { emptyWorld } from '../src/core/world';
import { layout, type View } from '../src/ui/render';

describe('layout', () => {
  const sizes: [number, number][] = [[1, 1], [3, 3], [4, 4], [5, 3], [10, 8], [30, 30]];
  const boxes: [number, number][] = [[320, 200], [800, 600], [200, 800]];
  for (const [w, h] of sizes)
    for (const [cw, ch] of boxes)
      for (const levels of [0, 3, 10])
        for (const view of [0, 1, 2, 3] as View[])
          it(`${w}x${h} in ${cw}x${ch}, ${levels} bricks, view ${view}: everything inside`, () => {
            const L = layout(cw, ch, emptyWorld(w, h), view, { levels });
            const top = L.oy - L.H - L.FZ - levels * 0.31 * L.W - 1.04 * L.W; // Karel's head on the back corner's stack
            const bottom = L.oy + (L.rw + L.rh - 1) * L.H + L.FZ; // the front corner's floor edge
            expect(top).toBeGreaterThanOrEqual(0);
            expect(bottom).toBeLessThanOrEqual(ch);
            expect(L.ox - L.rh * L.W).toBeGreaterThanOrEqual(0); // left corner
            expect(L.ox + L.rw * L.W).toBeLessThanOrEqual(cw); // right corner
          });
});
