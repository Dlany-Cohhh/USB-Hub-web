## USB Hub Web · 资源库 🎛️

**轻量的 USB-Hub 前端资源与部署示例，包含本地可直接打开的控制面板、Docker 化配置与部署脚本。**

---

- **作者**: Dylan-Cohhh
- **用途**: 局域网设备面板、本地演示、嵌入式 Web UI 原型

---

## 项目概览

本仓库不仅包含前端静态页面资源（位于 `resource/`），还提供了用于容器化与部署的示例配置与脚本，便于在嵌入式设备或轻量服务器上快速上线。

主要内容：

- `resource/`：前端静态资源（`ui_control.html`、`ui_control.css`、`ui_control.js`），可直接打开预览或通过静态服务器托管。
- `Dockerfile`：用于打包静态资源为容器镜像的示例 Dockerfile。
- `docker-compose.yml`：展示如何用 docker-compose 启动镜像（可结合 `nginx.conf` 做静态托管）。
- `nginx.conf`：示例 NGINX 配置，适用于容器或宿主机的静态文件托管。
- `scripts/`：包含 `build-and-push.sh`（构建并推送镜像）和 `deploy.sh`（部署示例），以及其他辅助脚本。
- `docs/`：文档目录，包含部署说明与 MQTT 控制文档（例如 `DEPLOYMENT.md`、`MQTT_UI_CONTROL_README.md` 等）。

## 📁 文件结构（简要）

```text
.
├─ Dockerfile
├─ docker-compose.yml
├─ nginx.conf
├─ docs/
│  ├─ DEPLOYMENT.md
│  ├─ MQTT_UI_CONTROL_README.md
│  └─ MQTT_命令参考.md
├─ resource/
│  ├─ ui_control.html
│  ├─ ui_control.css
│  └─ ui_control.js
└─ scripts/
   ├─ build-and-push.sh
   └─ deploy.sh
```

---

## 🚀 快速开始

本项目有两种常见的使用方式：直接打开前端资源进行本地调试，或使用容器化方式部署。

1) 本地快速预览（最简单）

 - 直接用浏览器打开 `resource/ui_control.html`。
 - 或者在仓库根目录运行一个临时静态服务器：

```bash
# Python 3:
python -m http.server 8000
# 然后访问 http://localhost:8000/resource/ui_control.html
```

2) 使用 Docker（推荐用于设备/服务器部署）

 - 构建并运行（使用示例 `docker-compose.yml`）：

```bash
docker compose up -d --build
# 之后访问容器或宿主机对应端口以查看页面
```

 - 项目中提供 `scripts/build-and-push.sh` 用于自动构建并推送镜像，`scripts/deploy.sh` 为示例部署脚本。具体流程请参考 `docs/DEPLOYMENT.md`。

---

## 🧩 定制与集成建议

- 修改样式：编辑 `resource/ui_control.css`，可直接替换主题变量与颜色。
- 修改结构：在 `resource/ui_control.html` 中调整 DOM，保留用于 JS 绑定的 `id`/`class`（可在 `ui_control.js` 中查看绑定逻辑）。
- 与设备/后端集成：`ui_control.js` 可扩展为通过 Fetch / WebSocket / MQTT 与设备通信；参考 `docs/MQTT_UI_CONTROL_README.md` 中的示例命令。
- 容器部署：若需要在真实环境中使用，请参考 `nginx.conf` 与 `Dockerfile`，并在 `docker-compose.yml` 中按需调整端口与挂载。

---

## `resource/` 详解（页面内容与定制指南）

下面对 `resource/` 中的三个核心文件做详细说明，帮助你快速定位需要修改的地方并理解交互逻辑与集成点。

- 文件概况（仓库内当前版本）

  - `resource/ui_control.html` — 主页面入口（约 20KB，约 400 行），包含页面结构与占位节点，用于放置设备列表、端口控制、状态指示与日志区域。
  - `resource/ui_control.css` — 页面样式表（约 45KB，约 2000 行），包含主题变量、控件样式、响应式规则与若干动画效果。样式采用全局变量管理主题色与间距，便于快速替换外观。
  - `resource/ui_control.js` — 交互逻辑脚本（约 83KB，约 2400 行），实现 DOM 绑定、事件处理、状态管理、以及与后端/设备的通信适配层（可扩展为 Fetch / WebSocket / MQTT）。

