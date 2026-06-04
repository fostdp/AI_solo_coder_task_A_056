const WebSocket = require('ws');
const http = require('http');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const SENSOR_COUNT = parseInt(process.env.SENSOR_COUNT || '500', 10);
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '10000', 10);

const SENSOR_TYPES = ['gas', 'dust', 'roof', 'wind'];
const ZONES = [
  { id: 'main_entrance', xRange: [90, 130], yRange: [380, 420] },
  { id: 'tunnel_1', xRange: [110, 690], yRange: [330, 410] },
  { id: 'tunnel_2', xRange: [270, 700], yRange: [590, 700] },
  { id: 'tunnel_3', xRange: [700, 1040], yRange: [240, 360] },
  { id: 'face_1', xRange: [680, 720], yRange: [190, 340] },
  { id: 'face_2', xRange: [680, 720], yRange: [490, 640] },
  { id: 'face_3', xRange: [1020, 1080], yRange: [230, 270] },
  { id: 'face_4', xRange: [480, 520], yRange: [330, 370] },
  { id: 'air_shaft', xRange: [480, 520], yRange: [80, 120] }
];

const BASE_VALUES = {
  gas:  { min: 0.1, max: 0.5, anomalyChance: 0.05, anomalyMax: 2.0 },
  dust: { min: 2,   max: 6,   anomalyChance: 0.08, anomalyMax: 20 },
  roof: { min: 1,   max: 4,   anomalyChance: 0.03, anomalyMax: 15 },
  wind: { min: 0.5, max: 1.5, anomalyChance: 0.06, anomalyMax: 0.15 }
};

const THRESHOLDS = {
  gas:  1.0,
  dust: 10,
  roof: 10,
  wind: 0.25
};

let ws = null;
let reconnectTimer = null;
let simulationTimer = null;

const sensors = [];

function generateSensors() {
  const perZone = Math.floor(SENSOR_COUNT / ZONES.length);
  const remainder = SENSOR_COUNT % ZONES.length;

  ZONES.forEach((zone, zi) => {
    const count = perZone + (zi < remainder ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const type = SENSOR_TYPES[i % SENSOR_TYPES.length];
      const idx = sensors.length;
      sensors.push({
        sensor_id: `S${String(idx + 1).padStart(4, '0')}`,
        type,
        name: `${zone.id}_${type}_${Math.floor(i / SENSOR_TYPES.length) + 1}`,
        zone_id: zone.id,
        x: Math.floor(zone.xRange[0] + Math.random() * (zone.xRange[1] - zone.xRange[0])),
        y: Math.floor(zone.yRange[0] + Math.random() * (zone.yRange[1] - zone.yRange[0])),
        lastValue: null
      });
    }
  });

  console.log(`[SENSOR SIM] Generated ${sensors.length} sensors across ${ZONES.length} zones`);
}

function generateValue(sensor) {
  const cfg = BASE_VALUES[sensor.type];
  let value;

  if (Math.random() < cfg.anomalyChance) {
    if (sensor.type === 'wind') {
      value = cfg.anomalyMax + Math.random() * (cfg.min - cfg.anomalyMax);
    } else {
      value = cfg.max + Math.random() * (cfg.anomalyMax - cfg.max);
    }
  } else {
    const base = sensor.lastValue !== null ? sensor.lastValue : (cfg.min + cfg.max) / 2;
    const drift = (cfg.max - cfg.min) * 0.1 * (Math.random() - 0.5);
    value = Math.max(cfg.min * 0.5, Math.min(cfg.max * 1.2, base + drift));
  }

  value = Math.round(value * 100) / 100;
  sensor.lastValue = value;
  return value;
}

function simulateBatch() {
  const now = new Date().toISOString();
  const batch = sensors.map(sensor => ({
    sensor_id: sensor.sensor_id,
    type: sensor.type,
    zone_id: sensor.zone_id,
    value: generateValue(sensor),
    timestamp: now
  }));

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'sensor_data_sim', data: batch }));
  }

  const alertCount = batch.filter(d => {
    if (d.type === 'wind') return d.value < THRESHOLDS[d.type];
    return d.value > THRESHOLDS[d.type];
  }).length;

  if (alertCount > 0) {
    console.log(`[SENSOR SIM] Batch sent: ${batch.length} readings, ${alertCount} threshold violations`);
  }
}

function connect() {
  if (ws) {
    ws.removeAllListeners();
    ws = null;
  }

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log(`[SENSOR SIM] Connected to ${WS_URL}`);
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = setInterval(simulateBatch, INTERVAL_MS);
    simulateBatch();
  });

  ws.on('close', () => {
    console.log('[SENSOR SIM] Disconnected, reconnecting in 3s...');
    if (simulationTimer) clearInterval(simulationTimer);
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[SENSOR SIM] Connection error:', err.message);
  });
}

function start() {
  generateSensors();
  console.log(`[SENSOR SIM] Starting simulation: ${sensors.length} sensors, interval ${INTERVAL_MS}ms`);
  connect();
}

process.on('SIGINT', () => {
  console.log('[SENSOR SIM] Shutting down...');
  if (simulationTimer) clearInterval(simulationTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
});

start();
