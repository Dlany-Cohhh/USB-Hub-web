/**
 * 商用级 USB-Hub 数字化终端控制系统
 * 工业科幻风格 MQTT 控制面板
 */

// 全局配置
const CONFIG = {
    MAX_PORTS: 4,
    MAX_POWER: 100, // 最大功率 (W)
    RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 2000,
    LOG_MAX_ENTRIES: 100,
    ANIMATION_DURATION: 300
};

// 默认 MQTT 配置（当页面移除配置 UI 时使用）
const DEFAULT_MQTT = {
    server: '116.211.150.115',
    port: 1883,
    wsPort: 8083,
    clientId: 'USB-Hub-Terminal'
};

// MQTT客户端和连接状态
let mqttClient = null;
let isConnected = false;
let reconnectAttempts = 0;

// 系统状态
let systemState = {
    totalPower: 0,
    powerPercentage: 0,
    ports: {},
    theme: localStorage.getItem('theme') || 'dark',
    simulationMode: false,
    chartDisplayMode: 'power', // 图表显示模式：power, voltage, current
    chartTimeRange: 50 // 图表时间范围
};
// per-port power history (sliding window)
systemState.portHistory = {};
// 新增：电压和电流历史数据
systemState.voltageHistory = {};
systemState.currentHistory = {};
const POWER_HISTORY_LENGTH = 50;

// MQTT主题配置（根据文档更新）
const TOPICS = {
    COMMAND: 'usb-hub/ui/command',
    FEEDBACK: 'usb-hub/ui/feedback',
    MQTT_STATUS: 'usb-hub/mqtt/status',
    USB_STATUS: 'usb-hub/usb/status',
    PORT_STATUS: 'usb-hub/port/status',
    WIFI_STATUS: 'usb-hub/wifi/status',
    UI_STATUS: 'usb-hub/ui/status',
    UI_PAGE: 'usb-hub/ui/page'
};

// 页面名称映射
const PAGE_NAMES = {
    0: 'Window',
    1: 'Sleep',
    2: 'Main Menu',
    3: 'USB Switch',
    4: 'USB Monitor',
    5: 'Monitor Settings',
    6: 'WiFi',
    7: 'WiFi Connect',
    8: 'WiFi Info',
    9: 'WiFi Config',
    10: 'Settings',
    11: 'About',
    12: 'OTA Update'
};

// 工业音效触发器（预留）
const SOUND_EFFECTS = {
    connect: () => console.log('🔊 连接音效'),
    disconnect: () => console.log('🔊 断开音效'),
    powerOn: () => console.log('🔊 开机音效'),
    powerOff: () => console.log('🔊 关机音效'),
    error: () => console.log('🔊 错误音效'),
    success: () => console.log('🔊 成功音效')
};

/**
 * 初始化系统
 */
document.addEventListener('DOMContentLoaded', function() {
    showLoadingOverlay();
    initializeTheme();
    initializeUI();
    setupEventListeners();
    loadSavedSettings();
    initializeChartControls(); // 初始化图表控制
    
    // 延迟自动连接
    setTimeout(() => {
        autoConnect();
        setTimeout(hideLoadingOverlay, 1500);
    }, 1000);
    
    addLog('数字化终端系统启动完成', 'success');
});

/**
 * 初始化图表控制选项
 */
function initializeChartControls() {
    // 从localStorage加载保存的设置
    const savedDisplayMode = localStorage.getItem('chartDisplayMode') || 'power';
    const savedTimeRange = localStorage.getItem('chartTimeRange') || '50';
    
    systemState.chartDisplayMode = savedDisplayMode;
    systemState.chartTimeRange = parseInt(savedTimeRange);
    
    // 设置UI控件的值
    const displayModeSelect = document.getElementById('chartDisplayMode');
    const timeRangeSelect = document.getElementById('chartTimeRange');
    
    if (displayModeSelect) {
        displayModeSelect.value = savedDisplayMode;
    }
    if (timeRangeSelect) {
        timeRangeSelect.value = savedTimeRange;
    }
    
    console.log(`[CHART-INIT] 图表控制初始化完成 - 显示模式: ${savedDisplayMode}, 时间范围: ${savedTimeRange}`);
}

/**
 * 主题管理
 */
function initializeTheme() {
    document.documentElement.setAttribute('data-theme', systemState.theme);
    updateThemeButton();
}

function toggleTheme() {
    systemState.theme = systemState.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', systemState.theme);
    localStorage.setItem('theme', systemState.theme);
    updateThemeButton();
    
    SOUND_EFFECTS.success();
    addLog(`主题已切换至${systemState.theme === 'dark' ? '深色' : '浅色'}模式`, 'info');
}

function updateThemeButton() {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    const text = themeToggle.querySelector('.theme-text');
    
    if (systemState.theme === 'dark') {
        icon.className = 'fas fa-sun';
        text.textContent = '浅色模式';
    } else {
        icon.className = 'fas fa-moon';
        text.textContent = '深色模式';
    }
}

/**
 * UI初始化
 */
function initializeUI() {
    updateConnectionStatus('disconnected');
    initializePowerDisplay();
    initializePortStates();
    
    // 设置亮度滑块事件
    const brightnessSlider = document.getElementById('brightnessSlider');
    const brightnessValue = document.getElementById('brightnessValue');
    if (brightnessSlider && brightnessValue) {
        brightnessSlider.addEventListener('input', function() {
            brightnessValue.textContent = this.value;
        });
    }
}

function initializePowerDisplay() {
    updatePowerDisplay(0);
}

function initializePortStates() {
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        systemState.ports[i] = {
            active: false,
            voltage: 0,
            current: 0,
            power: 0
        };
        updatePortDisplay(i);
    }
    // 初始化各种历史数据
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        systemState.portHistory[i] = new Array(systemState.chartTimeRange).fill(0);
        systemState.voltageHistory[i] = new Array(systemState.chartTimeRange).fill(0);
        systemState.currentHistory[i] = new Array(systemState.chartTimeRange).fill(0);
    }
    // 初始化图表渲染
    setTimeout(() => {
        for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
            updatePowerChart(i);
        }
    }, 200);
}

/**
 * 事件监听器设置
 */
