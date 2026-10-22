# NOTICE

## 许可分层

本仓只有一套条款：

| 范围 | 条款 | 全文 |
|---|---|---|
| 全部（`src/` `tools/` `docs/` `examples/`） | PolyForm Noncommercial 1.0.0 | [LICENSE](LICENSE) |

真实校园数据不随本仓分发。资产仓 `vertray-assets` 内部按层分属 ODbL 与同一套 Noncommercial 条款，以该仓各层 `layer.json` 为准。

## 关于示例数据

`examples/toy-campus/` 是完全虚构的合成校区：坐标、楼名、门位均不对应任何真实地点。其 `layers/00-osm/layer.json` 标注 ODbL 仅为演示分层机制，不构成对真实 OpenStreetMap 数据的引用。

## 本仓署名

> Required Notice: Copyright (c) 2026 Takahashi_Rinta

## 第三方工具

构建与测试仅使用 Node 与 TypeScript；运行时不引入第三方依赖。若后续引入第三方库，其许可与版本须记录于本节并确认与上述条款兼容。
