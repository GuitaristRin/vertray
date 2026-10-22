/**
 * SVG 后端：把渲染模型写成独立的 SVG 文档。
 *
 * 这是一个后端，不是核心。换后端（Compose Canvas、Canvas2D）只替换本文件。
 *
 * 视觉约束：纯色、无渐变、无滤镜、无阴影；门线用双描边加圆头端帽，
 * 近似门位用虚线区分——与既有实现一致。
 */
import type { RenderModel, RenderShape } from "./model.ts"
import type { BasePath } from "../types.ts"
import { MARGINAL, PALETTE, paintFor } from "./style.ts"

const ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&apos;",
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => ESCAPES[char] ?? char)

const paintAttrs = (paint: { fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }) => {
  const parts: string[] = []
  if (paint.fill !== undefined) parts.push(`fill="${paint.fill}"`)
  if (paint.stroke) parts.push(`stroke="${paint.stroke}"`)
  if (paint.strokeWidth !== undefined) parts.push(`stroke-width="${paint.strokeWidth}"`)
  if (paint.opacity !== undefined) parts.push(`opacity="${paint.opacity}"`)
  return parts.join(" ")
}

function polyline(points: readonly [number, number][], close: boolean): string {
  if (points.length === 0) return ""
  const [first, ...rest] = points
  const start = `M ${first![0]} ${first![1]}`
  const body = rest.map((point) => `L ${point[0]} ${point[1]}`).join(" ")
  return close ? `${start} ${body} Z`.replace(/\s+/g, " ") : `${start} ${body}`.replace(/\s+/g, " ")
}

