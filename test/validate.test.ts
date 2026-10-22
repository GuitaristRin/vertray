import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { validateData } from "../src/validate.ts"
import { loadBaseData, loadSurveyData } from "../src/io-node.ts"
import type { BaseData, SurveyData } from "../src/types.ts"

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url))

const clone = <T>(value: T): T => structuredClone(value)

test("迁移后的数据通过校验", async () => {
  const result = validateData(await loadBaseData(DATA_DIR), await loadSurveyData(DATA_DIR))
  const errors = result.issues.filter((issue) => issue.level === "error")
  assert.deepEqual(errors, [], `不应有错误：${JSON.stringify(errors, null, 2)}`)
  assert.equal(result.ok, true)
})

test("base 中出现人工核对入口即报错", async () => {
  const base = clone(await loadBaseData(DATA_DIR))
  const first = Object.keys(base.entrances.records)[0]
  assert.ok(first)
  base.entrances.records[first]![0]!.manual = true

  const result = validateData(base, await loadSurveyData(DATA_DIR))
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "survey-data-in-base"))
})

test("survey 中出现自动入口即报错", async () => {
  const survey = clone(await loadSurveyData(DATA_DIR))
  const first = Object.keys(survey.entrances.records)[0]
  assert.ok(first)
  survey.entrances.records[first]![0]!.manual = false

  const result = validateData(await loadBaseData(DATA_DIR), survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "auto-data-in-survey"))
})

test("连接体混进 base 即报错", async () => {
  const base: BaseData = clone(await loadBaseData(DATA_DIR))
  base.campus.features.push({
    type: "Feature",
    id: "测试连接体",
    properties: { name: "测试连接体", kind: "building-connector" },
    geometry: { type: "Point", coordinates: [116.8, 36.5] },
  })

  const result = validateData(base, await loadSurveyData(DATA_DIR))
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "connector-in-base"))
})

test("宿舍共用门厅未写共用对象即报错", async () => {
  const survey: SurveyData = clone(await loadSurveyData(DATA_DIR))
  const first = Object.keys(survey.residence.records)[0]
  assert.ok(first)
  survey.residence.records[first] = {
    layout: "connected",
    source: "测试",
  }

  const result = validateData(await loadBaseData(DATA_DIR), survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "residence-shared-missing"))
})
