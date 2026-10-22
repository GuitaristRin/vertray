import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { composeDataset } from "../src/compose.ts"
import { loadInstance } from "../src/io-node.ts"
import { buildRenderModel, TIERS } from "../src/render/model.ts"
import { createProjector } from "../src/render/project.ts"
import { renderSvg } from "../src/render/svg.ts"
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

test("配准等比缩放，不因画布长宽比改变尺度", async () => {
  const { loaded } = await dataset()
  const projector = createProjector(loaded.registration)
  const { southWest, northEast } = loaded.registration.overlayBounds

  const width = projector.toCanvas([northEast.lng, southWest.lat])[0] - projector.toCanvas([southWest.lng, southWest.lat])[0]
  const height = projector.toCanvas([southWest.lng, southWest.lat])[1] - projector.toCanvas([southWest.lng, northEast.lat])[1]

  const geoWidth = northEast.lng - southWest.lng
  const geoHeight = northEast.lat - southWest.lat
  const anisotropy = (width / geoWidth) / (height / geoHeight)

  // 经度方向按纬度压缩过，所以比值应接近 cos(纬度)，而不是 1。
  assert.ok(anisotropy > 0.8 && anisotropy < 1.0, `各向异性 ${anisotropy}`)
})

test("模型中的点都落在画布内", async () => {
  const { dataset: data } = await dataset()
  for (const tier of Object.values(TIERS)) {
    const model = buildRenderModel(data, tier)
    for (const layer of model.layers) {
      for (const shape of layer.shapes) {
        for (const [x, y] of shape.points) {
          assert.ok(x >= 0 && x <= model.width, `${tier.id}/${layer.id}/${shape.id} x=${x}`)
          assert.ok(y >= 0 && y <= model.height, `${tier.id}/${layer.id}/${shape.id} y=${y}`)
        }
      }
    }
  }
})

test("入口按档位过滤：总览无、标准仅已核对、近景全绘", async () => {
  const { dataset: data } = await dataset()
  const count = (tier: keyof typeof TIERS) =>
    buildRenderModel(data, TIERS[tier]).layers.find((layer) => layer.id === "entrances")!.shapes.length

  assert.equal(count("overview"), 0)
  assert.equal(count("z17"), 2)
  assert.equal(count("close"), 3)
})

test("SVG 输出确定性且带署名", async () => {
  const { dataset: data } = await dataset()
  const model = buildRenderModel(data, TIERS.z17)
  const first = renderSvg(model)
  const second = renderSvg(model)

  assert.equal(first, second, "同一模型应产出相同 SVG")
  assert.match(first, /viewBox="0 0 1000 800"/)
  assert.match(first, /OpenStreetMap contributors/)
  assert.match(first, /id="layer-buildings"/)
})

test("SVG 对标注文字做转义", async () => {
  const { dataset: data } = await dataset()
  const model = buildRenderModel(data, TIERS.z17)
  const labels = model.layers.find((layer) => layer.id === "labels")!
  labels.shapes[0]!.text = "<测试&标注>"
  const svg = renderSvg(model)
  assert.match(svg, /&lt;测试&amp;标注&gt;/)
})

test("经纬写反的标注点被校验拦住", async () => {
  const { loaded, dataset: data } = await dataset()
  const base = structuredClone(loaded.base)
  const target = base.campus.features.find((feature) => feature.properties.label_latlng) ??
    base.campus.features[0]!
  target.properties.label_latlng = { lat: 120, lng: 30 }

  const result = validateData(base, loaded.survey)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === "coordinate-out-of-bounds"))
  assert.ok(data.features.length > 0)
})
