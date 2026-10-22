import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset, findFeature } from "../src/compose.ts"
import { loadInstance } from "../src/io-node.ts"

const ROOT = fileURLToPath(new URL("../examples/toy-campus", import.meta.url))

const load = async () => {
  const loaded = await loadInstance(ROOT, "demo")
  return {
    loaded,
    dataset: composeDataset(
      loaded.base,
      loaded.survey,
      loaded.layers.map((layer) => layer.info),
    ),
  }
}

test("合成结果为底图特征加连接体", async () => {
  const { dataset } = await load()
  const names = dataset.features.map((feature) => feature.properties.name)
  assert.deepEqual(names.sort(), ["东门", "示例楼 A", "示例楼 B", "示例操场", "示例楼 A–B 连接体", "示例校区"].sort())
})

test("入口按层合并，且保留人工与自动的分界", async () => {
  const { dataset } = await load()
  const building = findFeature(dataset, "示例楼 A")
  assert.ok(building)
  const entrances = building.properties.entrances ?? []
  assert.equal(entrances.length, 2, "示例楼 A 应有一个自动入口与一个人工入口")
  assert.equal(entrances.filter((entrance) => entrance.manual).length, 1)
  assert.equal(entrances.filter((entrance) => !entrance.manual).length, 1)
})

test("宿舍结构只挂在对应建筑上", async () => {
  const { dataset } = await load()
  const buildingB = findFeature(dataset, "示例楼 B")
  assert.equal(buildingB?.properties.residence?.layout, "connected")
  assert.equal(buildingB?.properties.residence?.shared_with, "示例楼 A")
  assert.equal(findFeature(dataset, "示例楼 A")?.properties.residence, undefined)
})

test("层摘要随数据集返回，供产物署名", async () => {
  const { dataset } = await load()
  assert.deepEqual(
    dataset.layers.map((layer) => `${layer.id}:${layer.license}`),
    ["osm:ODbL-1.0", "survey:PolyForm-Noncommercial-1.0.0"],
  )
})

test("配准来自实例而非数据文件", async () => {
  const { dataset } = await load()
  assert.equal(dataset.registration.canvas.viewBox, "0 0 1000 800")
  assert.deepEqual(dataset.registration.center, { lat: 30.0015, lng: 120.002 })
})
