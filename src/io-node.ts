/**
 * 仅供 Node 环境（工具与测试）的读取层。
 * 浏览器端不走这里：宿主直接 import JSON 或由构建注入。
 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  BaseData,
  CampusMeta,
  Entrance,
  FeatureCollection,
  ProvenanceFile,
  ResidenceStructure,
  SurveyData,
} from "./types.ts"

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

export async function loadMeta(dataDir: string): Promise<CampusMeta> {
  return readJson<CampusMeta>(join(dataDir, "meta.json"))
}

export async function loadBaseData(dataDir: string): Promise<BaseData> {
  return {
    meta: await loadMeta(dataDir),
    campus: await readJson<FeatureCollection>(join(dataDir, "base", "campus.geojson")),
    entrances: await readJson<ProvenanceFile<Entrance[]>>(
      join(dataDir, "base", "entrances.json"),
    ),
  }
}

export async function loadSurveyData(dataDir: string): Promise<SurveyData> {
  return {
    entrances: await readJson<ProvenanceFile<Entrance[]>>(
      join(dataDir, "survey", "entrances.json"),
    ),
    residence: await readJson<ProvenanceFile<ResidenceStructure>>(
      join(dataDir, "survey", "residence.json"),
    ),
    connectors: await readJson<FeatureCollection>(
      join(dataDir, "survey", "connectors.geojson"),
    ),
  }
}
