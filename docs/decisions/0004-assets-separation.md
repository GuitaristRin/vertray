# ADR 0004 · 引擎、资产、实例三层分离

- 状态：已采纳并实施（2026-10-22）
- 落地：资产独立仓 `vertray-assets`（私有）；引擎公开；实例产物以 submodule 锁内容哈希消费。
- 决定：把代码与数据拆成三层——**引擎**（代码与契约）、**资产**（数据与权属）、**实例**（引擎读资产后的打包产物）。

## Ⅰ · 为什么必须拆

现在 `vertray` 里 `src/` 与 `data/` 同仓，带来三个后果：

1. **许可连坐。** 引擎是自有代码，资产里有 ODbL 派生数据；同一个仓库里两套条款只能靠目录约定，一旦有人整仓克隆再商用，条款执行要靠逐目录解释。
2. **可见性绑死。** 引擎公开有价值（可被别的学校、别的 agent 复用），资产公开等于把实地测绘成果白送。同仓只能二选一。
3. **数据成了代码的测试夹具。** 引擎的测试直接读真实校园数据，等于每次跑测试都在复制你的资产。

三层分离后，各自有独立的许可、可见性与消费者。

## Ⅱ · 三层职责

| 层 | 是什么 | 谁消费 | 许可 |
|---|---|---|---|
| 引擎 `vertray` | 数据模型、校验、查询、渲染模型、SVG 后端、构建器、schema | 资产仓的 CI、宿主构建 | 本仓条款 |
| 资产 `vertray-assets` | 分层数据、权属声明、实例配置、署名 | 引擎构建器 | 逐层：ODbL / 本仓条款 / 机构协议 |
| 实例 `qlu-changqing@x.y.z` | 渲染模型、SVG 分档、索引、attribution | portal-web、Android | 随其来源层，见 attribution |

**构建方向只有一条：** 引擎 + 资产 → 实例。实例不被手改，资产不被宿主直读。

## Ⅲ · 结构

```text
vertray/                       引擎（无真实校园数据）
  schema/                      JSON Schema —— 引擎与资产之间的契约
  src/                         纯函数核心：合成、校验、查询
  src/render/model.ts          平台中立的渲染模型
  src/render/svg/              SVG 后端（web）
  tools/build/                 读资产 → 出实例
  examples/toy-campus/         合成小数据，供测试与演示
  test/                        只依赖合成数据

vertray-assets/                资产（数据）
  manifest.json                实例清单、层列表、署名汇总
  layers/
    00-osm/                    ODbL：来源几何
      layer.json               来源、权属、劳动、约束
      campus.geojson
      entrances.json
    10-survey/                 自有：实地采集
      layer.json
      entrances.json
      residence.json
      connectors.geojson
    20-institution/            预留：学校/后勤提供，须先有协议
  instances/
    qlu-changqing/
      instance.json            用哪些层、配准、样式 profile
      registration.json        画布 ↔ 地理配准
  attribution.md               产物必须携带的署名
  LICENSE                      默认条款，逐层可覆盖
```

## Ⅳ · 资产内部的权属模型

每一层一个 `layer.json`：

```json
{
  "id": "survey",
  "title": "实地采集",
  "source": { "kind": "field-observation", "note": "现场查看与记录" },
  "holder": "Takahashi_Rinta",
  "license": { "id": "PolyForm-Noncommercial-1.0.0", "file": "../../LICENSE" },
  "constraints": [],
  "labor": [
    { "what": "门位与门向", "by": "Takahashi_Rinta", "recordedAt": "2026-10-20/2026-10-22" }
  ]
}
```

OSM 层的关键差别：

```json
{
  "id": "osm",
  "license": { "id": "ODbL-1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/" },
  "holder": "OpenStreetMap contributors",
  "constraints": ["衍生数据库须以 ODbL 提供", "产物须署名 OpenStreetMap contributors"],
  "labor": [
    { "what": "中文楼名与别名", "by": "Takahashi_Rinta", "note": "位于 ODbL 衍生库中，许可仍为 ODbL" }
  ]
}
```

**核心规则：劳动归属与许可是两件事，分别记录，不得互相推导。**

- 中文楼名是你做的劳动，但它长在 ODbL 衍生库里，许可仍是 ODbL——`labor` 记你的功劳，`license` 记能不能限制。
- 反过来，`labor` 里写了你的名字，不代表该层可以主张保留所有权利。
- 将来的合作者、学校提供的数据，各占一层，各自声明；不往 `10-survey` 里混。

记录级可选字段：`recordedAt`（已有）、`contributor`（预留）。层内不设「默认作者」，谁做的写谁。

## Ⅴ · 实例是什么

`instances/<name>/instance.json` 声明该实例的选择，不含几何：

```json
{
  "id": "qlu-changqing",
  "title": "齐鲁工业大学长清校区",
  "layers": ["osm", "survey"],
  "registration": "registration.json",
  "style": "default",
  "center": { "lat": 36.5596, "lng": 116.8047 },
  "outputs": ["svg:overview", "svg:z17", "svg:close", "model"]
}
```

同一个引擎加不同实例配置，就是不同的校园。实例版本号由内容哈希决定，宿主锁哈希而非日期。

## Ⅵ · 迁移映射

| 现在 | 去向 |
|---|---|
| `src/`、`tools/`、`docs/`、`schema`（新） | 引擎 |
| `data/base/*` | 资产 `layers/00-osm/` |
| `data/survey/*` | 资产 `layers/10-survey/` |
| `data/meta.json` 的中心与范围 | 实例 `instance.json` + `registration.json` |
| `test/fixtures/campus-source.json` | 资产仓（作为其数据对拍基准） |
| 引擎测试 | 改用 `examples/toy-campus/` 合成数据 |

## Ⅶ · 对测试的影响

引擎测试**不得**依赖真实校园数据，否则引擎仓每跑一次测试就复制一份资产。真实数据的校验由资产仓自己跑：它把引擎的 `schema/` 与 `validate` 作为依赖，验证自己的数据合规。

两层测试的分工：

- 引擎：合成数据的单元测试 + 构建器端到端。
- 资产：真实数据的 schema 校验 + 权属完整性 + 产物对拍。

## Ⅷ · 待定

1. 资产是独立仓，还是引擎仓内的 `assets/` 子目录（分仓隔离更彻底，代价是多一个仓要维护）。
2. 引擎公开、资产私有？还是两者都私有。
3. 实例产物如何被宿主消费：submodule 锁哈希 / npm 包 / 构建时复制。
