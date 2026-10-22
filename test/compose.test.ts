import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset, findFeature } from "../src/compose.ts"
import { loadBaseData, loadSurveyData } from "../src/io-node.ts"
import type { Entrance, Feature } from "../src/types.ts"
import { readFile } from "node:fs/promises"

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url))
const FIXTURE = fileURLToPath(new URL("./fixtures/campus-source.json", import.meta.url))

interface Fixture {
  center: [number, number]
  overlayBounds: [[number, number], [number, number]]
  features: Feature[]
}

const fixture: Fixture = JSON.parse(await readFile(FIXTURE, "utf8"))

const normalizeEntrances = (entrances: Entrance[] | undefined): string[] =>
  (entrances ?? [])
    .map((entrance) =>
      JSON.stringify({
        side: entrance.side,
        is_main: entrance.is_main,
        manual: entrance.manual,
        ...(entrance.long_edge === undefined ? {} : { long_edge: entrance.long_edge }),
        ...(entrance.dist_to_road === undefined ? {} : { dist_to_road: entrance.dist_to_road }),
        ...(entrance.position_accuracy === undefined
          ? {}
          : { position_accuracy: entrance.position_accuracy }),
        line: entrance.line,
      }),
    )
    .sort()

test("拆分后重组与迁移源等价", async () => {
  const dataset = composeDataset(await loadBaseData(DATA_DIR), await loadSurveyData(DATA_DIR))

  assert.equal(dataset.features.length, fixture.features.length, "特征数量应一致")
  assert.equal(
    new Set(dataset.features.map((feature) => feature.properties.name)).size,
    fixture.features.length,
    "特征名应唯一",
  )

  for (const original of fixture.features) {
    const name = original.properties.name
    const composed = dataset.features.find((feature) => feature.properties.name === name)
    assert.ok(composed, `缺少特征：${name}`)

    assert.deepEqual(composed.geometry, original.geometry, `${name} 的几何被改动`)

    const { entrances: originalEntrances, residence: originalResidence, ...originalRest } =
      original.properties
    const { entrances: composedEntrances, residence: composedResidence, ...composedRest } =
      composed.properties

    assert.deepEqual(composedRest, originalRest, `${name} 的基础属性被改动`)
    assert.deepEqual(
      normalizeEntrances(composedEntrances),
      normalizeEntrances(originalEntrances),
      `${name} 的入口集合被改动`,
    )
    assert.deepEqual(composedResidence ?? null, originalResidence ?? null, `${name} 的宿舍结构被改动`)
  }
})

test("base 与 survey 的入口不重叠且各自标记一致", async () => {
  const base = await loadBaseData(DATA_DIR)
  const survey = await loadSurveyData(DATA_DIR)

  const baseEntrances = Object.values(base.entrances.records).flat()
  const surveyEntrances = Object.values(survey.entrances.records).flat()

  assert.ok(baseEntrances.length > 0 && surveyEntrances.length > 0)
  assert.ok(
    baseEntrances.every((entrance) => entrance.manual === false),
    "base 入口不应标记为人工核对",
  )
  assert.ok(
    surveyEntrances.every((entrance) => entrance.manual === true),
    "survey 入口必须标记为人工核对",
  )
})

test("数据集可按名称定位并能取到入口", async () => {
  const dataset = composeDataset(await loadBaseData(DATA_DIR), await loadSurveyData(DATA_DIR))
  const withEntrance = dataset.features.find(
    (feature) => (feature.properties.entrances ?? []).length > 0,
  )
  assert.ok(withEntrance)
  const byName = findFeature(dataset, withEntrance.properties.name)
  assert.equal(byName?.properties.name, withEntrance.properties.name)
})
