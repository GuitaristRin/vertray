/**
 * 渲染模型的样式词表。
 *
 * 只放语义 token，不放 SVG 属性——后端负责把 token 翻成具体属性。
 * 换主题、换后端（Compose Canvas）都只替换映射，不动模型。
 */
export type StyleToken =
  | "campus"
  | "building"
  | "building-connector"
  | "gate"
  | "pitch"
  | "entrance-verified"
  | "entrance-approximate"
  | "entrance-candidate"
  | "label-primary"
  | "label-secondary"
  | "canvas"

export interface Style {
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** 0–1，仅用于 SVG 后端；其他后端按 alpha 处理。 */
  opacity?: number
  /** 文字样式：字号（画布单位）与字重。 */
  fontSize?: number
  fontWeight?: number
}

export const DEFAULT_STYLE: Record<StyleToken, Style> = {
  canvas: { fill: "#f8faf8" },
  campus: { fill: "#eef4ef", stroke: "#c8d6cc", strokeWidth: 2 },
  building: { fill: "#e4e9ee", stroke: "#9aa8b6", strokeWidth: 1 },
  "building-connector": { fill: "#fde68a", stroke: "#d97706", strokeWidth: 1, opacity: 0.9 },
  gate: { fill: "#0f9b6c", stroke: "#0b7a54", strokeWidth: 1 },
  pitch: { fill: "#dbeafe", stroke: "#93c5fd", strokeWidth: 1 },
  "entrance-verified": { fill: "#047857", stroke: "#ffffff", strokeWidth: 1 },
  "entrance-approximate": { fill: "#b45309", stroke: "#ffffff", strokeWidth: 1 },
  "entrance-candidate": { fill: "#94a3b8", stroke: "#ffffff", strokeWidth: 0.5, opacity: 0.7 },
  "label-primary": { fill: "#1e293b", fontSize: 22, fontWeight: 600 },
  "label-secondary": { fill: "#475569", fontSize: 15, fontWeight: 400 },
}
