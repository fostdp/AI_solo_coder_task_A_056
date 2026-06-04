const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const PERSONNEL_COUNT = parseInt(process.env.PERSONNEL_COUNT || '8', 10);
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '2000', 10);

const PERSONNEL_DATA = [
  { tag_id: 'P001', name: '张三', department: '掘进一队' },
  { tag_id: 'P002', name: '李四', department: '掘进一队' },
  { tag_id: 'P003', name: '王五', department: '掘进二队' },
  { tag_id: 'P004', name: '赵六', department: '通风队' },
  { tag_id: 'P005', name: '钱七', department: '安全科' },
  { tag_id: 'P006', name: '孙八', department: '机电队' },
  { tag_id: 'P007', name: '周九', department: '掘进二队' },
  { tag_id: 'P008', name: '吴十', department: '运输队' }
];

const MOVEMENT_PATHS = [
  { zones: ['main_entrance', 'tunnel_1', 'face_1'], points: [[100,400],[300,400],[500,350],[700,350],[700,200]] },
  { zones: ['main_entrance', 'tunnel_1', 'face_4'], points: [[100,400],[300,400],[500,350],[500,350]] },
  { zones: ['main_entrance', 'tunnel_2', 'face_2'], points: [[100,400],[300,400],[300,600],[500,650],[700,650],[700,500]] },
  { zones: ['main_entrance', 'tunnel_1', 'tunnel_3'], points: [[100,400],[300,400],[500,350],[700,350],[900,350],[1050,250]] },
  { zones: ['main_entrance', 'tunnel_1', 'air_shaft'], points: [[100,400],[300,400],[500,350],[500,100]] },
  { zones: ['main_entrance', 'tunnel_1', 'face_1', 'face_4'], points: [[100,400],[300,400],[500,350],[700,350],[700,200],[700,350],[500,350]] },
  { zones: ['main_entrance', 'tunnel_2'], points: [[100,400],[300,400],[300,600],[500,650]] },
  { zones: ['main_entrance', 'tunnel_1'], points: [[100,400],[300,400],[500,350]] }
];

let ws = null;
let reconnectTimer = null;
let simulationTimer = null;

const personnel = [];

function initPersonnel() {
  const count = Math.min(PERSONNEL_COUNT, PERSONNEL_DATA.length, MOVEMENT_PATHS.length);
  for (let i = 0; i < count; i++) {
    const path = MOVEMENT_PATHS[i];
    personnel.push({
      ...PERSONNEL_DATA[i],
      path: path.points,
      zones: path.zones,
      pathIndex: 0,
      direction: 1,
      progress: 0,
      speed: 0.02 + Math.random() * 0.03,
      x: path.points[0][0],
      y: path.points[0][1],
      currentZone: path.zones[0]
    });
  }
  console.log(`[PERSONNEL SIM] Initialized ${personnel.length} personnel`);
}

function updatePositions() {
  personnel.forEach(person => {
    const path = person.path;
    const nextIdx = person.pathIndex + person.direction;

    if (nextIdx >= path.length || nextIdx < 0) {
      person.direction *= -1;
      return;
    }

    person.progress += person.speed;

    if (person.progress >= 1.0) {
      person.progress = 0;
      person.pathIndex = nextIdx;
      
      if (person.pathIndex >= path.length - 1 || person.pathIndex <= 0) {
        person.direction *= -1;
      }
    }

    const current = path[person.pathIndex];
    const next = path[Math.min(person.pathIndex + person.direction, path.length - 1)];
    
    const t = person.progress;
    person.x = Math.round((current[0] + (next[0] - current[0]) * t) * 10) / 10;
    person.y = Math.round((current[1] + (next[1] - current[1]) * t) * 10) / 10;

    const segIdx = Math.min(person.pathIndex, person.zones.length - 1);
    person.currentZone = person.zones[segIdx];
  });
}

function broadcastPositions() {
  updatePositions();

  const locations = personnel.map(person => ({
    tag_id: person.tag_id,
    name: person.name,
    department: person.department,
    zone_id: person.currentZone,
    x: person.x,
    y: person.y,
    last_update: new Date().toISOString()
  }));

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'personnel_locations_sim', data: locations }));
  }
}

function connect() {
  if (ws) {
    ws.removeAllListeners();
    ws = null;
  }

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log(`[PERSONNEL SIM] Connected to ${WS_URL}`);
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = setInterval(broadcastPositions, INTERVAL_MS);
    broadcastPositions();
  });

  ws.on('close', () => {
    console.log('[PERSONNEL SIM] Disconnected, reconnecting in 3s...');
    if (simulationTimer) clearInterval(simulationTimer);
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[PERSONNEL SIM] Connection error:', err.message);
  });
}

function start() {
  initPersonnel();
  console.log(`[PERSONNEL SIM] Starting simulation: ${personnel.length} personnel, interval ${INTERVAL_MS}ms`);
  connect();
}

process.on('SIGINT', () => {
  console.log('[PERSONNEL SIM] Shutting down...');
  if (simulationTimer) clearInterval(simulationTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
});

start();
