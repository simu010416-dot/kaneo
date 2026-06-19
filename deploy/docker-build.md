# Docker 本地源码构建部署

使用当前仓库源码构建 Kaneo 镜像并运行，**不修改**根目录的 `compose.yml`（官方预构建镜像方式保持不变）。

| 文件 | 用途 |
| --- | --- |
| `compose.yml` | 拉取 `ghcr.io/usekaneo/kaneo:latest` 官方镜像 |
| `compose.build.yml` | 用 `Dockerfile.kaneo` 从本地源码构建 `kaneo:local` |
| `compose.local.yml` | API / Web 分容器构建（高级调试，暴露 1337 + 5173） |

## 环境要求

- Docker 20.10+
- Docker Compose V2
- 内存 ≥ 2GB，磁盘 ≥ 10GB（首次构建会下载依赖并编译）
- Windows 建议使用 Docker Desktop + WSL2 后端

## 操作步骤

### 1. 进入项目根目录

```bash
cd /path/to/kaneoOri
```

### 2. 准备 `.env`

若尚无 `.env`，从示例复制：

```bash
cp .env.sample .env
```

至少配置以下变量：

```env
KANEO_CLIENT_URL=http://localhost:5173

POSTGRES_DB=kaneo
POSTGRES_USER=kaneo
POSTGRES_PASSWORD=你的强密码

AUTH_SECRET=用 openssl rand -hex 32 生成的值
```

说明：

- `KANEO_API_URL` **可不写**，启动时会自动设为 `KANEO_CLIENT_URL/api`
- `DATABASE_URL` **可不写**，会从 `POSTGRES_*` 自动拼接，并连接 Compose 中的 `postgres` 服务
- 生产环境务必固定 `AUTH_SECRET`；未设置时容器会临时生成随机值，**重启后会话会失效**

生成 `AUTH_SECRET` 示例：

```bash
openssl rand -hex 32
```

### 3. 构建并启动

```bash
docker compose -f compose.build.yml up -d --build
```

首次构建较慢（`pnpm install` + 编译 API 与 Web），属正常现象。

### 4. 访问应用

浏览器打开：**http://localhost:5173**

### 5. 查看状态与日志

```bash
docker compose -f compose.build.yml ps
docker compose -f compose.build.yml logs -f kaneo
```

健康检查地址：`http://localhost:5173/api/health`

### 6. 修改代码后重新部署

只重建 Kaneo 服务（数据库不动）：

```bash
docker compose -f compose.build.yml up -d --build kaneo
```

### 7. 停止服务

```bash
docker compose -f compose.build.yml down
```

数据保存在 `postgres_data` 卷中，`down` 不会删除数据。若要清空数据库：

```bash
docker compose -f compose.build.yml down -v
```

## 与官方镜像方式对照

| | 官方镜像 | 本地构建（本文） |
| --- | --- | --- |
| Compose 文件 | `compose.yml` | `compose.build.yml` |
| 启动命令 | `docker compose up -d` | `docker compose -f compose.build.yml up -d --build` |
| Kaneo 镜像 | `ghcr.io/usekaneo/kaneo:latest` | `kaneo:local`（本地构建） |
| 代码 | 官方发布版本 | 当前目录源码 |
| `.env` | 共用 | 共用 |

两种方式可共用同一份 `.env` 和 `postgres_data` 卷（项目名相同时）。

## 工作原理

### 架构

```
浏览器 :5173
    │
    ▼
┌─────────────────────────────────┐
│  kaneo 容器 (kaneo:local)        │
│  ┌─────────┐    /api/* 反代      │
│  │ nginx   │ ──────────────► API │
│  │ :5173   │      127.0.0.1:1337 │
│  └─────────┘                     │
└──────────────┬──────────────────┘
               │
               ▼
        postgres :5432
```

- 对外只暴露 **5173** 端口
- 浏览器访问 `/` 由 nginx 提供前端静态文件
- 浏览器访问 `/api/*` 由 nginx 反代到容器内 API（1337）
- 同域访问，无需额外配置 CORS

### 构建（`Dockerfile.kaneo`）

多阶段构建：

1. **api-builder** — 安装依赖，编译 `apps/api` 及 `packages/email` 等
2. **web-builder** — 编译 `apps/web` 前端为静态资源
3. **runtime** — 合并 API 产物、`drizzle` 迁移文件、前端 `dist`，安装 nginx

相关文件：

- `Dockerfile.kaneo` — 镜像定义
- `apps/web/nginx.kaneo.conf` — 合一镜像的 nginx 配置（含 `/api` 反代）
- `deploy/kaneo-entrypoint.sh` — 容器启动脚本

### 启动（`deploy/kaneo-entrypoint.sh`）

容器启动时依次：

1. 推导 `KANEO_API_URL`、`DATABASE_URL`（若未在 `.env` 中显式设置）
2. 运行 `apps/web/env.sh`，将 `KANEO_API_URL` 等注入前端 JS
3. 启动 Node API（监听 1337，启动时自动执行数据库迁移）
4. 等待 API 健康后启动 nginx（监听 5173）

## 可选配置

### 文件上传（MinIO）

任务描述/评论中的附件需要 S3 兼容存储。未配置时 Kaneo 可正常运行，但上传功能不可用。

在 `compose.build.yml` 中可增加 MinIO 服务，并在 `.env` 中配置 `S3_*`。完整示例见 [Docker Compose 文档](../apps/docs/core/installation/docker-compose.mdx)。

### 生产环境 + 域名

将 `.env` 中的 URL 改为实际域名：

```env
KANEO_CLIENT_URL=https://pm.example.com
```

在宿主机前加 Nginx / Caddy / Traefik 做 HTTPS 反代到 `5173` 即可。

### 高可用 WebSocket

多实例部署需配置 `REDIS_URL`。单机可省略。`compose.yml` 中有注释掉的 Redis 示例，可按需复制到 `compose.build.yml`。

## 常见问题

**构建失败或很慢**

- 确认磁盘空间充足、网络可访问 npm registry
- Windows 上优先使用 WSL2 内的 Docker

**端口 5173 或 5432 已被占用**

- 修改 `compose.build.yml` 中 `ports` 映射，例如 `"8080:5173"`
- 同时把 `.env` 里 `KANEO_CLIENT_URL` 改为对应端口

**与 `pnpm dev` 的区别**

- `pnpm dev`：开发模式，热更新，API 1337 + Web 5173 分开跑
- `compose.build.yml`：生产构建，改代码后需重新 `build` 镜像

**想用 API / Web 分容器调试**

使用 `compose.local.yml` 和 `.env.local`，详见仓库内该文件及 [环境配置](../ENVIRONMENT_SETUP.md)。
