# CLAUDE.md

<!-- BEGIN workbench-pointer · v1 · 勿手改本块（由 GuitaristRin/Projects 统一维护；改模板请改 templates/repo-AGENTS-block.md） -->
> **本文件只写本仓特有的规则。跨仓通用约定不在本仓重复**，唯一真源是工作台文档库：
> - Windows：`%USERPROFILE%\Documents\Projects\AGENTS.md`
> - Linux：`~/projects/AGENTS.md` → `~/projects/Arcturius/AGENTS.md`（按序取第一个存在的）
> - 远端：<https://github.com/GuitaristRin/Projects/blob/main/AGENTS.md>
>
> 动手之前先读它。**读不到就在报告里写明「工作台未读到」**，然后按本文件执行，不要猜。
> 新发现的通用规则先回流工作台（`docs/09-回流与同步.md`），本文件只留引用，不抄正文。
> 冲突优先级：用户当前明确指令 > 本仓特有规则 > 工作台通用规则。
<!-- END workbench-pointer -->

本文件是 `vertray` 仓的入口摘要。完整规则见 [AGENTS.md](AGENTS.md)，概念契约见 [docs/MAP.md](docs/MAP.md)。

## 一句话

把分层资产与实例配置组装成可核验的空间数据，生成渲染模型与 SVG 分档，并向宿主提供入口与连通查询。

## 三层

| 层 | 位置 | 内容 |
|---|---|---|
| 引擎 | 本仓 | 模型、校验、查询、渲染模型、构建器 |
| 资产 | `vertray-assets`（私有） | 分层数据、权属声明、实例配置 |
| 实例 | 构建产物 | 渲染模型与 SVG 分档，锁内容哈希 |

## 结构

| 路径 | 内容 |
|---|---|
| `src/` | 数据模型、合成、入口模型、几何、校验（纯函数，零运行时依赖） |
| `src/io-node.ts` | 仅 Node 侧的实例与资产读取，不经 `index.ts` 导出 |
| `src/render/` | 平台中立的渲染模型与 SVG 后端 |
| `tools/` | 生成入口、校验脚本、采集器 |
| `examples/toy-campus/` | 合成校区，测试与演示唯一数据源 |
| `docs/` | 正典、调用指南、回流指南、设计决策（`docs/decisions/`） |

## 改动前必须知道

1. 数据可信优先于视觉完整。缺就标待采集，不补。
2. 几何必带来源；未核验的通行条件不等于允许。
3. `00-osm`（ODbL）与 `10-survey`（自有）不可混装，判据是来源不是长相。
4. 配准变更视为版本事件，须记录影响。
5. 产物由构建器产出，不手改。
6. 本仓不放真实校园数据。

## 当前状态

v0.2：引擎、资产、实例三层分离。资产已迁至私有仓；本仓测试全部基于 `examples/toy-campus` 的合成数据，`pnpm test`（22 项）与 `pnpm typecheck` 通过。

未迁入：SVG 生成管线（仍在 `portal-web`）、采集器、宿主接回。
