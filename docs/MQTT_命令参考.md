# MQTT 命令参考文档

## 概述
本文档描述了USB-Hub数字化终端支持的MQTT命令格式和主题结构。

## MQTT 主题结构

### 命令主题（发送到设备）
- `usb-hub/ui/command` - 发送控制命令到设备

### 状态主题（从设备接收）
- `usb-hub/ui/feedback` - 接收命令执行反馈
- `usb-hub/mqtt/status` - 接收MQTT连接状态
- `usb-hub/wifi/status` - 接收WiFi连接状态
- `usb-hub/ui/status` - 接收UI状态信息
- `usb-hub/ui/page` - 接收当前页面信息

## 命令格式

所有命令都采用JSON格式，基本结构：
```json
{
    "type": "命令类型",
    "action": "具体动作",
    "参数名": "参数值"
}
```

## 支持的命令类型

### 1. USB端口控制 (usb_control)

#### 设置单个端口状态
```json
{
    "type": "usb_control",
    "action": "set_port",
    "port": 1,
    "state": true
}
```
- `port`: 端口号 (1-4)
- `state`: 端口状态 (true=开启, false=关闭)

#### 获取端口状态
```json
{
    "type": "usb_control",
    "action": "get_port_status",
    "port": 1
}
```

#### 全部端口开启
```json
{
    "type": "usb_control",
    "action": "all_on"
}
```

#### 全部端口关闭
```json
{
    "type": "usb_control",
    "action": "all_off"
}
```

#### 紧急断电
```json
{
    "type": "usb_control",
    "action": "emergency_shutdown"
}
```

### 2. 显示控制 (display_control)

#### 设置亮度
```json
{
    "type": "display_control",
    "action": "set_brightness",
    "brightness": 200
}
```
- `brightness`: 亮度值 (0-255)

#### 显示休眠
```json
{
    "type": "display_control",
    "action": "sleep"
}
```

#### 显示唤醒
```json
{
    "type": "display_control",
    "action": "wake"
}
```

### 3. 页面导航 (page_navigation)

#### 跳转到指定页面
```json
{
    "type": "page_navigation",
    "action": "goto_page",
    "page_index": 3
}
```
- `page_index`: 页面索引
  - 0: Window (主窗口)
  - 1: Sleep (休眠页面)
  - 2: Main Menu (主菜单)
  - 3: USB Switch (USB开关)
  - 4: USB Monitor (USB监控)
  - 5: Monitor Settings (监控设置)
  - 6: WiFi (WiFi页面)
  - 7: WiFi Connect (WiFi连接)
  - 8: WiFi Info (WiFi信息)
  - 9: WiFi Config (WiFi配置)
  - 10: Settings (设置)
  - 11: About (关于)
  - 12: OTA Update (OTA更新)

#### 获取当前页面
```json
{
    "type": "page_navigation",
    "action": "get_current_page"
}
```

#### 模拟按钮操作
```json
{
    "type": "page_navigation",
    "action": "button_up"
}
```
支持的按钮动作：
- `button_up` - 上按钮
- `button_down` - 下按钮
- `button_left` - 左按钮
- `button_right` - 右按钮
- `button_select` - 选择按钮
- `button_back` - 返回按钮

### 4. 系统控制 (system_control)

#### 获取系统信息
```json
{
    "type": "system_control",
    "action": "get_info"
}
```

#### 重启系统
```json
{
    "type": "system_control",
    "action": "restart"
}
```

#### 恢复出厂设置
```json
{
    "type": "system_control",
    "action": "factory_reset"
}
```

### 5. 设置控制 (settings_control)

#### 请求发布MQTT状态
```json
{
    "type": "settings_control",
    "action": "publish_mqtt_status"
}
```

## 反馈消息格式

设备执行命令后会通过 `usb-hub/ui/feedback` 主题发送反馈：

### 成功反馈
```json
{
    "status": "success",
    "command": "set_port",
    "command_type": "usb_control",
    "message": "端口1已开启",
    "port_status": {
        "port": 1,
        "state": true,
        "voltage": 5.0,
        "current": 500,
        "power": 2.5
    }
}
```

### 错误反馈
```json
{
    "status": "error",
    "command": "set_port",
    "command_type": "usb_control",
    "error": "端口号无效",
    "error_code": 400
}
```

## 状态消息格式

### MQTT状态 (usb-hub/mqtt/status)
```json
{
    "enabled": true,
    "connected": true,
    "failed_attempts": 0,
    "max_retry": 5,
    "last_error": null,
    "client_id": "USB-Hub-Device",
    "server": "192.168.1.100",
    "port": 1883
}
```

### WiFi状态 (usb-hub/wifi/status)
```json
{
    "connected": true,
    "ssid": "MyWiFi",
    "ip": "192.168.1.100",
    "rssi": -45,
    "mac": "AA:BB:CC:DD:EE:FF"
}
```

### UI状态 (usb-hub/ui/status)
```json
{
    "current_page": 3,
    "brightness": 200,
    "sleep_mode": false,
    "uptime": 3600000
}
```

### 页面信息 (usb-hub/ui/page)
```json
{
    "page_index": 3,
    "page_name": "USB Switch",
    "timestamp": 1640995200
}
```

## 使用示例

### JavaScript 示例
```javascript
// 连接MQTT
const client = mqtt.connect('ws://192.168.1.100:8083/mqtt');

// 订阅状态主题
client.subscribe('usb-hub/ui/feedback');
client.subscribe('usb-hub/mqtt/status');

// 发送命令
function toggleUSBPort(port, state) {
    const command = {
        type: 'usb_control',
        action: 'set_port',
        port: port,
        state: state
    };
    client.publish('usb-hub/ui/command', JSON.stringify(command));
}

// 处理反馈
client.on('message', function(topic, message) {
    const data = JSON.parse(message.toString());
    console.log('收到消息:', topic, data);
});
```

## 错误代码

| 错误代码 | 描述 |
|---------|------|
| 400 | 请求参数无效 |
| 404 | 命令不存在 |
| 500 | 内部服务器错误 |
| 503 | 服务不可用 |

## 注意事项

1. **命令队列**: 设备使用队列处理命令，避免阻塞
2. **重试机制**: 发布失败时会自动重试，最多3次
3. **超时处理**: 命令执行超时会返回错误反馈
4. **状态同步**: 建议订阅反馈主题获取实时状态
5. **连接监控**: 监控MQTT状态主题了解连接情况

## 调试建议

1. 使用MQTT客户端工具（如MQTT Explorer）监控消息
2. 检查JSON格式是否正确
3. 确认主题名称拼写正确
4. 监控反馈消息了解执行结果
5. 查看设备日志获取详细错误信息