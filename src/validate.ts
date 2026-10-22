/**
 * 校验：把 docs/MAP.md 的不变量写成可执行检查。
 * 校验放宽必须伴随正典修订，不能为了通过而放宽。
 */
import { entrancePoint, entranceStatus } from "./entrance.ts"
import type { BaseData, Issue, SurveyData } from "./types.ts"

export interface ValidationResult {
  ok: boolean
  issues: Issue[]
}

const error = (code: string, message: string, at?: string): Issue => ({
  level: "error",
  code,
  message,
  ...(at ? { at } : {}),
})

const warning = (code: string, message: string, at?: string): Issue => ({
  level: "warning",
  code,
  message,
  ...(at ? { at } : {}),
})

/**
 * 检查数据集的结构与分层纪律。
 * 只做能机械判定的事；「这扇门是不是真的在这个位置」不在自动校验范围内。
 */
export function validateData(base: BaseData, survey: SurveyData): ValidationResult {
  const issues: Issue[] = []

  const bounds = base.registration.overlayBounds
  const outside = (lng: number, lat: number) =>
    lng < bounds.southWest.lng - 0.02 ||
    lng > bounds.northEast.lng + 0.02 ||
    lat < bounds.southWest.lat - 0.02 ||
    lat > bounds.northEast.lat + 0.02

  const checkPoint = (name: string, lng: number, lat: number) => {
    if (outside(lng, lat)) {
      issues.push(
        error(
          "coordinate-out-of-bounds",
          `坐标落在实例范围外，可能是经纬顺序写反：${name} (${lng}, ${lat})`,
          name,
        ),
      )
    }
  }

  const checkGeometry = (name: string, geometry: BaseData["campus"]["features"][number]["geometry"]) => {
    if (geometry.type === "Polygon") {
      for (const point of geometry.coordinates[0] ?? []) checkPoint(name, point[0], point[1])
    } else {
      checkPoint(name, geometry.coordinates[0], geometry.coordinates[1])
    }
  }

  const names = new Set<string>()
  for (const feature of base.campus.features) {
    const { name, kind } = feature.properties
    if (!name) {
      issues.push(error("feature-name-missing", "特征缺少 name，无法作为稳定标识"))
      continue
    }
    if (names.has(name)) {
      issues.push(error("feature-name-duplicate", `特征名重复：${name}`, name))
    }
    names.add(name)
    if (kind === "building-connector") {
      issues.push(
        error("connector-in-base", `连接体属自绘层，不应出现在底图：${name}`, name),
      )
    }
  }

  for (const feature of survey.features.features) {
    const { name, kind } = feature.properties
    if (!name) {
      issues.push(error("feature-name-missing", "补绘要素缺少 name"))
      continue
    }
    if (names.has(name)) {
      issues.push(error("feature-name-duplicate", `特征名重复：${name}`, name))
    }
    names.add(name)
    if (kind === "building-connector" && (feature.properties.serves_buildings ?? []).length === 0) {
      issues.push(
        warning("connector-serves-missing", `连接体未写明所服务的楼栋：${name}`, name),
      )
    }
    checkGeometry(name, feature.geometry)
  }

  for (const feature of base.campus.features) {
    const name = feature.properties.name
    const label = feature.properties.label_latlng
    if (label) checkPoint(`${name} 标注点`, label.lng, label.lat)
    checkGeometry(name, feature.geometry)
  }

  for (const [name, entrances] of Object.entries(survey.entrances.records)) {
    if (!names.has(name)) {
      issues.push(error("entrance-orphan", `入口引用了不存在的特征：${name}`, name))
    }
    for (const [index, entrance] of entrances.entries()) {
      const at = `${name}#${index}`
      for (const point of entrance.line) checkPoint(at, point[0], point[1])
      if (!entrancePoint(entrance)) {
        issues.push(error("entrance-line-short", `入口线段不足两点：${at}`, at))
      }
      if (!entrance.recordedAt) {
        issues.push(warning("entrance-recorded-missing", `入口缺少 recordedAt：${at}`, at))
      }
      if (entranceStatus(entrance) === "candidate") {
        issues.push(
          warning("entrance-unverified", `入口可信度为 candidate，不参与导航结论：${at}`, at),
        )
      }
    }
  }

  const claimed = new Map<string, string>()
  for (const [id, structure] of Object.entries(survey.structures.records)) {
    const at = id
    if (structure.members.length === 0) {
      issues.push(error("structure-empty", `结构体没有成员：${at}`, at))
    }
    if (structure.layout === "connected" && structure.members.length < 2) {
      issues.push(
        error("structure-single-member", `共用门厅的结构体应至少两栋：${at}`, at),
      )
    }
    if (structure.layout === "standalone" && structure.members.length !== 1) {
      issues.push(
        error("structure-multi-member", `独栋结构体只能有一个成员：${at}`, at),
      )
    }
    if (!structure.source) {
      issues.push(warning("structure-source-missing", `结构体缺少来源：${at}`, at))
    }
    for (const member of structure.members) {
      if (!names.has(member)) {
        issues.push(error("structure-orphan", `结构体成员不存在：${member}`, member))
      }
      const previous = claimed.get(member)
      if (previous) {
        issues.push(
          error("structure-overlap", `楼栋同时属于两个结构体：${member}`, member),
        )
      }
      claimed.set(member, id)
    }
  }

  const hasError = issues.some((issue) => issue.level === "error")
  return { ok: !hasError, issues }
}
