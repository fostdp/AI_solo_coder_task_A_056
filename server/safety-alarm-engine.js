const { pool } = require('./config/database');

const ALERT_THRESHOLDS = {
  gas: { threshold: 1.0, warning: 0.8, name: '瓦斯浓度超限' },
  dust: { threshold: 10, warning: 8, name: '粉尘浓度超标' },
  roof: { threshold: 10, warning: 7, name: '顶板位移异常' },
  wind: { threshold: 0.25, warning: 0.4, name: '通风不足', isLower: true }
};

class SafetyAlarmEngine {
  constructor() {
    this.activeAlerts = new Map();
    this.onAlert = null;
  }

  checkBatch(batch) {
    batch.forEach(dataPoint => {
      this.checkSensorData(dataPoint);
    });
  }

  async checkSensorData(sensorData) {
    const { sensor_id, type, value, zone_id } = sensorData;
    const config = ALERT_THRESHOLDS[type];
    if (!config) return null;

    const isAlert = config.isLower
      ? value < config.threshold
      : value > config.threshold;
    const isWarning = config.isLower
      ? value < config.warning
      : value > config.warning;

    if (isAlert) {
      return this.createAlert(sensor_id, type, value, zone_id, 'danger', config);
    } else if (isWarning) {
      return this.createAlert(sensor_id, type, value, zone_id, 'warning', config);
    } else {
      this.clearAlert(sensor_id);
      return null;
    }
  }

  async createAlert(sensor_id, type, value, zone_id, level, config) {
    const alertKey = `${sensor_id}_${type}`;

    if (this.activeAlerts.has(alertKey)) {
      const existing = this.activeAlerts.get(alertKey);
      if (existing.level === level && existing.value === value) {
        return null;
      }
    }

    const message = level === 'danger'
      ? `${config.name} - 当前值: ${value}${this.getUnit(type)}, 阈值: ${config.threshold}${this.getUnit(type)}`
      : `${config.name}预警 - 当前值: ${value}${this.getUnit(type)}`;

    const alert = {
      id: Date.now(),
      alert_type: type,
      level,
      sensor_id,
      zone_id,
      message,
      value,
      threshold: config.threshold,
      status: 'active',
      power_cut: false,
      created_at: new Date().toISOString()
    };

    if (type === 'gas' && level === 'danger') {
      alert.power_cut = true;
      alert.message += ' [已自动切断该区域电源]';
    }

    try {
      await pool.query(
        `INSERT INTO alerts (alert_type, level, sensor_id, zone_id, message, value, threshold, power_cut)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [alert.alert_type, alert.level, alert.sensor_id, alert.zone_id,
         alert.message, alert.value, alert.threshold, alert.power_cut]
      );
    } catch (err) {
      console.error('Failed to save alert:', err);
    }

    this.activeAlerts.set(alertKey, alert);

    if (this.onAlert) {
      this.onAlert(alert);
    }

    return alert;
  }

  clearAlert(sensor_id) {
    const types = Object.keys(ALERT_THRESHOLDS);
    types.forEach(type => {
      const key = `${sensor_id}_${type}`;
      if (this.activeAlerts.has(key)) {
        this.activeAlerts.delete(key);
      }
    });
  }

  getUnit(type) {
    const units = {
      gas: '%',
      dust: 'mg/m³',
      roof: 'mm',
      wind: 'm/s'
    };
    return units[type] || '';
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }
}

module.exports = SafetyAlarmEngine;
