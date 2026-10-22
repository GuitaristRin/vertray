import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { validateData } from "../src/validate.ts"
import { loadInstance } from "../src/io-node.ts"
import type { BaseData, SurveyData } from "../src/types.ts"

const ROOT = fileURLToPath(new URL("../examples/toy-campus", import.meta.url))

const clone = <T>(value: T): T => structuredClone(value)

const parts = async (): Promise<{ base: BaseData; survey: SurveyData }> => {
  const loaded = await loadInstance(ROOT, "demo")
  return { base: loaded.base, survey: loaded.survey }
}

test("示例实例通过校验", async () => {
  const { base, survey } = await parts()
  const result = validateData(base, survey)
  const errors = result.issues.filter((issue) => issue.level === "error")
  assert.deepEqual(errors, [], `不应有错误：${JSON.stringify(errors, null, 2)}`)
  assert.equal(result.ok, true)
})

test("base 中出现人工核对入口即报错", async () => {
  const { base } = await parts()
  const next = clone(base)
  next.entrances.records["示例楼 A"]![0]!.manual = true

  const result = validateData(next, (await parts()).survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "survey-data-in-base"))
})

test("survey 中出现自动入口即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.entrances.records["示例楼 A"]![0]!.manual = false

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "auto-data-in-survey"))
})

test("连接体混进 base 即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(base)
  next.campus.features.push({
    type: "Feature",
    id: "测试连接体",
    properties: { name: "测试连接体", kind: "building-connector" },
    geometry: { type: "Point", coordinates: [120, 30] },
  })

  const result = validateData(next, survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "connector-in-base"))
})

test("宿舍共用门厅未写共用对象即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.residence.records["示例楼 B"] = { layout: "connected", source: "测试" }

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "residence-shared-missing"))
})

test("入口引用不存在的建筑即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.entrances.records["不存在的楼"] = [
    { side: "north", is_main: false, manual: true, line: [[120, 30], [120.001, 30]] },
  ]

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "survey-entrance-orphan"))
})
