# 部署说明（1Panel）

本文档介绍如何在 1Panel 与 服务器上部署本项目的步骤，以及构建/推送镜像的操作。

仓库根目录现有用于不同部署方式的文件：
- `docker-compose.yml`：用于在服务器上直接用 `docker compose up -d --build` 构建并运行（推荐用于服务器部署）
- `1panel-stack.yml`：用于在 1Panel 中以镜像方式部署
- `scripts/build-and-push.sh`：构建并推送镜像的脚本（本地/CI）
- `scripts/deploy.sh`：在服务器上自动拉取、构建并重启服务的部署脚本
- `nginx.conf`、`resource/`、`docs/`：保留在根目录

步骤

1) 构建并推送镜像（本地或 CI）

```bash
# 替换为你自己的镜像名
./scripts/build-and-push.sh your-registry/mqtt-usb-hub:latest
```

2) 在 1Panel 中使用 `1panel-stack.yml` 部署

- 登录 1Panel 控制面板 → 容器 → 编排 → 创建编排
- 选择 **粘贴 Compose**，将 `1panel-stack.yml` 内容粘贴进去（或上传文件）
- 将 `image` 字段改成你推送的镜像名（例如 `your-registry/mqtt-usb-hub:latest`）
- 创建并启动

3) 在服务器上使用 `docker-compose.yml` 部署（直接在服务器上构建并运行）

- 登录服务器并切换到项目根目录（含 `docker-compose.yml`）：
  ```bash
  cd /path/to/your/repo
  ```
- 使用提供的部署脚本（推荐）：
  ```bash
  # 确保脚本可执行：chmod +x scripts/deploy.sh
  ./scripts/deploy.sh
  ```
- 或按手动步骤运行（适用 `docker compose`）：
  ```bash
  git pull origin main
  docker compose pull || true
  docker compose down
  docker compose up -d --build
  docker compose ps
  docker compose logs --tail=200
  ```

4) 访问与验证

- 访问主界面：`http://服务器IP:49152`（或你在 1Panel 中映射的端口）
- 健康检查：`http://服务器IP:49152/health`
- 日志查看：通过 1Panel 的日志面板或 `docker logs mqtt-usb-hub-control`

4) 可选：域名与 SSL

- 通过 1Panel 的 **网站 → 反向代理** 添加域名，目标地址填写 `http://127.0.0.1:49152`
- 在 **SSL 证书** 中申请并绑定证书

回退与注意事项

- 如果需要恢复本地 build（有源文件改动），可以从版本控制恢复 `Dockerfile` 与 `docker-compose.yml`，或将它们放回仓库。
- 删除 `docker-compose.yml` / `Dockerfile` 是为了简化根目录展示；仓库仍保留 `1panel-stack.yml` 与 `scripts/` 来支持 1Panel 部署与镜像构建。

故障排查（常见）

- 若容器无法启动：检查端口冲突与 1Panel 网络配置
- 若页面静态资源异常：确认 `nginx.conf` 与 `resource/` 已正确包含在镜像内
- 若健康检查失败：通过 1Panel 查看容器内的 `/health` 响应

联系

如需我把 `Dockerfile` / `docker-compose.yml` 放到 `deploy/` 目录而不是删除，或需要我把 `docs/1panel-deploy.md` 合并到此文件，请告诉我。

{
  "cells": [],
  "metadata": {
    "language_info": {
      "name": "python"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 2
}
