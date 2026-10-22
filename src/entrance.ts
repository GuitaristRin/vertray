/**
 * 入口模型：线段代表门所在的墙边，门位取线段中点。
 * 楼中心不是可达点，不得用它替代入口。
 */
import { haversineMeters, midpoint, nearestPointOnSegment } from "./geo.ts"
import type { Entrance, EntranceStatus, Feature, FeatureKind, LatLng, LngLat } from "./types.ts"

const RANK: Record<EntranceStatus, number> = {
  verified: 3,
  approximate: 2,
  candidate: 1,
  unknown: 0,
}

export function statusRank(status: EntranceStatus): number {
  return RANK[status]
}

/** 入口的代表点。线段不足两点时为未知，返回 null。 */
export function entrancePoint(entrance: Entrance): LngLat | null {
  if (entrance.line.length < 2) return null
  return midpoint(entrance.line)
}

/**
 * 入口可信度由数据的产生方式决定，不由「看起来准不准」决定：
 * 自动生成的候选点永远不是 verified，即便它离路很近。
 */
export function entranceStatus(entrance: Entrance): EntranceStatus {
  if (entrance.line.length < 2) return "unknown"
  if (entrance.position_accuracy === "approximate") return "approximate"
  return entrance.manual ? "verified" : "candidate"
}

export interface EntranceHit {
  feature: Feature
  entrance: Entrance
  status: EntranceStatus
  /** 入口代表点。 */
  point: LngLat
  /** 到目标的米制距离。 */
  distanceMeters: number
}

export interface NearestEntranceOptions {
  /** 最低可信度，默认 verified：未核验的门不参与导航结论。 */
  minStatus?: EntranceStatus
  /** 只在给定 kind 中查找，默认建筑与校门。 */
  kinds?: readonly FeatureKind[]
}

const DEFAULT_KINDS: readonly FeatureKind[] = ["building", "gate"]

/**
 * 最近的可达入口。默认只接受已核对的入口——这是正典 Ⅴ-5 的实现：
 * 未核验的通行条件不等于允许。
 */
export function nearestEntrance(
  features: readonly Feature[],
  target: LatLng,
  options: NearestEntranceOptions = {},
): EntranceHit | null {
  const minimum = statusRank(options.minStatus ?? "verified")
  const kinds = options.kinds ?? DEFAULT_KINDS
  const at: LngLat = [target.lng, target.lat]

  let best: EntranceHit | null = null
  for (const feature of features) {
    if (!kinds.includes(feature.properties.kind)) continue
    for (const entrance of feature.properties.entrances ?? []) {
      const status = entranceStatus(entrance)
      if (statusRank(status) < minimum) continue
      const point = entrancePoint(entrance)
      if (!point) continue
      const distanceMeters = haversineMeters(
        { lng: point[0], lat: point[1] },
        { lng: at[0], lat: at[1] },
      )
      if (!best || distanceMeters < best.distanceMeters) {
        best = { feature, entrance, status, point, distanceMeters }
      }
    }
  }
  return best
}

/** 沿某建筑外墙到道路的最近距离；用于判断入口是否贴路。 */
export function distanceToRoadAlongEntrance(entrance: Entrance, road: readonly LngLat[]): number {
  const point = entrancePoint(entrance)
  if (!point) return Number.POSITIVE_INFINITY
  let minimum = Number.POSITIVE_INFINITY
  for (let i = 1; i < road.length; i += 1) {
    const a = road[i - 1]
    const b = road[i]
    if (!a || !b) continue
    const hit = nearestPointOnSegment(point, a, b)
    if (hit.distanceMeters < minimum) minimum = hit.distanceMeters
  }
  return minimum
}
