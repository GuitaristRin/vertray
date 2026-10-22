#!/usr/bin/env node
/**
 * 用 git blame 给 survey 入口补上「记录日期」。
 *
 * 注意：git 只能证明某一行何时进入仓库，不能证明人何时到过现场。
 * 因此写的是 `recordedAt`（记录时间），不是 `checkedAt`（核验时间）。
 * 两者不可互相冒充；`checkedAt` 仍需作者确认。
 *
 * 用法：
 *   node tools/migrate/backfill-recorded-at.mjs [path/to/portal-web]
 */
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const PORTAL = resolve(
  process.argv[2] ?? resolve(ROOT, "..", "qlu-campus", "portal-web"),
)
const SOURCE = resolve(PORTAL, "src", "data", "campus-map.ts")
const SURVEY = resolve(ROOT, "data", "survey", "entrances.json")

/** 解析 `git blame --line-porcelain`：末行号 → 提交日期。 */
function blameDates(file) {
  const output = execFileSync("git", ["blame", "--line-porcelain", file], {
    cwd: PORTAL,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })

  const dates = new Map()
  let authorTime = 0
  let finalLine = 0
  for (const line of output.split("\n")) {
    const header = /^[0-9a-f]{40} \d+ (\d+)(?: \d+)?$/.exec(line)
    if (header) {
      finalLine = Number(header[1])
      continue
    }
    if (line.startsWith("author-time ")) {
      authorTime = Number(line.slice("author-time ".length))
      continue
    }
    if (line.startsWith("\t")) {
      dates.set(finalLine, localDate(authorTime))
      finalLine += 1
    }
  }
  return dates
}

/** 按本机时区取日期：commit 时间与「当天做了什么」应对得上。 */
function localDate(unixSeconds) {
  const date = new Date(unixSeconds * 1000)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** 找出人工核对入口所在行及其所属建筑。 */
function entranceLines(source) {
  const lines = source.split("\n")
  const found = []
  let building = ""
  for (const [index, line] of lines.entries()) {
    const name = /name:\s*"([^"]+)"/.exec(line)
    if (name) building = name[1]
    if (!/manual:\s*true/.test(line)) continue
    const previous = lines[index - 1]?.trim() ?? ""
    // 入口对象的上一行是 is_main；场地对象的是 sport，属特征级 manual，不计入。
    if (!previous.startsWith("is_main:")) continue
    found.push({ building, line: index + 1 })
  }
  return found
}

async function main() {
  const source = await readFile(SOURCE, "utf8")
  const dates = blameDates("src/data/campus-map.ts")
  const entries = entranceLines(source)

  const survey = JSON.parse(await readFile(SURVEY, "utf8"))
  const expected = Object.values(survey.records).reduce((sum, list) => sum + list.length, 0)
  if (entries.length !== expected) {
    throw new Error(`入口数量不匹配：源码 ${entries.length}，survey ${expected}`)
  }

  const byBuilding = new Map()
  for (const entry of entries) {
    const date = dates.get(entry.line)
    if (!date) throw new Error(`第 ${entry.line} 行没有 blame 记录`)
    const list = byBuilding.get(entry.building) ?? []
    list.push(date)
    byBuilding.set(entry.building, list)
  }

  let applied = 0
  for (const [building, records] of Object.entries(survey.records)) {
    const list = byBuilding.get(building)
    if (!list) throw new Error(`survey 中的建筑在源码里找不到人工入口：${building}`)
    if (list.length !== records.length) {
      throw new Error(`${building} 的入口数量不一致：源码 ${list.length}，survey ${records.length}`)
    }
    records.forEach((record, index) => {
      record.recordedAt = list[index]
      applied += 1
    })
  }

  survey.provenance.checkedAt = "见各记录的 recordedAt（git 记录时间，非核验时间）"
  await writeFile(SURVEY, `${JSON.stringify(survey, null, 2)}\n`, "utf8")

  const histogram = {}
  for (const entry of entries) {
    const date = dates.get(entry.line)
    histogram[date] = (histogram[date] ?? 0) + 1
  }
  console.log(JSON.stringify({ applied, histogram }, null, 2))
}

await main()
