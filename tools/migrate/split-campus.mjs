#!/usr/bin/env node
/**
 * 一次性迁移：把 portal-web 的 CAMPUS_FEATURES 拆成 vertray 的 base / survey 两层。
 *
 * 分类规则（不可随意放宽）：
 * - 几何来自 OpenStreetMap 派生或由算法在其上生成 → data/base（ODbL）
 * - 由人到现场查看、核对、记录所得 → data/survey（本仓条款）
 *
 * 用法：
 *   node tools/migrate/split-campus.mjs [path/to/campus-map.ts]
 *
 * 该脚本只写 vertray，不改动 portal-web。
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..")
const DEFAULT_SOURCE = resolve(
  ROOT,
  "..",
  "qlu-campus",
  "portal-web",
  "src",
  "data",
  "campus-map.ts",
)

const SCHEMA = 1

const sha256 = (text) => createHash("sha256").update(text).digest("hex")

/** 只保留基础层字段；entrances / residence 由 survey 层重组。 */
function baseProperties(properties) {
  const { entrances, residence, ...rest } = properties
  return rest
}

function classify(features) {
  const baseFeatures = []
  const connectors = []
  const baseEntrances = {}
  const surveyEntrances = {}
  const residence = {}

  for (const feature of features) {
    const { properties, geometry } = feature
    const name = properties.name
    if (!name) throw new Error("特征缺少 name，无法作为稳定标识")

    if (properties.kind === "building-connector") {
      connectors.push({ type: "Feature", id: name, properties, geometry })
      continue
    }

    baseFeatures.push({
      type: "Feature",
      id: name,
      properties: baseProperties(properties),
      geometry,
    })

    for (const entrance of properties.entrances ?? []) {
      const bucket = entrance.manual ? surveyEntrances : baseEntrances
      ;(bucket[name] ??= []).push(entrance)
    }

    if (properties.residence) {
      const { source, ...rest } = properties.residence
      residence[name] = { ...rest, source }
    }
  }

  return { baseFeatures, connectors, baseEntrances, surveyEntrances, residence }
}

function provenance(note, scope, checkedAt) {
  return { source: "portal-web 地图模块迁移", checkedAt, scope, note }
}

async function main() {
  const source = resolve(process.argv[2] ?? DEFAULT_SOURCE)
  const raw = await readFile(source, "utf8")
  const module = await import(pathToFileURL(source).href)
  const collection = module.CAMPUS_FEATURES
  if (!collection || !Array.isArray(collection.features)) {
    throw new Error(`未能从 ${source} 读到 CAMPUS_FEATURES`)
  }

  const features = collection.features
  const split = classify(features)

  const meta = {
    schema: SCHEMA,
    campus: "齐鲁工业大学长清校区",
    center: { lat: module.CAMPUS_CENTER[0], lng: module.CAMPUS_CENTER[1] },
    overlayBounds: {
      southWest: {
        lat: module.CAMPUS_MAP_OVERLAY_BOUNDS[0][0],
        lng: module.CAMPUS_MAP_OVERLAY_BOUNDS[0][1],
      },
      northEast: {
        lat: module.CAMPUS_MAP_OVERLAY_BOUNDS[1][0],
        lng: module.CAMPUS_MAP_OVERLAY_BOUNDS[1][1],
      },
    },
    registration: {
      source: "portal-web@fddc046 的 tools/campus-map/source/map.svg（georef 元数据）",
      note: "画布坐标与地理坐标的对应由该文件给出；变更配准须作为版本事件记录。",
    },
  }

  const files = {
    "data/meta.json": meta,
    "data/base/campus.geojson": { type: "FeatureCollection", features: split.baseFeatures },
    "data/base/entrances.json": {
      schema: SCHEMA,
      provenance: provenance(
        "由建筑轮廓与道路距离自动生成的入口候选",
        "仅用于示意，不得作为路径终点",
        "2026-08-27",
      ),
      records: split.baseEntrances,
    },
    "data/survey/entrances.json": {
      schema: SCHEMA,
      provenance: provenance(
        "现场观察与用户说明",
        "门位与门向；逐条核验日期待补",
        "2026-08-27 至 2026-10-21",
      ),
      records: split.surveyEntrances,
    },
    "data/survey/residence.json": {
      schema: SCHEMA,
      provenance: provenance("用户说明与卫星截图", "宿舍楼结构与共用门厅", "2026-10-21"),
      records: split.residence,
    },
    "data/survey/connectors.geojson": {
      type: "FeatureCollection",
      features: split.connectors,
    },
  }

  for (const [relative, value] of Object.entries(files)) {
    const target = join(ROOT, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  }

  const entranceCount = (records) =>
    Object.values(records).reduce((sum, list) => sum + list.length, 0)

  const report = {
    schema: SCHEMA,
    source: { path: source, sha256: sha256(raw) },
    counts: {
      features: features.length,
      baseFeatures: split.baseFeatures.length,
      connectors: split.connectors.length,
      baseEntrances: entranceCount(split.baseEntrances),
      surveyEntrances: entranceCount(split.surveyEntrances),
      residence: Object.keys(split.residence).length,
    },
  }

  await writeFile(
    join(ROOT, "data/split-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  )

  // 保留迁移输入的原始快照，作为拆分的对拍基准与跨语言一致性夹具。
  const fixtureDir = join(ROOT, "test", "fixtures")
  await mkdir(fixtureDir, { recursive: true })
  await writeFile(
    join(fixtureDir, "campus-source.json"),
    `${JSON.stringify(
      {
        center: module.CAMPUS_CENTER,
        overlayBounds: module.CAMPUS_MAP_OVERLAY_BOUNDS,
        features,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  console.log(JSON.stringify(report.counts, null, 2))
}

await main()