function setupEventListeners() {
    // 主题切换
    const themeToggleEl = document.getElementById('themeToggle');
    if (themeToggleEl) themeToggleEl.addEventListener('click', toggleTheme);
    
    // 刷新按钮
    const refreshBtnEl = document.getElementById('refreshBtn');
    if (refreshBtnEl) refreshBtnEl.addEventListener('click', refreshSystemStatus);
    
    // 页面卸载时断开连接
    window.addEventListener('beforeunload', function() {
        if (mqttClient && isConnected) {
            mqttClient.end();
        }
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Observe container size changes for responsive chart redraws
    observePowerChartContainers();
    
    // Intercept console MQTT publish logs so they can be auto-forwarded to the UI
    interceptConsoleForMqttLogs();

    // 绑定 MQTT 发布间隔保存按钮（如果存在）
    const mqttPubSaveBtn = document.getElementById('mqttPubIntervalSaveBtn');
    if (mqttPubSaveBtn) {
        mqttPubSaveBtn.addEventListener('click', setMqttPublishIntervalFromUI);
    }
}

// Observe `.power-chart` element size changes and redraw the corresponding canvas.
function observePowerChartContainers() {
    if (typeof ResizeObserver === 'undefined') {
        console.warn('ResizeObserver not supported — charts will still update on window resize.');
        return;
    }

    const ro = new ResizeObserver(entries => {
        entries.forEach(entry => {
            const container = entry.target;
            const canvas = container.querySelector('canvas');
            if (!canvas) return;
            const m = canvas.id && canvas.id.match(/(\d+)$/);
            const portNum = m ? parseInt(m[1], 10) : null;
            if (portNum) {
                // Defer slightly to allow layout to stabilize when many changes occur.
                window.requestAnimationFrame(() => updatePowerChart(portNum));
            }
        });
    });

    document.querySelectorAll('.power-chart').forEach(el => {
        ro.observe(el);
    });
}

// Parse lines like:
// [10131][MQTT-UI] Publish -> topic: usb-hub/usb/status, payload: {"ports":[...]}
// and forward the topic + parsed payload to receiveExternalMqtt.
function parseConsoleMqttLine(line) {
    if (!line || typeof line !== 'string') return null;
    const m = line.match(/topic:\s*([^\s,]+)\s*,\s*payload:\s*([\s\S]+)$/i);
    if (!m) return null;
    const topic = m[1].trim();
    let payloadText = m[2].trim();
    // Trim trailing characters if necessary (e.g. stray markers)
    // Try to find JSON object start and end
    const objStart = payloadText.indexOf('{');
    if (objStart !== -1) {
        payloadText = payloadText.slice(objStart);
    }
    try {
        const parsed = JSON.parse(payloadText);
        return { topic, payload: parsed };
    } catch (err) {
        // parsing failed — ignore
        return null;
    }
}

// 临时禁用控制台拦截机制，直接输出调试信息
function interceptConsoleForMqttLogs() {
    console.log('[MQTT-DEBUG] 控制台拦截机制已禁用，直接输出MQTT调试信息');
    // 注释掉原有的拦截代码，避免干扰调试
    /*
    const methods = ['log', 'info', 'warn', 'error', 'debug'];
    methods.forEach(name => {
        const orig = console[name].bind(console);
        console[name] = function(...args) {
            try {
                // Call original first to preserve behavior
                orig(...args);
                for (const arg of args) {
                    if (typeof arg === 'string') {
                        const parsed = parseConsoleMqttLine(arg);
                        if (parsed) {
                            // forward to receiveExternalMqtt
                            if (window.receiveExternalMqtt) {
                                window.receiveExternalMqtt(parsed.topic, parsed.payload);
                            } else {
                                // fallback: directly call handler
                                handleMQTTMessage(parsed.topic, JSON.stringify(parsed.payload));
                            }
                        }
                    }
                }
                // If not matched above, try to extract topic/payload from multi-arg console calls
                const multi = tryParseArgsForTopicPayload(args);
                if (multi && multi.topic && multi.payload) {
                    if (window.receiveExternalMqtt) {
                        window.receiveExternalMqtt(multi.topic, multi.payload);
                    } else {
                        handleMQTTMessage(multi.topic, JSON.stringify(multi.payload));
                    }
                }
            } catch (e) {
                // ensure console doesn't break
                orig('console interception error', e);
            }
        };
    });
    */
}

// Try to derive topic + payload from an array of console arguments.
function tryParseArgsForTopicPayload(args) {
    if (!args || !args.length) return null;

    // Helper to detect topic-like strings
    const topicRegex = /(?:[a-z0-9_\-]+\/)+[a-z0-9_\-]+/i; // simple 'namespace/name' pattern

    // 1) Look for explicit label pairs: 'topic', topicValue, 'payload', payloadValue
    for (let i = 0; i < args.length - 1; i++) {
        const a = args[i];
        if (typeof a === 'string' && /topic[:\s]*$/i.test(a.trim())) {
            const topicVal = args[i + 1];
            // payload may come after 'payload' label later
            for (let j = i + 2; j < args.length; j++) {
                const b = args[j];
                if (typeof b === 'string' && /payload[:\s]*$/i.test(b.trim()) && j + 1 < args.length) {
                    const payloadVal = args[j + 1];
                    try {
                        const payload = (typeof payloadVal === 'string' && payloadVal.trim().startsWith('{')) ? JSON.parse(payloadVal) : payloadVal;
                        return { topic: String(topicVal), payload };
                    } catch (err) {
                        return { topic: String(topicVal), payload: payloadVal };
                    }
                }
            }
        }
    }

    // 2) Find a standalone topic-like string and a nearby object/JSON payload
    let foundTopicIndex = -1;
    for (let i = 0; i < args.length; i++) {
        const v = args[i];
        if (typeof v === 'string' && topicRegex.test(v)) {
            foundTopicIndex = i;
            break;
        }
    }
    if (foundTopicIndex !== -1) {
        // look for an object or JSON string payload after the topic index
        for (let j = foundTopicIndex + 1; j < args.length; j++) {
            const candidate = args[j];
            if (candidate && typeof candidate === 'object') {
                return { topic: String(args[foundTopicIndex]), payload: candidate };
            }
            if (typeof candidate === 'string' && candidate.trim().startsWith('{')) {
                try {
                    return { topic: String(args[foundTopicIndex]), payload: JSON.parse(candidate) };
                } catch (err) {
                    // ignore parse error
                }
            }
        }
    }

    // 3) As a last resort, check for a single string that contains both labels separated across args,
    //    e.g., 'Publish -> topic:' , topicString , 'payload:' , payloadObj
    // The above logic already handles many cases; if nothing matched, return null.
    return null;
}

function handleKeyboardShortcuts(event) {
    // Ctrl + R: 刷新
    if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        refreshSystemStatus();
    }
    
    // Ctrl + T: 切换主题
    if (event.ctrlKey && event.key === 't') {
        event.preventDefault();
        toggleTheme();
    }
    
    // Ctrl + C: 连接/断开
    if (event.ctrlKey && event.key === 'c') {
        event.preventDefault();
        if (isConnected) {
            disconnectMQTT();
        } else {
            connectMQTT();
        }
    }
}

/**
 * 设置管理
 */
function loadSavedSettings() {
    // 页面已移除战术连接配置输入项；确保 localStorage 中存在默认值以便自动连接使用
    if (!localStorage.getItem('mqttServer')) {
        localStorage.setItem('mqttServer', DEFAULT_MQTT.server);
    }
    if (!localStorage.getItem('mqttPort')) {
        localStorage.setItem('mqttPort', String(DEFAULT_MQTT.port));
    }
    if (!localStorage.getItem('mqttClientId')) {
        localStorage.setItem('mqttClientId', DEFAULT_MQTT.clientId);
    }
    if (!localStorage.getItem('wsPort')) {
        localStorage.setItem('wsPort', String(DEFAULT_MQTT.wsPort));
    }
    // MQTT 发布间隔（秒），默认 2s
    if (!localStorage.getItem('mqttPubInterval')) {
        localStorage.setItem('mqttPubInterval', '2');
    }
    // 如果页面存在相应输入框则设置其初始值
    const pubInput = document.getElementById('mqttPubIntervalInput');
    if (pubInput) {
        pubInput.value = localStorage.getItem('mqttPubInterval');
    }
}

function saveSettings(cfg) {
    // cfg: { server, port, clientId, wsPort }
    if (!cfg) return;
    if (cfg.server !== undefined) localStorage.setItem('mqttServer', String(cfg.server));
    if (cfg.port !== undefined) localStorage.setItem('mqttPort', String(cfg.port));
    if (cfg.clientId !== undefined) localStorage.setItem('mqttClientId', String(cfg.clientId));
    if (cfg.wsPort !== undefined) localStorage.setItem('wsPort', String(cfg.wsPort));
    if (cfg.pubInterval !== undefined) localStorage.setItem('mqttPubInterval', String(cfg.pubInterval));
}

function getMqttConfig() {
    return {
        server: localStorage.getItem('mqttServer') || DEFAULT_MQTT.server,
        port: parseInt(localStorage.getItem('mqttPort') || String(DEFAULT_MQTT.port)),
        clientId: localStorage.getItem('mqttClientId') || DEFAULT_MQTT.clientId,
        wsPort: parseInt(localStorage.getItem('wsPort') || String(DEFAULT_MQTT.wsPort))
    };
}

/**
 * 从 UI 设置 MQTT 发布间隔（秒），保存到 localStorage 并发送到设备
 */
function setMqttPublishIntervalFromUI() {
    const input = document.getElementById('mqttPubIntervalInput');
    if (!input) return;
    const val = parseInt(input.value);
    if (isNaN(val) || val < 1 || val > 255) {
        addLog('请输入有效的 MQTT 发送间隔（1-255 秒）', 'warning');
        return;
    }

    // 保存到 localStorage 以便 web UI 使用
    localStorage.setItem('mqttPubInterval', String(val));

    // 发送到设备（通过 MQTT 命令）
    sendCommand({
        type: 'settings_control',
        action: 'set_mqtt_pub_interval',
        pub_interval: val
    });

    addLog(`请求设置设备 MQTT 发送间隔为 ${val}s`, 'info');
}

/**
 * MQTT连接管理
 */
function connectMQTT(server, port, wsPort, clientId) {
    // 如果外部未传入参数，则从 localStorage 或默认值获取
    let cfg;
    if (server !== undefined) {
        cfg = {
            server: server,
            port: port,
            wsPort: wsPort,
            clientId: clientId
        };
    } else {
        cfg = getMqttConfig();
    }

    const s = cfg.server;
    const p = parseInt(cfg.port);
    const w = parseInt(cfg.wsPort);
    const id = cfg.clientId;

    if (!s || !p || !id) {
        addLog('MQTT 配置不完整，无法建立连接', 'error');
        SOUND_EFFECTS.error();
        return;
    }

    // 保存用于下次启动自动连接
    saveSettings({ server: s, port: p, clientId: id, wsPort: w });

    updateConnectionStatus('connecting');
    addLog(`正在建立战术连接: ${s}:${w}`, 'info');

    // 断开现有连接
    if (mqttClient) {
        mqttClient.end();
    }

    tryConnectMQTT(s, p, w, id);
}

function tryConnectMQTT(server, port, wsPort, clientId) {
    const connectionMethods = [
        () => {
            addLog(`尝试WebSocket连接: ws://${server}:${wsPort}/mqtt`, 'info');
            return mqtt.connect(`ws://${server}:${wsPort}/mqtt`, {
                clientId: clientId,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 0,
                keepalive: 60
            });
        },
        () => {
            addLog(`尝试WebSocket连接: ws://${server}:${wsPort}`, 'info');
            return mqtt.connect(`ws://${server}:${wsPort}`, {
                clientId: clientId,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 0,
                keepalive: 60
            });
        },
        () => {
            const wsPortAlt = port + 1000;
            addLog(`尝试WebSocket连接: ws://${server}:${wsPortAlt}`, 'info');
            return mqtt.connect(`ws://${server}:${wsPortAlt}`, {
                clientId: clientId,
                clean: true,
                connectTimeout: 5000,
                reconnectPeriod: 0,
                keepalive: 60
            });
        }
    ];
    
    let currentMethodIndex = 0;
    
    function tryNextMethod() {
        if (currentMethodIndex >= connectionMethods.length) {
            addLog('所有连接方式失败，请检查服务器配置', 'error');
            updateConnectionStatus('disconnected');
            SOUND_EFFECTS.error();

            // 显示持久提示，方便用户查看（需要手动关闭或刷新页面）
            showToast('所有连接方式失败，请检查服务器配置或网络。（已启用模拟模式）', 'error', 0);

            // 添加模拟数据用于测试界面
            addLog('启用模拟数据模式进行界面测试', 'warning');
            enableSimulationMode();
            return;
        }

        try {
            // 在 UI 上显示当前尝试方式
            showToast(`尝试连接方式 ${currentMethodIndex + 1}/${connectionMethods.length}...`, 'info', 2200);
            mqttClient = connectionMethods[currentMethodIndex]();

            const connectTimeout = setTimeout(() => {
                if (mqttClient && !isConnected) {
                    mqttClient.end();
                    currentMethodIndex++;
                    addLog(`连接超时，尝试下一种方式...`, 'warning');
                    showToast('连接超时，正在尝试下一种方式...', 'warning', 2200);
                    setTimeout(tryNextMethod, 1000);
                }
            }, 5000);

            mqttClient.on('connect', function() {
                clearTimeout(connectTimeout);
                isConnected = true;
                reconnectAttempts = 0;
                updateConnectionStatus('connected');
                addLog('战术连接建立成功！', 'success');
                SOUND_EFFECTS.connect();
                showToast('战术连接建立成功！', 'success', 3000);

                subscribeToTopics();
                requestInitialStatus();
            });

            mqttClient.on('message', function(topic, message) {
                console.log(`[MQTT-DEBUG] 原始MQTT消息接收:`, {
                    topic: topic,
                    message: message.toString(),
                    timestamp: new Date().toISOString()
                });
                handleMQTTMessage(topic, message.toString());
            });

            mqttClient.on('error', function(error) {
                clearTimeout(connectTimeout);
                addLog(`连接失败: ${error.message}`, 'warning');
                showToast(`连接失败: ${error.message}`, 'warning', 3000);
                currentMethodIndex++;
                setTimeout(tryNextMethod, 1000);
            });

            mqttClient.on('close', function() {
                if (isConnected) {
                    isConnected = false;
                    updateConnectionStatus('disconnected');
                    addLog('战术连接已断开', 'warning');
                    SOUND_EFFECTS.disconnect();

                    // 自动重连
                    if (reconnectAttempts < CONFIG.RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        addLog(`尝试自动重连 (${reconnectAttempts}/${CONFIG.RECONNECT_ATTEMPTS})`, 'info');
                        showToast(`连接断开，正在自动重连 (${reconnectAttempts}/${CONFIG.RECONNECT_ATTEMPTS})...`, 'info', 2500);
                        setTimeout(() => connectMQTT(), CONFIG.RECONNECT_DELAY);
                    } else {
                        addLog('启用模拟数据模式', 'warning');
                        enableSimulationMode();
                    }
                }
            });

        } catch (error) {
            addLog(`连接异常: ${error.message}`, 'warning');
            showToast(`连接异常: ${error.message}`, 'warning', 3000);
            currentMethodIndex++;
            setTimeout(tryNextMethod, 1000);
        }
    }
    
    tryNextMethod();
}

function disconnectMQTT() {
    if (mqttClient && isConnected) {
        mqttClient.end();
        addLog('已主动断开战术连接', 'info');
        SOUND_EFFECTS.disconnect();
    }
}

function autoConnect() {
    // 使用 localStorage 或默认配置自动连接（页面已移除手动配置项）
    const cfg = getMqttConfig();
    if (cfg && cfg.server) {
        showToast('正在尝试自动连接...', 'info', 2000);
        connectMQTT();
    } else {
        addLog('未找到 MQTT 配置，无法自动连接', 'warning');
    }
}

/**
 * MQTT消息处理
 */
function subscribeToTopics() {
    const topics = Object.values(TOPICS);
    topics.forEach(topic => {
        mqttClient.subscribe(topic, function(err) {
            if (err) {
                addLog(`订阅主题失败: ${topic}`, 'error');
            } else {
                addLog(`已订阅主题: ${topic}`, 'info');
            }
        });
    });
}

function handleMQTTMessage(topic, message) {
    // record incoming raw + parsed for modal console view
    try {
        appendMqttDebugLog(topic, message);
    } catch (e) {
        console.warn('[MQTT-DEBUG] appendMqttDebugLog error', e);
    }

    try {
        const data = JSON.parse(message);
        
        // 添加详细的控制台输出用于调试
        console.log(`[MQTT-DEBUG] 收到消息:`, {
            topic: topic,
            message: message,
            parsedData: data
        });
        
        switch (topic) {
            case TOPICS.FEEDBACK:
                console.log(`[MQTT-DEBUG] 处理反馈消息:`, data);
                handleCommandFeedback(data);
                break;
            case TOPICS.USB_STATUS:
                console.log(`[MQTT-DEBUG] 处理USB状态:`, data);
                updateUSBStatus(data);
                break;
            case TOPICS.PORT_STATUS:
                console.log(`[MQTT-DEBUG] 处理端口状态:`, data);
                // single-port status messages (from MQTT per-port publishes)
                updateSinglePortStatus(data);
                break;
            case TOPICS.MQTT_STATUS:
                console.log(`[MQTT-DEBUG] 处理MQTT状态:`, data);
                updateMQTTStatus(data);
                break;
            case TOPICS.WIFI_STATUS:
                console.log(`[MQTT-DEBUG] 处理WiFi状态:`, data);
                updateWiFiStatus(data);
                break;
            case TOPICS.UI_STATUS:
                console.log(`[MQTT-DEBUG] 处理UI状态:`, data);
                updateUIStatus(data);
                break;
            case TOPICS.UI_PAGE:
                console.log(`[MQTT-DEBUG] 处理页面信息:`, data);
                updatePageInfo(data);
                break;
            default:
                console.log(`[MQTT-DEBUG] 未知主题:`, topic, data);
                break;
        }
        
        addLog(`收到数据: ${topic}`, 'info');
    } catch (error) {
        console.error(`[MQTT-DEBUG] 数据解析失败:`, {
            topic: topic,
            message: message,
            error: error.message
        });
        addLog(`数据解析失败: ${topic} - ${error.message}`, 'error');
    }
}

// Append MQTT receive log (raw + optional parsed) to circular buffer for modal display
function appendMqttDebugLog(topic, message) {
    if (!systemState.mqttDebugLogs) systemState.mqttDebugLogs = [];
    const ts = new Date().toISOString();
    let parsed = null;
    try {
        parsed = JSON.parse(message);
    } catch (e) {
        parsed = null;
    }
    systemState.mqttDebugLogs.push({ timestamp: ts, topic, raw: message, parsed });
    // cap to 200 entries
    if (systemState.mqttDebugLogs.length > 200) systemState.mqttDebugLogs.shift();

    // If modal open, refresh its log area
    try {
        const overlay = document.getElementById('mechMqttOverlay');
        if (overlay && overlay.style.display !== 'none') {
            updateMqttDebugModal(systemState.lastMqttStatus);
        }
    } catch (e) {
        // ignore
    }
}

// Expose a helper to receive raw MQTT messages (useful for testing or
// to forward messages from other parts of the app). Accepts either a JSON
// string payload or an object.
window.receiveExternalMqtt = function(topic, payload) {
    try {
        const message = (typeof payload === 'string') ? payload : JSON.stringify(payload);
        // Reuse existing handler for consistency
        handleMQTTMessage(topic, message);
        // Small visual cue for debugging
        showToast(`接收 MQTT: ${topic}`, 'info', 1200);
    } catch (err) {
        console.error('receiveExternalMqtt error', err);
    }
};

function handleCommandFeedback(data) {
    // 兼容不同反馈格式：{status:'success'| 'error'} 或 {result:'ok'} 或 {result:'error'}
    if (data.status === 'success' || data.result === 'ok') {
        addLog(`命令执行成功: ${data.command || data.topic || '未知命令'}`, 'success');
    } else if (data.status === 'error' || data.result === 'error') {
        addLog(`命令执行失败: ${data.error || '未知错误'}`, 'error');
    }

    // 处理特定命令的反馈（兼容：port_status 或 port 字段）
    if (data.port_status) {
        updateSinglePortStatus(data.port_status);
    } else if (data.port && (data.state !== undefined)) {
        updateSinglePortStatus(data);
    }
}

function updateMQTTStatus(data) {
    addLog(`MQTT状态: ${data.connected ? '已连接' : '未连接'}, 重试次数: ${data.failed_attempts || 0}`, 'info');
    
    if (data.last_error) {
        addLog(`MQTT错误: ${data.last_error}`, 'warning');
    }

    // Save last MQTT status for modal display and update modal if open
    try {
        systemState.lastMqttStatus = data;
        updateMqttDebugModal(data);
    } catch (e) {
        console.warn('[UI] updateMqttDebugModal error', e);
    }
}

function sendCommand(command) {
    if (systemState.simulationMode) {
        addLog(`模拟命令: ${command.type} - ${command.action}`, 'info');
        return true;
    }
    
    if (!mqttClient || !isConnected) {
        addLog('战术连接未建立，无法发送指令', 'error');
        addLog('提示: 请检查MQTT服务器配置或使用模拟模式测试界面', 'warning');
        SOUND_EFFECTS.error();
        return false;
    }
    
    try {
        const message = JSON.stringify(command);
        mqttClient.publish(TOPICS.COMMAND, message);
        addLog(`发送指令: ${command.type} - ${command.action}`, 'success');
        return true;
    } catch (error) {
        addLog(`指令发送失败: ${error.message}`, 'error');
        SOUND_EFFECTS.error();
        return false;
    }
}

/**
 * USB端口控制（根据MQTT文档格式）
 */
function toggleUSBPort(port) {
    const checkbox = document.getElementById(`usb${port}Toggle`);
    const isActive = checkbox.checked;
    
    // 如果是模拟模式，直接更新本地状态
    if (systemState.simulationMode) {
        simulatePortData(port, isActive);
        return;
    }
    
    // 真实模式：发送MQTT命令
    if (sendCommand({
        type: 'usb_control',
        action: 'set_port',
        port: port,
        state: isActive
    })) {
        // 更新本地状态
        systemState.ports[port].active = isActive;
        updatePortDisplay(port);
        
        SOUND_EFFECTS[isActive ? 'powerOn' : 'powerOff']();
        addLog(`USB-${port.toString().padStart(2, '0')} ${isActive ? '已激活' : '已断电'}`, isActive ? 'success' : 'warning');
    } else {
        // 命令发送失败，恢复开关状态
        checkbox.checked = !isActive;
    }
}

function controlAllUSB(state) {
    // 如果是模拟模式
    if (systemState.simulationMode) {
        for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
            const checkbox = document.getElementById(`usb${i}Toggle`);
            if (checkbox) {
                checkbox.checked = state;
                simulatePortData(i, state);
            }
        }
        addLog(`所有USB端口${state ? '已激活' : '已断电'} (模拟模式)`, state ? 'success' : 'warning');
        return;
    }
    
    // 真实模式：发送MQTT命令
    sendCommand({
        type: 'usb_control',
        action: state ? 'all_on' : 'all_off'
    });
    
    // 更新所有端口状态
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        const checkbox = document.getElementById(`usb${i}Toggle`);
        if (checkbox) {
            checkbox.checked = state;
            systemState.ports[i].active = state;
            updatePortDisplay(i);
        }
    }
    
    SOUND_EFFECTS[state ? 'powerOn' : 'powerOff']();
    addLog(`所有USB端口${state ? '已激活' : '已断电'}`, state ? 'success' : 'warning');
}

