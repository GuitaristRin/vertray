# NOTICE

## 许可分层

本仓并非常规的单许可仓库。按目录分属两套条款：

| 目录 | 条款 | 全文 |
|---|---|---|
| `src/` `tools/` `docs/` `data/survey/` | PolyForm Noncommercial 1.0.0 | [LICENSE](LICENSE) |
| `data/base/` | Open Database License 1.0 | https://opendatacommons.org/licenses/odbl/1-0/ |

两者不可互换，也不可覆盖彼此。复制、分发或修改时按所在目录适用对应条款。

`test/fixtures/` 存放迁移对拍快照，内容与 `data/base`、`data/survey` 同源；其中 ODbL 派生部分仍受 ODbL 约束，不因放在测试目录而改变。

## 来源数据

`data/base/` 与生成产物中的校外背景层包含来自 **OpenStreetMap** 的数据：

> © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0.
> https://www.openstreetmap.org/copyright

ODbL 的要求不因本仓的 Noncommercial 条款而放松：

- 衍生数据库须继续以 ODbL 提供，并保留上述署名。
- 由数据库产生的图片、SVG 等产物（Produced Work）可另行授权，但须保留来源署名。
- `data/base/` 的数据不得复制进 `data/survey/` 以规避 ODbL。边界说明见 [data/README.md](data/README.md)。

## 本仓署名

代码与实测数据：

> Required Notice: Copyright (c) 2026 Takahashi_Rinta

## 第三方工具

生成与校验仅使用各宿主已具备的运行时；不引入需要注册、联网或专有授权的依赖。若后续引入第三方库，其许可与版本须记录于本节并确认与上述条款兼容。
