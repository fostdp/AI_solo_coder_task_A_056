const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL || '2000');

const PERSONNEL_LIST = [
  { tag_id: 'P001', name: '张三', department: '掘进一队' },
  { tag_id: 'P002', name: '李四', department: '掘进一队' },
  { tag_id: 'P003', name: '王五', department: '掘进二队' },
  { tag_id: 'P004', name: '赵六', department: '通风队' },
  { tag_id: 'P005', name: '钱七', department: '安全科' },
  { tag_id: 'P006', name: '孙八', department: '机电队' },
  { tag_id: 'P007', name: '周九', department: '掘进二队' },
  { tag_id: 'P008', name: '吴十', department: '运输队' }
];

const ZONE_PATHS = {
  'P001': [
    { zone: 'tunnel_1', x: 200, y: 400 },
    { zone: 'face_1', x: 700, y: 250 },
    { zone: 'face_1', x: 700, y: 300 },
    { zone: 'tunnel_1', x: 400, y: 380 }
  ],
  'P002': [
    { zone: 'tunnel_1', x: 300, y: 390 },
    { zone: 'face_4', x: 500, y: 350 },
    { zone: 'face_4', x: 510, y: 340 },
    { zone: 'tunnel_1', x: 350, y: 395 }
  ],
  'P003': [
    { zone: 'tunnel_2', x: 300, y: 550 },
    { zone: 'face_2', x: 700, y: 550 },
    { zone: 'face_2', x: 710, y: 580 },
    { zone: 'tunnel_2', x: 310, y: 540 }
  ],
  'P004': [
    { zone: 'tunnel_1', x: 450, y: 370 },
    { zone: 'tunnel_3', x: 850, y: 300 },
    { zone: 'air_shaft', x: 500, y: 100 },
    { zone: 'tunnel_1', x: 500, y: 360 }
  ],
  'P005': [
    { zone: 'main_entrance', x: 110, y: 400 },
    { zone: 'tunnel_1', x: 300, y: 390 },
    { zone: 'tunnel_2', x: 300, y: 600 },
    { zone: 'main_entrance', x: 100, y: 410 }
  ],
  'P006': [
    { zone: 'tunnel_1', x: 600, y: 360 },
    { zone: 'face_1', x: 690, y: 280 },
    { zone: 'tunnel_3', x: 1000, y: 250 },
    { zone: 'face_3', x: 1050, y: 250 }
  ],
  'P007': [
    { zone: 'tunnel_2', x: 500, y: 650 },
    { zone: 'tunnel_2b', x: 650, y: 655 },
    { zone: 'face_2', x: 700, y: 580 },
    { zone: 'tunnel_2b', x: 550, y: 645 }
  ],
  'P008': [
    { zone: 'main_entrance', x: 105, y: 395 },
    { zone: 'tunnel_1', x: 250, y: 400 },
    { zone: 'tunnel_2', x: 300, y: 500 },
    { zone: 'tunnel_2b', x: 450, y: 660 }
  ]
};

class PersonnelSimulator {
  constructor() {
    this.ws = null;
    this.personnel = new Map();
    this.personnelPaths = new Map();
    this.intervalId = null;
    this.reconnectDelay = 5000;
    this.isConnected = false;
    this.initPersonnel();
    this.connect();
  }

  initPersonnel() {
    PERSONNEL_LIST.forEach(p => {
      const path = ZONE_PATHS[p.tag_id] || ZONE_PATHS['P001'];
      this.personnel.set(p.tag_id, {
        ...p,
        status: 'online',
        x: path[0].x,
        y: path[0].y,
        zone_id: path[0].zone,
        last_update: new Date().toISOString()
      });
      this.personnelPaths.set(p.tag_id, {
        path: path,
        currentIndex: 0,
        progress: 0
      });
    });
  }

  connect() {
    console.log(`[PersonnelSimulator] Connecting to ${WS_URL}...`);
    
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      console.log('[PersonnelSimulator] WebSocket connected');
      this.isConnected = true;
      this.startSimulation();
    });

    this.ws.on('close', () => {
      console.log('[PersonnelSimulator] WebSocket disconnected, reconnecting...');
      this.isConnected = false;
      this.stopSimulation();
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error('[PersonnelSimulator] WebSocket error:', err.message);
    });
  }

  startSimulation() {
    this.stopSimulation();
    console.log(`[PersonnelSimulator] Starting simulation (${UPDATE_INTERVAL}ms interval)`);
    this.sendPositions();
    this.intervalId = setInterval(() => this.sendPositions(), UPDATE_INTERVAL);
  }

  stopSimulation() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updatePositions() {
    this.personnel.forEach((person, tagId) => {
      const pathInfo = this.personnelPaths.get(tagId);
      if (!pathInfo) return;

      pathInfo.progress += 0.1;

      if (pathInfo.progress >= 1) {
        pathInfo.progress = 0;
        pathInfo.currentIndex = (pathInfo.currentIndex + 1) % pathInfo.path.length;
      }

      const currentPoint = pathInfo.path[pathInfo.currentIndex];
      const nextIndex = (pathInfo.currentIndex + 1) % pathInfo.path.length;
      const nextPoint = pathInfo.path[nextIndex];

      const newX = currentPoint.x + (nextPoint.x - currentPoint.x) * pathInfo.progress;
      const newY = currentPoint.y + (nextPoint.y - currentPoint.y) * pathInfo.progress;

      person.x = Math.round(newX * 10) / 10;
      person.y = Math.round(newY * 10) / 10;
      person.zone_id = pathInfo.progress < 0.5 ? currentPoint.zone : nextPoint.zone;
      person.last_update = new Date().toISOString();
    });
  }

  sendPositions() {
    if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.updatePositions();

    const locations = Array.from(this.personnel.values());

    try {
      this.ws.send(JSON.stringify({
        type: 'personnel_locations_sim',
        data: locations,
        incremental: true
      }));
      console.log(`[PersonnelSimulator] Sent ${locations.length} personnel locations`);
    } catch (e) {
      console.error('[PersonnelSimulator] Failed to send locations:', e.message);
    }
  }
}

new PersonnelSimulator();

process.on('SIGINT', () => {
  console.log('[PersonnelSimulator] Shutting down...');
  process.exit(0);
});
