import assert from "node:assert/strict"
import { test } from "node:test"
import { buildingKind, buildingLabel, gateLabel, labelLines, pitchLabel, BUILDING_COLORS } from "../src/render/style.ts"

test("楼型判定按名称，逐条与既有实现一致", () => {
  assert.equal(buildingKind("九号楼"), "residence")
  assert.equal(buildingKind("十号楼"), "residence")
  assert.equal(buildingKind("第一食堂"), "canteen")
  assert.equal(buildingKind("齐鲁工业大学图书馆"), "library")
  assert.equal(buildingKind("校医院"), "health")
  assert.equal(buildingKind("1#公共教学楼"), "academic")
  assert.equal(buildingKind("材料科学与工程学院"), "academic")
  assert.equal(buildingKind("国家重点实验室"), "academic")
  assert.equal(buildingKind("菜鸟驿站"), "other")
})

test("各楼型颜色互不相同，且都是浅底深边", () => {
  const kinds = Object.keys(BUILDING_COLORS) as (keyof typeof BUILDING_COLORS)[]
  const fills = new Set(kinds.map((kind) => BUILDING_COLORS[kind].fill))
  assert.equal(fills.size, kinds.length, "六种楼型应有六种底色")
})

test("标注缩写：长名压行、短名去井号", () => {
  assert.deepEqual(labelLines("齐鲁工业大学图书馆"), ["图书馆"])
  assert.deepEqual(labelLines("1#公共教学楼"), ["1号公共教学楼"])
  assert.deepEqual(labelLines("国家重点实验室"), ["国家重点", "实验室"])
  assert.deepEqual(labelLines("九号楼"), ["9号楼"])
  assert.deepEqual(labelLines("菜鸟驿站"), ["菜鸟驿站"])
})

test("建筑标注按楼型与档位分字号字重", () => {
  const overview = buildingLabel("齐鲁工业大学图书馆", true)
  const normal = buildingLabel("齐鲁工业大学图书馆", false)
  assert.equal(overview.size, 26)
  assert.equal(normal.size, 21)
  assert.equal(normal.weight, 650)
  assert.equal(buildingLabel("九号楼", false).size, 14.5)
  assert.equal(buildingLabel("九号楼", false).weight, 500)
  assert.notEqual(
    buildingLabel("第一食堂", false).color,
    buildingLabel("九号楼", false).color,
    "食堂与宿舍的标注色应不同",
  )
})

test("校门与场地的标注规格", () => {
  assert.equal(gateLabel(true).size, 22)
  assert.equal(gateLabel(false).size, 17)
  assert.equal(gateLabel(false).weight, 650)
  assert.equal(pitchLabel(true).size, 23)
  assert.equal(pitchLabel(false).size, 15)
})
