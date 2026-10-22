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

test("入口引用不存在的建筑即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.entrances.records["不存在的楼"] = [
    { side: "north", is_main: false, manual: true, line: [[120, 30], [120.001, 30]] },
  ]

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "entrance-orphan"))
})

test("连接体混进底图即报错", async () => {
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

test("共用门厅的结构体只有一栋即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.structures.records["示例楼 A、示例楼 B"]!.members = ["示例楼 A"]

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "structure-single-member"))
})

test("同一栋楼出现在两个结构体即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.structures.records["另一个结构"] = {
    id: "另一个结构",
    members: ["示例楼 A"],
    layout: "standalone",
    source: "测试",
  }

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "structure-overlap"))
})

test("结构体成员不存在即报错", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  next.structures.records["示例楼 A、示例楼 B"]!.members = ["示例楼 A", "幽灵楼"]

  const result = validateData(base, next)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "structure-orphan"))
})

test("入口缺少 recordedAt 记为警告而非错误", async () => {
  const { base, survey } = await parts()
  const next = clone(survey)
  delete next.entrances.records["示例楼 B"]![0]!.recordedAt

  const result = validateData(base, next)
  assert.equal(result.ok, true)
  assert.ok(result.issues.some((issue) => issue.code === "entrance-recorded-missing"))
})
