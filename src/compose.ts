/**
 * 组装：把 base（ODbL）与 survey（本仓条款）合成为可查询的数据集。
 *
 * 合成只发生在内存里，不回写成同一份文件——文件层面的分层是许可边界，
 * 见 docs/MAP.md Ⅶ。
 */
import type {
  BaseData,
  Entrance,
  Feature,
  FeatureCollection,
  LayerInfo,
  Registration,
  SurveyData,
} from "./types.ts"

export interface CampusDataset {
  registration: Registration
  features: Feature[]
  /** 参与合成的层，供产物署名与授权核对。 */
  layers: LayerInfo[]
}

function mergeEntrances(
  base: Record<string, Entrance[]>,
  survey: Record<string, Entrance[]>,
  name: string,
): Entrance[] | undefined {
  const merged = [...(base[name] ?? []), ...(survey[name] ?? [])]
  return merged.length > 0 ? merged : undefined
}

export function composeDataset(
  base: BaseData,
  survey: SurveyData,
  layers: LayerInfo[] = [],
): CampusDataset {
  const features: Feature[] = base.campus.features.map((feature) => {
    const name = feature.properties.name
    const entrances = mergeEntrances(
      base.entrances.records,
      survey.entrances.records,
      name,
    )
    const residence = survey.residence.records[name]
    const properties = { ...feature.properties }
    if (entrances) properties.entrances = entrances
    if (residence) properties.residence = residence
    return { ...feature, properties }
  })

  // 连接体属于 survey：几何由实测与示意图确认，非基础底图。
  for (const connector of survey.connectors.features) {
    const properties: Feature["properties"] = { ...connector.properties }
    const entrances = mergeEntrances(
      base.entrances.records,
      survey.entrances.records,
      connector.properties.name,
    )
    if (entrances) properties.entrances = entrances
    features.push({ ...connector, properties })
  }

  return {
    registration: base.registration,
    features,
    layers,
  }
}

export function toFeatureCollection(features: readonly Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features: [...features] }
}

export function findFeature(dataset: CampusDataset, name: string): Feature | undefined {
  return dataset.features.find((feature) => feature.properties.name === name)
}
