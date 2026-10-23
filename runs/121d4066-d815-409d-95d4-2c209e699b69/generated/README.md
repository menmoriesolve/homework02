# 一个任务清单服务，支持新增、查询、修改和删除任务

该服务由 MiniSE Workflow 自动生成，实现 任务 的 CRUD 闭环。

## 启动

```bash
npm start
```

默认端口为 `3100`，可通过 `PORT` 环境变量修改。

## 测试

```bash
npm test
```

## API

- `GET /api/tasks`: 查询记录列表
- `GET /api/tasks/:id`: 查询单条记录
- `POST /api/tasks`: 创建记录
- `PUT /api/tasks/:id`: 更新记录
- `DELETE /api/tasks/:id`: 删除记录

## 架构

Lean REST service