function emergencyShutdown() {
    if (confirm('⚠️ 确认执行紧急断电程序？\n\n此操作将立即切断所有USB端口电源，可能导致数据丢失。')) {
        sendCommand({
            type: 'usb_control',
            action: 'emergency_shutdown'
        });
        
        // 本地状态更新
        controlAllUSB(false);
        addLog('🚨 紧急断电程序已执行', 'error');
        SOUND_EFFECTS.error();
        
        // 添加紧急断电动画效果
        document.body.style.animation = 'emergencyShutdown 0.5s ease-out';
        setTimeout(() => {
            document.body.style.animation = '';
        }, 500);
    }
}

/**
 * 显示控制（根据MQTT文档格式）
 */
function setBrightness(value) {
    document.getElementById('brightnessValue').textContent = value;
    sendCommand({
        type: 'display_control',
        action: 'set_brightness',
        brightness: parseInt(value)
    });
}

function sleepDisplay() {
    sendCommand({
        type: 'display_control',
        action: 'sleep'
    });
    addLog('显示单元进入休眠模式', 'info');
}

function wakeDisplay() {
    sendCommand({
        type: 'display_control',
        action: 'wake'
    });
    addLog('显示单元已唤醒', 'info');
}

/**
 * 页面导航控制（根据MQTT文档格式）
 */
