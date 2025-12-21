API 和示例：MQTT UI 控制器
=========================

概述
----
本文件描述设备端已实现的非阻塞控制 API（通过 MQTT），并给出网页端的示例 JS 片段，方便在网页上实现对设备的“绝对控制”。

重要主题（topics）
------------------
- 命令接收：`usb-hub/ui/command` （设备订阅，接收 JSON 命令）  
- 命令反馈：`usb-hub/ui/feedback` （设备异步发布，非阻塞反馈）  
- MQTT 状态：`usb-hub/mqtt/status` （设备在状态变更或按需发布当前 MQTT 状态）  
- WiFi 状态：`usb-hub/wifi/status` （设备发布 WiFi 相关状态）  
- 设备 UI 状态：`usb-hub/ui/status`、`usb-hub/ui/page` 等（保持兼容）

命令格式（示例）
----------------
1) 页面导航（跳转）
{
  "type": "page_navigation",
  "action": "goto_page",
  "page_index": 3
}

2) 显示控制（例如设置亮度）
{
  "type": "display_control",
  "action": "set_brightness",
  "brightness": 200
}

3) 系统级命令（发布 MQTT 状态）
{
  "type": "settings_control",
  "action": "publish_mqtt_status"
}

非阻塞 API（设备端已实现）
-------------------------
- sendCommand(topic, payload)：将命令入队（非阻塞），由后台任务异步解析并执行。  
- publishAsync(topic, payload)：将发布请求入队（非阻塞），后台任务在 MQTT 连接可用时发送并有限重试。  
- setMqttMaxRetry(n)：通过 UI 或命令设置最大重试次数（持久化到 EEPROM）。  
- publish_mqtt_status：可以通过发送上面的系统级命令触发设备立即发布 MQTT 状态（或调用 MQTT UI Controller 的 publishStatus）。

网页示例（使用 Paho MQTT over WebSocket）
-----------------------------------------
参见 `web_control/mqtt_ui_examples.js`（示例代码）。

可靠性与注意事项
-----------------
- 设备端采用命令队列和发布队列、后台任务异步处理，保证接收/处理不阻塞 MQTT 回调。  
- 发布队列实现有限重试（默认 3 次），超过后会丢弃并记录日志（可以扩展为回调或持久化）。  
- 可以通过 `publish_mqtt_status` 命令让设备即时推送状态，网页应订阅 `usb-hub/mqtt/status` 与 `usb-hub/ui/feedback` 获取实时回执。

示例交互流程
-------------
1. 网页用 MQTT/WS 连接到 broker。  
2. 网页发布命令到 `usb-hub/ui/command`（sendCommand 对应）。  
3. 设备收到后把命令入队并快速返回（非阻塞）。  
4. 后台任务解析并执行命令，执行结果通过 `usb-hub/ui/feedback` 异步发送回网页。  

结束


