/**
 * vertray 公共接口。
 *
 * 核心是纯函数，输入输出皆为普通数据：不触碰 DOM、不发请求、不读文件。
 * 这让同一份契约可以在浏览器、Node 与将来的别语言实现之间对拍。
 */
export type {
  BaseData,
  CampusMeta,
  Confidence,
  Entrance,
  EntranceStatus,
  Feature,
  FeatureCollection,
  FeatureKind,
  FeatureProperties,
  Geometry,
  Issue,
  IssueLevel,
  LatLng,
  LngLat,
  Provenance,
  ProvenanceFile,
  ResidenceStructure,
  SurveyData,
} from "./types.ts"

export {
  bboxOf,
  featureContains,
  haversineMeters,
  metersPerDegreeLng,
  midpoint,
  nearestPointOnSegment,
  ringContains,
} from "./geo.ts"

export {
  distanceToRoadAlongEntrance,
  entrancePoint,
  entranceStatus,
  nearestEntrance,
  statusRank,
  type EntranceHit,
  type NearestEntranceOptions,
} from "./entrance.ts"

export {
  composeDataset,
  findFeature,
  toFeatureCollection,
  type CampusDataset,
} from "./compose.ts"

export { validateData, type ValidationResult } from "./validate.ts"
