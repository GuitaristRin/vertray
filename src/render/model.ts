/**
 * 渲染模型：平台中立的中间表示。
 *
 * 只描述「画什么、按什么语义着色」，不出现 SVG 专有概念。
 * 样式取自既有实现，见 src/render/style.ts 与 docs/MAP_STYLE.md。
 */
import { entrancePoint, entranceStatus } from "../entrance.ts"
import { haversineMeters } from "../geo.ts"
import type { CampusDataset } from "../compose.ts"
import type { BasePath, Feature, LngLat } from "../types.ts"
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
  | {
      kind: "rect"
      id: string
      token: StyleToken
      /** 矩形中心；旋转绕此点。 */
      center: LngLat
      width: number
      height: number
      rx: number
      /** 顺时针角度（度）。 */
      rotation: number
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
  /** 既有底图的基础几何，按既有层序先于数据层绘制。 */
  base?: { transform: string; groups: { id: string; paths: BasePath[] }[] }
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

/** 去掉与首点重合的闭合点。 */
function openRing(points: LngLat[]): LngLat[] {
  if (points.length > 1) {
    const [first] = points
    const last = points[points.length - 1]!
    if (first && first[0] === last[0] && first[1] === last[1]) return points.slice(0, -1)
  }
  return points
}

function meanPoint(points: LngLat[]): LngLat {
  const sum = points.reduce<LngLat>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

/**
 * 田径场的示意内线：以最长边为长轴，取旋转后的外接矩形。
 * 这些内缩椭圆只是识别符号，不代表实测跑道位置——与既有实现一致。
 */
function athleticFrame(points: LngLat[]): {
  center: LngLat
  rotation: number
  length: number
  breadth: number
} | null {
  const ring = openRing(points)
  if (ring.length < 3) return null

  let longest = 0
  let angle = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (distance > longest) {
      longest = distance
      angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    }
  }
  if (longest === 0) return null

  const center = meanPoint(ring)
  const radians = (-angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const rotated = ring.map(([x, y]) => {
    const dx = x - center[0]
    const dy = y - center[1]
    return [dx * cos - dy * sin, dx * sin + dy * cos] as LngLat
  })

  const xs = rotated.map(([x]) => x)
  const ys = rotated.map(([, y]) => y)
  return {
    center,
    rotation: angle,
    length: Math.max(...xs) - Math.min(...xs),
    breadth: Math.max(...ys) - Math.min(...ys),
  }
}

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

/** 视口贴合校园外框加留白，不输出登记画布里的空白带。 */function cropToContent(campus: RenderShape[], margin = 44) {
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

  const hasBase = Boolean(dataset.geometry)

  for (const feature of dataset.features) {
    const { name, kind, label_latlng } = feature.properties
    const ring = outerRing(feature)
    const canvasRing = ring.map(toCanvas)
    const labelAt = toCanvas(
      label_latlng ? [label_latlng.lng, label_latlng.lat] : centroid(ring),
    )

    if (kind === "campus" && canvasRing.length > 0 && !hasBase) {
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

      if (athletic) {
        const frame = athleticFrame(canvasRing)
        if (frame) {
          for (const inset of [8, 12, 16]) {
            pitches.push({
              kind: "rect",
              id: `${name}-mark-${inset}`,
              token: inset === 16 ? "track-inner" : "track-mark",
              center: frame.center.map(round) as LngLat,
              width: round(frame.length - inset * 2),
              height: round(frame.breadth - inset * 2),
              rx: round(Math.max(0, frame.breadth / 2 - inset)),
              rotation: round(frame.rotation),
            })
          }
        }
      } else {
        const ring = openRing(canvasRing)
        if (ring.length > 2) {
          const center = meanPoint(ring)
          pitches.push({
            kind: "polygon",
            id: `${name}-inset`,
            token: "field-inset",
            points: ring.map(
              ([x, y]) =>
                [round(center[0] + (x - center[0]) * 0.91), round(center[1] + (y - center[1]) * 0.91)] as LngLat,
            ),
          })
        }
      }
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
      // 有底图时建筑轮廓由底图绘制（含 80 个无名轮廓），数据层只负责标注。
      if (!hasBase) {
        buildings.push({
          kind: "polygon",
          id: name,
          token: `building:${kindOfBuilding}`,
          points: canvasRing,
        })
      }

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
    ...(dataset.geometry
      ? {
          base: {
            transform: dataset.geometry.transform,
            groups: dataset.geometry.groups.map((group) => ({
              id: group.id,
              paths: group.paths,
            })),
          },
        }
      : {}),
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
