/**
 * 样式：Kanesumi Design 在底图上的落地。
 *
 * 三条约束决定这张图长什么样（见 docs/MAP_STYLE.md）：
 * 1. 中性分层 + 单一强调色。一屏只有一种强调，换 accent 即换掉全部强调。
 * 2. 纯色、无渐变、无阴影，深度靠明暗不靠投影。
 * 3. 直角。没有圆角，也没有圆点——点标记一律是方。
 *
 * 参考：Win10 时代地图的中性底与发丝线（land / building / open 三段中性阶梯），
 * 但取值是按观感重定的，不是微软原始色值。
 */
export type StyleToken =
  | "canvas"
  | "land"
  | "building"
  | "open"
  | "link"
  | "gate"
  | "entrance-verified"
  | "entrance-approximate"
  | "entrance-candidate"
  | "label-primary"
  | "label-secondary"

export interface Style {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  fontSize?: number
  fontWeight?: number
  letterSpacing?: number
  /** 文字描边（光晕）：让标注在色块上仍可读，不是阴影。 */
  halo?: string
}

/** 中性阶梯：只有明暗，没有色相。 */
export const NEUTRAL = {
  outside: "#EFEFEF",
  land: "#F8F8F8",
  open: "#F1F1F1",
  building: "#E3E3E3",
  buildingStroke: "#D6D6D6",
  link: "#DDDDDD",
  linkStroke: "#CDCDCD",
  gate: "#3A3A3A",
  ink: "#161616",
  inkMuted: "#666666",
  hairline: "#D9D9D9",
} as const

/** Kanesumi 默认强调色（UWP Windows blue）。实例可覆盖。 */
export const DEFAULT_ACCENT = "#009ADC"

export function styleFor(token: StyleToken, accent: string): Style {
  switch (token) {
    case "canvas":
      return { fill: NEUTRAL.outside }
    case "land":
      return { fill: NEUTRAL.land, stroke: NEUTRAL.hairline, strokeWidth: 1 }
    case "building":
      return { fill: NEUTRAL.building, stroke: NEUTRAL.buildingStroke, strokeWidth: 1 }
    case "open":
      return { fill: NEUTRAL.open, stroke: NEUTRAL.hairline, strokeWidth: 1 }
    case "link":
      return { fill: NEUTRAL.link, stroke: NEUTRAL.linkStroke, strokeWidth: 1 }
    case "gate":
      return { fill: NEUTRAL.gate }
    // 可信度不靠换色区分，靠填充方式：实心 = 已核对，空心 = 近似，灰 = 未核。
    case "entrance-verified":
      return { fill: accent, stroke: NEUTRAL.land, strokeWidth: 1 }
    case "entrance-approximate":
      return { fill: NEUTRAL.land, stroke: accent, strokeWidth: 1.5 }
    case "entrance-candidate":
      return { fill: "#B4B4B4", stroke: NEUTRAL.land, strokeWidth: 0.5, opacity: 0.85 }
    case "label-primary":
      return {
        fill: NEUTRAL.ink,
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 1,
        halo: NEUTRAL.land,
      }
    case "label-secondary":
      return {
        fill: NEUTRAL.inkMuted,
        fontSize: 17,
        fontWeight: 400,
        letterSpacing: 0.5,
        halo: NEUTRAL.land,
      }
  }
}

/** 点标记的边长（画布单位）。直角方块，不设圆角。 */
export function markerSize(token: StyleToken): number {
  switch (token) {
    case "gate":
      return 14
    case "entrance-verified":
      return 7
    case "entrance-approximate":
      return 7
    default:
      return 5
  }
}
