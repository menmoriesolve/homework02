# 一个校园失物招领服务，支持发布失物信息、浏览列表、标记已找回和删除信息

该服务由 MiniSE Workflow 自动生成，实现 业务记录 的 CRUD 闭环。

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

- `GET /api/items`: 查询记录列表
- `GET /api/items/:id`: 查询单条记录
- `POST /api/items`: 创建记录
- `PUT /api/items/:id`: 更新记录
- `DELETE /api/items/:id`: 删除记录

## 架构

Lean REST service