function shapeToSvg(shape: RenderShape): string {
  if (shape.kind === "polygon") {
    const paint = paintFor(shape.token)
    return `    <path id="${escapeXml(shape.id)}" d="${polyline(shape.points, true)}" ${paintAttrs(paint)} />`
  }

  if (shape.kind === "circle") {
    const paint = paintFor(shape.token)
    return `    <circle id="${escapeXml(shape.id)}" cx="${shape.at[0]}" cy="${shape.at[1]}" r="${shape.radius}" ${paintAttrs(paint)} />`
  }

  if (shape.kind === "line") {
    const paint = paintFor(shape.token)
    const d = polyline(shape.points, false)
    const dash = shape.dash ? ` stroke-dasharray="${shape.dash}"` : ""
    const casing =
      shape.casing && shape.casingWidth
        ? `    <path d="${d}" fill="none" stroke="${shape.casing}" stroke-width="${shape.casingWidth}" stroke-linecap="round" />\n`
        : ""
    return `${casing}    <path id="${escapeXml(shape.id)}" d="${d}" ${paintAttrs(paint)} stroke-linecap="round"${dash} />`
  }

  if (shape.kind === "rect") {
    const paint = paintFor(shape.token)
    const { center, width, height, rx, rotation } = shape
    const transform = `translate(${center[0]} ${center[1]}) rotate(${rotation})`
    return `    <rect id="${escapeXml(shape.id)}" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${rx}" transform="${transform}" ${paintAttrs(paint)} />`
  }

  const { style } = shape
  const lines = shape.text.split("\n")
  const lineHeight = style.size * 1.15
  const startY = shape.at[1] - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${shape.at[0]}" y="${(startY + index * lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`,
    )
    .join("")

  return `    <text id="${escapeXml(shape.id)}" text-anchor="middle" font-size="${style.size}" font-weight="${style.weight}" fill="${style.color}" stroke="${PALETTE.label.halo}" stroke-width="3" paint-order="stroke fill" stroke-linejoin="round">${tspans}</text>`
}

/** 底图原始路径：坐标沿用底图自身的局部米制系，由外层 g 的 transform 变换。 */
function basePathToSvg(path: BasePath, index: number): string {
  const fill = path.fill ?? "none"
  const stroke = path.stroke ? ` stroke="${path.stroke}"` : ""
  const width = path.strokeWidth !== undefined ? ` stroke-width="${path.strokeWidth}"` : ""
  return `      <path id="base-${index}" d="${path.d}" fill="${fill}"${stroke}${width} />`
}

/** 校外背景：整幅先铺底色，再按 evenodd 挖掉校园，只留校外。 */
function renderSurroundings(model: RenderModel): string {
  if (!model.surroundings) return ""
  const { transform, clip, groups } = model.surroundings

  const body = groups
    .filter((group) => group.paths.length > 0)
    .map((group) => {
      const paths = group.paths.map(basePathToSvg).join("\n")
      return `    <g id="surroundings-${escapeXml(group.id)}">\n${paths}\n    </g>`
    })
    .join("\n")

  return [
    `  <defs>`,
    `    <clipPath id="surroundings-clip" clipPathUnits="userSpaceOnUse">`,
    `      <path d="${clip.frame} ${clip.campusPathD}" clip-rule="${clip.rule}" fill-rule="${clip.rule}" />`,
    `    </clipPath>`,
    `  </defs>`,
    `  <g id="surroundings" transform="${transform}" clip-path="url(#surroundings-clip)" stroke-linejoin="round" stroke-linecap="round">`,
    body,
    `  </g>`,
  ].join("\n")
}

function renderBase(model: RenderModel): string {
  if (!model.base) return ""
  const groups = model.base.groups
    .filter((group) => group.paths.length > 0)
    .map((group) => {
      const paths = group.paths.map(basePathToSvg).join("\n")
      return `    <g id="base-${escapeXml(group.id)}">\n${paths}\n    </g>`
    })
    .join("\n")

  return `  <g id="base" transform="${model.base.transform}">\n${groups}\n  </g>`
}

/**
 * 图角信息：图题、指北针、比例尺、来源署名。
 * 位置相对视口，不写死画布坐标——裁切后仍然贴边。
 */
function renderMarginal(model: RenderModel): string {
  const { x, y, width, height } = model.viewport
  const right = x + width
  const bottom = y + height
  const bar = 100 * model.unitsPerMeter
  const compass = right - 55

  return [
    `  <g id="marginal">`,
    `    <text x="${x + 38}" y="${y + 53}" font-size="26" font-weight="650" fill="${MARGINAL.ink}">长清校区</text>`,
    `    <text x="${x + 39}" y="${y + 79}" font-size="13" fill="${MARGINAL.muted}">齐鲁工业大学 · 校园导览</text>`,
    `    <text x="${compass}" y="${y + 45}" font-size="16" font-weight="650" text-anchor="middle" fill="${MARGINAL.ink}">N</text>`,
    `    <path d="M${compass} ${y + 85} V${y + 55} M${compass - 6} ${y + 64} L${compass} ${y + 55} L${compass + 6} ${y + 64}" fill="none" stroke="${MARGINAL.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
    `    <path d="M${x + 38} ${bottom - 37} v6 h${bar.toFixed(2)} v-6 M${x + 38 + bar / 2} ${bottom - 31} v-4" fill="none" stroke="${MARGINAL.rule}" stroke-width="1.3" />`,
    `    <text x="${x + 38}" y="${bottom - 44}" font-size="11" fill="${MARGINAL.tick}">0</text>`,
    `    <text x="${x + 38 + bar}" y="${bottom - 44}" font-size="11" text-anchor="end" fill="${MARGINAL.tick}">100 米</text>`,
    `    <text x="${right - 38}" y="${bottom - 16}" font-size="9" text-anchor="end" fill="${MARGINAL.credit}">© OpenStreetMap contributors · ODbL</text>`,
    `  </g>`,
  ].join("\n")
}

export function renderSvg(model: RenderModel): string {
  const groups = model.layers
    .filter((layer) => layer.shapes.length > 0)
    .map((layer) => {
      const shapes = layer.shapes.map(shapeToSvg).filter(Boolean).join("\n")
      return `  <g id="layer-${escapeXml(layer.id)}">\n${shapes}\n  </g>`
    })
    .join("\n")

  const description = [
    `${model.instance} · ${model.tier} 档`,
    `特征 ${model.stats.features}，门线 ${model.stats.doors}，标注 ${model.stats.labels}`,
    ...model.attribution,
  ]
    .map((line) => line.replace(/[。；]+$/u, ""))
    .join("；")

  const { x, y, width, height } = model.viewport

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${model.viewBox}" width="${width}" height="${height}" role="img" aria-labelledby="map-title map-desc" font-family="'Microsoft YaHei','PingFang SC',sans-serif" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility">`,
    `  <title id="map-title">${escapeXml(`${model.instance} · 校园地图`)}</title>`,
    `  <desc id="map-desc">${escapeXml(description)}</desc>`,
    `  <rect id="canvas" x="${x}" y="${y}" width="${width}" height="${height}" fill="${PALETTE.canvas}" />`,
    renderSurroundings(model),
    renderBase(model),
    groups,
    renderMarginal(model),
    `</svg>`,
    ``,
  ]
    .filter((line) => line !== "")
    .join("\n")
}