function navigateToPage(pageIndex) {
    sendCommand({
        type: 'page_navigation',
        action: 'goto_page',
        page_index: pageIndex
    });
    addLog(`导航到页面: ${PAGE_NAMES[pageIndex] || pageIndex}`, 'info');
}

function simulateButton(action) {
    sendCommand({
        type: 'page_navigation',
        action: action
    });
    addLog(`模拟按钮: ${action}`, 'info');
}

/**
 * 快速 USB 控制（通过按钮直接发送 set_port / get_port_status）
 */
function quickSetPort(port, state) {
    // state: true = on, false = off
    const cmd = {
        type: 'usb_control',
        action: 'set_port',
        port: port,
        state: !!state
    };

    if (sendCommand(cmd)) {
        // 尝试立即更新 UI 状态以获得更好体验（设备反馈仍将覆盖）
        systemState.ports[port] = systemState.ports[port] || {};
        systemState.ports[port].active = !!state;
        updatePortDisplay(port);
        addLog(`已发送快速控制: 端口${port} -> ${state ? '开' : '关'}`, 'success');
    } else {
        addLog(`快速控制发送失败: 端口${port}`, 'error');
    }
}

function getPortStatus(port) {
    const cmd = {
        type: 'usb_control',
        action: 'get_port_status',
        port: port
    };
    sendCommand(cmd);
    addLog(`已请求端口 ${port} 状态`, 'info');
}

/**
 * 页面按钮操作（button_up/button_down/button_left/button_right/button_select/button_back）
 */
function navButton(action) {
    // action 应为文档中支持的 button_* 值
    sendCommand({
        type: 'page_navigation',
        action: action
    });
    addLog(`页面按钮操作: ${action}`, 'info');
}

/**
 * 从 UI 设置 MQTT 最大重试次数（通过 MQTT 命令传递到设备）
 */
function setMqttMaxRetryFromUI() {
    const input = document.getElementById('mqttMaxRetryInput');
    if (!input) return;
    const val = parseInt(input.value);
    if (isNaN(val) || val < 0) {
        addLog('请输入有效的最大重试次数（>=0）', 'warning');
        return;
    }

    sendCommand({
        type: 'settings_control',
        action: 'set_mqtt_max_retry',
        max_retry: val
    });
    addLog(`请求设置设备 MQTT 最大重试次数: ${val}`, 'info');
}

/**
 * 系统控制（根据MQTT文档格式）
 */
function getSystemInfo() {
    sendCommand({
        type: 'system_control',
        action: 'get_info'
    });
    addLog('正在获取系统信息...', 'info');
}

function restartSystem() {
    if (confirm('⚠️ 确认重启系统？\n\n系统将重新启动，当前连接会断开。')) {
        sendCommand({
            type: 'system_control',
            action: 'restart'
        });
        addLog('系统重启指令已发送', 'warning');
        SOUND_EFFECTS.powerOff();
    }
}

function factoryReset() {
    if (confirm('⚠️ 确认恢复出厂设置？\n\n此操作将清除所有自定义配置，无法撤销。')) {
        if (confirm('⚠️ 最后确认：真的要恢复出厂设置吗？')) {
            sendCommand({
                type: 'system_control',
                action: 'factory_reset'
            });
            addLog('出厂重置指令已发送', 'error');
            SOUND_EFFECTS.error();
        }
    }
}

/**
 * 请求MQTT状态（根据文档）
 */
function requestMqttStatus() {
    // 参数 showModal: boolean - 是否在请求后自动打开详情模态（默认 false）
    const args = Array.from(arguments);
    const showModal = args[0] === true;

    sendCommand({
        type: 'settings_control',
        action: 'publish_mqtt_status'
    });
    addLog('请求MQTT状态信息...', 'info');

    // 仅在显式传入 true 时打开模态（避免页面加载时自动弹出）
    if (showModal) {
        try {
            showMqttDebugModal();
        } catch (e) {
            console.warn('[UI] showMqttDebugModal error', e);
        }
    }
}

/**
 * 状态更新函数
 */
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    const icon = statusElement.querySelector('i');
    const text = statusElement.querySelector('span');
    const workModeElement = document.getElementById('workMode');
    
    statusElement.className = `connection-status status-${status}`;
    
    switch (status) {
        case 'connected':
            icon.className = 'fas fa-wifi';
            text.textContent = '已连接';
            if (workModeElement && !systemState.simulationMode) {
                workModeElement.textContent = '实时模式';
                workModeElement.style.color = 'var(--success-color)';
            }
            break;
        case 'connecting':
            icon.className = 'fas fa-spinner fa-spin';
            text.textContent = '连接中';
            if (workModeElement) {
                workModeElement.textContent = '连接中...';
                workModeElement.style.color = 'var(--warning-color)';
            }
            break;
        case 'disconnected':
        default:
            icon.className = 'fas fa-wifi-slash';
            text.textContent = '未连接';
            if (workModeElement && !systemState.simulationMode) {
                workModeElement.textContent = '离线模式';
                workModeElement.style.color = 'var(--danger-color)';
            }
            break;
    }
}

function updateUIStatus(data) {
    const pageName = PAGE_NAMES[data.current_page] || `页面 ${data.current_page}`;
    document.getElementById('currentPage').textContent = `页面: ${pageName}`;
}

function updatePageInfo(data) {
    const pageName = PAGE_NAMES[data.page_index] || `页面 ${data.page_index}`;
    document.getElementById('currentPage').textContent = `页面: ${pageName}`;
}

function updateDisplayInfo(data) {
    if (data.brightness !== undefined) {
        document.getElementById('brightnessSlider').value = data.brightness;
        document.getElementById('brightnessValue').textContent = data.brightness;
    }
}

function updateUSBStatus(data) {
    if (data.ports && Array.isArray(data.ports)) {
        let totalPower = 0;
        
        data.ports.forEach(port => {
            const portNum = port.port;
            if (portNum >= 1 && portNum <= CONFIG.MAX_PORTS) {
                // Normalize incoming units (robust to W/mW and A/mA)
                const normalized = normalizePortPayload(port);
                systemState.ports[portNum] = {
                    active: port.status,
                    voltage: normalized.voltageV,
                    current: normalized.current_mA,
                    power: normalized.power_W
                };
                
                updatePortDisplay(portNum);
                totalPower += port.power || 0;
            }
        });
        
        systemState.totalPower = totalPower;
        updatePowerDisplay(totalPower);
    }
}

