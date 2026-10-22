import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset } from "../src/compose.ts"
import { loadInstance } from "../src/io-node.ts"
import { buildRenderModel, TIERS, type RenderShape } from "../src/render/model.ts"
import { createProjector } from "../src/render/project.ts"
import { renderSvg } from "../src/render/svg.ts"
import { paletteColors } from "../src/render/style.ts"
import { validateData } from "../src/validate.ts"

const ROOT = fileURLToPath(new URL("../examples/toy-campus", import.meta.url))

const dataset = async () => {
  const loaded = await loadInstance(ROOT, "demo")
  return {
    loaded,
    dataset: composeDataset(
      loaded.base,
      loaded.survey,
      loaded.layers.map((layer) => layer.info),
    ),
  }
}

/** 形状上所有可定位的点，用于边界检查。 */
function pointsOf(shape: RenderShape): [number, number][] {
  if (shape.kind === "polygon" || shape.kind === "line") return shape.points
  if (shape.kind === "circle") return [shape.at]
  if (shape.kind === "rect") return [shape.center]
  return [shape.at]
}

test("配准把西南角映射到绘图区左上", async () => {
  const { loaded } = await dataset()
  const projector = createProjector(loaded.registration)
  const { southWest, northEast } = loaded.registration.overlayBounds

  const topLeft = projector.toCanvas([southWest.lng, northEast.lat])
  const bottomRight = projector.toCanvas([northEast.lng, southWest.lat])

  assert.ok(Math.abs(topLeft[0] - projector.viewport.x) < 0.01)
  assert.ok(Math.abs(topLeft[1] - projector.viewport.y) < 0.01)
  assert.ok(Math.abs(bottomRight[0] - (projector.viewport.x + projector.viewport.width)) < 0.01)
  assert.ok(Math.abs(bottomRight[1] - (projector.viewport.y + projector.viewport.height)) < 0.01)
})

test("模型中的点都落在视口内", async () => {
  const { dataset: data } = await dataset()
  for (const tier of Object.values(TIERS)) {
    const model = buildRenderModel(data, tier)
    const { x: vx, y: vy, width: vw, height: vh } = model.viewport
    for (const layer of model.layers) {
      for (const shape of layer.shapes) {
        for (const [x, y] of pointsOf(shape)) {
          assert.ok(x >= vx && x <= vx + vw, `${tier.id}/${layer.id}/${shape.id} x=${x}`)
          assert.ok(y >= vy && y <= vy + vh, `${tier.id}/${layer.id}/${shape.id} y=${y}`)
        }
      }
    }
  }
})

test("视口按校园外框加固定留白", async () => {
  const { dataset: data } = await dataset()
  const model = buildRenderModel(data, TIERS.z17)
  const points = model.layers
    .find((layer) => layer.id === "campus")!
    .shapes.flatMap((shape) => (shape.kind === "polygon" ? shape.points : []))

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const margin = 44

  assert.ok(Math.abs(model.viewport.x - (Math.min(...xs) - margin)) < 0.01)
  assert.ok(Math.abs(model.viewport.y - (Math.min(...ys) - margin)) < 0.01)
})

test("门线只画人工核对且为主的入口", async () => {
  const { dataset: data } = await dataset()
  const doors = (tier: keyof typeof TIERS) =>
    buildRenderModel(data, TIERS[tier]).layers.find((layer) => layer.id === "doors")!.shapes.length

  assert.equal(doors("overview"), 0, "总览档不画门线")
  // 示例数据里只有「示例楼 A 南侧」是 manual 且 is_main。
  assert.equal(doors("z17"), 1)
  assert.equal(doors("close"), 1)
})

test("标注按档位筛选：总览省略宿舍与其他楼", async () => {
  const { dataset: data } = await dataset()
  const count = (tier: keyof typeof TIERS) =>
    buildRenderModel(data, TIERS[tier]).layers.find((layer) => layer.id === "labels")!.shapes.length

  assert.ok(count("overview") < count("z17"), "总览档标注应更少")
})

test("SVG 输出确定性且带署名", async () => {
  const { dataset: data } = await dataset()
  const model = buildRenderModel(data, TIERS.z17)
  const first = renderSvg(model)
  const second = renderSvg(model)

  assert.equal(first, second, "同一模型应产出相同 SVG")
  assert.match(first, new RegExp(`viewBox="${model.viewBox.replace(/\./g, "\\.")}"`))
  assert.match(first, /OpenStreetMap contributors/)
  assert.match(first, /id="layer-buildings"/)
})

test("只用调色板内的颜色，且没有渐变、滤镜与阴影", async () => {
  const { dataset: data } = await dataset()
  const svg = renderSvg(buildRenderModel(data, TIERS.close))

  const allowed = new Set(paletteColors())

  for (const match of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)) {
    assert.ok(allowed.has(match[1]!), `出现调色板外的颜色：${match[1]}`)
  }

  assert.doesNotMatch(svg, /<linearGradient|<radialGradient|<filter|<feDropShadow/, "不得使用渐变、滤镜或投影")
})

test("门线带白色描边底衬，近似门位用虚线", async () => {
  const { dataset: data } = await dataset()
  const svg = renderSvg(buildRenderModel(data, TIERS.close))

  assert.match(svg, /stroke="#fffdf7" stroke-width="7" stroke-linecap="round"/)
  assert.match(svg, /stroke="#23836c" stroke-width="3" stroke-linecap="round"/)
})

test("SVG 对标注文字做转义", async () => {
  const { dataset: data } = await dataset()
  const model = buildRenderModel(data, TIERS.z17)
  const labels = model.layers.find((layer) => layer.id === "labels")!
  const first = labels.shapes[0]!
  if (first.kind !== "label") throw new Error("labels 层应只有标注")
  first.text = "<测试&标注>"

  assert.match(renderSvg(model), /&lt;测试&amp;标注&gt;/)
})

test("经纬写反的标注点被校验拦住", async () => {
  const { loaded } = await dataset()
  const base = structuredClone(loaded.base)
  const target = base.campus.features[0]!
  target.properties.label_latlng = { lat: 120, lng: 30 }

  const result = validateData(base, loaded.survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "coordinate-out-of-bounds"))
})
