# ADR 0002 · 数据布局

- 状态：已采纳（2026-10-22）
- 决定：数据以 JSON/GeoJSON 存放并按 base / survey 分目录；`name` 作稳定标识；坐标统一 `[lng, lat]`，元数据用 `{lat, lng}` 命名键。

## Ⅰ · 为什么不是 TypeScript 字面量

迁移源是 portal-web 的 `src/data/campus-map.ts`，一个 103 KB 的 TS 字面量。它对宿主方便，对引擎有四个问题：

1. Python 生成器要读它，只能起一个 Node 子进程去 `import` 一个 TS 文件；
2. 许可边界只能靠注释表达，无法按文件区分 ODbL 与自有条款；
3. 其他语言实现无法直接消费；
4. 任何数据修订都要经过一次 TS 解析。

改为 JSON 后，生成器 `json.load` 即可，Node 依赖从管线里消失。

## Ⅱ · 分目录即分许可

| 路径 | 来源 | 条款 |
|---|---|---|
| `data/base/campus.geojson` | OSM 派生底图、建筑轮廓、道路、用地 | ODbL |
| `data/base/entrances.json` | 由轮廓与道路距离自动生成的入口候选 | ODbL（衍生） |
| `data/survey/entrances.json` | 现场核对的门位 | 本仓条款 |
| `data/survey/residence.json` | 宿舍结构与共用门厅 | 本仓条款 |
| `data/survey/connectors.geojson` | 连接体轮廓（示意） | 本仓条款 |

判据是**来源**，不是数据长什么样。自动生成的入口即使出现在建筑上，也随底图属 ODbL；人工核对的门位才是自有资产。

不确定时默认进 `base`：把 OSM 派生数据主张为自有会违反 ODbL，把自有数据放进 ODbL 只是少赚，两者代价不对称。

## Ⅲ · 标识与坐标

- **标识**：`name` 作为特征 id。59 个特征名无重复；用名称而非序号，新增建筑不会导致既有引用漂移。
- **坐标**：GeoJSON 一律 `[lng, lat]`；元数据里的中心与范围改为 `{lat, lng}` 命名键，避免「数组第 0 位是纬度还是经度」这类经典错误。迁移时把原来的 `[lat, lng]` 数组转成了命名键。

## Ⅳ · 拆分是可验证的

拆分不是「感觉分对了」：迁移脚本同时留下原始快照 `test/fixtures/campus-source.json`，`test/compose.test.ts` 把 base + survey 重新组装后与原快照逐特征比对——几何、基础属性、入口集合、宿舍结构全部相等。

这条测试的意义是：数据分层的正确性有机器判据，不靠人复查 59 个特征。

## Ⅴ · 待人工确认

以下无法由程序判定，已列入待办：

1. 16 条 survey 入口的逐条核验日期（目前只有文件级时间范围）。
2. 184 条 base 入口中，是否存在人工核对却被标成 `manual: false` 的项——若有，应移入 survey。
3. `survey/residence.json` 的来源字符串保留了原文（如「用户说明及卫星图，2026-10-21」），尚未拆成 `source` + `checkedAt` 两栏。

## Ⅵ · 产物

`data/render/` 预留给生成的 SVG 分档。生成器迁入前，产物仍由 portal-web 的 `tools/campus-map/` 产出；接回时一次性切换，避免同一份图存在两个产出源。
