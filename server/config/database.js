const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'smart_mine_monitoring',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX || '30', 10),
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  query_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const timescaledbConfig = {
  sensorData: {
    chunkTimeInterval: '1 hour',
    retentionPeriod: '30 days',
    compressionThreshold: '7 days',
    compressSegmentBy: 'sensor_id',
    compressOrderBy: 'timestamp DESC'
  },
  personnelLocation: {
    chunkTimeInterval: '1 day',
    retentionPeriod: '7 days',
    compressionThreshold: '3 days',
    compressSegmentBy: 'tag_id',
    compressOrderBy: 'timestamp DESC'
  },
  batchWriteSize: parseInt(process.env.DB_BATCH_SIZE || '5000', 10),
  maxWriteQueueSize: parseInt(process.env.DB_QUEUE_MAX || '50000', 10),
  writeFlushInterval: parseInt(process.env.DB_FLUSH_INTERVAL || '5000', 10)
};

module.exports = { pool, timescaledbConfig };
