import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset, findFeature, structureMembers } from "../src/compose.ts"
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

test("合成结果为底图特征加补绘要素", async () => {
  const { dataset } = await load()
  const names = dataset.features.map((feature) => feature.properties.name).sort()
  assert.deepEqual(names, ["东门", "示例楼 A", "示例楼 B", "示例操场", "示例楼 A–B 连接体", "示例校区"].sort())
})

test("入口全部来自 survey 层", async () => {
  const { loaded, dataset } = await load()
  assert.equal(loaded.base.campus.features.some((f) => f.properties.entrances), false)
  const building = findFeature(dataset, "示例楼 A")
  const entrances = building?.properties.entrances ?? []
  assert.equal(entrances.length, 2)
  assert.equal(entrances.filter((entrance) => entrance.manual).length, 1)
})

test("共用门厅的楼栋指向同一结构体", async () => {
  const { dataset } = await load()
  const a = findFeature(dataset, "示例楼 A")
  const b = findFeature(dataset, "示例楼 B")
  assert.equal(a?.properties.structure?.id, "示例楼 A、示例楼 B")
  assert.equal(a?.properties.structure?.id, b?.properties.structure?.id)
  assert.deepEqual(structureMembers(dataset, "示例楼 A"), ["示例楼 A", "示例楼 B"])
})

test("未登记结构的楼栋返回自身", async () => {
  const { dataset } = await load()
  assert.deepEqual(structureMembers(dataset, "东门"), ["东门"])
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
