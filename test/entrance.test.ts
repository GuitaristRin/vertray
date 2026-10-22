import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset, findFeature } from "../src/compose.ts"
import { entrancePoint, entranceStatus, nearestEntrance } from "../src/entrance.ts"
import { loadBaseData, loadSurveyData } from "../src/io-node.ts"
import type { Entrance, Feature } from "../src/types.ts"

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url))

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

test("真实数据里最近的已核对入口在合理范围内", async () => {
  const dataset = composeDataset(await loadBaseData(DATA_DIR), await loadSurveyData(DATA_DIR))
  const campus = findFeature(dataset, "齐鲁工业大学长清校区")
  assert.ok(campus)

  const hit = nearestEntrance(dataset.features, {
    lat: dataset.meta.center.lat,
    lng: dataset.meta.center.lng,
  })
  assert.ok(hit, "校中心附近应能找到已核对入口")
  assert.equal(hit.status, "verified")
  assert.ok(hit.distanceMeters < 3000, `距离 ${hit.distanceMeters} 超出校区尺度`)
})
