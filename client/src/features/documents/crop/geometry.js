/**
 * Pure geometry for the document auto-crop: corner ordering, the perspective transform
 * (homography) between a photographed page and a flat rectangle, the output size, and turning a
 * crop with the photo by 90°. Points are `{ x, y }`; a quad is `[topLeft, topRight, bottomRight,
 * bottomLeft]`. No DOM — unit-tested.
 */

/** Orders 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points) {
  const pts = points.slice(0, 4);
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tl = bySum[0];
  const br = bySum[3];
  const tr = byDiff[0];
  const bl = byDiff[3];
  return [tl, tr, br, bl];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Area of a polygon (shoelace), always positive. */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** True when the quad is convex and not self-crossing (every turn has the same sign). */
export function isConvexQuad(quad) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Output width/height for flattening `quad`: the longer of each pair of opposite sides. */
export function flatSize(quad) {
  const [tl, tr, br, bl] = quad;
  return {
    width: Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br)))),
    height: Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br)))),
  };
}

/** Solves the 8×8 linear system A·h = b (Gaussian elimination with partial pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * The homography that maps each `from[i]` onto `to[i]` (4 point pairs), as a 3×3 matrix in a
 * flat array `[a, b, c, d, e, f, g, h, 1]`; `null` for a degenerate quad.
 */
export function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

/** Applies a homography to one point. */
export function project(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** The whole image as a quad (`width`×`height`). */
export function fullQuad(width, height) {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

/**
 * Where a point of a `width`×`height` image lands after turning the image 90° clockwise
 * (`dir = 1`) or anticlockwise (`dir = -1`); the turned image is `height`×`width`.
 */
export function rotatePoint({ x, y }, width, height, dir) {
  return dir > 0 ? { x: height - y, y: x } : { x: y, y: width - x };
}

/** Turns a crop together with its photo by 90° (keeps the corner order top-left first). */
export function rotateQuad(quad, width, height, dir) {
  return orderCorners(quad.map((p) => rotatePoint(p, width, height, dir)));
}

/** Scales a quad between two image sizes (e.g. detection copy → full photo). */
export function scaleQuad(quad, sx, sy = sx) {
  return quad.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

/** Keeps every corner inside a `width`×`height` image. */
export function clampQuad(quad, width, height) {
  return quad.map((p) => ({ x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) }));
}

/**
 * Whether a detected quad is trustworthy enough to crop to: convex, covering between 12% and
 * 97% of the photo (smaller is probably a detail; nearly all of it means there's nothing to
 * crop), with sane corner angles, and — when given — filled by the detected page for at least
 * 85% of its area. Anything else keeps the whole photo: a missing crop beats a bad one.
 */
export function isConfidentQuad(quad, width, height, { fill = 1 } = {}) {
  if (!quad || quad.length !== 4 || !isConvexQuad(quad)) return false;
  const share = polygonArea(quad) / (width * height);
  if (share < 0.12 || share > 0.97) return false;
  if (fill < 0.85) return false;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[(i + 3) % 4];
    const b = quad[i];
    const c = quad[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (deg < 45 || deg > 135) return false;
  }
  return true;
}
