class MineMonitoringApp {
    constructor() {
        this.ws = null;
        this.tunnelRenderer = null;
        this.sensorManager = new SensorManager();
        this.alertManager = new AlertManager();
        this.personnelTracker = new PersonnelTracker();
        this.powerCutoffController = new PowerCutoffController();
        this.trendChart = null;
        this.selectedSensor = null;
        this.renderScheduled = false;
        
        this.init();
    }

    async init() {
        await MineConfig.load();

        const canvas = document.getElementById('mineCanvas');
        this.tunnelRenderer = new TunnelRenderer(canvas, MineConfig);
        
        const trendCanvas = document.getElementById('trendChart');
        this.trendChart = new TrendChart(trendCanvas);
        
        this.setupModuleCallbacks();
        this.powerCutoffController.renderZoneList();
        this.setupEventListeners();
        this.connectWebSocket();
        this.doFullRender();
        this.startSystemTime();
    }

    setupModuleCallbacks() {
        this.personnelTracker.onMoved((moved) => {
            const success = this.tunnelRenderer.renderIncremental(moved);
            if (!success) {
                this.doFullRender();
            }
        });

        this.powerCutoffController.onPowerChange((powerOffZones, zone_id, status) => {
            this.tunnelRenderer.setPowerOffZones(powerOffZones);
            this.tunnelRenderer.markDirty();
            this.scheduleRender();
        });
    }

    setupEventListeners() {
        const canvas = document.getElementById('mineCanvas');
        canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        document.getElementById('zoomIn').addEventListener('click', () => {
            this.tunnelRenderer.zoomIn();
        });
        
        document.getElementById('zoomOut').addEventListener('click', () => {
            this.tunnelRenderer.zoomOut();
        });
        
        document.getElementById('resetView').addEventListener('click', () => {
            this.tunnelRenderer.resetView();
        });
        
        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });
        
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.closeModal();
            }
        });

        document.addEventListener('click', () => {
            if (!this.alertManager.audioContext) {
                this.alertManager.initAudio();
            }
        }, { once: true });
    }

    connectWebSocket() {
        try {
            this.ws = new WebSocket(MineConfig.WS_URL);
            this.powerCutoffController.setWebSocket(this.ws);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.powerCutoffController.reconcilePowerStatus();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected, retrying...');
                setTimeout(() => this.connectWebSocket(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (e) {
            console.error('Failed to connect WebSocket:', e);
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'init':
                this.handleInit(message.data);
                break;
            case 'sensor_data':
                this.handleSensorData(message.data);
                break;
            case 'alert':
                this.handleAlert(message.data);
                break;
            case 'personnel_locations':
                this.handlePersonnelLocations(message.data);
                break;
            case 'power_status':
                this.handlePowerStatus(message.data);
                break;
            case 'sensor_history':
                this.handleSensorHistory(message.data);
                break;
        }
    }

    handleInit(data) {
        this.sensorManager.initSensors(data.sensors);
        this.personnelTracker.initPersonnel(data.personnel);
        
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => this.alertManager.addAlert(alert, this.powerCutoffController));
        }
        
        document.getElementById('sensorCount').textContent = data.sensors.length;
        this.personnelTracker.updateCount();
    }

    handleSensorData(dataBatch) {
        this.sensorManager.updateSensorData(dataBatch);
        this.tunnelRenderer.markDirty();
        this.scheduleRender();
        
        if (this.selectedSensor) {
            const sensor = this.sensorManager.getSensorById(this.selectedSensor);
            if (sensor) {
                this.updateModalValue(sensor);
            }
        }
    }

    handleAlert(alert) {
        this.alertManager.addAlert(alert, this.powerCutoffController);
        this.tunnelRenderer.markDirty();
        this.scheduleRender();
    }

    handlePersonnelLocations(locations) {
        this.personnelTracker.updateLocations(locations);
    }

    handlePowerStatus(powerStatus) {
        this.powerCutoffController.handleServerPowerStatus(powerStatus);
    }

    handleSensorHistory(data) {
        if (data.sensor_id === this.selectedSensor) {
            const sensor = this.sensorManager.getSensorById(data.sensor_id);
            this.trendChart.setData(data.history, sensor ? sensor.type : null);
        }
    }

    handleCanvasClick(e) {
        if (this.tunnelRenderer.isDragging) return;
        
        const sensor = this.tunnelRenderer.getSensorAtPosition(
            e.clientX, 
            e.clientY, 
            this.sensorManager.getAllSensors()
        );
        
        if (sensor) {
            this.showSensorDetail(sensor);
        }
    }

    showSensorDetail(sensor) {
        this.selectedSensor = sensor.sensor_id;
        
        const status = this.sensorManager.getSensorStatus(sensor.sensor_id);
        const value = this.sensorManager.getSensorValue(sensor.sensor_id);
        
        document.getElementById('modalTitle').textContent = sensor.name;
        document.getElementById('modalSensorId').textContent = sensor.sensor_id;
        document.getElementById('modalSensorName').textContent = sensor.name;
        document.getElementById('modalSensorType').textContent = MineConfig.getSensorTypeLabel(sensor.type);
        document.getElementById('modalSensorZone').textContent = MineConfig.getZoneName(sensor.zone_id);
        
        const valueEl = document.getElementById('modalSensorValue');
        valueEl.textContent = `${value} ${MineConfig.getSensorUnit(sensor.type)}`;
        valueEl.className = `value ${status}`;
        
        document.getElementById('modalOverlay').style.display = 'flex';
        
        this.requestSensorHistory(sensor.sensor_id);
    }

    updateModalValue(sensor) {
        const status = this.sensorManager.getSensorStatus(sensor.sensor_id);
        const value = this.sensorManager.getSensorValue(sensor.sensor_id);
        
        const valueEl = document.getElementById('modalSensorValue');
        valueEl.textContent = `${value} ${MineConfig.getSensorUnit(sensor.type)}`;
        valueEl.className = `value ${status}`;
    }

    requestSensorHistory(sensorId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'get_sensor_history',
                sensor_id: sensorId
            }));
        }
    }

    closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
        this.selectedSensor = null;
    }

    scheduleRender() {
        if (this.renderScheduled) return;
        this.renderScheduled = true;
        
        requestAnimationFrame(() => {
            this.renderScheduled = false;
            this.doFullRender();
        });
    }

    doFullRender() {
        this.tunnelRenderer.render(
            this.sensorManager.getAllSensors(),
            this.sensorManager.getStatuses(),
            this.personnelTracker.getAllPersonnel()
        );
    }

    startSystemTime() {
        const updateTime = () => {
            const now = new Date();
            document.getElementById('systemTime').textContent = now.toLocaleTimeString('zh-CN');
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new MineMonitoringApp();
});
