import { describe, it, expect } from 'vitest';
import {
  orderCorners, polygonArea, isConvexQuad, flatSize, homography, project, fullQuad, rotatePoint, rotateQuad, scaleQuad,
  clampQuad, isConfidentQuad,
} from '../geometry.js';
import { hullToQuad } from '../autoCrop.js';

const close = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('crop geometry', () => {
  it('orders corners top-left, top-right, bottom-right, bottom-left whatever the input order', () => {
    const q = orderCorners([{ x: 90, y: 110 }, { x: 10, y: 12 }, { x: 8, y: 100 }, { x: 95, y: 5 }]);
    expect(q).toEqual([{ x: 10, y: 12 }, { x: 95, y: 5 }, { x: 90, y: 110 }, { x: 8, y: 100 }]);
  });

  it('measures area and convexity', () => {
    expect(polygonArea(fullQuad(10, 20))).toBe(200);
    expect(isConvexQuad(fullQuad(10, 20))).toBe(true);
    // A bow-tie (crossed) quad is not convex.
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
  });

  it('sizes the flattened page from its longer opposite sides', () => {
    expect(flatSize([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 90, y: 60 }, { x: 10, y: 60 }])).toEqual({ width: 100, height: 61 });
  });

  it('builds a homography that maps each corner exactly and the middle sensibly', () => {
    const from = fullQuad(200, 100);
    const to = [{ x: 10, y: 20 }, { x: 180, y: 5 }, { x: 190, y: 120 }, { x: 0, y: 110 }];
    const H = homography(from, to);
    from.forEach((p, i) => {
      const r = project(H, p.x, p.y);
      close(r.x, to[i].x);
      close(r.y, to[i].y);
    });
    // An affine case: the centre maps to the centre.
    const Ha = homography(fullQuad(10, 10), [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 25 }, { x: 5, y: 25 }]);
    const c = project(Ha, 5, 5);
    close(c.x, 15);
    close(c.y, 15);
    expect(homography(fullQuad(10, 10), [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toBe(null);
  });

  it('turns points and crops with the photo by quarter turns', () => {
    // A 200×100 photo turned clockwise becomes 100×200; its top-left corner goes top-right.
    expect(rotatePoint({ x: 0, y: 0 }, 200, 100, 1)).toEqual({ x: 100, y: 0 });
    expect(rotatePoint({ x: 0, y: 0 }, 200, 100, -1)).toEqual({ x: 0, y: 200 });
    const quad = [{ x: 20, y: 10 }, { x: 180, y: 10 }, { x: 180, y: 90 }, { x: 20, y: 90 }];
    const turned = rotateQuad(quad, 200, 100, 1);
    expect(turned).toEqual([{ x: 10, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 180 }, { x: 10, y: 180 }]);
    // Four turns bring it back.
    let q = quad;
    let [w, h] = [200, 100];
    for (let i = 0; i < 4; i += 1) {
      q = rotateQuad(q, w, h, 1);
      [w, h] = [h, w];
    }
    expect(q).toEqual(quad);
  });

  it('scales and clamps quads', () => {
    expect(scaleQuad(fullQuad(10, 10), 2)).toEqual(fullQuad(20, 20));
    expect(clampQuad([{ x: -5, y: 3 }, { x: 50, y: -1 }, { x: 12, y: 30 }, { x: 0, y: 0 }], 20, 20)).toEqual([
      { x: 0, y: 3 }, { x: 20, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 0 },
    ]);
  });

  it('only trusts sensible, well-filled page shapes', () => {
    const card = [{ x: 60, y: 80 }, { x: 420, y: 70 }, { x: 430, y: 300 }, { x: 50, y: 310 }];
    expect(isConfidentQuad(card, 480, 360)).toBe(true);
    expect(isConfidentQuad(card, 480, 360, { fill: 0.6 })).toBe(false); // the patch doesn't fill it
    expect(isConfidentQuad(fullQuad(480, 360), 480, 360)).toBe(false); // the whole photo: nothing to crop
    expect(isConfidentQuad([{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 40 }, { x: 10, y: 40 }], 480, 360)).toBe(false); // too small
    // A sliver with a very sharp corner.
    expect(isConfidentQuad([{ x: 0, y: 0 }, { x: 400, y: 20 }, { x: 420, y: 40 }, { x: 0, y: 340 }], 480, 360)).toBe(false);
  });

  it('reduces a hull to the 4 corners that keep the most area', () => {
    const hull = [{ x: 0, y: 0 }, { x: 50, y: -1 }, { x: 100, y: 0 }, { x: 101, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: -1, y: 50 }];
    expect(hullToQuad(hull)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
  });
});
