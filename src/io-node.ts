/**
 * 仅供 Node 环境（工具与测试）的读取层。
 * 浏览器端不走这里：宿主消费的是构建后的实例产物，不是资产源文件。
 *
 * 目录约定与 vertray-assets 一致：
 *   manifest.json
 *   instances/<id>/{instance.json,registration.json}
 *   layers/<nn-name>/{layer.json,...}
 */
import { readFile } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import type {
  BaseData,
  Entrance,
  FeatureCollection,
  InstanceConfig,
  InstanceManifest,
  LayerInfo,
  LayerManifest,
  ProvenanceFile,
  Registration,
  Structure,
  SurveyData,
} from "./types.ts"

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

export interface LoadedLayer {
  manifest: LayerManifest
  dir: string
  /** 供合成与署名使用的摘要。 */
  info: LayerInfo
}

export interface LoadedInstance {
  root: string
  instance: InstanceConfig
  registration: Registration
  layers: LoadedLayer[]
  base: BaseData
  survey: SurveyData
}

/**
 * 按实例读取分层资产。层文件按约定命名，缺失即视为该层不提供该数据。
 */
export async function loadInstance(root: string, instanceId: string): Promise<LoadedInstance> {
  const base = resolve(root)
  const manifest = await readJson<InstanceManifest>(join(base, "manifest.json"))
  const entry = manifest.instances.find((item) => item.id === instanceId)
  if (!entry) throw new Error(`实例不存在：${instanceId}`)

  const instanceDir = isAbsolute(entry.path) ? entry.path : join(base, entry.path)
  const instance = await readJson<InstanceConfig>(join(instanceDir, "instance.json"))
  const registration = await readJson<Registration>(
    join(instanceDir, instance.registration),
  )

  const layers: LoadedLayer[] = []
  for (const id of instance.layers) {
    const declared = manifest.layers.find((item) => item.id === id)
    if (!declared) throw new Error(`实例引用了未声明的层：${id}`)
    const dir = isAbsolute(declared.path) ? declared.path : join(base, declared.path)
    const layerManifest = await readJson<LayerManifest>(join(dir, "layer.json"))
    layers.push({
      manifest: layerManifest,
      dir,
      info: {
        id: layerManifest.id,
        title: layerManifest.title,
        holder: layerManifest.holder,
        license: layerManifest.license.id,
      },
    })
  }

  const layerDir = (id: string): string => {
    const layer = layers.find((item) => item.manifest.id === id)
    if (!layer) throw new Error(`实例缺少层：${id}`)
    return layer.dir
  }

  const osmDir = layerDir("osm")
  const surveyDir = layerDir("survey")

  return {
    root: base,
    instance,
    registration,
    layers,
    base: {
      registration,
      campus: await readJson<FeatureCollection>(join(osmDir, "campus.geojson")),
    },
    survey: {
      entrances: await readJson<ProvenanceFile<Entrance[]>>(
        join(surveyDir, "entrances.json"),
      ),
      structures: await readJson<ProvenanceFile<Structure>>(
        join(surveyDir, "structures.json"),
      ),
      features: await readJson<FeatureCollection>(join(surveyDir, "features.geojson")),
    },
  }
}
