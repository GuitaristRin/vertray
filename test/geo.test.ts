import assert from "node:assert/strict"
import { test } from "node:test"
import {
  bboxOf,
  haversineMeters,
  midpoint,
  nearestPointOnSegment,
  ringContains,
} from "../src/geo.ts"
import type { LngLat } from "../src/types.ts"

const square: LngLat[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

test("ringContains 判定内外", () => {
  assert.equal(ringContains(square, [0.5, 0.5]), true)
  assert.equal(ringContains(square, [1.5, 0.5]), false)
  assert.equal(ringContains(square, [-0.1, 0.5]), false)
})

test("ringContains 对凹形环仍成立", () => {
  const concave: LngLat[] = [
    [0, 0],
    [2, 0],
    [2, 2],
    [1, 0.5],
    [0, 2],
  ]
  assert.equal(ringContains(concave, [1, 1.5]), false, "凹口内应判为外")
  assert.equal(ringContains(concave, [0.2, 0.2]), true)
})

test("haversineMeters 与已知量级一致", () => {
  const oneDegreeLat = haversineMeters({ lat: 36.5, lng: 116.8 }, { lat: 37.5, lng: 116.8 })
  assert.ok(Math.abs(oneDegreeLat - 111_195) < 500, `实测 ${oneDegreeLat}`)
  assert.equal(haversineMeters({ lat: 36.5, lng: 116.8 }, { lat: 36.5, lng: 116.8 }), 0)
})

test("nearestPointOnSegment 取垂足", () => {
  const hit = nearestPointOnSegment([0.5, 0.001], [0, 0], [1, 0])
  assert.deepEqual(hit.point, [0.5, 0])
  assert.ok(hit.distanceMeters > 100 && hit.distanceMeters < 120, `${hit.distanceMeters}`)
})

test("nearestPointOnSegment 对端点外取端点", () => {
  const hit = nearestPointOnSegment([2, 0], [0, 0], [1, 0])
  assert.deepEqual(hit.point, [1, 0])
})

test("midpoint 与 bboxOf", () => {
  assert.deepEqual(midpoint([[0, 0], [2, 2]]), [1, 1])
  assert.deepEqual(bboxOf(square), { min: [0, 0], max: [1, 1] })
})
