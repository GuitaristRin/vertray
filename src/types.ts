/**
 * 数据结构。字段名沿用迁移时的原始拼写，以便与 portal-web 的既有数据对齐；
 * 统一改名须与宿主一次性同步，避免两套名字并存。
 */

export interface LatLng {
  lat: number
  lng: number
}

/** GeoJSON 坐标顺序：[经度, 纬度]。 */
export type LngLat = [number, number]

export type FeatureKind = "campus" | "gate" | "building" | "pitch" | "building-connector"

export type EntranceStatus = "verified" | "approximate" | "candidate" | "unknown"

export type Confidence = "verified" | "approximate" | "candidate" | "unknown"

/**
 * 入口：建筑轮廓边界上的一段边（`line` 为墙体线段），门位取线段中点。
 * 不用「建筑中心」代表入口——那是标注点，不是可达点。
 */
export interface Entrance {
  side: string
  is_main: boolean
  manual: boolean
  long_edge?: boolean
  dist_to_road?: number
  position_accuracy?: "approximate"
  line: LngLat[]
}

export interface ResidenceStructure {
  layout: "standalone" | "connected"
  shared_with?: string
  entrance_side?: "north" | "east" | "west"
  entrance_position?: "center" | "near-main-road" | "connector"
  source: string
  checkedAt?: string
}

export interface FeatureProperties {
  name: string
  kind: FeatureKind
  class?: string
  sport?: string
  roads?: string[]
  label_latlng?: LngLat
  serves_buildings?: string[]
  manual?: boolean
  position_accuracy?: "approximate"
  entrances?: Entrance[]
  residence?: ResidenceStructure
}

export type Geometry =
  | { type: "Point"; coordinates: LngLat }
  | { type: "Polygon"; coordinates: LngLat[][] }

export interface Feature {
  type: "Feature"
  id: string
  properties: FeatureProperties
  geometry: Geometry
}

export interface FeatureCollection {
  type: "FeatureCollection"
  features: Feature[]
}

/** 文件级来源声明。逐条来源缺失时，以文件级声明兜底并记为警告。 */
export interface Provenance {
  source: string
  checkedAt: string
  scope: string
  note?: string
}

export interface ProvenanceFile<T> {
  schema: number
  provenance: Provenance
  records: Record<string, T>
}

export interface CampusMeta {
  schema: number
  campus: string
  center: LatLng
  overlayBounds: { southWest: LatLng; northEast: LatLng }
  registration: { source: string; note: string }
}

/** base 层：ODbL 来源。 */
export interface BaseData {
  meta: CampusMeta
  campus: FeatureCollection
  entrances: ProvenanceFile<Entrance[]>
}

/** survey 层：本仓条款。 */
export interface SurveyData {
  entrances: ProvenanceFile<Entrance[]>
  residence: ProvenanceFile<ResidenceStructure>
  connectors: FeatureCollection
}

export type IssueLevel = "error" | "warning"

export interface Issue {
  level: IssueLevel
  code: string
  message: string
  /** 相关特征、记录或文件的定位。 */
  at?: string
}
