/**
 * 样式：直接沿用 refine_svg.py 的配色与标注意图，不做重新设计。
 *
 * 这里记录的是既有产品的视觉事实：
 * - 建筑按楼型分色（宿舍/食堂/图书馆/医院/教学/其他），不是单一强调色。
 *   分类填色是制图编码，不是 UI 的 accent——两者的约束不同。
 * - 圆形点标记是允许的；Kanesumi 排斥的是圆角矩形（卡片化控件），
 *   跑道的内缩圆角图元属于几何形状，不在此列。
 * - 无渐变、无阴影、无滤镜。
 */
export type BuildingKind = "residence" | "canteen" | "library" | "health" | "academic" | "other"

export type StyleToken =
  | "campus"
  | `building:${BuildingKind}`
  | "pitch:track"
  | "pitch:field"
  | "track-mark"
  | "track-inner"
  | "field-inset"
  | "gate"
  | "door"
  | "door-approximate"

export interface Paint {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
}

export const PALETTE = {
  canvas: "#f8faf8",
  campus: { fill: "#f0f3ed", stroke: "#d1dcd0", strokeWidth: 1.3 },
  pitch: {
    track: { fill: "#e5c7af", stroke: "#bb977d", strokeWidth: 1 },
    field: { fill: "#c5ddca", stroke: "#9bbda5", strokeWidth: 1 },
  },
  gate: { fill: "#24836b", stroke: "#ffffff", radius: 5.5 },
  door: { casing: "#fffdf7", casingWidth: 7, stroke: "#23836c", strokeWidth: 3, dash: "2 2" },
  label: {
    base: "#35483e",
    halo: "#f8faf8",
    gate: "#236e58",
    pitch: "#51705b",
    road: "#7b877d",
    building: {
      canteen: "#8c6334",
      library: "#256451",
      academic: "#374b58",
      residence: "#4e5668",
      health: "#526054",
      other: "#526054",
    },
  },
} as const

/** 建筑分色：取自既有实现，勿按审美改动。 */
export const BUILDING_COLORS: Record<BuildingKind, { fill: string; stroke: string }> = {
  residence: { fill: "#e6e8ef", stroke: "#abb3c1" },
  canteen: { fill: "#f3e5ce", stroke: "#c6ac82" },
  library: { fill: "#d7e9e1", stroke: "#8aada1" },
  health: { fill: "#efdfdf", stroke: "#c3a6a8" },
  academic: { fill: "#dfe9ed", stroke: "#a4b9c2" },
  other: { fill: "#e8e9e4", stroke: "#b7bcb2" },
}

/** 楼型判定，逐条照搬既有实现。 */
export function buildingKind(name: string): BuildingKind {
  if (/^[一二三四五六七八九十\d]+号楼$/u.test(name)) return "residence"
  if (name.includes("食堂")) return "canteen"
  if (name.includes("图书馆")) return "library"
  if (name.includes("医院") || name.includes("病房")) return "health"
  if (["教学", "学院", "实验", "训练", "实训"].some((key) => name.includes(key))) {
    return "academic"
  }
  return "other"
}

/** 标注缩写：长名压成两行，短名去掉 `#`。 */
const LABEL_NAMES: Record<string, string[]> = {
  齐鲁工业大学图书馆: ["图书馆"],
  "1#公共教学楼": ["1号公共教学楼"],
  "2#公共教学楼": ["2号公共教学楼"],
  国家重点实验室: ["国家重点", "实验室"],
  "轻工机械工程实训中心(电气楼)": ["电气楼", "工程实训中心"],
  工程训练中心: ["工程训练", "中心"],
  一号楼: ["1号楼"],
  二号楼: ["2号楼"],
  三号楼: ["3号楼"],
  四号楼: ["4号楼"],
  五号楼: ["5号楼"],
  八号楼: ["8号楼"],
  九号楼: ["9号楼"],
  十号楼: ["10号楼"],
}

