import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset } from "../src/compose.ts"
import { entrancePoint, entranceStatus, nearestEntrance } from "../src/entrance.ts"
import { loadInstance } from "../src/io-node.ts"
import type { Entrance, Feature } from "../src/types.ts"

const ROOT = fileURLToPath(new URL("../examples/toy-campus", import.meta.url))

const line: [number, number][] = [
  [116.8, 36.5],
  [116.8001, 36.5],
]

const entrance = (overrides: Partial<Entrance>): Entrance => ({
  side: "north",
  is_main: false,
  manual: true,
  line,
  ...overrides,
})

const building = (name: string, entrances: Entrance[]): Feature => ({
  type: "Feature",
  id: name,
  properties: { name, kind: "building", entrances },
  geometry: { type: "Point", coordinates: [116.8, 36.5] },
})

test("可信度由产生方式决定", () => {
  assert.equal(entranceStatus(entrance({ manual: true })), "verified")
  assert.equal(entranceStatus(entrance({ manual: false })), "candidate")
  assert.equal(entranceStatus(entrance({ manual: true, position_accuracy: "approximate" })), "approximate")
  assert.equal(entranceStatus(entrance({ line: [] })), "unknown")
})

test("entrancePoint 取线段中点，空线段返回 null", () => {
  assert.deepEqual(entrancePoint(entrance({})), [116.80005, 36.5])
  assert.equal(entrancePoint(entrance({ line: [] })), null)
})

test("nearestEntrance 默认只接受已核对入口", () => {
  const near = building("近处候选门", [entrance({ manual: false })])
  const far = building("远处已核对门", [
    entrance({ manual: true, line: [[116.801, 36.5], [116.8011, 36.5]] }),
  ])

  const hit = nearestEntrance([near, far], { lat: 36.5, lng: 116.7999 })
  assert.equal(hit?.feature.properties.name, "远处已核对门")
  assert.equal(hit?.status, "verified")
})

test("nearestEntrance 放宽到 candidate 后才取近处", () => {
  const near = building("近处候选门", [entrance({ manual: false })])
  const far = building("远处已核对门", [
    entrance({ manual: true, line: [[116.801, 36.5], [116.8011, 36.5]] }),
  ])

  const hit = nearestEntrance([near, far], { lat: 36.5, lng: 116.7999 }, { minStatus: "candidate" })
  assert.equal(hit?.feature.properties.name, "近处候选门")
})

test("示例实例中，靠近南侧的查询命中已核对入口", async () => {
  const loaded = await loadInstance(ROOT, "demo")
  const dataset = composeDataset(
    loaded.base,
    loaded.survey,
    loaded.layers.map((layer) => layer.info),
  )

  const hit = nearestEntrance(dataset.features, { lat: 30.0006, lng: 120.001 })
  assert.ok(hit)
  assert.equal(hit.feature.properties.name, "示例楼 A")
  assert.equal(hit.status, "verified")
  assert.ok(hit.distanceMeters < 30, `距离 ${hit.distanceMeters} 应贴近南侧外墙`)
})
