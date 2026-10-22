/**
 * 组装：把 00-osm（ODbL）与 10-survey（本仓条款）合成为可查询的数据集。
 *
 * 合成只发生在内存里，不回写成同一份文件——文件层面的分层是许可边界，
 * 见 docs/MAP.md Ⅶ。
 */
import type {
  BaseData,
  BaseGeometry,
  Entrance,
  Feature,
  FeatureCollection,
  LayerInfo,
  Registration,
  Structure,
  SurroundingsGeometry,
  SurveyData,
} from "./types.ts"

export interface CampusDataset {
  registration: Registration
  features: Feature[]
  /** 参与合成的层，供产物署名与授权核对。 */
  layers: LayerInfo[]
  /** 既有底图的基础几何（路网、用地、水系等），按既有层序。 */
  geometry?: BaseGeometry
  /** 校外低细节背景。 */
  surroundings?: SurroundingsGeometry
}

/** 楼栋名 → 所属结构体。共用门厅的楼栋由此指向同一条记录。 */
function indexStructures(structures: Record<string, Structure>): Map<string, Structure> {
  const index = new Map<string, Structure>()
  for (const structure of Object.values(structures)) {
    for (const member of structure.members) index.set(member, structure)
  }
  return index
}

export function composeDataset(
  base: BaseData,
  survey: SurveyData,
  layers: LayerInfo[] = [],
): CampusDataset {
  const structures = indexStructures(survey.structures.records)

  const features: Feature[] = base.campus.features.map((feature) => {
    const name = feature.properties.name
    const properties = { ...feature.properties }

    const entrances = survey.entrances.records[name]
    if (entrances && entrances.length > 0) properties.entrances = entrances

    const structure = structures.get(name)
    if (structure) properties.structure = structure

    return { ...feature, properties }
  })

  // 补绘要素属于 survey：OSM 未覆盖的场地与连接体。
  for (const feature of survey.features.features) {
    const properties: Feature["properties"] = { ...feature.properties }
    const entrances = survey.entrances.records[properties.name]
    if (entrances && entrances.length > 0) properties.entrances = entrances
    const structure = structures.get(properties.name)
    if (structure) properties.structure = structure
    features.push({ ...feature, properties })
  }

  return {
    registration: base.registration,
    features,
    layers,
    ...(base.geometry ? { geometry: base.geometry } : {}),
    ...(base.surroundings ? { surroundings: base.surroundings } : {}),
  }
}

export function toFeatureCollection(features: readonly Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features: [...features] }
}

export function findFeature(dataset: CampusDataset, name: string): Feature | undefined {
  return dataset.features.find((feature) => feature.properties.name === name)
}

/** 取某栋楼所属结构体的全部成员；未登记结构时返回自身。 */
export function structureMembers(dataset: CampusDataset, name: string): string[] {
  const feature = findFeature(dataset, name)
  return feature?.properties.structure?.members ?? [name]
}
