# 部署说明（1Panel）

本文档介绍如何在 1Panel 上部署本项目的步骤，以及构建/推送镜像的操作。根目录中的 `docker-compose.yml` 与 `Dockerfile` 已按你的选择删除，部署请使用 `1panel-stack.yml`。

- **文件位置（仓库根）**
  - `1panel-stack.yml`：用于 1Panel 编排的 Compose 文件（使用镜像，不做本地 build）
  - `scripts/build-and-push.sh`：构建并推送镜像的脚本
  - `nginx.conf`、`resource/`、`docs/`：保留在根目录

步骤

```bash
# 替换为你自己的镜像名
./scripts/build-and-push.sh your-registry/mqtt-usb-hub:latest
```

2) 在 1Panel 中使用 `1panel-stack.yml` 部署

- 登录 1Panel 控制面板 → 容器 → 编排 → 创建编排
- 选择 **粘贴 Compose**，将 `1panel-stack.yml` 内容粘贴进去（或上传文件）
- 将 `image` 字段改成你推送的镜像名（例如 `your-registry/mqtt-usb-hub:latest`）
- 创建并启动

3) 访问与验证

- 访问主界面：`http://服务器IP:8080`（或你在 1Panel 中映射的端口）
- 健康检查：`http://服务器IP:8080/health`
- 日志查看：通过 1Panel 的日志面板或 `docker logs mqtt-usb-hub-control`

4) 可选：域名与 SSL

- 通过 1Panel 的 **网站 → 反向代理** 添加域名，目标地址填写 `http://127.0.0.1:8080`
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
