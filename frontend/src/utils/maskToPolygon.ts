/**
 * Extract a shape from a PNG image and map it to geographic coordinates.
 *
 * Supported image formats:
 *  - Dark shape on transparent background
 *  - Dark shape on light background (white, grey)
 *  - Light shape on dark background (auto-detected via border analysis)
 */

export interface MaskShape {
  points: number[][]; // normalized [0,1] × [0,1]
  aspect: number; // width / height
}

export interface MaskGeo {
  polygon: number[][]; // [[lon,lat], ...] closed
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractMaskShape(
  file: File,
  maxDim = 150,
): Promise<MaskShape | null> {
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

  const points = simplified.map(([px, py]) => [px / w, py / h]);
  if (
    points[0][0] !== points[points.length - 1][0] ||
    points[0][1] !== points[points.length - 1][1]
  ) {
    points.push([points[0][0], points[0][1]]);
  }

  return points.length >= 4
    ? { points, aspect: img.width / img.height }
    : null;
}

export function maskShapeToGeo(
  shape: MaskShape,
  center: { lng: number; lat: number },
  widthM: number,
): MaskGeo {
  const DEG_LAT_M = 111_320;
  const DEG_LON_M = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const wDeg = widthM / DEG_LON_M;
  const hDeg = widthM / shape.aspect / DEG_LAT_M;

  const polygon = shape.points.map(([nx, ny]) => [
    center.lng + (nx - 0.5) * wDeg,
    center.lat + (0.5 - ny) * hDeg,
  ]);

  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return { polygon, bbox: { minLon, minLat, maxLon, maxLat } };
}

// ---------------------------------------------------------------------------
// Mask building — handles alpha, brightness, or inverted images
// ---------------------------------------------------------------------------

function buildMask(data: ImageData): Uint8Array {
  const { width, height, data: px } = data;
  const n = width * height;
  const mask = new Uint8Array(n);

  let minA = 255,
    maxA = 0;
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
  }

  if (maxA - minA > 50) {
    // Alpha mode: opaque pixels = shape
    for (let i = 0; i < n; i++) {
      mask[i] = px[i * 4 + 3] > 128 ? 1 : 0;
    }
    return mask;
  }

  // Brightness mode: check border pixels to decide which is background
  let borderSum = 0;
  let borderN = 0;
  for (let x = 0; x < width; x++) {
    borderSum += brightness(px, x);
    borderSum += brightness(px, (height - 1) * width + x);
    borderN += 2;
  }
  for (let y = 1; y < height - 1; y++) {
    borderSum += brightness(px, y * width);
    borderSum += brightness(px, y * width + width - 1);
    borderN += 2;
  }
  const bgBright = borderSum / borderN;
  const inverted = bgBright < 128;

  for (let i = 0; i < n; i++) {
    const b = brightness(px, i);
    mask[i] = inverted ? (b > 128 ? 1 : 0) : b < 128 ? 1 : 0;
  }
  return mask;
}

function brightness(px: Uint8ClampedArray, idx: number): number {
  return (px[idx * 4] + px[idx * 4 + 1] + px[idx * 4 + 2]) / 3;
}

// ---------------------------------------------------------------------------
// Moore boundary tracing
// ---------------------------------------------------------------------------

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

  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const inside = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1;

  const result: number[][] = [];
  let bx = sx,
    by = sy;
  let backDir = 6;
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

// ---------------------------------------------------------------------------
// Douglas-Peucker simplification
// ---------------------------------------------------------------------------

function douglasPeucker(pts: number[][], eps: number): number[][] {
  if (pts.length <= 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let maxD = 0,
    maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD > eps) {
    const left = douglasPeucker(pts.slice(0, maxI + 1), eps);
    const right = douglasPeucker(pts.slice(maxI), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function ptLineDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// ---------------------------------------------------------------------------

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