export function labelLines(name: string): string[] {
  return LABEL_NAMES[name] ?? [name.replace(/#/gu, "号")]
}

export interface LabelStyle {
  color: string
  size: number
  weight: number
}

/** 建筑标注：字号与字重按楼型与档位，取自既有实现。 */
export function buildingLabel(name: string, overview: boolean): LabelStyle {
  const kind = buildingKind(name)
  const color = PALETTE.label.building[kind]
  const weight = kind === "library" || kind === "canteen" ? 650 : 500

  let size = kind === "library" || kind === "canteen" ? (overview ? 26 : 21) : overview ? 22 : 15
  if (kind === "residence") size = 14.5
  if (name.includes("电气楼")) size = overview ? 18 : 12
  if (name === "菜鸟驿站") size = overview ? 17 : 12.5

  return { color, size, weight }
}

export function gateLabel(overview: boolean): LabelStyle {
  return { color: PALETTE.label.gate, size: overview ? 22 : 17, weight: 650 }
}

export function pitchLabel(overview: boolean): LabelStyle {
  return { color: PALETTE.label.pitch, size: overview ? 23 : 15, weight: 500 }
}

/** 场地内线：跑道三条内缩椭圆与球场内缩边界。 */
export const PITCH_MARKINGS = {
  trackMark: { stroke: "#fff8ed", strokeWidth: 0.85 },
  trackInner: { fill: "#b8d4be", stroke: "#fff8ed", strokeWidth: 0.85 },
  fieldInset: { stroke: "#eef7ee", strokeWidth: 0.8 },
} as const

/** 产物里允许出现的全部颜色。新增颜色必须先进这里，再进样式表。 */
export function paletteColors(): string[] {
  return [
    PALETTE.canvas,
    PALETTE.campus.fill,
    PALETTE.campus.stroke,
    PALETTE.pitch.track.fill,
    PALETTE.pitch.track.stroke,
    PALETTE.pitch.field.fill,
    PALETTE.pitch.field.stroke,
    PITCH_MARKINGS.trackMark.stroke,
    PITCH_MARKINGS.trackInner.fill,
    PITCH_MARKINGS.fieldInset.stroke,
    PALETTE.gate.fill,
    PALETTE.gate.stroke,
    PALETTE.door.casing,
    PALETTE.door.stroke,
    PALETTE.label.base,
    PALETTE.label.halo,
    PALETTE.label.gate,
    PALETTE.label.pitch,
    ...Object.values(BUILDING_COLORS).flatMap((color) => [color.fill, color.stroke]),
    ...Object.values(PALETTE.label.building),
  ]
}

export function paintFor(token: StyleToken): Paint {
  if (token === "campus") return PALETTE.campus
  if (token === "pitch:track") return PALETTE.pitch.track
  if (token === "pitch:field") return PALETTE.pitch.field
  // 场地内线：跑道三条内缩椭圆与球场内缩边界，取值同既有实现。
  if (token === "track-mark") return { fill: "none", stroke: "#fff8ed", strokeWidth: 0.85 }
  if (token === "track-inner") return { fill: "#b8d4be", stroke: "#fff8ed", strokeWidth: 0.85 }
  if (token === "field-inset") return { fill: "none", stroke: "#eef7ee", strokeWidth: 0.8 }
  if (token === "gate") return { fill: PALETTE.gate.fill, stroke: PALETTE.gate.stroke, strokeWidth: 2 }
  if (token === "door") return { fill: "none", stroke: PALETTE.door.stroke, strokeWidth: PALETTE.door.strokeWidth }
  if (token === "door-approximate") return { fill: "none", stroke: PALETTE.door.stroke, strokeWidth: PALETTE.door.strokeWidth }

  const kind = token.slice("building:".length) as BuildingKind
  const colors = BUILDING_COLORS[kind]
  return { fill: colors.fill, stroke: colors.stroke, strokeWidth: 1 }
}
