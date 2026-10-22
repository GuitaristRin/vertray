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
 * 只做能机械判定的事；「这条门是不是真的在这个位置」不在自动校验范围内。
 */
export function validateData(base: BaseData, survey: SurveyData): ValidationResult {
  const issues: Issue[] = []

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
        error(
          "connector-in-base",
          `连接体属于 survey，不应出现在 base：${name}`,
          name,
        ),
      )
    }
  }

  // base 入口：自动生成，manual 必须为 false；否则说明分层被破坏。
  for (const [name, entrances] of Object.entries(base.entrances.records)) {
    if (!names.has(name)) {
      issues.push(error("base-entrance-orphan", `base 入口引用了不存在的特征：${name}`, name))
    }
    for (const [index, entrance] of entrances.entries()) {
      const at = `${name}#${index}`
      if (entrance.manual) {
        issues.push(
          error("survey-data-in-base", `base 入口标记为 manual，应移入 survey：${at}`, at),
        )
      }
      if (!entrancePoint(entrance)) {
        issues.push(error("entrance-line-short", `入口线段不足两点：${at}`, at))
      }
    }
  }

  // survey 入口：必须为人工核对，且必须引用存在的特征。
  for (const [name, entrances] of Object.entries(survey.entrances.records)) {
    if (!names.has(name) && !survey.connectors.features.some((f) => f.properties.name === name)) {
      issues.push(error("survey-entrance-orphan", `survey 入口引用了不存在的特征：${name}`, name))
    }
    for (const [index, entrance] of entrances.entries()) {
      const at = `${name}#${index}`
      if (!entrance.manual) {
        issues.push(
          error("auto-data-in-survey", `survey 入口未标记为 manual：${at}`, at),
        )
      }
      if (!entrancePoint(entrance)) {
        issues.push(error("entrance-line-short", `入口线段不足两点：${at}`, at))
      }
      if (entranceStatus(entrance) === "candidate") {
        issues.push(
          warning("survey-entrance-unverified", `survey 入口可信度为 candidate：${at}`, at),
        )
      }
    }
  }

  for (const [name, structure] of Object.entries(survey.residence.records)) {
    if (!names.has(name)) {
      issues.push(error("residence-orphan", `宿舍结构引用了不存在的特征：${name}`, name))
    }
    if (!structure.source) {
      issues.push(warning("residence-source-missing", `宿舍结构缺少来源：${name}`, name))
    }
    if (structure.layout === "connected" && !structure.shared_with) {
      issues.push(
        error("residence-shared-missing", `共用门厅未写明共用对象：${name}`, name),
      )
    }
  }

  for (const connector of survey.connectors.features) {
    if (connector.properties.kind !== "building-connector") {
      issues.push(
        error(
          "connector-kind-wrong",
          `连接体的 kind 应为 building-connector：${connector.properties.name}`,
          connector.properties.name,
        ),
      )
    }
    if ((connector.properties.serves_buildings ?? []).length === 0) {
      issues.push(
        warning(
          "connector-serves-missing",
          `连接体未写明所服务的楼栋：${connector.properties.name}`,
          connector.properties.name,
        ),
      )
    }
  }

  const hasError = issues.some((issue) => issue.level === "error")
  return { ok: !hasError, issues }
}
