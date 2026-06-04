-- ============================================
-- 智慧矿山安全监测平台 - TimescaleDB 初始化脚本
-- 适配Docker: 不包含CREATE DATABASE(由POSTGRES_DB环境变量创建)
-- ============================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit;

-- ============================================
-- 1. 传感器表
-- ============================================
CREATE TABLE IF NOT EXISTS sensors (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    zone_id VARCHAR(50) NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensors_zone_id ON sensors(zone_id);
CREATE INDEX IF NOT EXISTS idx_sensors_type ON sensors(type);

-- ============================================
-- 2. 传感器数据表 (时序超表)
-- ============================================
CREATE TABLE IF NOT EXISTS sensor_data (
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sensor_id VARCHAR(50) NOT NULL,
    value FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable(
    'sensor_data',
    'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_time ON sensor_data(sensor_id, timestamp DESC);

SELECT add_retention_policy(
    'sensor_data',
    INTERVAL '30 days',
    if_not_exists => TRUE
);

SELECT add_compression_policy(
    'sensor_data',
    INTERVAL '7 days',
    if_not_exists => TRUE
);

ALTER TABLE sensor_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'sensor_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- ============================================
-- 3. 人员表
-- ============================================
CREATE TABLE IF NOT EXISTS personnel (
    id SERIAL PRIMARY KEY,
    tag_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    status VARCHAR(20) DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. 人员定位表 (时序超表)
-- ============================================
CREATE TABLE IF NOT EXISTS personnel_location (
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tag_id VARCHAR(50) NOT NULL,
    zone_id VARCHAR(50) NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable(
    'personnel_location',
    'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_personnel_location_tag_time ON personnel_location(tag_id, timestamp DESC);

SELECT add_retention_policy(
    'personnel_location',
    INTERVAL '7 days',
    if_not_exists => TRUE
);

SELECT add_compression_policy(
    'personnel_location',
    INTERVAL '3 days',
    if_not_exists => TRUE
);

ALTER TABLE personnel_location SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tag_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- ============================================
-- 5. 告警表
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    level VARCHAR(20) NOT NULL,
    sensor_id VARCHAR(50),
    zone_id VARCHAR(50),
    message TEXT NOT NULL,
    value FLOAT,
    threshold FLOAT,
    status VARCHAR(20) DEFAULT 'active',
    power_cut BOOLEAN DEFAULT FALSE,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_zone_id ON alerts(zone_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

-- ============================================
-- 6. 区域表
-- ============================================
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    zone_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    power_status VARCHAR(20) DEFAULT 'on',
    last_power_change TIMESTAMP,
    last_power_change_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. 指令日志表
-- ============================================
CREATE TABLE IF NOT EXISTS power_commands (
    id BIGSERIAL PRIMARY KEY,
    command_id VARCHAR(100) UNIQUE NOT NULL,
    zone_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(50) NOT NULL,
    reason TEXT,
    acked BOOLEAN DEFAULT FALSE,
    acked_at TIMESTAMP,
    retries INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_power_commands_zone ON power_commands(zone_id);
CREATE INDEX IF NOT EXISTS idx_power_commands_created ON power_commands(created_at DESC);

-- ============================================
-- 初始化数据
-- ============================================

INSERT INTO zones (zone_id, name, description) VALUES
('main_entrance', '主井口', '矿井主出入口'),
('tunnel_1', '1号巷道', '主要运输巷道'),
('tunnel_2', '2号巷道', '辅助运输巷道'),
('tunnel_3', '3号巷道', '回风巷道'),
('face_1', '1号掘进面', '采煤工作面'),
('face_2', '2号掘进面', '采煤工作面'),
('face_3', '3号掘进面', '采煤工作面'),
('face_4', '4号掘进面', '预备工作面'),
('air_shaft', '通风井', '通风竖井')
ON CONFLICT (zone_id) DO NOTHING;

INSERT INTO personnel (tag_id, name, department, status) VALUES
('P001', '张三', '掘进一队', 'online'),
('P002', '李四', '掘进一队', 'online'),
('P003', '王五', '掘进二队', 'online'),
('P004', '赵六', '通风队', 'online'),
('P005', '钱七', '安全科', 'online'),
('P006', '孙八', '机电队', 'online'),
('P007', '周九', '掘进二队', 'online'),
('P008', '吴十', '运输队', 'online')
ON CONFLICT (tag_id) DO NOTHING;

-- ============================================
-- 视图
-- ============================================

CREATE OR REPLACE VIEW sensor_latest_data AS
SELECT DISTINCT ON (sensor_id)
    s.sensor_id,
    s.type,
    s.name,
    s.zone_id,
    s.x,
    s.y,
    sd.value,
    sd.timestamp
FROM sensors s
LEFT JOIN sensor_data sd ON s.sensor_id = sd.sensor_id
ORDER BY s.sensor_id, sd.timestamp DESC;

CREATE OR REPLACE VIEW personnel_latest_location AS
SELECT DISTINCT ON (tag_id)
    p.tag_id,
    p.name,
    p.department,
    p.status,
    pl.zone_id,
    pl.x,
    pl.y,
    pl.timestamp
FROM personnel p
LEFT JOIN personnel_location pl ON p.tag_id = pl.tag_id
ORDER BY p.tag_id, pl.timestamp DESC;