function updateSinglePortStatus(data) {
    // 兼容两种字段名格式：port/usb_port 和 state/status
    const portNum = data.port || data.usb_port;
    
    if (portNum && portNum >= 1 && portNum <= CONFIG.MAX_PORTS) {
        console.log(`[MQTT-DEBUG] 更新端口${portNum}状态:`, data);
        
        // 兼容多种状态字段格式
        let active = false;
        if (data.state !== undefined) {
            active = data.state === 'true' || data.state === true || data.state === 'on';
        } else if (data.status !== undefined) {
            active = data.status === 'true' || data.status === true || data.status === 'on' || data.status === 1;
        }
        // Normalize incoming units to internal representation:
        //   voltage: V
        //   current: mA
        //   power: W
        const normalized = normalizePortPayload(data);

        systemState.ports[portNum] = {
            active: active,
            voltage: normalized.voltageV,
            current: normalized.current_mA,
            power: normalized.power_W
        };
        
        console.log(`[MQTT-DEBUG] 端口${portNum}新状态:`, systemState.ports[portNum]);
        
        updatePortDisplay(portNum);
        
        // 重新计算总功率
        let totalPower = 0;
        for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
            if (systemState.ports[i]) {
                totalPower += systemState.ports[i].power || 0;
            }
        }
        systemState.totalPower = totalPower;
        updatePowerDisplay(totalPower);
        
        console.log(`[MQTT-DEBUG] 总功率更新为: ${totalPower}W`);
    } else {
        console.warn(`[MQTT-DEBUG] 无效的端口号:`, portNum, data);
    }
}

function updatePortDisplay(portNum) {
    const port = systemState.ports[portNum];
    if (!port) {
        console.warn(`[MQTT-DEBUG] 端口${portNum}状态为空，跳过更新`);
        return;
    }
    
    console.log(`[MQTT-DEBUG] 开始更新端口${portNum}显示:`, port);
    
    const checkbox = document.getElementById(`usb${portNum}Toggle`);
    const portElement = document.getElementById(`usbPort${portNum}`);
    const voltageElement = document.getElementById(`usb${portNum}Voltage`);
    const currentElement = document.getElementById(`usb${portNum}Current`);
    const powerElement = document.getElementById(`usb${portNum}Power`);
    
    // 检查元素是否存在
    if (!checkbox) console.warn(`[MQTT-DEBUG] 找不到开关元素: usb${portNum}Toggle`);
    if (!portElement) console.warn(`[MQTT-DEBUG] 找不到端口元素: usbPort${portNum}`);
    if (!voltageElement) console.warn(`[MQTT-DEBUG] 找不到电压元素: usb${portNum}Voltage`);
    if (!currentElement) console.warn(`[MQTT-DEBUG] 找不到电流元素: usb${portNum}Current`);
    if (!powerElement) console.warn(`[MQTT-DEBUG] 找不到功率元素: usb${portNum}Power`);
    
    if (checkbox) {
        const oldChecked = checkbox.checked;
        checkbox.checked = port.active;
        console.log(`[MQTT-DEBUG] 端口${portNum}开关状态: ${oldChecked} -> ${port.active}`);
    }
    
    if (portElement) {
        const hadActive = portElement.classList.contains('active');
        if (port.active) {
            portElement.classList.add('active');
        } else {
            portElement.classList.remove('active');
        }
        console.log(`[MQTT-DEBUG] 端口${portNum}激活状态: ${hadActive} -> ${port.active}`);
    }
    
    // 格式化显示数据
    if (voltageElement) {
        const newText = port.voltage > 0 ? `${port.voltage.toFixed(2)}V` : '0.00V';
        const oldText = voltageElement.textContent;
        voltageElement.textContent = newText;
        console.log(`[MQTT-DEBUG] 端口${portNum}电压显示: ${oldText} -> ${newText}`);
    }
    if (currentElement) {
        const newText = port.current > 0 ? `${port.current.toFixed(0)}mA` : '0mA';
        const oldText = currentElement.textContent;
        currentElement.textContent = newText;
        console.log(`[MQTT-DEBUG] 端口${portNum}电流显示: ${oldText} -> ${newText}`);
    }
    if (powerElement) {
        const newText = port.power > 0 ? `${Math.round(port.power * 1000)} mW` : '0 mW';
        const oldText = powerElement.textContent;
        powerElement.textContent = newText;
        console.log(`[MQTT-DEBUG] 端口${portNum}功率显示 (mW): ${oldText} -> ${newText}`);
    }
    
    // 更新功率历史并刷新图表
    if (!systemState.portHistory[portNum]) {
        systemState.portHistory[portNum] = new Array(systemState.chartTimeRange).fill(0);
        console.log(`[MQTT-DEBUG] 初始化端口${portNum}功率历史`);
    }
    if (!systemState.voltageHistory[portNum]) {
        systemState.voltageHistory[portNum] = new Array(systemState.chartTimeRange).fill(0);
        console.log(`[MQTT-DEBUG] 初始化端口${portNum}电压历史`);
    }
    if (!systemState.currentHistory[portNum]) {
        systemState.currentHistory[portNum] = new Array(systemState.chartTimeRange).fill(0);
        console.log(`[MQTT-DEBUG] 初始化端口${portNum}电流历史`);
    }
    
    const powerHistory = systemState.portHistory[portNum];
    const voltageHistory = systemState.voltageHistory[portNum];
    const currentHistory = systemState.currentHistory[portNum];
    
    powerHistory.push(port.power || 0);
    voltageHistory.push(port.voltage || 0);
    currentHistory.push(port.current || 0);
    
    if (powerHistory.length > systemState.chartTimeRange) powerHistory.shift();
    if (voltageHistory.length > systemState.chartTimeRange) voltageHistory.shift();
    if (currentHistory.length > systemState.chartTimeRange) currentHistory.shift();
    
    console.log(`[MQTT-DEBUG] 端口${portNum}历史数据更新 - 功率: ${port.power}W, 电压: ${port.voltage}V, 电流: ${port.current}mA`);
    updatePowerChart(portNum);
    
    // 根据端口开关状态更新左侧 data-stream 面板的激活/未激活样式
    try {
        updateDataStreamActiveState();
    } catch (e) {
        console.warn('[UI] updateDataStreamActiveState 执行失败', e);
    }
}

/**
 * Normalize incoming port payload to internal units:
 * - voltageV: volts (V)
 * - current_mA: milliamps (mA)
 * - power_W: watts (W)
 *
 * The payload may provide combinations like:
 *  - voltage in V, current in mA, power in mW
 *  - voltage in V, current in A, power in W
 * This function uses consistency checks (voltage * current ≈ power) to infer units robustly.
 */
function normalizePortPayload(payload) {
    const voltageV = Number(parseFloat(payload.voltage) || 0);
    const rawCurrent = Number(parseFloat(payload.current) || 0);
    const rawPower = Number(parseFloat(payload.power) || 0);

    // Helper for approximate equality
    const approxEqual = (a, b, relTol = 0.25) => {
        if (!isFinite(a) || !isFinite(b)) return false;
        return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * relTol;
    };

    // Interpretations:
    // 1) assume current is in mA, power in mW => implied_power_mW = V * current_mA
    const implied_p_mW_if_current_mA = voltageV * rawCurrent;
    // 2) assume current is in A, power in W => implied_power_W_if_current_A = V * current_A
    const implied_p_W_if_current_A = voltageV * rawCurrent;
    // 3) assume power is given in mW -> power_mW = rawPower
    const power_mW_from_raw = rawPower;
    // 4) assume power is given in W -> power_mW = rawPower * 1000
    const power_mW_from_raw_as_W = rawPower * 1000;

    let final_current_mA = 0;
    let final_power_W = 0;

    // If both voltage and current present, try to find consistent interpretation
    if (voltageV > 0 && rawCurrent > 0) {
        // If raw power matches implied (V * current_mA)
        if (rawPower > 0 && approxEqual(power_mW_from_raw, implied_p_mW_if_current_mA, 0.2)) {
            final_current_mA = rawCurrent;
            final_power_W = power_mW_from_raw / 1000;
            return { voltageV, current_mA: final_current_mA, power_W: final_power_W };
        }

        // If raw power (as W) matches implied with current in A
        if (rawPower > 0 && approxEqual(power_mW_from_raw_as_W, implied_p_mW_if_current_mA, 0.2)) {
            final_current_mA = rawCurrent * 1000;
            final_power_W = rawPower;
            return { voltageV, current_mA: final_current_mA, power_W: final_power_W };
        }

        // If raw power is zero or missing, compute power from V and current assuming current in mA
        if (!rawPower || rawPower === 0) {
            final_current_mA = rawCurrent;
            final_power_W = (voltageV * final_current_mA) / 1000;
            return { voltageV, current_mA: final_current_mA, power_W: final_power_W };
        }
    }

    // Fallback heuristics when voltage or current are missing / inconsistent:
    // - If rawCurrent > 10 -> likely mA
    if (rawCurrent > 10) {
        final_current_mA = rawCurrent;
    } else {
        // rawCurrent small: it may be A or mA; default to treating as mA if power magnitude small
        if (rawPower > 50) {
            // power magnitude suggests mW provided -> treat current as mA
            final_current_mA = rawCurrent;
        } else {
            // treat as mA by default (safer for low-power sensors)
            final_current_mA = rawCurrent;
        }
    }

    // Determine power: if rawPower > 50 assume it's mW; if rawPower <= 50 assume W
    if (rawPower > 50) {
        final_power_W = rawPower / 1000;
    } else {
        final_power_W = rawPower;
    }

    return { voltageV, current_mA: final_current_mA, power_W: final_power_W };
}

/**
 * 更新左侧 data-stream 面板的激活/未激活状态。
 * 规则：若面板内任一 toggle-switch input 为 checked，则标记为 active，否则标记为 inactive。
 */
