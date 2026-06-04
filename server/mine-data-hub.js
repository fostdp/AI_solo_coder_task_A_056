const { pool, timescaledbConfig } = require('./config/database');

const SENSOR_BASE_VALUES = {
  gas: { min: 0.1, max: 0.5, anomalyChance: 0.05 },
  dust: { min: 2, max: 6, anomalyChance: 0.08 },
  roof: { min: 1, max: 4, anomalyChance: 0.03 },
  wind: { min: 0.5, max: 1.5, anomalyChance: 0.06 }
};

const {
  batchWriteSize: BATCH_WRITE_SIZE,
  maxWriteQueueSize: MAX_WRITE_QUEUE_SIZE,
  writeFlushInterval: WRITE_FLUSH_INTERVAL
} = timescaledbConfig;

const DB_RETRY_ATTEMPTS = 5;
const DB_RETRY_DELAY_BASE = 1000;

class MineDataHub {
  constructor() {
    this.sensors = this.generateSensors();
    this.sensorDataHistory = new Map();
    this.writeBuffer = [];
    this.isWriting = false;
    this.writeStats = {
      totalWritten: 0,
      failedAttempts: 0,
      lastWriteTime: null
    };
    this.onData = null;
    this.initHistory();
    this.startBufferFlush();
  }

  generateSensors() {
    const sensors = [];
    const zones = [
      { id: 'main_entrance', xRange: [90, 130], yRange: [380, 420] },
      { id: 'tunnel_1', xRange: [150, 680], yRange: [330, 370] },
      { id: 'tunnel_2', xRange: [280, 320], yRange: [450, 650] },
      { id: 'tunnel_2b', xRange: [350, 680], yRange: [630, 670] },
      { id: 'tunnel_3', xRange: [720, 1050], yRange: [250, 370] },
      { id: 'face_1', xRange: [680, 720], yRange: [200, 320] },
      { id: 'face_2', xRange: [680, 720], yRange: [500, 620] },
      { id: 'face_3', xRange: [1030, 1070], yRange: [230, 270] },
      { id: 'face_4', xRange: [480, 520], yRange: [330, 370] }
    ];

    const types = ['gas', 'dust', 'roof', 'wind'];
    let sensorId = 1;

    zones.forEach(zone => {
      const sensorsPerZone = 50;
      for (let i = 0; i < sensorsPerZone; i++) {
        const type = types[i % 4];
        const prefix = type[0].toUpperCase();
        sensors.push({
          sensor_id: `${prefix}${String(sensorId).padStart(3, '0')}`,
          type,
          name: `${this.getTypeName(type)}传感器-${zone.id}-${i + 1}`,
          zone_id: zone.id,
          x: zone.xRange[0] + Math.random() * (zone.xRange[1] - zone.xRange[0]),
          y: zone.yRange[0] + Math.random() * (zone.yRange[1] - zone.yRange[0]),
          currentValue: SENSOR_BASE_VALUES[type].min +
            Math.random() * (SENSOR_BASE_VALUES[type].max - SENSOR_BASE_VALUES[type].min)
        });
        sensorId++;
      }
    });

    return sensors.slice(0, 500);
  }

  getTypeName(type) {
    const names = { gas: '瓦斯', dust: '粉尘', roof: '顶板位移', wind: '风速' };
    return names[type] || type;
  }

  initHistory() {
    this.sensors.forEach(sensor => {
      const history = [];
      const now = Date.now();
      for (let i = 360; i >= 0; i--) {
        history.push({
          value: this.generateValue(sensor.type, false),
          timestamp: new Date(now - i * 10000).toISOString()
        });
      }
      this.sensorDataHistory.set(sensor.sensor_id, history);
    });
  }

  generateValue(type, forceAnomaly = false) {
    const config = SENSOR_BASE_VALUES[type];
    const isAnomaly = forceAnomaly || Math.random() < config.anomalyChance;

    if (isAnomaly) {
      switch (type) {
        case 'gas':
          return 0.8 + Math.random() * 0.8;
        case 'dust':
          return 8 + Math.random() * 6;
        case 'roof':
          return 7 + Math.random() * 8;
        case 'wind':
          return Math.random() * 0.4;
        default:
          return config.min + Math.random() * (config.max - config.min);
      }
    }

    return config.min + Math.random() * (config.max - config.min);
  }

  startSimulation() {
    setInterval(() => this.simulateData(), 10000);
    this.simulateData();
  }

