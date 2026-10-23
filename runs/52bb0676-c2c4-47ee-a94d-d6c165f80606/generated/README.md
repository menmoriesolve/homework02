# 图书管理服务，支持新增、查询、修改、删除图书

该服务由 MiniSE Workflow 自动生成，实现 图书 的 CRUD 闭环。

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

- `GET /api/books`: 查询记录列表
- `GET /api/books/:id`: 查询单条记录
- `POST /api/books`: 创建记录
- `PUT /api/books/:id`: 更新记录
- `DELETE /api/books/:id`: 删除记录

## 架构

Lean REST service
