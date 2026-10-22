/**
 * SVG 后端：把渲染模型写成独立的 SVG 文档。
 *
 * 这是一个后端，不是核心。换后端（Compose Canvas、Canvas2D）只替换本文件，
 * 模型与数据不动。
 *
 * Kanesumi 约束在写出层同样生效：直角（无圆角、miter 连接）、纯色、
 * 无渐变、无滤镜、无阴影；标注光晕用描边实现，不是投影。
 */
import type { RenderModel, RenderShape } from "./model.ts"
import { styleFor, type Style } from "./style.ts"

const ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&apos;",
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (char) => ESCAPES[char] ?? char)

const SHAPE_GEOMETRY = 'stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt"'

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

function shapeToSvg(shape: RenderShape, accent: string): string {
  const style = styleFor(shape.style, accent)

  if (shape.kind === "polygon") {
    return `    <path id="${escapeXml(shape.id)}" d="${pathData(shape.points)}" ${attrs(style)} ${SHAPE_GEOMETRY} />`
  }

  if (shape.kind === "marker") {
    const [point] = shape.points
    if (!point) return ""
    const size = shape.size ?? 6
    const half = size / 2
    // 直角方块：中心对齐到点位，不设圆角。
    return `    <rect id="${escapeXml(shape.id)}" x="${point[0] - half}" y="${point[1] - half}" width="${size}" height="${size}" ${attrs(style)} />`
  }

  const [point] = shape.points
  if (!point) return ""
  const anchor = shape.anchor ?? "middle"
  const fontSize = style.fontSize ?? 16
  const fontWeight = style.fontWeight ?? 400
  const spacing = style.letterSpacing ?? 0
  const halo = style.halo
    ? ` stroke="${style.halo}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="miter"`
    : ""
  const fill = style.fill ? `fill="${style.fill}"` : ""

  return `    <text id="${escapeXml(shape.id)}" x="${point[0]}" y="${point[1]}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${spacing}" ${fill}${halo}>${escapeXml(shape.text ?? "")}</text>`
}

export function renderSvg(model: RenderModel): string {
  const groups = model.layers
    .filter((layer) => layer.shapes.length > 0)
    .map((layer) => {
      const shapes = layer.shapes
        .map((shape) => shapeToSvg(shape, model.accent))
        .filter(Boolean)
        .join("\n")
      return `  <g id="layer-${escapeXml(layer.id)}">\n${shapes}\n  </g>`
    })
    .join("\n")

  const description = [
    `${model.instance} · ${model.tier} 档`,
    `特征 ${model.stats.features}，入口 ${model.stats.entrances}，标注 ${model.stats.labels}`,
    ...model.attribution,
  ]
    .map((line) => line.replace(/[。；]+$/u, ""))
    .join("；")

  const background = styleFor("canvas", model.accent)
  const { x, y, width, height } = model.viewport

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${model.viewBox}" width="${width}" height="${height}" role="img" aria-labelledby="map-title map-desc" font-family="'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility">`,
    `  <title id="map-title">${escapeXml(`${model.instance} · 校园地图`)}</title>`,
    `  <desc id="map-desc">${escapeXml(description)}</desc>`,
    `  <rect id="canvas" x="${x}" y="${y}" width="${width}" height="${height}" ${attrs(background)} />`,
    groups,
    `</svg>`,
    ``,
  ].join("\n")
}