  async simulateData() {
    const timestamp = new Date().toISOString();
    const sensorDataBatch = [];

    this.sensors.forEach(sensor => {
      const value = this.generateValue(sensor.type);
      sensor.currentValue = value;

      const dataPoint = {
        sensor_id: sensor.sensor_id,
        type: sensor.type,
        zone_id: sensor.zone_id,
        value: Math.round(value * 1000) / 1000,
        timestamp
      };

      sensorDataBatch.push(dataPoint);

      const history = this.sensorDataHistory.get(sensor.sensor_id) || [];
      history.push({ value: dataPoint.value, timestamp });
      if (history.length > 360) history.shift();
      this.sensorDataHistory.set(sensor.sensor_id, history);
    });

    this.bufferWrite(sensorDataBatch);

    if (this.onData) {
      this.onData(sensorDataBatch);
    }
  }

  bufferWrite(dataBatch) {
    if (this.writeBuffer.length >= MAX_WRITE_QUEUE_SIZE) {
      const dropCount = Math.floor(MAX_WRITE_QUEUE_SIZE * 0.1);
      this.writeBuffer.splice(0, dropCount);
      console.warn(`[DB BUFFER] Queue overflow, dropped ${dropCount} oldest records`);
    }

    this.writeBuffer.push(...dataBatch);

    if (this.writeBuffer.length >= BATCH_WRITE_SIZE && !this.isWriting) {
      this.flushBuffer();
    }
  }

  startBufferFlush() {
    setInterval(() => {
      if (this.writeBuffer.length > 0 && !this.isWriting) {
        this.flushBuffer();
      }
    }, WRITE_FLUSH_INTERVAL);
  }

  async flushBuffer() {
    if (this.writeBuffer.length === 0 || this.isWriting) return;

    this.isWriting = true;

    const dataToWrite = this.writeBuffer.splice(0,
      Math.min(this.writeBuffer.length, BATCH_WRITE_SIZE));

    try {
      await this.saveToDatabaseWithRetry(dataToWrite);
      this.writeStats.totalWritten += dataToWrite.length;
      this.writeStats.lastWriteTime = Date.now();
    } catch (err) {
      this.writeStats.failedAttempts++;
      console.error(`[DB WRITE] Failed after retries, re-buffering ${dataToWrite.length} records:`, err.message);
      this.writeBuffer.unshift(...dataToWrite);
    } finally {
      this.isWriting = false;

      if (this.writeBuffer.length >= BATCH_WRITE_SIZE) {
        setImmediate(() => this.flushBuffer());
      }
    }
  }

  async saveToDatabaseWithRetry(dataBatch) {
    for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.saveToDatabase(dataBatch);
        return;
      } catch (err) {
        if (attempt === DB_RETRY_ATTEMPTS) {
          throw err;
        }
        const delay = DB_RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        console.warn(`[DB RETRY] Attempt ${attempt}/${DB_RETRY_ATTEMPTS} failed, retry in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async saveToDatabase(dataBatch) {
    if (dataBatch.length === 0) return;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const values = [];
      const placeholders = [];

      let i = 1;
      dataBatch.forEach(data => {
        placeholders.push(`($${i}, $${i+1}, $${i+2})`);
        values.push(data.timestamp, data.sensor_id, data.value);
        i += 3;
      });

      await client.query(
        `INSERT INTO sensor_data (timestamp, sensor_id, value) VALUES ${placeholders.join(', ')}`,
        values
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  getSensorHistory(sensorId) {
    return this.sensorDataHistory.get(sensorId) || [];
  }

  getAllSensors() {
    return this.sensors.map(s => ({
      sensor_id: s.sensor_id,
      type: s.type,
      name: s.name,
      zone_id: s.zone_id,
      x: s.x,
      y: s.y,
      currentValue: s.currentValue
    }));
  }

  getSensorById(sensorId) {
    return this.sensors.find(s => s.sensor_id === sensorId);
  }

  processExternalBatch(batch) {
    const timestamp = new Date().toISOString();
    const dataBatch = [];

    batch.forEach(data => {
      const sensor = this.sensors.find(s => s.sensor_id === data.sensor_id);
      if (sensor) {
        sensor.currentValue = data.value;
      }

      const dataPoint = {
        sensor_id: data.sensor_id,
        type: data.type,
        zone_id: data.zone_id,
        value: data.value,
        timestamp: data.timestamp || timestamp
      };

      dataBatch.push(dataPoint);

      const history = this.sensorDataHistory.get(data.sensor_id) || [];
      history.push({ value: data.value, timestamp: dataPoint.timestamp });
      if (history.length > 360) history.shift();
      this.sensorDataHistory.set(data.sensor_id, history);
    });

    this.bufferWrite(dataBatch);

    if (this.onData) {
      this.onData(dataBatch);
    }
  }
}

module.exports = MineDataHub;
