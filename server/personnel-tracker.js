const { pool, timescaledbConfig } = require('./config/database');

const PERSONNEL_BATCH_SIZE = 50;
const PERSONNEL_FLUSH_INTERVAL = 10000;
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_BASE = 500;

const MOVEMENT_PATHS = {
  P001: [
    { x: 150, y: 400, zone: 'main_entrance' },
    { x: 250, y: 400, zone: 'tunnel_1' },
    { x: 400, y: 375, zone: 'tunnel_1' },
    { x: 550, y: 350, zone: 'tunnel_1' },
    { x: 650, y: 350, zone: 'tunnel_1' },
    { x: 700, y: 280, zone: 'face_1' }
  ],
  P002: [
    { x: 150, y: 400, zone: 'main_entrance' },
    { x: 250, y: 400, zone: 'tunnel_1' },
    { x: 300, y: 500, zone: 'tunnel_2' },
    { x: 400, y: 625, zone: 'tunnel_2' },
    { x: 550, y: 650, zone: 'tunnel_2' },
    { x: 700, y: 580, zone: 'face_2' }
  ],
  P003: [
    { x: 150, y: 400, zone: 'main_entrance' },
    { x: 300, y: 400, zone: 'tunnel_1' },
    { x: 500, y: 350, zone: 'tunnel_1' },
    { x: 500, y: 350, zone: 'face_4' }
  ],
  P004: [
    { x: 100, y: 400, zone: 'main_entrance' },
    { x: 200, y: 400, zone: 'tunnel_1' },
    { x: 500, y: 100, zone: 'air_shaft' },
    { x: 500, y: 350, zone: 'tunnel_1' }
  ],
  P005: [
    { x: 150, y: 400, zone: 'main_entrance' },
    { x: 300, y: 400, zone: 'tunnel_1' },
    { x: 300, y: 550, zone: 'tunnel_2' },
    { x: 600, y: 650, zone: 'tunnel_2' },
    { x: 700, y: 620, zone: 'face_2' }
  ],
  P006: [
    { x: 100, y: 400, zone: 'main_entrance' },
    { x: 400, y: 375, zone: 'tunnel_1' },
    { x: 700, y: 350, zone: 'tunnel_1' },
    { x: 900, y: 350, zone: 'tunnel_3' },
    { x: 1000, y: 290, zone: 'tunnel_3' }
  ],
  P007: [
    { x: 150, y: 400, zone: 'main_entrance' },
    { x: 300, y: 400, zone: 'tunnel_1' },
    { x: 550, y: 350, zone: 'tunnel_1' },
    { x: 700, y: 350, zone: 'tunnel_1' },
    { x: 800, y: 350, zone: 'tunnel_3' },
    { x: 950, y: 320, zone: 'tunnel_3' },
    { x: 1050, y: 250, zone: 'face_3' }
  ],
  P008: [
    { x: 100, y: 400, zone: 'main_entrance' },
    { x: 200, y: 400, zone: 'tunnel_1' },
    { x: 300, y: 500, zone: 'tunnel_2' },
    { x: 450, y: 637, zone: 'tunnel_2' },
    { x: 650, y: 650, zone: 'tunnel_2' }
  ]
};

class PersonnelTracker {
  constructor(pushService) {
    this.pushService = pushService;
    this.personnel = new Map();
    this.prevPositions = new Map();
    this.movementIndex = new Map();
    this.locationBuffer = [];
    this.isWriting = false;
    this.initPersonnel();
    this.startBufferFlush();
  }

  initPersonnel() {
    const personnelList = [
      { tag_id: 'P001', name: '张三', department: '掘进一队' },
      { tag_id: 'P002', name: '李四', department: '掘进一队' },
      { tag_id: 'P003', name: '王五', department: '掘进二队' },
      { tag_id: 'P004', name: '赵六', department: '通风队' },
      { tag_id: 'P005', name: '钱七', department: '安全科' },
      { tag_id: 'P006', name: '孙八', department: '机电队' },
      { tag_id: 'P007', name: '周九', department: '掘进二队' },
      { tag_id: 'P008', name: '吴十', department: '运输队' }
    ];

    personnelList.forEach(p => {
      this.personnel.set(p.tag_id, {
        ...p,
        x: 100,
        y: 400,
        zone_id: 'main_entrance',
        status: 'online',
        last_update: new Date().toISOString()
      });
      this.movementIndex.set(p.tag_id, 0);
    });
  }

  startTracking() {
    setInterval(() => this.updatePositions(), 2000);
  }

