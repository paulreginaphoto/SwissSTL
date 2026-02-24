import type { BBox } from "../App";

/**
 * Extract a polygon contour from a PNG mask (dark pixels on transparent bg).
 * Returns [[lon,lat], ...] polygon mapped to the given bbox, or null on failure.
 */
export async function pngMaskToPolygon(
  file: File,
  bbox: BBox,
  maxDim = 150,
  maxPoints = 300,
): Promise<number[][] | null> {
  const img = await loadImage(file);

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const mask = buildMask(imageData);
  const contour = traceBoundary(mask, w, h);
  if (contour.length < 6) return null;

  const simplified = douglasPeucker(contour, 0.8);
  if (simplified.length < 3) return null;

  const polygon = simplified.map(([px, py]) => [
    bbox.minLon + (px / w) * (bbox.maxLon - bbox.minLon),
    bbox.maxLat - (py / h) * (bbox.maxLat - bbox.minLat),
  ]);

  if (
    polygon[0][0] !== polygon[polygon.length - 1][0] ||
    polygon[0][1] !== polygon[polygon.length - 1][1]
  ) {
    polygon.push([polygon[0][0], polygon[0][1]]);
  }

  return polygon.length >= 4 ? polygon : null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function buildMask(data: ImageData): Uint8Array {
  const { width, height, data: px } = data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const a = px[i * 4 + 3];
    mask[i] = a > 100 && (r + g + b) / 3 < 200 ? 1 : 0;
  }
  return mask;
}

/**
 * Moore boundary tracing: walk the outer contour of the binary mask clockwise.
 */
function traceBoundary(mask: Uint8Array, w: number, h: number): number[][] {
  let sx = -1,
    sy = -1;
  for (let y = 0; y < h && sx < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];

  // 8-neighbor offsets clockwise: E, SE, S, SW, W, NW, N, NE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const inside = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1;

  const result: number[][] = [];
  let bx = sx,
    by = sy;
  let backDir = 6; // came from N (above start is outside)
  const maxIter = w * h * 2;

  for (let iter = 0; iter < maxIter; iter++) {
    result.push([bx, by]);
    let found = false;

    for (let i = 0; i < 8; i++) {
      const d = (backDir + i) % 8;
      const nx = bx + dx[d];
      const ny = by + dy[d];
      if (inside(nx, ny)) {
        backDir = (d + 4) % 8;
        bx = nx;
        by = ny;
        found = true;
        break;
      }
    }

    if (!found) break;
    if (bx === sx && by === sy) break;
  }

  return result;
}

function douglasPeucker(pts: number[][], epsilon: number): number[][] {
  if (pts.length <= 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function ptLineDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0)
    return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
  );
  return Math.sqrt((p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2);
}
