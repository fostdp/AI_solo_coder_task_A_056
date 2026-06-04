const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const SIMULATION_INTERVAL = parseInt(process.env.SIMULATION_INTERVAL || '10000');
const ANOMALY_RATE = parseFloat(process.env.ANOMALY_RATE || '0.05');

const tunnelConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/tunnel-config.json'), 'utf8')
);

const SENSOR_BASE_VALUES = {
  gas: { min: 0.1, max: 0.5, unit: '%', anomalyMin: 1.0, anomalyMax: 2.0 },
  dust: { min: 2, max: 6, unit: 'mg/m³', anomalyMin: 10, anomalyMax: 20 },
  roof: { min: 1, max: 4, unit: 'mm', anomalyMin: 10, anomalyMax: 25 },
  wind: { min: 0.5, max: 1.5, unit: 'm/s', anomalyMin: 0.05, anomalyMax: 0.2 }
};

const ZONE_RANGES = [
  { id: 'main_entrance', xRange: [90, 130], yRange: [380, 420] },
  { id: 'tunnel_1', xRange: [200, 600], yRange: [360, 440] },
  { id: 'tunnel_2', xRange: [280, 320], yRange: [450, 700] },
  { id: 'tunnel_2b', xRange: [350, 700], yRange: [630, 700] },
  { id: 'tunnel_3', xRange: [750, 1050], yRange: [230, 380] },
  { id: 'face_1', xRange: [680, 720], yRange: [200, 350] },
  { id: 'face_2', xRange: [680, 720], yRange: [500, 650] },
  { id: 'face_3', xRange: [1030, 1070], yRange: [230, 270] },
  { id: 'face_4', xRange: [480, 520], yRange: [330, 370] }
];

class SensorSimulator {
  constructor() {
    this.ws = null;
    this.sensors = [];
    this.intervalId = null;
    this.reconnectDelay = 5000;
    this.isConnected = false;
    this.connect();
  }

  connect() {
    console.log(`[SensorSimulator] Connecting to ${WS_URL}...`);
    
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      console.log('[SensorSimulator] WebSocket connected');
      this.isConnected = true;
      this.fetchSensors();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (e) {
        console.error('[SensorSimulator] Failed to parse message:', e.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[SensorSimulator] WebSocket disconnected, reconnecting...');
      this.isConnected = false;
      this.stopSimulation();
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error('[SensorSimulator] WebSocket error:', err.message);
    });
  }

  handleMessage(message) {
    if (message.type === 'init') {
      this.sensors = message.data.sensors || [];
      console.log(`[SensorSimulator] Loaded ${this.sensors.length} sensors`);
      this.startSimulation();
    }
  }

  fetchSensors() {
    if (this.sensors.length === 0) {
      this.sensors = this.generateSensors(500);
      console.log(`[SensorSimulator] Generated ${this.sensors.length} sensors`);
      this.startSimulation();
    }
  }

  generateSensors(count) {
    const types = ['gas', 'dust', 'roof', 'wind'];
    const sensors = [];
    const sensorsPerZone = Math.floor(count / ZONE_RANGES.length);

    ZONE_RANGES.forEach((zone, zoneIndex) => {
      for (let i = 0; i < sensorsPerZone; i++) {
        const type = types[(zoneIndex * sensorsPerZone + i) % types.length];
        sensors.push({
          sensor_id: `${type.toUpperCase()}_${zone.id}_${i.toString().padStart(3, '0')}`,
          type: type,
          name: `${this.getSensorTypeName(type)}传感器-${zone.id}-${i}`,
          zone_id: zone.id,
          x: this.randomInRange(zone.xRange[0], zone.xRange[1]),
          y: this.randomInRange(zone.yRange[0], zone.yRange[1])
        });
      }
    });

    return sensors;
  }

  getSensorTypeName(type) {
    const names = { gas: '瓦斯', dust: '粉尘', roof: '顶板', wind: '风速' };
    return names[type] || type;
  }

  randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  generateValue(type) {
    const config = SENSOR_BASE_VALUES[type];
    const isAnomaly = Math.random() < ANOMALY_RATE;

    if (isAnomaly) {
      return parseFloat((type === 'wind' 
        ? this.randomInRange(config.anomalyMin, config.anomalyMax)
        : this.randomInRange(config.anomalyMin, config.anomalyMax)
      ).toFixed(2));
    }

    return parseFloat(this.randomInRange(config.min, config.max).toFixed(2));
  }

  startSimulation() {
    this.stopSimulation();
    console.log(`[SensorSimulator] Starting simulation (${SIMULATION_INTERVAL}ms interval)`);
    this.sendSensorData();
    this.intervalId = setInterval(() => this.sendSensorData(), SIMULATION_INTERVAL);
  }

  stopSimulation() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  sendSensorData() {
    if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const batch = this.sensors.map(sensor => ({
      sensor_id: sensor.sensor_id,
      type: sensor.type,
      zone_id: sensor.zone_id,
      value: this.generateValue(sensor.type),
      timestamp: new Date().toISOString()
    }));

    try {
      this.ws.send(JSON.stringify({
        type: 'sensor_data_sim',
        data: batch
      }));
      console.log(`[SensorSimulator] Sent ${batch.length} sensor readings`);
    } catch (e) {
      console.error('[SensorSimulator] Failed to send data:', e.message);
    }
  }
}

new SensorSimulator();

process.on('SIGINT', () => {
  console.log('[SensorSimulator] Shutting down...');
  process.exit(0);
});