function updateDataStreamActiveState() {
    const section = document.querySelector('.panel.data-stream');
    if (!section) return;

    // 查找面板内所有开关输入（智能容错）
    const toggles = Array.from(section.querySelectorAll('.toggle-switch input[type="checkbox"]'));
    const anyChecked = toggles.some(cb => cb.checked);

    if (anyChecked) {
        section.classList.add('active');
        section.classList.remove('inactive');
    } else {
        section.classList.add('inactive');
        section.classList.remove('active');
    }
}

// 在初始化端口后确保面板状态正确（initializePortStates 中会调用 updatePortDisplay，updateDataStreamActiveState 也会被触发）

/**
 * 绘制单端口数据图表（增强版 - 支持功率/电压/电流）
 */
function updatePowerChart(portNum) {
    const canvas = document.getElementById(`usbPowerChart${portNum}`);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');

    // 使用元素实际 CSS 尺寸来设置画布像素尺寸，支持响应式拉伸
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;

    // 如果尺寸变化或 DPR 变化，重新设置 backing store 大小
    if (canvas._cssW !== cssW || canvas._cssH !== cssH || canvas._dpr !== dpr) {
        canvas._cssW = cssW;
        canvas._cssH = cssH;
        canvas._dpr = dpr;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
        // 清空在当前变换下的画布
        ctx.clearRect(0, 0, cssW, cssH);
    }

    // 获取当前显示模式的数据
    const { data: history, unit, colorThresholds } = getCurrentDisplayData(portNum);
    const maxVal = Math.max(...history, colorThresholds.low);
    const minVal = Math.min(...history, 0);
    const range = Math.max(maxVal - minVal, 0.001);

    // 从 CSS 读取主题相关样式（支持浅色/深色）
    const styles = getComputedStyle(document.documentElement);
    let strokeColor = (styles.getPropertyValue('--chart-stroke') || '#00e5ff').trim();
    const gradStart = (styles.getPropertyValue('--chart-grad-start') || 'rgba(0,229,255,0.08)').trim();
    const gradEnd = (styles.getPropertyValue('--chart-grad-end') || 'rgba(0,229,255,0.01)').trim();
    let fillColor = (styles.getPropertyValue('--chart-fill') || 'rgba(0,229,255,0.06)').trim();

    // 根据显示模式调整颜色
    switch (systemState.chartDisplayMode) {
        case 'voltage':
            strokeColor = '#ff6b35'; // 橙色
            fillColor = 'rgba(255, 107, 53, 0.06)';
            break;
        case 'current':
            strokeColor = '#4ecdc4'; // 青色
            fillColor = 'rgba(78, 205, 196, 0.06)';
            break;
        case 'power':
        default:
            // 保持默认蓝色
            break;
    }

    // 背景网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    
    // 水平网格线
    for (let i = 1; i < 4; i++) {
        const y = (cssH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
    }
    
    // 垂直网格线
    for (let i = 1; i < 5; i++) {
        const x = (cssW / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
    }
    
    ctx.setLineDash([]);

    // 背景渐变
    const grad = ctx.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, gradStart);
    grad.addColorStop(1, gradEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cssW, cssH);

    // 绘制数据线
    if (history.length > 1) {
        ctx.beginPath();
        const step = cssW / (history.length - 1);
        
        history.forEach((v, idx) => {
            const x = idx * step;
            const y = cssH - ((v - minVal) / range) * cssH;
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        // 主线条
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        // 发光效果
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 填充下面区域
        ctx.lineTo(cssW, cssH);
        ctx.lineTo(0, cssH);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // 数据点
        const latest = history[history.length - 1] || 0;
        if (latest > (colorThresholds.low * 0.1)) { // 显示阈值
            const lastX = (history.length - 1) * step;
            const lastY = cssH - ((latest - minVal) / range) * cssH;
            
            ctx.beginPath();
            ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI);
            ctx.fillStyle = strokeColor;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // 更新统计信息
    updateChartStats(portNum, history, unit, colorThresholds);
    
    // 更新图表容器的激活状态
    const chartContainer = document.getElementById(`powerChart${portNum}`);
    if (chartContainer) {
        const currentValue = history[history.length - 1] || 0;
        const threshold = colorThresholds.low * 0.1;
        if (currentValue > threshold) {
            chartContainer.classList.add('active');
        } else {
            chartContainer.classList.remove('active');
        }
    }
}

/**
 * 更新图表统计信息（支持多种数据类型）
 */
function updateChartStats(portNum, history, unit, colorThresholds) {
    const currentElement = document.getElementById(`chart${portNum}Current`);
    const peakElement = document.getElementById(`chart${portNum}Peak`);
    const avgElement = document.getElementById(`chart${portNum}Avg`);
    
    if (!currentElement || !peakElement || !avgElement) return;
    
    const current = history[history.length - 1] || 0;
    const peak = Math.max(...history);
    const avg = history.reduce((sum, val) => sum + val, 0) / history.length;
    
    // 根据数据类型格式化显示
    let precision = 1;
    if (unit === 'V') precision = 2;
    else if (unit === 'mA') precision = 0;
    else if (unit === 'mW') precision = 0;
    
    currentElement.textContent = `${current.toFixed(precision)} ${unit}`;
    peakElement.textContent = `${peak.toFixed(precision)} ${unit}`;
    avgElement.textContent = `${avg.toFixed(precision)} ${unit}`;
    
    // 根据数值和阈值设置颜色
    const setColor = (element, value) => {
        if (value > colorThresholds.high) {
            element.style.color = 'var(--danger-color)';
        } else if (value > colorThresholds.medium) {
            element.style.color = 'var(--warning-color)';
        } else if (value > colorThresholds.low) {
            element.style.color = 'var(--success-color)';
        } else {
            element.style.color = 'var(--text-secondary)';
        }
    };
    
    setColor(currentElement, current);
    setColor(peakElement, peak);
    setColor(avgElement, avg);
}

// 在窗口缩放时重绘图表
window.addEventListener('resize', () => {
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        updatePowerChart(i);
    }
});

function updatePowerDisplay(totalPower) {
    console.log(`[MQTT-DEBUG] 更新总功率显示: ${totalPower}W`);
    
    const totalPowerElement = document.getElementById('totalPower');
    const powerPercentageElement = document.getElementById('powerPercentage');
    const powerCircle = document.getElementById('powerCircle');
    
    if (totalPowerElement) {
        const oldText = totalPowerElement.textContent;
        const newText = Math.round(totalPower * 1000);
        totalPowerElement.textContent = newText;
        console.log(`[MQTT-DEBUG] 总功率文本 (mW): ${oldText} -> ${newText}`);
    } else {
        console.warn(`[MQTT-DEBUG] 找不到总功率元素: totalPower`);
    }
    
    const percentage = Math.min((totalPower / CONFIG.MAX_POWER) * 100, 100);
    systemState.powerPercentage = percentage;
    
    if (powerPercentageElement) {
        const oldText = powerPercentageElement.textContent;
        const newText = `${percentage.toFixed(0)}%`;
        powerPercentageElement.textContent = newText;
        console.log(`[MQTT-DEBUG] 功率百分比: ${oldText} -> ${newText}`);
    } else {
        console.warn(`[MQTT-DEBUG] 找不到功率百分比元素: powerPercentage`);
    }
    
    if (powerCircle) {
        const circumference = 314; // 2 * π * 50
        const offset = circumference - (percentage / 100) * circumference;
        const oldOffset = powerCircle.style.strokeDashoffset;
        powerCircle.style.strokeDashoffset = offset;
        console.log(`[MQTT-DEBUG] 功率环形图偏移: ${oldOffset} -> ${offset}`);
        
        // 根据负载百分比改变颜色
        let newColor;
        if (percentage > 80) {
            newColor = 'var(--danger-color)';
        } else if (percentage > 60) {
            newColor = 'var(--warning-color)';
        } else {
            newColor = 'var(--primary-color)';
        }
        const oldColor = powerCircle.style.stroke;
        powerCircle.style.stroke = newColor;
        console.log(`[MQTT-DEBUG] 功率环形图颜色: ${oldColor} -> ${newColor}`);
    } else {
        console.warn(`[MQTT-DEBUG] 找不到功率环形图元素: powerCircle`);
    }
}

function updateWiFiStatus(data) {
    const wifiStatusElement = document.getElementById('wifiStatus');
    const ipAddressElement = document.getElementById('ipAddress');
    
    if (wifiStatusElement) {
        wifiStatusElement.textContent = data.connected ? '已连接' : '未连接';
        wifiStatusElement.style.color = data.connected ? 'var(--success-color)' : 'var(--danger-color)';
    }
    
    if (ipAddressElement) {
        ipAddressElement.textContent = data.ip || '-';
    }
}

function updateSystemInfo(data) {
    const uptimeElement = document.getElementById('uptime');
    
    if (uptimeElement && data.uptime) {
        const uptimeSeconds = Math.floor(data.uptime / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        
        uptimeElement.textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // 在日志中显示详细系统信息
    if (data.chip_model) {
        addLog(`系统信息: ${data.chip_model} Rev${data.chip_revision}, CPU: ${data.cpu_freq}MHz`, 'info');
    }
    if (data.free_heap && data.total_heap) {
        addLog(`内存: ${Math.round(data.free_heap/1024)}KB 可用 / ${Math.round(data.total_heap/1024)}KB 总计`, 'info');
    }
}

/**
 * 系统状态请求
 */
function requestInitialStatus() {
    // 请求MQTT状态
    requestMqttStatus();
    
    // 请求当前页面信息
    sendCommand({
        type: 'page_navigation',
        action: 'get_current_page'
    });
    
    // 请求所有USB端口状态
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        sendCommand({
            type: 'usb_control',
            action: 'get_port_status',
            port: i
        });
    }
    
    // 请求系统信息
    getSystemInfo();
}

function refreshSystemStatus() {
    if (!isConnected) {
        addLog('请先建立战术连接', 'warning');
        return;
    }
    
    requestInitialStatus();
    addLog('正在刷新系统状态...', 'info');
    
    // 添加刷新动画
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.style.animation = 'spin 1s linear';
    setTimeout(() => {
        refreshBtn.style.animation = '';
    }, 1000);
}

/**
 * 日志系统
 */
function addLog(message, type = 'info') {
    const logContent = document.getElementById('logContent');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
    
    // 限制日志条数
    while (logContent.children.length > CONFIG.LOG_MAX_ENTRIES) {
        logContent.removeChild(logContent.firstChild);
    }
}

function clearLog() {
    document.getElementById('logContent').innerHTML = '';
    addLog('日志已清空', 'info');
}

/**
 * 可见提示（toast）
 * type: 'info' | 'success' | 'warning' | 'error'
 * timeout(ms): 0 表示持久显示，直到手动移除
 */
function showToast(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="message">${message}</div>`;
    container.appendChild(toast);

    // 强制回流以触发动画
    void toast.offsetWidth;
    toast.classList.add('show');

    if (timeout > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 260);
        }, timeout);
    }
}

/**
 * 加载动画控制
 */
function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }
}

/**
 * 图表显示控制功能
 */

// 改变图表显示模式（功率/电压/电流）
function changeChartDisplayMode(mode) {
    console.log(`[CHART-CONTROL] 切换图表显示模式: ${mode}`);
    systemState.chartDisplayMode = mode;
    
    // 保存到localStorage
    localStorage.setItem('chartDisplayMode', mode);
    
    // 更新所有图表标题
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        const chartTitle = document.querySelector(`#powerChart${i} .chart-title`);
        if (chartTitle) {
            let title, unit, icon;
            switch (mode) {
                case 'voltage':
                    title = `USB-${i.toString().padStart(2, '0')} 电压监控`;
                    unit = 'V';
                    icon = '⚡';
                    break;
                case 'current':
                    title = `USB-${i.toString().padStart(2, '0')} 电流监控`;
                    unit = 'mA';
                    icon = '🔌';
                    break;
                case 'power':
                default:
                    title = `USB-${i.toString().padStart(2, '0')} 功率监控`;
                    unit = 'W';
                    icon = '⚡';
                    break;
            }
            chartTitle.innerHTML = `${title}`;
            chartTitle.style.display = 'flex';
            chartTitle.style.alignItems = 'center';
            chartTitle.style.gap = '8px';
        }
    }
    
    // 重新绘制所有图表
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        updatePowerChart(i);
    }
    
    addLog(`图表显示模式已切换为: ${getDisplayModeText(mode)}`, 'info');
    SOUND_EFFECTS.success();
}

// 改变图表时间范围
function changeChartTimeRange(range) {
    const newRange = parseInt(range);
    console.log(`[CHART-CONTROL] 切换图表时间范围: ${newRange}个点`);
    systemState.chartTimeRange = newRange;
    
    // 保存到localStorage
    localStorage.setItem('chartTimeRange', range);
    
    // 调整历史数据长度
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        if (systemState.portHistory[i]) {
            adjustHistoryLength(systemState.portHistory[i], newRange);
        }
        if (systemState.voltageHistory[i]) {
            adjustHistoryLength(systemState.voltageHistory[i], newRange);
        }
        if (systemState.currentHistory[i]) {
            adjustHistoryLength(systemState.currentHistory[i], newRange);
        }
    }
    
    // 重新绘制所有图表
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        updatePowerChart(i);
    }
    
    addLog(`图表时间范围已调整为: ${newRange}个数据点`, 'info');
    SOUND_EFFECTS.success();
}

