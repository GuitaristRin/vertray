/**
 * 构建入口：资产 + 实例 → 实例产物。
 *
 * 用法（Windows / 任意平台）：
 *   node tools/build/cli.ts --assets ../vertray-assets --instance qlu-changqing
 *   node tools/build/cli.ts --assets ../vertray-assets --instance qlu-changqing --preview
 *
 * 产物写入 dist/<instance>/：model-<tier>.json、map-<tier>.svg、attribution.txt、bundle.json
 * 校验不通过时直接失败，不产出半套图。
 */
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { composeDataset } from "../../src/compose.ts"
import { loadInstance } from "../../src/io-node.ts"
import { buildRenderModel, TIERS, type RenderTier } from "../../src/render/model.ts"
import { renderSvg } from "../../src/render/svg.ts"
import { validateData } from "../../src/validate.ts"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

interface Args {
  assets: string
  instance: string
  out: string
  tiers: RenderTier["id"][]
  preview: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback?: string): string => {
    const index = argv.indexOf(`--${name}`)
    const value = index >= 0 ? argv[index + 1] : undefined
    if (value === undefined || value.startsWith("--")) {
      if (fallback === undefined) throw new Error(`缺少参数 --${name}`)
      return fallback
    }
    return value
  }

  const tierArg = get("tiers", "overview,z17,close")
  const tiers = tierArg.split(",").map((item) => item.trim()) as RenderTier["id"][]
  for (const tier of tiers) {
    if (!(tier in TIERS)) throw new Error(`未知档位：${tier}`)
  }

  return {
    assets: resolve(get("assets", join(ROOT, "..", "vertray-assets"))),
    instance: get("instance", "qlu-changqing"),
    out: resolve(get("out", join(ROOT, "dist"))),
    tiers,
    preview: argv.includes("--preview"),
  }
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const started = Date.now()

  const loaded = await loadInstance(args.assets, args.instance)
  const dataset = composeDataset(
    loaded.base,
    loaded.survey,
    loaded.layers.map((layer) => layer.info),
  )

  const validation = validateData(loaded.base, loaded.survey)
  const errors = validation.issues.filter((issue) => issue.level === "error")
  const warnings = validation.issues.filter((issue) => issue.level === "warning")
  if (!validation.ok) {
    for (const issue of errors) console.error(`  错误 ${issue.code}：${issue.message}`)
    throw new Error(`校验未通过（${errors.length} 项错误），不产出实例`)
  }

  const outDir = join(args.out, args.instance)
  await mkdir(outDir, { recursive: true })

  const bundle: Record<string, unknown> = {
    instance: args.instance,
    title: loaded.instance.title,
    registration: loaded.registration,
    layers: dataset.layers,
    tiers: [],
  }

  const rendered: { tier: RenderTier["id"]; svg: string }[] = []

  for (const tierId of args.tiers) {
    const model = buildRenderModel(dataset, TIERS[tierId])
    const svg = renderSvg(model)

    await writeFile(join(outDir, `model-${tierId}.json`), `${JSON.stringify(model, null, 2)}\n`, "utf8")
    await writeFile(join(outDir, `map-${tierId}.svg`), svg, "utf8")

    rendered.push({ tier: tierId, svg })
    ;(bundle.tiers as unknown[]).push({
      id: tierId,
      model: `model-${tierId}.json`,
      svg: `map-${tierId}.svg`,
      sha256: sha256(svg).slice(0, 16),
      stats: model.stats,
    })
  }

  await writeFile(
    join(outDir, "attribution.txt"),
    ["地图数据 © OpenStreetMap contributors，依 ODbL 1.0 使用。", "实地门位与楼栋结构由 Takahashi_Rinta 采集。", ""].join("\n"),
    "utf8",
  )

  const bundleText = `${JSON.stringify(bundle, null, 2)}\n`
  await writeFile(join(outDir, "bundle.json"), bundleText, "utf8")

  if (args.preview) {
    await writeFile(join(outDir, "preview.html"), previewHtml(args.instance, rendered, warnings.length), "utf8")
  }

  const totalEntrances = rendered.length > 0 ? buildRenderModel(dataset, TIERS.close).stats.doors : 0
  console.log(JSON.stringify({
    instance: args.instance,
    output: outDir,
    features: dataset.features.length,
    entrances: totalEntrances,
    tiers: rendered.map((item) => item.tier),
    errors: 0,
    warnings: warnings.length,
    bundleSha256: sha256(bundleText).slice(0, 16),
    milliseconds: Date.now() - started,
  }, null, 2))
}

function previewHtml(
  instance: string,
  rendered: { tier: string; svg: string }[],
  warningCount: number,
): string {
  const sections = rendered
    .map(
      ({ tier, svg }) => `<section>
  <h2>${tier}</h2>
  <div class="frame">${svg}</div>
</section>`,
    )
    .join("\n")

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${instance} · 预览</title>
<style>
body{margin:0;padding:24px;background:#0b1220;color:#e2e8f0;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}
h1{font-size:18px;margin:0 0 4px}
p.meta{color:#94a3b8;margin:0 0 20px}
section{margin-bottom:32px}
h2{font-size:14px;color:#cbd5e1;font-weight:600;margin:0 0 8px}
.frame{background:#fff;border-radius:12px;padding:8px;max-width:720px}
.frame svg{display:block;width:100%;height:auto}
</style></head>
<body>
<h1>${instance}</h1>
<p class="meta">预览 · 警告 ${warningCount} 项 · 由 vertray 构建</p>
${sections}
</body></html>
`
}

await main()
