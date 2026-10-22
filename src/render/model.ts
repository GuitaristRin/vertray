/**
 * 渲染模型：平台中立的中间表示。
 *
 * 只描述「画什么、按什么语义着色」，不出现 SVG 专有概念。
 * SVG、Compose Canvas 等后端各自把它翻成自己的绘制指令。
 */
import { entrancePoint, entranceStatus } from "../entrance.ts"
import { haversineMeters } from "../geo.ts"
import type { CampusDataset } from "../compose.ts"
import type { Feature, LngLat } from "../types.ts"
import { createProjector } from "./project.ts"
import type { StyleToken } from "./style.ts"

export interface RenderShape {
  kind: "polygon" | "point" | "label"
  id: string
  style: StyleToken
  /** 多边形顶点；point/label 只用第一项。 */
  points: LngLat[]
  radius?: number
  text?: string
  anchor?: "middle" | "start" | "end"
}

export interface RenderLayer {
  id: string
  shapes: RenderShape[]
}

export interface RenderTier {
  id: "overview" | "z17" | "close"
  title: string
  /** 小于该面积的建筑不标注（画布单位面积）。 */
  labelMinArea: number
  /** 是否绘制入口，以及绘制到哪一档可信度。 */
  entrances: "none" | "verified" | "all"
  showConnectors: boolean
}

export const TIERS: Record<RenderTier["id"], RenderTier> = {
  overview: {
    id: "overview",
    title: "总览",
    labelMinArea: 6000,
    entrances: "none",
    showConnectors: false,
  },
  z17: {
    id: "z17",
    title: "标准",
    labelMinArea: 1500,
    entrances: "verified",
    showConnectors: true,
  },
  close: {
    id: "close",
    title: "近景",
    labelMinArea: 0,
    entrances: "all",
    showConnectors: true,
  },
}

export interface RenderModel {
  instance: string
  tier: RenderTier["id"]
  width: number
  height: number
  viewBox: string
  layers: RenderLayer[]
  attribution: string[]
  stats: {
    features: number
    entrances: number
    labels: number
    /** 地理范围对角线长度（米），用于核对配准是否合理。 */
    spanMeters: number
  }
}

const round = (value: number) => Math.round(value * 100) / 100

function outerRing(feature: Feature): LngLat[] {
  if (feature.geometry.type !== "Polygon") return []
  return feature.geometry.coordinates[0] ?? []
}

function centroid(points: LngLat[]): LngLat {
  if (points.length === 0) return [0, 0]
  const closed = points.length > 1 && points[0]![0] === points[points.length - 1]![0]
  const body = closed ? points.slice(0, -1) : points
  const sum = body.reduce<LngLat>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / body.length, sum[1] / body.length]
}

/** 鞋带公式，返回绝对面积。 */
function polygonArea(points: LngLat[]): number {
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    total += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(total) / 2
}

export function buildRenderModel(
  dataset: CampusDataset,
  tier: RenderTier = TIERS.z17,
): RenderModel {
  const projector = createProjector(dataset.registration)
  const toCanvas = (point: LngLat): LngLat => projector.toCanvas(point).map(round) as LngLat

  const campus: RenderShape[] = []
  const pitches: RenderShape[] = []
  const buildings: RenderShape[] = []
  const connectors: RenderShape[] = []
  const gates: RenderShape[] = []
  const entrances: RenderShape[] = []
  const labels: RenderShape[] = []

  let entranceCount = 0

  for (const feature of dataset.features) {
    const { name, kind, label_latlng } = feature.properties
    const ring = outerRing(feature)
    const canvasRing = ring.map(toCanvas)
    const labelAt = toCanvas(
      label_latlng ? [label_latlng.lng, label_latlng.lat] : centroid(ring),
    )

    if (kind === "campus" || kind === "pitch" || kind === "building") {
      const target = kind === "campus" ? campus : kind === "pitch" ? pitches : buildings
      if (canvasRing.length > 0) {
        target.push({ kind: "polygon", id: name, style: kind, points: canvasRing })
      }
      const area = polygonArea(canvasRing)
      const alwaysLabelled = kind === "campus"
      if (alwaysLabelled || area >= tier.labelMinArea) {
        labels.push({
          kind: "label",
          id: name,
          style: alwaysLabelled ? "label-primary" : "label-secondary",
          points: [labelAt],
          text: name,
          anchor: "middle",
        })
      }
    }

    if (kind === "building-connector" && tier.showConnectors) {
      if (canvasRing.length > 0) {
        connectors.push({
          kind: "polygon",
          id: name,
          style: "building-connector",
          points: canvasRing,
        })
      }
    }

    if (kind === "gate") {
      const at =
        feature.geometry.type === "Point" ? toCanvas(feature.geometry.coordinates) : labelAt
      gates.push({ kind: "point", id: name, style: "gate", points: [at], radius: 6 })
      labels.push({
        kind: "label",
        id: `${name}-label`,
        style: "label-secondary",
        points: [at],
        text: name,
        anchor: "middle",
      })
    }

    for (const entrance of feature.properties.entrances ?? []) {
      const status = entranceStatus(entrance)
      if (status === "unknown") continue
      if (tier.entrances === "none") continue
      if (tier.entrances === "verified" && status !== "verified") continue
      const point = entrancePoint(entrance)
      if (!point) continue
      entrances.push({
        kind: "point",
        id: `${name}-${status}`,
        style:
          status === "verified"
            ? "entrance-verified"
            : status === "approximate"
              ? "entrance-approximate"
              : "entrance-candidate",
        points: [toCanvas(point)],
        radius: status === "verified" ? 3.2 : 2.4,
      })
      entranceCount += 1
    }
  }

  const { southWest, northEast } = dataset.registration.overlayBounds
  const spanMeters = haversineMeters(
    { lat: southWest.lat, lng: southWest.lng },
    { lat: northEast.lat, lng: northEast.lng },
  )

  return {
    instance: dataset.registration.campus,
    tier: tier.id,
    width: dataset.registration.canvas.width,
    height: dataset.registration.canvas.height,
    viewBox: dataset.registration.canvas.viewBox,
    layers: [
      { id: "campus", shapes: campus },
      { id: "pitches", shapes: pitches },
      { id: "buildings", shapes: buildings },
      { id: "connectors", shapes: connectors },
      { id: "gates", shapes: gates },
      { id: "entrances", shapes: entrances },
      { id: "labels", shapes: labels },
    ],
    attribution: [
      "地图数据 © OpenStreetMap contributors，依 ODbL 1.0 使用。",
      "实地门位与楼栋结构由 Takahashi_Rinta 采集。",
    ],
    stats: {
      features: dataset.features.length,
      entrances: entranceCount,
      labels: labels.length,
      spanMeters: Math.round(spanMeters),
    },
  }
}
