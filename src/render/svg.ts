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
import { PALETTE, paintFor } from "./style.ts"

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
    renderBase(model),
    groups,
    `</svg>`,
    ``,
  ]
    .filter((line) => line !== "")
    .join("\n")
}
