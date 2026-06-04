class MinePushService {
  constructor() {
    this.wsClients = new Set();
  }

  addClient(ws) {
    this.wsClients.add(ws);
  }

  removeClient(ws) {
    this.wsClients.delete(ws);
  }

  broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    this.wsClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  broadcastSensorData(batch) {
    this.broadcast('sensor_data', batch);
  }

  broadcastAlert(alert) {
    this.broadcast('alert', alert);
  }

  broadcastPowerStatus(status) {
    this.broadcast('power_status', status);
  }

  broadcastPersonnelLocations(locations) {
    const message = JSON.stringify({ type: 'personnel_locations', data: locations, incremental: true });
    this.wsClients.forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  broadcastInit(data) {
    this.broadcast('init', data);
  }
}

module.exports = MinePushService;