### `ui_control.html`（结构与关键节点）

- 结构概述：页面通常按以下区域组织——头部（标题/全局操作）、设备/端口列表（每个端口有开/关/定时等控件）、控制面板/详情侧栏、实时日志/状态区域、底部版权或帮助信息。
- 关键点：
  - 保留或标识 `id` / `class`：脚本通过固定的选择器查找并绑定元素，若改动节点请搜索 `ui_control.js` 中的选择器并同步更新。
  - 容器化：如果需要将页面作为子页面嵌入（iframe）或集成到现有应用，请确保样式作用域与外部样式不冲突（可在 `ui_control.css` 中为根容器添加命名空间前缀）。

### `ui_control.css`（主题与定制）

- 主题变量：样式顶部包含 CSS 变量（`:root`），优先修改这些变量即可全局调整颜色、圆角与间距。例如：

```css
:root {
  --primary-color: #2b7cff;
  --accent-color: #ff6b6b;
  --bg-color: #0f1720;
  --panel-radius: 8px;
}
```

- 控件样式：按钮、切换开关、进度条和表格等都在本文件统一定义，建议在保留类名的前提下覆盖变量或增加小片段 CSS以保持升级兼容。
- 响应式：文件包含若干媒体查询来适配不同宽度，若需支持更多分辨率可在末尾补充或调整现有断点。

### `ui_control.js`（交互与集成点）

- 职责分层：
  - DOM 绑定：页面加载时会缓存常用节点与事件监听器，避免频繁查询。
  - 状态管理：脚本维护当前设备/端口的状态模型（内存结构），并负责把模型渲染回视图。
  - 通信适配：内部提供抽象的通信适配点（例如 `sendCommand`, `connectSocket`, `publishMqtt` 等），你可以把这些函数替换或扩展为调用你的后端 API、WebSocket 服务或 MQTT 客户端。

- 常见改动点：
  - 修改默认模拟数据/示例：若页面有内置模拟数据用于离线开发（常见于 demo），可在脚本顶部或 `data/` 初始化处替换为真实数据源或变为异步获取。
  - 按钮回调与表单处理：所有用户触发的动作都会走一套统一的处理流程（校验 → 更新模型 → 调用通信适配 → 显示反馈），修改时请保持该流程以保证交互一致性。
  - 日志与调试：页面通常在控制台及日志面板输出操作细节，开发时可在 `ui_control.js` 中打开或拓展日志级别（info/debug/error）。

### 与后端或设备集成（建议实践）

- 若使用 MQTT：参见 `docs/MQTT_UI_CONTROL_README.md` 中约定的主题/命令格式，`ui_control.js` 中的 MQTT 适配点可以直接映射到这些主题。
- 若使用 HTTP API / WebSocket：建议实现一层“适配器”，把平台差异封装成统一接口供 UI 调用（例如：`api.sendPortCommand(portId, action)`）。
- 安全与跨域：若前端与后端分离部署，记得配置 `nginx.conf` 或后端允许的 CORS，或把静态页面与 API 同域部署以简化跨域问题。

### 定制示例（快速上手）

- 修改主色：

```css
:root { --primary-color: #ff7a59; }
```

- 将按钮的事件改为调用自定义 API（伪代码）：

```javascript
// ui_control.js 中原有调用
// sendCommand(portId, 'toggle')

// 替换为：
async function sendCommand(portId, action) {
  await fetch(`/api/ports/${portId}/action`, { method: 'POST', body: JSON.stringify({ action }) });
}
```

---

如需我把 `resource/ui_control.html`、`resource/ui_control.css`、`resource/ui_control.js` 中的主要片段摘录到 README（例如列出页面中所有重要 `id`/`class` 与关键函数），我可以读取这些文件并把结果加入 README 中。现在我已完成高层说明并将该任务标记为完成。

---

## 🤝 贡献与反馈

欢迎提交 Issue 或 PR。若提交 PR，请在描述中说明变更动机与测试步骤。

---

## 📜 许可

本仓库代码与资源采用 **MIT 协议**（如需其它许可，请在仓库根目录替换说明）。

---

## 📬 联系方式

在仓库 Issue 中留言，或在 PR 中附上联系方式（邮箱 / 微信 / 企业号）以便进一步沟通。

---

感谢使用本资源，祝你开发顺利！✨
