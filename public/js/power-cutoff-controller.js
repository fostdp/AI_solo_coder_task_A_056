class PowerCutoffController {
    constructor() {
        this.powerOffZones = new Set();
        this.localPowerCache = new Map();
        this.pendingCommands = new Map();
        this.ws = null;
        this.COMMAND_ACK_TIMEOUT = 5000;
        this.COMMAND_MAX_RETRIES = 5;
        this.COMMAND_RETRY_DELAY = 2000;
        this.onPowerChangeCallbacks = [];
        this.startCommandRetryLoop();
    }

    onPowerChange(callback) {
        this.onPowerChangeCallbacks.push(callback);
    }

    setWebSocket(ws) {
        this.ws = ws;
        this.retryPendingCommands();
    }

    applyPowerCut(zone_id, commandId = null) {
        const cacheData = {
            status: 'off',
            timestamp: Date.now(),
            source: commandId ? 'server_command' : 'local_alert',
            commandId: commandId
        };
        
        this.localPowerCache.set(zone_id, cacheData);
        
        const wasOff = this.powerOffZones.has(zone_id);
        if (!wasOff) {
            this.powerOffZones.add(zone_id);
        }

        if (!commandId) {
            this.storeCommandLocally(zone_id, 'off');
        }

        this.onPowerChangeCallbacks.forEach(cb => cb(this.getPowerOffZones(), zone_id, 'off'));
        this.renderZoneList();
        return true;
    }

    restorePower(zone_id) {
        this.powerOffZones.delete(zone_id);
        this.localPowerCache.delete(zone_id);
        
        this.pendingCommands.forEach((cmd, id) => {
            if (cmd.zone_id === zone_id) {
                this.pendingCommands.delete(id);
            }
        });

        this.onPowerChangeCallbacks.forEach(cb => cb(this.getPowerOffZones(), zone_id, 'on'));
        this.renderZoneList();
    }

    storeCommandLocally(zone_id, status) {
        const commandId = `local_${zone_id}_${Date.now()}`;
        
        this.pendingCommands.set(commandId, {
            commandId,
            zone_id,
            status,
            retries: 0,
            maxRetries: this.COMMAND_MAX_RETRIES,
            createdAt: Date.now(),
            lastSent: null,
            acked: false
        });

        this.sendPowerCommand(commandId, zone_id, status);
        return commandId;
    }

    sendPowerCommand(commandId, zone_id, status) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        const command = {
            type: 'power_status',
            data: {
                commandId,
                zone_id,
                status,
                timestamp: new Date().toISOString(),
                requiresAck: true
            }
        };

        try {
            this.ws.send(JSON.stringify(command));
            
            const pending = this.pendingCommands.get(commandId);
            if (pending) {
                pending.lastSent = Date.now();
                pending.retries++;
            }
            
            return true;
        } catch (e) {
            console.error(`[POWER CMD] Failed to send command ${commandId}:`, e);
            return false;
        }
    }

    startCommandRetryLoop() {
        this.commandRetryInterval = setInterval(() => {
            this.processPendingCommands();
        }, this.COMMAND_RETRY_DELAY);
    }

    processPendingCommands() {
        const now = Date.now();
        
        this.pendingCommands.forEach((command, commandId) => {
            if (command.acked) {
                this.pendingCommands.delete(commandId);
                return;
            }

            if (command.retries >= command.maxRetries) {
                return;
            }

            if (!command.lastSent || (now - command.lastSent) > this.COMMAND_ACK_TIMEOUT) {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.sendPowerCommand(commandId, command.zone_id, command.status);
                }
            }
        });
    }

    retryPendingCommands() {
        this.pendingCommands.forEach((command, commandId) => {
            if (!command.acked && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendPowerCommand(commandId, command.zone_id, command.status);
            }
        });
    }

    handlePowerCommandAck(commandId) {
        const command = this.pendingCommands.get(commandId);
        if (command) {
            command.acked = true;
            this.pendingCommands.delete(commandId);
        }
    }

    sendPowerCutAck(commandId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'power_cut_ack',
                commandId: commandId
            }));
        }
        this.handlePowerCommandAck(commandId);
    }

    handleServerPowerStatus(powerStatus) {
        const { zone_id, status, commandId, requiresAck } = powerStatus;

        if (status === 'off') {
            this.applyPowerCut(zone_id, commandId);
        } else {
            this.restorePower(zone_id);
        }

        if (requiresAck && commandId) {
            this.sendPowerCutAck(commandId);
        }
    }

    reconcilePowerStatus() {
        let stateRestored = false;
        
        this.localPowerCache.forEach((cache, zone_id) => {
            if (cache.status === 'off' && !this.powerOffZones.has(zone_id)) {
                this.powerOffZones.add(zone_id);
                stateRestored = true;
                
                if (!cache.commandId || cache.source === 'local_alert') {
                    this.storeCommandLocally(zone_id, 'off');
                }
            }
        });

        if (stateRestored) {
            this.onPowerChangeCallbacks.forEach(cb => cb(this.getPowerOffZones(), null, 'reconcile'));
            this.renderZoneList();
        }
    }

    getPowerOffZones() {
        return Array.from(this.powerOffZones);
    }

    getLocalPowerCache(zone_id) {
        return this.localPowerCache.get(zone_id);
    }

    renderZoneList() {
        const zoneListEl = document.getElementById('zoneList');
        if (!zoneListEl) return;
        const zones = MineConfig.zones || [];
        zoneListEl.innerHTML = zones.map(zone => {
            const isPowerOff = this.powerOffZones.has(zone.id);
            const cache = this.localPowerCache.get(zone.id);
            const cacheInfo = cache ? ` (${cache.source === 'local_alert' ? '本地缓存' : '服务端确认'})` : '';
            return `
                <div class="zone-item ${isPowerOff ? 'power-off' : ''}">
                    <span>${zone.name}${cacheInfo}</span>
                    <span class="zone-power-status ${isPowerOff ? 'off' : 'on'}">
                        ${isPowerOff ? '已断电' : '供电中'}
                    </span>
                </div>
            `;
        }).join('');
    }
}
