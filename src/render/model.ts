/**
 * 渲染模型：平台中立的中间表示。
 *
 * 只描述「画什么、按什么语义着色」，不出现 SVG 专有概念。
 * 样式取自既有实现，见 src/render/style.ts 与 docs/MAP_STYLE.md。
 */
import { entrancePoint, entranceStatus } from "../entrance.ts"
import { haversineMeters } from "../geo.ts"
import type { CampusDataset } from "../compose.ts"
import type { Feature, LngLat } from "../types.ts"
import { createProjector } from "./project.ts"
import {
  buildingKind,
  buildingLabel,
  gateLabel,
  labelLines,
  PALETTE,
  pitchLabel,
  type LabelStyle,
  type StyleToken,
} from "./style.ts"

export type RenderShape =
  | { kind: "polygon"; id: string; token: StyleToken; points: LngLat[] }
  | { kind: "circle"; id: string; token: StyleToken; at: LngLat; radius: number }
  | {
      kind: "line"
      id: string
      token: StyleToken
      points: LngLat[]
      dash?: string
      casing?: string
      casingWidth?: number
    }
  | { kind: "label"; id: string; at: LngLat; text: string; style: LabelStyle }

export interface RenderLayer {
  id: string
  shapes: RenderShape[]
}

export interface RenderTier {
  id: "overview" | "z17" | "close"
  title: string
  /** 总览档用大字，并省略宿舍与「其他」楼的标注。 */
  overview: boolean
  /** 是否绘制已核对的入口门线。 */
  doors: boolean
}

export const TIERS: Record<RenderTier["id"], RenderTier> = {
  overview: { id: "overview", title: "总览", overview: true, doors: false },
  z17: { id: "z17", title: "标准", overview: false, doors: true },
  close: { id: "close", title: "近景", overview: false, doors: true },
}

export interface RenderOptions {
  /** 保留接口：本设计的强调色来自楼型分色，不接收外部 accent。 */
  accent?: string
}

export interface RenderModel {
  instance: string
  tier: RenderTier["id"]
  viewport: { x: number; y: number; width: number; height: number }
  viewBox: string
  layers: RenderLayer[]
  attribution: string[]
  stats: {
    features: number
    doors: number
    labels: number
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

/** 视口贴合校园外框加留白，不输出登记画布里的空白带。 */
function cropToContent(campus: RenderShape[], margin = 44) {
  const points = campus.flatMap((shape) => (shape.kind === "polygon" ? shape.points : []))
  if (points.length === 0) return { x: 0, y: 0, width: 1129.2, height: 1723.7 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return {
    x: round(minX - margin),
    y: round(minY - margin),
    width: round(maxX - minX + margin * 2),
    height: round(maxY - minY + margin * 2),
  }
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
  const links: RenderShape[] = []
  const gates: RenderShape[] = []
  const doors: RenderShape[] = []
  const labels: RenderShape[] = []

  let doorCount = 0

  for (const feature of dataset.features) {
    const { name, kind, label_latlng } = feature.properties
    const ring = outerRing(feature)
    const canvasRing = ring.map(toCanvas)
    const labelAt = toCanvas(
      label_latlng ? [label_latlng.lng, label_latlng.lat] : centroid(ring),
    )

    if (kind === "campus" && canvasRing.length > 0) {
      campus.push({ kind: "polygon", id: name, token: "campus", points: canvasRing })
    }

    if (kind === "pitch" && canvasRing.length > 0) {
      const athletic = ["athletics", "track_field"].includes(feature.properties.sport ?? "")
      pitches.push({
        kind: "polygon",
        id: name,
        token: athletic ? "pitch:track" : "pitch:field",
        points: canvasRing,
      })
      if (!tier.overview || name.includes("田径")) {
        const lines = tier.overview
          ? [name.split("-")[0] ?? name]
          : name.includes("老操场")
            ? [name.split("-").at(-1) ?? name]
            : name.split("-")
        labels.push({
          kind: "label",
          id: `${name}-label`,
          at: labelAt,
          text: lines.join("\n"),
          style: pitchLabel(tier.overview),
        })
      }
    }

    if (kind === "building" && canvasRing.length > 0) {
      const kindOfBuilding = buildingKind(name)
      buildings.push({
        kind: "polygon",
        id: name,
        token: `building:${kindOfBuilding}`,
        points: canvasRing,
      })

      const omittedInOverview = kindOfBuilding === "residence" || kindOfBuilding === "other"
      if (!(tier.overview && omittedInOverview)) {
        labels.push({
          kind: "label",
          id: `${name}-label`,
          at: labelAt,
          text: labelLines(name).join("\n"),
          style: buildingLabel(name, tier.overview),
        })
      }
    }

    if (kind === "building-connector" && canvasRing.length > 0) {
      links.push({ kind: "polygon", id: name, token: "building:residence", points: canvasRing })
    }

    if (kind === "gate") {
      const at =
        feature.geometry.type === "Point" ? toCanvas(feature.geometry.coordinates) : labelAt
      gates.push({ kind: "circle", id: name, token: "gate", at, radius: PALETTE.gate.radius })
      labels.push({
        kind: "label",
        id: `${name}-label`,
        at: [at[0], at[1] + 20],
        text: name,
        style: gateLabel(tier.overview),
      })
    }

    if (tier.doors) {
      for (const [index, entrance] of (feature.properties.entrances ?? []).entries()) {
        // 与既有实现一致：只绘制人工核对且为主的入口，其余由宿主叠加。
        if (!entrance.manual || !entrance.is_main) continue
        const point = entrancePoint(entrance)
        if (!point) continue
        const approximate = entranceStatus(entrance) === "approximate"
        doors.push({
          kind: "line",
          id: `${name}-door-${index}`,
          token: approximate ? "door-approximate" : "door",
          points: entrance.line.map(toCanvas),
          ...(approximate ? { dash: PALETTE.door.dash } : {}),
          casing: PALETTE.door.casing,
          casingWidth: PALETTE.door.casingWidth,
        })
        doorCount += 1
      }
    }
  }

  const { southWest, northEast } = dataset.registration.overlayBounds
  const spanMeters = haversineMeters(
    { lat: southWest.lat, lng: southWest.lng },
    { lat: northEast.lat, lng: northEast.lng },
  )

  const viewport = cropToContent(campus)

  return {
    instance: dataset.registration.campus,
    tier: tier.id,
    viewport,
    viewBox: `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    layers: [
      { id: "campus", shapes: campus },
      { id: "pitches", shapes: pitches },
      { id: "buildings", shapes: buildings },
      { id: "links", shapes: links },
      { id: "gates", shapes: gates },
      { id: "doors", shapes: doors },
      { id: "labels", shapes: labels },
    ],
    attribution: [
      "地图数据 © OpenStreetMap contributors，依 ODbL 1.0 使用。",
      "实地门位与楼栋结构由 Takahashi_Rinta 采集。",
    ],
    stats: {
      features: dataset.features.length,
      doors: doorCount,
      labels: labels.length,
      spanMeters: Math.round(spanMeters),
    },
  }
}
