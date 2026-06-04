class SensorManager {
    constructor() {
        this.sensors = new Map();
        this.sensorValues = new Map();
        this.sensorStatuses = new Map();
    }

    initSensors(sensorsData) {
        this.sensors.clear();
        sensorsData.forEach(sensor => {
            this.sensors.set(sensor.sensor_id, sensor);
            this.sensorValues.set(sensor.sensor_id, sensor.currentValue || 0);
            this.sensorStatuses.set(sensor.sensor_id, 'normal');
        });
    }

    updateSensorData(dataBatch) {
        dataBatch.forEach(data => {
            this.sensorValues.set(data.sensor_id, data.value);
            this.updateSensorStatus(data);
        });
    }

    updateSensorStatus(data) {
        const config = CONFIG.THRESHOLDS[data.type];
        if (!config) return;

        const { value } = data;
        let status = 'normal';

        if (config.isLower) {
            if (value < config.threshold) {
                status = 'danger';
            } else if (value < config.warning) {
                status = 'warning';
            }
        } else {
            if (value > config.threshold) {
                status = 'danger';
            } else if (value > config.warning) {
                status = 'warning';
            }
        }

        this.sensorStatuses.set(data.sensor_id, status);
    }

    getSensorById(sensorId) {
        return this.sensors.get(sensorId);
    }

    getSensorValue(sensorId) {
        return this.sensorValues.get(sensorId);
    }

    getSensorStatus(sensorId) {
        return this.sensorStatuses.get(sensorId);
    }

    getAllSensors() {
        return Array.from(this.sensors.values());
    }

    getStatuses() {
        return this.sensorStatuses;
    }

    getSensorTypeLabel(type) {
        const labels = {
            gas: '瓦斯浓度',
            dust: '粉尘浓度',
            roof: '顶板位移',
            wind: '风速'
        };
        return labels[type] || type;
    }

    getSensorUnit(type) {
        const units = {
            gas: '%',
            dust: 'mg/m³',
            roof: 'mm',
            wind: 'm/s'
        };
        return units[type] || '';
    }

    getZoneName(zoneId) {
        const zone = CONFIG.ZONES.find(z => z.id === zoneId);
        return zone ? zone.name : zoneId;
    }
}
