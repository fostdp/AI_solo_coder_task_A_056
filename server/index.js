const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const MinePushService = require('./mine-push-service');
const EmergencyController = require('./emergency-controller');
const SafetyAlarmEngine = require('./safety-alarm-engine');
const MineDataHub = require('./mine-data-hub');
const PersonnelTracker = require('./personnel-tracker');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const tunnelConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../config/tunnel-config.json'), 'utf8')
);

const pushService = new MinePushService();
const emergencyController = new EmergencyController();
const alarmEngine = new SafetyAlarmEngine();
const dataHub = new MineDataHub();
const personnelTracker = new PersonnelTracker(pushService);

emergencyController.onPowerStatusChange = (status) => {
  pushService.broadcastPowerStatus(status);
};

alarmEngine.onAlert = (alert) => {
  pushService.broadcastAlert(alert);
  if (alert.power_cut) {
    emergencyController.cutPower(alert.zone_id, 'gas_alert');
  }
};

dataHub.onData = (batch) => {
  pushService.broadcastSensorData(batch);
  alarmEngine.checkBatch(batch);
};

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  pushService.addClient(ws);

  pushService.broadcastInit({
    sensors: dataHub.getAllSensors(),
    personnel: personnelTracker.getAllPersonnel(),
    alerts: alarmEngine.getActiveAlerts()
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'get_sensor_history') {
        const history = dataHub.getSensorHistory(data.sensor_id);
        ws.send(JSON.stringify({
          type: 'sensor_history',
          data: {
            sensor_id: data.sensor_id,
            history
          }
        }));
      }

      if (data.type === 'power_cut_ack') {
        emergencyController.handlePowerCutAck(data.commandId);
      }

      if (data.type === 'restore_power') {
        emergencyController.restorePower(data.zone_id);
      }

      if (data.type === 'sensor_data_sim') {
        dataHub.processExternalBatch(data.data);
      }

      if (data.type === 'personnel_locations_sim') {
        personnelTracker.updateFromExternal(data.data);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    pushService.removeClient(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    pushService.removeClient(ws);
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    tunnels: tunnelConfig.tunnels || [],
    zones: (tunnelConfig.tunnels || []).map(t => ({ id: t.id, name: t.name })),
    sensorTypes: tunnelConfig.sensorTypes || {}
  });
});

app.get('/api/sensors', (req, res) => {
  res.json(dataHub.getAllSensors());
});

app.get('/api/sensors/:id/history', (req, res) => {
  const history = dataHub.getSensorHistory(req.params.id);
  res.json({ sensor_id: req.params.id, history });
});

app.get('/api/personnel', (req, res) => {
  res.json(personnelTracker.getAllPersonnel());
});

app.get('/api/alerts', (req, res) => {
  res.json(alarmEngine.getActiveAlerts());
});

app.post('/api/zones/:id/restore-power', (req, res) => {
  emergencyController.restorePower(req.params.id);
  res.json({ success: true, message: `Zone ${req.params.id} power restored` });
});

dataHub.startSimulation();
personnelTracker.startTracking();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`Monitoring ${dataHub.getAllSensors().length} sensors`);
});
