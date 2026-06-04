# 智慧矿山安全监测平台

基于 WebSocket + TimescaleDB + Canvas 的地下矿山实时安全监测系统。

## 📋 目录

- [系统架构](#系统架构)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [部署方式](#部署方式)
- [巷道配置](#巷道配置)
- [API 接口](#api-接口)
- [告警规则](#告警规则)
- [项目结构](#项目结构)

## 🏗️ 系统架构

```
                    ┌─────────────────────────────────────────┐
                    │            前端 (Browser)               │
                    │  ┌──────────┐  ┌────────────────────┐  │
                    │  │  Canvas  │  │  Sensor Detail     │  │
                    │  │  巷道图   │  │  趋势图模态框      │  │
                    │  └──────────┘  └────────────────────┘  │
                    │  ┌───────────────────────────────────┐  │
                    │  │       PersonnelTracker            │  │
                    │  │       PowerCutoffController       │  │
                    │  │       AlertManager                │  │
                    │  └───────────────────────────────────┘  │
                    └──────────────────────┬──────────────────┘
                                           │
                                     WebSocket
                                           │
                    ┌──────────────────────▼──────────────────┐
                    │          MinePushService (推送服务)      │
                    └──────────────────────┬──────────────────┘
                                           │
    ┌──────────────────────┬───────────────┼───────────────┬──────────────────────┐
    │                      │               │               │                      │
┌───▼─────┐        ┌──────▼──────┐  ┌────▼───────┐  ┌────▼───────┐        ┌─────▼──────┐
│ MineData │        │ SafetyAlarm │  │ Emergency  │  │ Personnel  │        │   Sensor   │
│   Hub    │        │   Engine    │  │ Controller │  │  Tracker   │        │ Simulator  │
│ 数据接收 │        │  告警检测   │  │  断电控制  │  │  人员定位  │        │  传感器模拟 │
└─────┬────┘        └──────┬──────┘  └─────┬──────┘  └─────┬──────┘        └─────┬──────┘
      │                      │               │               │                      │
      │                      │               │               │                      │
      └──────────────────────┴───────────────┼───────────────┴──────────────────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │   TimescaleDB     │
                                    │  (时序数据库)     │
                                    └──────────────────┘
```

### 核心模块说明

| 模块 | 职责 | 所在文件 |
|------|------|---------|
| **MineDataHub** | 传感器数据接收、历史管理、数据库写入 | [mine-data-hub.js](server/mine-data-hub.js) |
| **SafetyAlarmEngine** | 告警规则判断、去重、告警记录 | [safety-alarm-engine.js](server/safety-alarm-engine.js) |
| **EmergencyController** | 断电/送电控制、指令重试、状态确认 | [emergency-controller.js](server/emergency-controller.js) |
| **MinePushService** | WebSocket 消息推送、客户端管理 | [mine-push-service.js](server/mine-push-service.js) |
| **PersonnelTracker** | 人员定位数据管理、移动模拟 | [personnel-tracker.js](server/personnel-tracker.js) |

## ✨ 功能特性

### 实时监测
- **500个传感器**：瓦斯浓度、粉尘浓度、顶板位移、风速
- **10秒上报**：高频数据采集，实时展示
- **4种类型**：覆盖掘进面和巷道的全方位监测

### 可视化
- **Canvas 巷道图**：可缩放、可拖拽的交互式矿井地图
- **传感器状态**：颜色根据危险等级动态变化（绿/黄/红）
- **人员定位**：实时显示井下人员位置
- **趋势图表**：点击传感器查看近1小时数据趋势

### 安全告警
| 告警类型 | 阈值 | 触发动作 |
|---------|------|---------|
| 瓦斯超限 | > 1.0% | 危险告警 + 自动切断区域电源 |
| 粉尘超标 | > 10 mg/m³ | 告警通知 |
| 顶板异常 | > 10 mm | 冒顶预警 |
| 通风不足 | < 0.25 m/s | 告警通知 |

- **声光报警**：Web Audio API 报警音 + 屏幕闪烁
- **指令重试**：断电指令本地缓存，超时自动重试（最多5次）
- **本地优先**：前端本地立即执行断电，不依赖网络延迟

## 🛠️ 技术栈

### 后端
- **Node.js 18+** - 服务端运行时
- **Express** - HTTP 服务框架
- **WebSocket (ws)** - 实时双向通信
- **TimescaleDB** - 时序数据库（PostgreSQL 扩展）
- **node-postgres** - PostgreSQL 客户端

### 前端
- **Canvas 2D** - 高性能矿井巷道图渲染
- **Web Audio API** - 声光报警
- **原生 JavaScript** - 无框架依赖，轻量高效

### 部署
- **Docker** - 容器化部署
- **Docker Compose** - 多服务编排

## 🚀 部署方式

### 方式一：Docker Compose 一键部署（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd AI_solo_coder_task_A_056

# 2. 配置环境变量（可选，使用默认值可跳过）
cp .env.example .env
# 编辑 .env 文件

# 3. 启动所有服务
docker-compose up -d

# 4. 查看服务状态
docker-compose ps

# 5. 查看日志
docker-compose logs -f mine-server
```

访问：http://localhost:3000

### 方式二：本机部署（开发环境）

#### 前置要求
- Node.js 18+
- PostgreSQL 15+
- TimescaleDB 2.13+

#### 安装步骤

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
psql -U postgres -f database/init.sql

# 3. 配置数据库连接
# 编辑 server/config/database.js

# 4. 启动服务
npm run dev
```

### 方式三：独立模拟器部署

```bash
# 启动传感器模拟器
node simulators/sensor-simulator.js

# 启动人员定位模拟器
node simulators/personnel-simulator.js
```

### Docker Compose 服务说明

```yaml
services:
  timescaledb:          # 时序数据库（端口5432）
  mine-server:          # 主服务（端口3000）
  sensor-simulator:     # 传感器模拟器
  personnel-simulator:  # 人员定位模拟器
```

## 📐 巷道配置

### 配置文件位置
[config/tunnel-config.json](config/tunnel-config.json)

### 配置格式

```json
{
  "tunnels": [
    {
      "id": "tunnel_1",
      "name": "1号巷道",
      "type": "main",
      "width": 40,
      "points": [
        [100, 400],
        [300, 400],
        [500, 350],
        [700, 350]
      ]
    },
    {
      "id": "face_1",
      "name": "1号掘进面",
      "type": "face",
      "width": 30,
      "points": [[700, 250]]
    }
  ],
  "sensorTypes": {
    "gas": {
      "name": "瓦斯浓度",
      "unit": "%",
      "threshold": 1.0,
      "warning": 0.8,
      "color": "#ff4444"
    }
  }
}
```

### 巷道类型说明

| type | 说明 | 绘制方式 |
|------|------|---------|
| `entrance` | 主井口 | 绿色圆形 + "入"字标识 |
| `main` | 主巷道 | 折线巷道（宽巷道） |
| `branch` | 分支巷道 | 折线巷道（窄巷道） |
| `face` | 掘进面 | 紫色圆形终端 |
| `shaft` | 通风井 | 蓝色圆形终端 |

### 坐标系统

- 原点 `(0, 0)` 在左上角
- X轴向右为正，Y轴向下为正
- 单位：像素
- 建议巷道布局在 1200x800 范围内

### 传感器类型配置

```json
{
  "sensorTypes": {
    "gas": {
      "name": "瓦斯浓度",
      "unit": "%",
      "threshold": 1.0,
      "warning": 0.8,
      "color": "#ff4444"
    },
    "dust": { ... },
    "roof": { ... },
    "wind": { ... }
  }
}
```

| 字段 | 说明 |
|------|------|
| `name` | 传感器类型名称 |
| `unit` | 数据单位 |
| `threshold` | 危险阈值 |
| `warning` | 预警阈值 |
| `color` | 传感器图标颜色 |

## 🔌 API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取系统配置（巷道、传感器类型） |
| GET | `/api/sensors` | 获取所有传感器列表 |
| GET | `/api/sensors/:id/history` | 获取传感器历史数据 |
| GET | `/api/personnel` | 获取所有人员位置 |
| GET | `/api/alerts` | 获取活动告警列表 |
| POST | `/api/zones/:id/restore-power` | 恢复区域供电 |

### WebSocket 消息

#### 服务端 → 客户端

| 类型 | 说明 |
|------|------|
| `init` | 初始化数据（传感器、人员、告警） |
| `sensor_data` | 传感器实时数据 |
| `alert` | 新告警通知 |
| `personnel_locations` | 人员位置更新 |
| `power_status` | 区域电源状态变更 |
| `sensor_history` | 传感器历史数据响应 |

#### 客户端 → 服务端

| 类型 | 说明 |
|------|------|
| `get_sensor_history` | 请求传感器历史数据 |
| `power_cut_ack` | 断电指令确认 |
| `restore_power` | 请求恢复供电 |

#### 模拟器 → 服务端

| 类型 | 说明 |
|------|------|
| `sensor_data_sim` | 模拟器传感器数据批次 |
| `personnel_locations_sim` | 模拟器人员位置批次 |

## ⚠️ 告警规则

### 瓦斯监测
- **正常**：< 0.8%
- **预警**：0.8% - 1.0%（黄色）
- **危险**：> 1.0%（红色 + 自动断电）

### 粉尘监测
- **正常**：< 8 mg/m³
- **预警**：8 - 10 mg/m³（黄色）
- **危险**：> 10 mg/m³（红色）

### 顶板监测
- **正常**：< 7 mm
- **预警**：7 - 10 mm（黄色）
- **危险**：> 10 mm（红色）

### 风速监测
- **正常**：> 0.4 m/s
- **预警**：0.25 - 0.4 m/s（黄色）
- **危险**：< 0.25 m/s（红色）

## 📁 项目结构

```
.
├── Dockerfile                  # 主服务 Docker 镜像
├── Dockerfile.simulator        # 模拟器 Docker 镜像
├── docker-compose.yml          # 多服务编排
├── .env                        # 环境变量配置
├── package.json                # 项目依赖
├── README.md                   # 本文档
├── server/                     # 后端代码
│   ├── index.js               # 服务入口
│   ├── config/
│   │   └── database.js        # 数据库配置
│   ├── mine-data-hub.js       # 数据中心模块
│   ├── safety-alarm-engine.js # 告警引擎模块
│   ├── emergency-controller.js # 紧急控制模块
│   ├── mine-push-service.js   # 推送服务模块
│   └── personnel-tracker.js   # 人员定位模块
├── simulators/                 # 独立模拟器
│   ├── sensor-simulator.js    # 传感器模拟器
│   └── personnel-simulator.js # 人员定位模拟器
├── public/                     # 前端静态文件
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── config.js           # 前端配置
│       ├── tunnel-renderer.js  # Canvas 渲染器
│       ├── personnel-tracker.js # 人员定位管理
│       ├── power-cutoff-controller.js # 断电控制
│       ├── alert-manager.js    # 告警管理
│       ├── sensor-manager.js   # 传感器管理
│       ├── trend-chart.js      # 趋势图表
│       └── app.js              # 主应用
├── config/                     # 系统配置
│   └── tunnel-config.json      # 巷道拓扑配置
└── database/                   # 数据库脚本
    └── init.sql               # 初始化脚本
```

## 🔧 配置项说明

### 环境变量 (.env)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | localhost | 数据库主机 |
| `DB_PORT` | 5432 | 数据库端口 |
| `DB_NAME` | smart_mine_monitoring | 数据库名 |
| `DB_USER` | postgres | 数据库用户 |
| `DB_PASSWORD` | postgres | 数据库密码 |
| `SERVER_PORT` | 3000 | 服务端口 |
| `WS_URL` | ws://localhost:3000 | WebSocket 地址 |
| `SIMULATION_INTERVAL` | 10000 | 传感器上报间隔（毫秒） |
| `ANOMALY_RATE` | 0.05 | 异常数据概率 |
| `UPDATE_INTERVAL` | 2000 | 人员定位更新间隔 |

## 📊 性能指标

- **传感器数据**：500个 × 6次/分钟 = 3000条/分钟
- **数据存储**：约 432万条/天，TimescaleDB 自动分区压缩
- **内存历史**：每个传感器保留 360个采样点（1小时）
- **Canvas 渲染**：人员移动采用脏矩形增量更新，性能提升约50倍

## ⚡ 安全机制

1. **断电控制**
   - 前端本地立即执行
   - 服务端指令确认
   - 超时自动重试（最多5次）
   - WebSocket 重连后状态恢复

2. **数据保护**
   - 数据库写入失败时内存缓存
   - 队列溢出保护（最多5万条）
   - 指数退避重试机制

3. **告警去重**
   - 同一传感器同一类型告警静默期
   - 级别变化时才更新

## 📝 开发说明

### 添加新的传感器类型

1. 在 `config/tunnel-config.json` 的 `sensorTypes` 中添加配置
2. 在 `server/mine-data-hub.js` 的 `SENSOR_BASE_VALUES` 中添加基准值
3. 在 `server/safety-alarm-engine.js` 的 `ALERT_THRESHOLDS` 中添加阈值

### 添加新的巷道

1. 在 `config/tunnel-config.json` 的 `tunnels` 数组中添加
2. 定义 `points` 坐标数组
3. 重启服务或调用 `/api/config` 重新加载

### 调整告警阈值

修改 `config/tunnel-config.json` 中对应 `sensorTypes` 的 `threshold` 和 `warning` 字段。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。