  updatePositions() {
    const movedPersonnel = [];

    this.personnel.forEach((person, tagId) => {
      const path = MOVEMENT_PATHS[tagId];
      if (!path) return;

      const idx = this.movementIndex.get(tagId);
      const target = path[idx % path.length];
      
      const currentPos = this.personnel.get(tagId);
      const dx = target.x - currentPos.x;
      const dy = target.y - currentPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const prevX = this.prevPositions.get(tagId + '_x');
      const prevY = this.prevPositions.get(tagId + '_y');

      if (distance < 10) {
        this.movementIndex.set(tagId, idx + 1);
      } else {
        const speed = 8;
        const ratio = Math.min(speed / distance, 1);
        currentPos.x += dx * ratio;
        currentPos.y += dy * ratio;
        currentPos.zone_id = target.zone;
        currentPos.last_update = new Date().toISOString();
        
        this.personnel.set(tagId, currentPos);
      }

      if (prevX !== currentPos.x || prevY !== currentPos.y) {
        movedPersonnel.push({
          tag_id: tagId,
          x: currentPos.x,
          y: currentPos.y,
          zone_id: currentPos.zone_id,
          last_update: currentPos.last_update
        });
        this.prevPositions.set(tagId + '_x', currentPos.x);
        this.prevPositions.set(tagId + '_y', currentPos.y);
      }
    });

    if (movedPersonnel.length > 0) {
      this.broadcastPositions(movedPersonnel);
      this.bufferSave(movedPersonnel);
    }
  }

  broadcastPositions(movedPersonnel) {
    this.pushService.broadcastPersonnelLocations(movedPersonnel);
  }

  startBufferFlush() {
    setInterval(() => {
      if (this.locationBuffer.length > 0 && !this.isWriting) {
        this.flushLocationBuffer();
      }
    }, PERSONNEL_FLUSH_INTERVAL);
  }

  bufferSave(movedPersonnel) {
    const timestamp = new Date().toISOString();
    movedPersonnel.forEach(p => {
      this.locationBuffer.push({ ...p, timestamp });
    });
    
    if (this.locationBuffer.length >= PERSONNEL_BATCH_SIZE && !this.isWriting) {
      this.flushLocationBuffer();
    }
  }

  async flushLocationBuffer() {
    if (this.locationBuffer.length === 0 || this.isWriting) return;
    
    this.isWriting = true;
    
    const dataToWrite = this.locationBuffer.splice(0, 
      Math.min(this.locationBuffer.length, PERSONNEL_BATCH_SIZE));
    
    try {
      await this.savePositionsWithRetry(dataToWrite);
    } catch (err) {
      console.error('[PERSONNEL DB] Failed to save locations:', err.message);
      this.locationBuffer.unshift(...dataToWrite);
    } finally {
      this.isWriting = false;
    }
  }

  async savePositionsWithRetry(dataBatch) {
    for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.savePositions(dataBatch);
        return;
      } catch (err) {
        if (attempt === DB_RETRY_ATTEMPTS) {
          throw err;
        }
        const delay = DB_RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async savePositions(dataBatch) {
    if (dataBatch.length === 0) return;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const values = [];
      const placeholders = [];
      
      let i = 1;
      dataBatch.forEach((p) => {
        placeholders.push(`($${i}, $${i+1}, $${i+2}, $${i+3}, $${i+4})`);
        values.push(p.timestamp, p.tag_id, p.zone_id, p.x, p.y);
        i += 5;
      });

      await client.query(
        `INSERT INTO personnel_location (timestamp, tag_id, zone_id, x, y) VALUES ${placeholders.join(', ')}`,
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

  getAllPersonnel() {
    return Array.from(this.personnel.values());
  }

  getPersonnelByTag(tagId) {
    return this.personnel.get(tagId);
  }

  updateFromExternal(locations) {
    const movedPersonnel = [];

    locations.forEach(loc => {
      const existing = this.personnel.get(loc.tag_id);
      if (existing) {
        const dx = Math.abs(existing.x - loc.x);
        const dy = Math.abs(existing.y - loc.y);
        if (dx > 0.5 || dy > 0.5) {
          existing.x = loc.x;
          existing.y = loc.y;
          existing.zone_id = loc.zone_id;
          existing.last_update = loc.last_update || new Date().toISOString();
          this.personnel.set(loc.tag_id, existing);
          movedPersonnel.push({
            tag_id: loc.tag_id,
            x: loc.x,
            y: loc.y,
            zone_id: loc.zone_id,
            last_update: existing.last_update
          });
        }
      } else {
        this.personnel.set(loc.tag_id, {
          tag_id: loc.tag_id,
          name: loc.name || loc.tag_id,
          department: loc.department || '',
          x: loc.x,
          y: loc.y,
          zone_id: loc.zone_id,
          status: 'online',
          last_update: loc.last_update || new Date().toISOString()
        });
        movedPersonnel.push({
          tag_id: loc.tag_id,
          x: loc.x,
          y: loc.y,
          zone_id: loc.zone_id,
          last_update: loc.last_update || new Date().toISOString()
        });
      }
    });

    if (movedPersonnel.length > 0) {
      this.broadcastPositions(movedPersonnel);
      this.bufferSave(movedPersonnel);
    }
  }
}

module.exports = PersonnelTracker;
