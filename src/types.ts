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
  /**
   * 记录时间：据 git 历史推出的「该项进入仓库」的日期。
   * 它不等于核验时间——人可以今天提交上个月的观察。`checkedAt` 才是作者的声明。
   */
  recordedAt?: string
  /** 采集者。层内不设默认作者，谁做的写谁。 */
  contributor?: string
  line: LngLat[]
}

/**
 * 结构体：共用门厅的楼栋属于同一个结构，不按栋重复记录。
 * `members` 至少一项；`connected` 时至少两项。
 */
export interface Structure {
  id: string
  members: string[]
  layout: "standalone" | "connected"
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
  /** 标注点。命名键而非数组：迁移源曾把 [纬度, 经度] 写成数组，与 GeoJSON 顺序相反。 */
  label_latlng?: LatLng
  serves_buildings?: string[]
  manual?: boolean
  position_accuracy?: "approximate"
  entrances?: Entrance[]
  structure?: Structure
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

export interface CanvasInfo {
  viewBox: string
  width: number
  height: number
  source: string
}

/** 配准：画布坐标与地理坐标的对应。变更须作为版本事件记录。 */
export interface Registration {
  schema: number
  campus: string
  center: LatLng
  overlayBounds: { southWest: LatLng; northEast: LatLng }
  canvas: CanvasInfo
  note?: string
}

/**
 * 层清单：来源、权属、贡献与许可。
 * 贡献归属（contributions）与许可（license）分开记录，互不推导——
 * 作者补写的中文楼名属其贡献，但位于 ODbL 衍生库中，许可仍是 ODbL。
 */
export interface LayerManifest {
  schema: number
  id: string
  title: string
  order?: number
  source: { kind: string; dataset?: string; note?: string }
  holder: string
  license: { id: string; file?: string; url?: string }
  constraints?: string[]
  contributions?: {
    what: string
    by: string
    recordedAt?: string
    note?: string
  }[]
  files?: string[]
}

export interface InstanceConfig {
  schema: number
  id: string
  title: string
  registration: string
  layers: string[]
  style?: string
  /** 单一强调色。换它即换掉产物里全部强调表现。 */
  accent?: string
  outputs?: string[]
  note?: string
}

/** 参与合成的层摘要，随产物一同记录署名与许可。 */
export interface LayerInfo {
  id: string
  title: string
  holder: string
  license: string
}

export interface InstanceManifest {
  schema: number
  instances: { id: string; title: string; path: string; layers: string[] }[]
  layers: { id: string; path: string; holder?: string; license?: string }[]
}

/** base 层：ODbL 来源。入口不在此层——门位线没有外部来源。 */
export interface BaseData {
  registration: Registration
  campus: FeatureCollection
}

/** survey 层：本仓条款。 */
export interface SurveyData {
  entrances: ProvenanceFile<Entrance[]>
  structures: ProvenanceFile<Structure>
  /** 作者补绘与示意的要素：OSM 未覆盖的场地、楼栋连接体。 */
  features: FeatureCollection
}

export type IssueLevel = "error" | "warning"

export interface Issue {
  level: IssueLevel
  code: string
  message: string
  /** 相关特征、记录或文件的定位。 */
  at?: string
}
