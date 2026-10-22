# CLAUDE.md

本文件是 `vertray` 仓的入口摘要。完整规则见 [AGENTS.md](AGENTS.md)，概念契约见 [docs/MAP.md](docs/MAP.md)。

## 一句话

把实地记录与公开来源整理成带来源与核验状态的空间数据，生成分层 SVG 产物，并向宿主提供入口与连通查询。

## 结构

| 路径 | 内容 |
|---|---|
| `src/` | 数据模型、合成、入口模型、几何、校验（纯函数，零运行时依赖） |
| `src/io-node.ts` | 仅 Node 侧的 JSON 读取，不经 `index.ts` 导出 |
| `tools/` | 生成入口、校验脚本、采集器、一次性迁移脚本 |
| `data/base/` | ODbL 来源数据（只读） |
| `data/survey/` | 实地采集数据（唯一可新增事实之处） |
| `data/render/` | 生成产物 |
| `docs/` | 正典、调用指南、回流指南、设计决策（`docs/decisions/`） |

## 改动前必须知道

1. 数据可信优先于视觉完整。缺就标待采集，不补。
2. 几何必带 `source` / `checkedAt` / `confidence` / `scope`。
3. `data/base/` 与 `data/survey/` 不可混装，前者受 ODbL 约束。
4. 配准变更视为版本事件，须记录影响。
5. 产物由生成器产出，不手改。

## 当前状态

v0.1：治理层 + 数据层 + 运行时核心。59 个特征已拆为 `data/base` 与 `data/survey`，`src/` 提供合成、入口、几何与校验；`pnpm test` 与 `pnpm typecheck` 通过。

未迁入：SVG 生成管线（仍在 `portal-web`）、采集器、宿主接回。
