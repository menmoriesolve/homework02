# 技术设计

## 架构决策

Lean REST service

技术栈：Node.js 20+ / node:http / node:test / In-memory repository

## 模块

| 模块 | 路径 | 职责 |
|---|---|---|
| HTTP Interface | `src/server.js` | 解析请求、路由分发、统一 JSON 响应。 |
| Domain Service | `src/service.js` | 实现业务规则、输入校验和 CRUD 状态变更。 |
| Automated Verification | `test/service.test.js` | 覆盖创建、查询、更新、删除和错误路径。 |

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/tasks` | 查询记录列表 |
| GET | `/api/tasks/:id` | 查询单条记录 |
| POST | `/api/tasks` | 创建记录 |
| PUT | `/api/tasks/:id` | 更新记录 |
| DELETE | `/api/tasks/:id` | 删除记录 |

## 设计决策

- **使用 Node.js 内置 HTTP 模块**：避免依赖安装，评审环境可直接运行。
- **服务层与路由层分离**：业务规则可被单元测试直接覆盖，也便于替换传输协议。
- **业务错误通过类型化异常传播**：HTTP 层可以统一映射 400、404 与 409 状态码。

## 风险

- 内存仓储不适合生产环境，重启后数据丢失。
- MVP 未实现鉴权、限流和审计日志。

## 实施任务

- 定义 任务 字段与校验规则
- 实现 tasks 的 CRUD 领域服务
- 实现 REST 路由与 JSON 错误映射
- 编写端到端服务测试
