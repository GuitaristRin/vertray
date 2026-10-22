/**
 * 平面几何与距离。校园尺度下用局部等距投影即可，
 * 不引入地理库：本仓要求离线自足、零运行时依赖。
 */
import type { Feature, LatLng, LngLat } from "./types.ts"

const METERS_PER_DEGREE_LAT = 111_132

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function metersPerDegreeLng(latitude: number): number {
  return 111_320 * Math.cos(toRadians(latitude))
}

/** 点到点的球面距离（米）。 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const earthRadius = 6_371_000
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function midpoint(line: readonly LngLat[]): LngLat {
  if (line.length === 0) throw new Error("空线段没有中点")
  if (line.length === 2) {
    const [a, b] = line as [LngLat, LngLat]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }
  const sum = line.reduce<LngLat>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
  return [sum[0] / line.length, sum[1] / line.length]
}

export function bboxOf(coordinates: readonly LngLat[]): {
  min: LngLat
  max: LngLat
} {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { min: [minLng, minLat], max: [maxLng, maxLat] }
}

/** 射线法：点是否在环内。环可闭合也可不闭合。 */
export function ringContains(ring: readonly LngLat[], point: LngLat): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const [xi, yi] = a
    const [xj, yj] = b
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** 只对 Polygon 有意义；Point 特征不参与判定。 */
export function featureContains(feature: Feature, point: LngLat): boolean {
  if (feature.geometry.type !== "Polygon") return false
  return feature.geometry.coordinates.some((ring) => ringContains(ring, point))
}

/**
 * 点到线段最近点。投影到以线段起点为原点的局部平面，返回米制距离。
 */
export function nearestPointOnSegment(
  point: LngLat,
  a: LngLat,
  b: LngLat,
): { point: LngLat; distanceMeters: number } {
  const lat0 = (a[1] + b[1]) / 2
  const kx = metersPerDegreeLng(lat0)
  const ky = METERS_PER_DEGREE_LAT
  const px = (point[0] - a[0]) * kx
  const py = (point[1] - a[1]) * ky
  const bx = (b[0] - a[0]) * kx
  const by = (b[1] - a[1]) * ky
  const lengthSquared = bx * bx + by * by
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared))
  const cx = bx * t
  const cy = by * t
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    distanceMeters: Math.hypot(px - cx, py - cy),
  }
}
