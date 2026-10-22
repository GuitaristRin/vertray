/**
 * SVG 后端：把渲染模型写成独立的 SVG 文档。
 *
 * 这是一个后端，不是核心。换后端（Compose Canvas、Canvas2D）只替换本文件，
 * 模型与数据不动。
 */
import type { RenderModel, RenderShape } from "./model.ts"
import { DEFAULT_STYLE, type Style } from "./style.ts"

const ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&apos;",
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => ESCAPES[char] ?? char)

function attrs(style: Style): string {
  const parts: string[] = []
  if (style.fill) parts.push(`fill="${style.fill}"`)
  if (style.stroke) parts.push(`stroke="${style.stroke}"`)
  if (style.strokeWidth !== undefined) parts.push(`stroke-width="${style.strokeWidth}"`)
  if (style.opacity !== undefined) parts.push(`opacity="${style.opacity}"`)
  return parts.join(" ")
}

function pathData(points: RenderShape["points"]): string {
  if (points.length === 0) return ""
  const [first, ...rest] = points
  const start = `M ${first![0]} ${first![1]}`
  const lines = rest.map((point) => `L ${point[0]} ${point[1]}`).join(" ")
  return `${start} ${lines} Z`.replace(/\s+/g, " ")
}

function shapeToSvg(shape: RenderShape): string {
  const style = DEFAULT_STYLE[shape.style]

  if (shape.kind === "polygon") {
    return `    <path id="${escapeXml(shape.id)}" d="${pathData(shape.points)}" ${attrs(style)} />`
  }

  if (shape.kind === "point") {
    const [point] = shape.points
    if (!point) return ""
    return `    <circle id="${escapeXml(shape.id)}" cx="${point[0]}" cy="${point[1]}" r="${shape.radius ?? 3}" ${attrs(style)} />`
  }

  const [point] = shape.points
  if (!point) return ""
  const anchor = shape.anchor ?? "middle"
  const fontSize = style.fontSize ?? 14
  const fontWeight = style.fontWeight ?? 400
  const fill = style.fill ? `fill="${style.fill}"` : ""
  return `    <text id="${escapeXml(shape.id)}" x="${point[0]}" y="${point[1]}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${fontWeight}" ${fill}>${escapeXml(shape.text ?? "")}</text>`
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
    `特征 ${model.stats.features}，入口 ${model.stats.entrances}，标注 ${model.stats.labels}`,
    ...model.attribution,
  ].join("；")

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${model.viewBox}" width="${model.width}" height="${model.height}" role="img" aria-labelledby="map-title map-desc" font-family="'Microsoft YaHei','PingFang SC',sans-serif">`,
    `  <title id="map-title">${escapeXml(`${model.instance} · 校园地图`)}</title>`,
    `  <desc id="map-desc">${escapeXml(description)}</desc>`,
    `  <rect id="canvas" width="${model.width}" height="${model.height}" ${attrs(DEFAULT_STYLE.canvas)} />`,
    groups,
    `</svg>`,
    ``,
  ].join("\n")
}
