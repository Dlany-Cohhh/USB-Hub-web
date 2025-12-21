# MQTT UI 控制器 使用说明（合并 API 文档）

本文件描述设备端 MQTT UI 控制器的设计、API 和网页示例，便于通过网页对设备进行非阻塞、可靠的控制。

目录
- 概述
- 主题（topics）
- 命令格式示例
- 设备端非阻塞 API 与行为
- 网页示例（参照 web_control/mqtt_ui_examples.js）
- 部署建议与注意事项

概述
----
设备实现了一个基于 MQTT 的 UI 控制器（`MQTTUIController`），特点：
- 命令与发布采用队列异步处理，避免在 MQTT 回调中执行耗时操作，从而不会阻塞网络或界面更新。  
- 支持非阻塞入队的命令发送与发布，后台任务负责解析并执行命令、发送反馈与状态。  
- 提供 API（sendCommand、publishAsync、setMqttMaxRetry、publishStatus）供本地代码或通过 MQTT 命令触发。

主题（topics）
------------
- 命令接收：`usb-hub/ui/command`（设备订阅）  
- 命令反馈：`usb-hub/ui/feedback`（设备发布）  
- MQTT 状态：`usb-hub/mqtt/status`（设备发布）  
- WiFi 状态：`usb-hub/wifi/status`（设备发布）  
- UI 状态：`usb-hub/ui/status`、`usb-hub/ui/page`（设备发布）

命令格式示例
------------
页面导航：
```json
{ "type": "page_navigation", "action": "goto_page", "page_index": 3 }
```
显示控制（亮度）：
```json
{ "type": "display_control", "action": "set_brightness", "brightness": 200 }
```
请求设备发布 MQTT 状态：
```json
{ "type": "settings_control", "action": "publish_mqtt_status" }
```

非阻塞 API（设备端）
------------------
- sendCommand(topic, payload)  
  - 行为：把命令压入命令队列，立即返回。后台任务从队列中读取并处理（解析 JSON，执行动作）。  
  - 适用场景：网页或其他模块发送 UI 控制命令。  

- publishAsync(topic, payload)  
  - 行为：把要发布的消息入发布队列，由后台任务在 MQTT 连接可用时发送；失败会有限重试，超过次数后丢弃并记录。  
  - 适用场景：设备想要非阻塞方式发布大量或不关键消息。  

- setMqttMaxRetry(n)  
  - 行为：设置最大连接重试次数并持久化到 EEPROM（WIFI namespace）。  

- publishStatus()  
  - 行为：立即构建并发布 MQTT 状态到 `usb-hub/mqtt/status`（仅在 MQTT 连接可用时发布）。包含 enabled/connected/failed_attempts/max_retry/last_error 字段。

网页示例
---------
参见 `web_control/mqtt_ui_examples.js`。核心逻辑：
- 建立 MQTT over WebSocket 连接后订阅 `usb-hub/ui/feedback` 与 `usb-hub/mqtt/status`。  
- 使用 `sendCommand()`（即向 `usb-hub/ui/command` 发布 JSON）发送控制命令。  
- 使用 `requestMqttStatus()` 触发设备发布状态。

部署建议与注意事项
-------------------
- 后台任务参数（队列长度、任务栈、任务优先级）可根据实际负载调整（当前默认 CMD_QUEUE_LEN=8、PUB_QUEUE_LEN=8、任务栈=4096、优先级=5）。  
- 发布队列采用有限重试（默认 3 次）以避免因为临时网络问题导致主流程阻塞。若对关键命令有强一致性需求，可考虑将发布队列持久化到 EEPROM（需处理空间与格式）。  
- 建议网页端订阅 `usb-hub/ui/feedback` 获取命令执行回执，并订阅 `usb-hub/mqtt/status` 获取设备实时连接/错误信息。

示例交互流程
-------------
1. 网页通过 MQTT/WS 发布命令到 `usb-hub/ui/command`。  
2. 设备将命令入队并返回快速 ack（不会阻塞）。  
3. 后台任务在设备侧解析并执行命令，执行结果通过 `usb-hub/ui/feedback` 异步回传。

结束


