const { pool } = require('./config/database');

const POWER_CUT_ACK_TIMEOUT = 5000;
const POWER_CUT_MAX_RETRIES = 5;
const POWER_CUT_RETRY_INTERVAL = 2000;
const POWER_CUT_LOCAL_EXECUTION = true;

class EmergencyController {
  constructor() {
    this.zonePowerStatus = new Map();
    this.pendingPowerCuts = new Map();
    this.onPowerStatusChange = null;
    this.startRetryTimer();
  }

  startRetryTimer() {
    setInterval(() => this.retryPendingPowerCuts(), POWER_CUT_RETRY_INTERVAL);
  }

  async cutPower(zone_id, reason = 'gas_alert') {
    if (this.zonePowerStatus.get(zone_id) === 'off') return;

    this.zonePowerStatus.set(zone_id, 'off');

    const commandId = `pc_${zone_id}_${Date.now()}`;

    try {
      await Promise.all([
        pool.query(
          `UPDATE zones SET power_status = 'off', last_power_change = CURRENT_TIMESTAMP WHERE zone_id = $1`,
          [zone_id]
        ),
        pool.query(
          `INSERT INTO power_commands (command_id, zone_id, status, source, reason, retries)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [commandId, zone_id, 'off', 'alert_engine', reason, 0]
        )
      ]);
    } catch (err) {
      console.error('Failed to update power status:', err);
    }

    console.log(`[POWER CUT] Zone ${zone_id} power has been cut due to ${reason}!`);

    this.pendingPowerCuts.set(commandId, {
      zone_id,
      status: 'off',
      commandId,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: POWER_CUT_MAX_RETRIES,
      acked: false,
      createdAt: Date.now(),
      reason
    });

    this.sendPowerCutCommand(commandId, zone_id, 'off');
  }

  sendPowerCutCommand(commandId, zone_id, status) {
    const command = {
      zone_id,
      status,
      commandId,
      timestamp: new Date().toISOString(),
      requiresAck: true,
      localExecution: POWER_CUT_LOCAL_EXECUTION
    };

    if (this.onPowerStatusChange) {
      this.onPowerStatusChange(command);
    }

    const pending = this.pendingPowerCuts.get(commandId);
    if (pending) {
      pending.lastSent = Date.now();
    }
  }

  async handlePowerCutAck(commandId) {
    const pending = this.pendingPowerCuts.get(commandId);
    if (pending) {
      pending.acked = true;
      this.pendingPowerCuts.delete(commandId);
      console.log(`[POWER CUT ACK] Command ${commandId} acknowledged`);

      try {
        await pool.query(
          `UPDATE power_commands SET acked = TRUE, acked_at = CURRENT_TIMESTAMP WHERE command_id = $1`,
          [commandId]
        );
      } catch (err) {
        console.error('Failed to update command ack status:', err);
      }
    }
  }

  async retryPendingPowerCuts() {
    const toDelete = [];

    for (const [commandId, pending] of this.pendingPowerCuts.entries()) {
      if (pending.acked) {
        toDelete.push(commandId);
        continue;
      }

      if (pending.retries >= pending.maxRetries) {
        console.error(`[POWER CUT FAILED] Zone ${pending.zone_id} command ${commandId} exceeded max retries (${pending.maxRetries})`);
        toDelete.push(commandId);
        continue;
      }

      const now = Date.now();
      if (!pending.lastSent || (now - pending.lastSent) > POWER_CUT_ACK_TIMEOUT) {
        pending.retries++;
        pending.lastSent = now;
        console.warn(`[POWER CUT RETRY] Zone ${pending.zone_id} retry ${pending.retries}/${pending.maxRetries}`);

        this.sendPowerCutCommand(commandId, pending.zone_id, pending.status);

        try {
          await pool.query(
            `UPDATE power_commands SET retries = $1 WHERE command_id = $2`,
            [pending.retries, commandId]
          );
        } catch (err) {
          console.error('Failed to update retry count:', err);
        }
      }
    }

    toDelete.forEach(id => this.pendingPowerCuts.delete(id));
  }

  async restorePower(zone_id) {
    this.zonePowerStatus.set(zone_id, 'on');

    try {
      await pool.query(
        `UPDATE zones SET power_status = 'on', last_power_change = CURRENT_TIMESTAMP WHERE zone_id = $1`,
        [zone_id]
      );
    } catch (err) {
      console.error('Failed to update power status:', err);
    }

    this.pendingPowerCuts.forEach((pending, commandId) => {
      if (pending.zone_id === zone_id) {
        pending.acked = true;
        this.pendingPowerCuts.delete(commandId);
      }
    });

    const status = {
      zone_id,
      status: 'on',
      timestamp: new Date().toISOString()
    };

    if (this.onPowerStatusChange) {
      this.onPowerStatusChange(status);
    }
  }

  getZonePowerStatus(zone_id) {
    return this.zonePowerStatus.get(zone_id) || 'on';
  }

  getPowerOffZones() {
    const zones = [];
    this.zonePowerStatus.forEach((status, zone_id) => {
      if (status === 'off') {
        zones.push(zone_id);
      }
    });
    return zones;
  }
}

module.exports = EmergencyController;