// 调整历史数据数组长度
function adjustHistoryLength(historyArray, newLength) {
    if (historyArray.length > newLength) {
        // 截取最新的数据
        historyArray.splice(0, historyArray.length - newLength);
    } else if (historyArray.length < newLength) {
        // 在前面填充0
        const fillCount = newLength - historyArray.length;
        for (let i = 0; i < fillCount; i++) {
            historyArray.unshift(0);
        }
    }
}

// 重置图表历史数据
function resetChartHistory() {
    console.log('[CHART-CONTROL] 重置所有图表历史数据');
    
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        systemState.portHistory[i] = new Array(systemState.chartTimeRange).fill(0);
        systemState.voltageHistory[i] = new Array(systemState.chartTimeRange).fill(0);
        systemState.currentHistory[i] = new Array(systemState.chartTimeRange).fill(0);
        updatePowerChart(i);
    }
    
    addLog('图表历史数据已重置', 'success');
}

// 导出图表数据
function exportChartData() {
    console.log('[CHART-CONTROL] 导出图表数据');
    
    const exportData = {
        timestamp: new Date().toISOString(),
        displayMode: systemState.chartDisplayMode,
        timeRange: systemState.chartTimeRange,
        ports: {}
    };
    
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        exportData.ports[i] = {
            power: systemState.portHistory[i] || [],
            voltage: systemState.voltageHistory[i] || [],
            current: systemState.currentHistory[i] || [],
            currentState: systemState.ports[i] || {}
        };
    }
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `usb-hub-chart-data-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog('图表数据已导出', 'success');
}

// 获取显示模式文本
function getDisplayModeText(mode) {
    switch (mode) {
        case 'voltage': return '电压监控';
        case 'current': return '电流监控';
        case 'power': 
        default: return '功率监控';
    }
}

// 获取当前显示的数据和单位
function getCurrentDisplayData(portNum) {
    const mode = systemState.chartDisplayMode;
    let data, unit, colorThresholds;
    
    switch (mode) {
        case 'voltage':
            data = systemState.voltageHistory[portNum] || new Array(systemState.chartTimeRange).fill(0);
            unit = 'V';
            colorThresholds = { low: 4.5, medium: 5.5, high: 6.0 };
            break;
        case 'current':
            data = systemState.currentHistory[portNum] || new Array(systemState.chartTimeRange).fill(0);
            unit = 'mA';
            colorThresholds = { low: 100, medium: 500, high: 1000 };
            break;
        case 'power':
        default:
            // Convert stored power values (W) to mW for display
            const raw = systemState.portHistory[portNum] || new Array(systemState.chartTimeRange).fill(0);
            data = raw.map(v => v * 1000); // mW
            unit = 'mW';
            colorThresholds = { low: 500, medium: 2000, high: 5000 }; // thresholds in mW
            break;
    }
    
    return { data, unit, colorThresholds };
}

// 添加页面元素检查函数
window.checkPageElements = function() {
    console.log('[ELEMENT-CHECK] 检查页面元素是否存在...');
    
    const elements = [
        'totalPower', 'powerPercentage', 'powerCircle',
        'usb1Toggle', 'usb2Toggle', 'usb3Toggle', 'usb4Toggle',
        'usbPort1', 'usbPort2', 'usbPort3', 'usbPort4',
        'usb1Voltage', 'usb1Current', 'usb1Power',
        'usb2Voltage', 'usb2Current', 'usb2Power',
        'usb3Voltage', 'usb3Current', 'usb3Power',
        'usb4Voltage', 'usb4Current', 'usb4Power',
        'powerChart1', 'powerChart2', 'powerChart3', 'powerChart4',
        'usbPowerChart1', 'usbPowerChart2', 'usbPowerChart3', 'usbPowerChart4',
        'chart1Current', 'chart1Peak', 'chart1Avg',
        'chart2Current', 'chart2Peak', 'chart2Avg',
        'chart3Current', 'chart3Peak', 'chart3Avg',
        'chart4Current', 'chart4Peak', 'chart4Avg'
    ];
    
    let missingElements = [];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            missingElements.push(id);
            console.error(`[ELEMENT-CHECK] 缺失元素: ${id}`);
        } else {
            console.log(`[ELEMENT-CHECK] ✅ 找到元素: ${id}`);
        }
    });
    
    if (missingElements.length > 0) {
        console.error(`[ELEMENT-CHECK] 总共缺失 ${missingElements.length} 个元素:`, missingElements);
        return false;
    } else {
        console.log('[ELEMENT-CHECK] ✅ 所有必要元素都存在');
        return true;
    }
};

// 添加强制更新函数
window.forceUpdateAllPorts = function() {
    console.log('[FORCE-UPDATE] 强制更新所有端口显示...');
    
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        if (systemState.ports[i]) {
            console.log(`[FORCE-UPDATE] 更新端口${i}:`, systemState.ports[i]);
            updatePortDisplay(i);
        } else {
            console.warn(`[FORCE-UPDATE] 端口${i}状态为空`);
        }
    }
    
    updatePowerDisplay(systemState.totalPower || 0);
};
window.testMqttMessage = function(topic, payload) {
    console.log(`[MQTT-TEST] 测试MQTT消息:`, { topic, payload });
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    handleMQTTMessage(topic, message);
};

// 添加控制台调试开关
window.enableMqttDebug = function(enable = true) {
    window.MQTT_DEBUG_ENABLED = enable;
    console.log(`[MQTT-DEBUG] 调试模式${enable ? '已启用' : '已禁用'}`);
};

// 测试各种MQTT消息格式
window.testAllMqttFormats = function() {
    console.log('[MQTT-TEST] 开始测试所有MQTT消息格式...');
    
    // 测试USB状态消息
    testMqttMessage('usb-hub/usb/status', {
        ports: [
            { port: 1, status: true, voltage: 5.0, current: 500, power: 2.5 },
            { port: 2, status: false, voltage: 0, current: 0, power: 0 }
        ]
    });
    
    // 测试单端口状态
    testMqttMessage('usb-hub/port/status', {
        port: 1,
        state: true,
        voltage: 5.0,
        current: 500,
        power: 2.5
    });
    
    // 测试反馈消息
    testMqttMessage('usb-hub/ui/feedback', {
        status: 'success',
        command: 'set_port',
        port_status: {
            port: 1,
            state: true,
            voltage: 5.0,
            current: 500,
            power: 2.5
        }
    });
    
    // 测试MQTT状态
    testMqttMessage('usb-hub/mqtt/status', {
        connected: true,
        failed_attempts: 0,
        max_retry: 5
    });
    
    console.log('[MQTT-TEST] 测试完成，请检查控制台输出和系统诊断日志');
};
function formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 兼容性函数（保持与旧版本的兼容性）
function initMqtt() {
    connectMQTT();
}

function log(msg) {
    addLog(msg, 'info');
}

/**
 * 模拟数据模式（用于测试界面）
 */
function enableSimulationMode() {
    systemState.simulationMode = true;
    updateConnectionStatus('connected');
    addLog('🔧 模拟数据模式已启用 - 仅用于界面测试', 'warning');
    
    // 更新工作模式显示
    const workModeElement = document.getElementById('workMode');
    if (workModeElement) {
        workModeElement.textContent = '模拟模式';
        workModeElement.style.color = 'var(--warning-color)';
    }
    
    // 模拟初始端口状态
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        systemState.ports[i] = {
            active: false,
            voltage: 0,
            current: 0,
            power: 0
        };
        updatePortDisplay(i);
    }
    
    // 模拟系统信息
    setTimeout(() => {
        document.getElementById('wifiStatus').textContent = '已连接';
        document.getElementById('wifiStatus').style.color = 'var(--success-color)';
        document.getElementById('ipAddress').textContent = '192.168.1.100';
        document.getElementById('currentPage').textContent = '页面: 模拟模式';
        addLog('模拟系统状态已加载', 'info');
    }, 1000);
}

function simulatePortData(port, active) {
    if (!systemState.simulationMode) return;
    
    if (active) {
        // 模拟真实的USB端口数据
        systemState.ports[port] = {
            active: true,
            voltage: 4.8 + Math.random() * 0.4, // 4.8-5.2V
            current: 100 + Math.random() * 400,  // 100-500mA
            power: 0
        };
        // 计算功率
        systemState.ports[port].power = (systemState.ports[port].voltage * systemState.ports[port].current) / 1000;
    } else {
        systemState.ports[port] = {
            active: false,
            voltage: 0,
            current: 0,
            power: 0
        };
    }
    
    updatePortDisplay(port);
    
    // 重新计算总功率
    let totalPower = 0;
    for (let i = 1; i <= CONFIG.MAX_PORTS; i++) {
        totalPower += systemState.ports[i].power;
    }
    systemState.totalPower = totalPower;
    updatePowerDisplay(totalPower);
    
    addLog(`模拟端口${port}状态: ${active ? '开启' : '关闭'}`, active ? 'success' : 'info');
}
// CSS动画样式注入
const additionalStyles = `
<style>
@keyframes emergencyShutdown {
    0% { filter: brightness(1); }
    50% { filter: brightness(0.3) hue-rotate(0deg); }
    100% { filter: brightness(1) hue-rotate(360deg); }
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', additionalStyles);
/**
 * MQTT 详情模态窗口 - 创建 / 显示 / 隐藏 / 更新
 */
function ensureMqttModal() {
    if (document.getElementById('mechMqttOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mechMqttOverlay';
    overlay.className = 'mech-modal-overlay';

    overlay.innerHTML = `
        <div class="mech-modal" role="dialog" aria-modal="true" aria-label="MQTT 详情">
            <div class="modal-header">
                <div class="modal-title"><i class="fas fa-robot"></i> MQTT 详细参数</div>
                <div class="modal-actions" style="display:flex; gap:8px; align-items:center;">
                    <button class="copy-btn" id="mechMqttCopyAll" title="复制当前原始 JSON">复制全部</button>
                    <button class="modal-close" id="mechMqttClose">关闭</button>
                </div>
            </div>
            <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
                <div style="width:100%;" id="mqttRawContainer">
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:6px;">原始 JSON：</div>
                    <pre id="mqttDebugRaw" class="raw-pre" style="max-height:260px; overflow:auto;">{}</pre>
                </div>

                <div style="width:100%; margin-top:6px;">
                    <h4 style="margin:0 0 8px 0; color:var(--primary-color); font-size:0.95rem;">最近 MQTT 收到 <span style="font-size:0.8rem; color:var(--text-secondary);">（最新在上）</span></h4>
                    <div id="mqttDebugLogs" class="mqtt-logs-container" style="max-height:calc(80vh - 360px); overflow:auto; display:flex; flex-direction:column; gap:12px; padding-right:6px;"></div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideMqttDebugModal();
    });
    const closeBtn = document.getElementById('mechMqttClose');
    if (closeBtn) closeBtn.addEventListener('click', hideMqttDebugModal);

    // 复制全部按钮行为：复制当前原始 JSON 区域内容
    const copyAllBtn = document.getElementById('mechMqttCopyAll');
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', async () => {
            const rawEl = document.getElementById('mqttDebugRaw');
            if (!rawEl) return;
            try {
                await navigator.clipboard.writeText(rawEl.textContent || '');
                copyAllBtn.classList.add('copied');
                setTimeout(() => copyAllBtn.classList.remove('copied'), 1200);
                showToast('已复制原始 JSON 到剪贴板', 'success', 1200);
            } catch (err) {
                console.warn('copyAll failed', err);
                showToast('复制失败', 'error', 1200);
            }
        });
    }
}

function showMqttDebugModal() {
    ensureMqttModal();
    const overlay = document.getElementById('mechMqttOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    // Populate with last known status immediately
    const data = systemState.lastMqttStatus || { info: '等待设备返回...' };
    updateMqttDebugModal(data);
}

function hideMqttDebugModal() {
    const overlay = document.getElementById('mechMqttOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
}

function updateMqttDebugModal(data) {
    const raw = document.getElementById('mqttDebugRaw');
    const logsContainer = document.getElementById('mqttDebugLogs');
    if (!raw || !logsContainer) return;

    const d = data || systemState.lastMqttStatus || {};
    // 更新原始 JSON 区域
    raw.textContent = JSON.stringify(d, null, 2);
    
    // Hide raw container and disable copy-all if content is empty or only {}
    const rawContainer = document.getElementById('mqttRawContainer');
    const copyAllBtn = document.getElementById('mechMqttCopyAll');
    const rawTrim = (raw.textContent || '').trim();
    if (rawContainer) {
        if (!rawTrim || rawTrim === '{}' || rawTrim === '{}' + '\\n') {
            rawContainer.style.display = 'none';
        } else {
            rawContainer.style.display = '';
        }
    }
    if (copyAllBtn) {
        if (!rawTrim || rawTrim === '{}' || rawTrim === '{}' + '\\n') {
            copyAllBtn.setAttribute('disabled', 'true');
            copyAllBtn.classList.add('disabled');
        } else {
            copyAllBtn.removeAttribute('disabled');
            copyAllBtn.classList.remove('disabled');
        }
    }

    // 渲染最近收到的 MQTT 日志（最新在上）
    const logs = systemState.mqttDebugLogs || [];
    const maxShow = 30;
    const showLogs = logs.slice(-maxShow).reverse(); // newest first
    const logHtml = showLogs.map(l => {
        const parsedHtml = l.parsed ? `<details><summary>解析后的 JSON</summary><pre>${escapeHtml(JSON.stringify(l.parsed, null, 2))}</pre></details>` : '';
        const topic = escapeHtml(l.topic);
        const ts = escapeHtml(l.timestamp);
        const rawEsc = escapeHtml(l.raw);
        return `<div class="mqtt-log-entry">
            <div class="mqtt-log-header">
                <div style="display:flex; gap:8px; align-items:center;">
                    <div class="log-topic">${topic}</div>
                    <div style="color:var(--text-secondary); font-size:0.85rem;">原始消息</div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <div class="log-ts">${ts}</div>
                    <button class="copy-btn" data-raw='${rawEsc}'>复制</button>
                </div>
            </div>
            <div class="raw-pre"><pre style="white-space:pre-wrap; word-break:break-word; margin:0;">${rawEsc}</pre></div>
            ${parsedHtml}
        </div>`;
    }).join('');

    logsContainer.innerHTML = logHtml || `<div style="color:var(--text-secondary); font-size:0.9rem;">暂无接收的 MQTT 消息</div>`;

    // wire copy buttons
    setTimeout(() => {
        const btns = logsContainer.querySelectorAll('.copy-btn');
        btns.forEach(b => {
            b.removeEventListener('click', handleCopyBtn);
            b.addEventListener('click', handleCopyBtn);
        });
    }, 30);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function handleCopyBtn(e) {
    const btn = e.currentTarget;
    const raw = btn.getAttribute('data-raw') || '';
    // 尝试使用异步 Clipboard API，并给按钮添加短暂的视觉反馈
    (async () => {
        try {
            await navigator.clipboard.writeText(raw.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1200);
            showToast('已复制原始 JSON 到剪贴板', 'success', 1500);
        } catch (err) {
            console.warn('copy failed', err);
            showToast('复制失败', 'error', 1500);
        }
    })();
}