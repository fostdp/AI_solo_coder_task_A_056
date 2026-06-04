class TunnelRenderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || MineConfig;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.powerOffZones = new Set();
        this.dirty = true;

        this.staticCanvas = document.createElement('canvas');
        this.staticCanvas.width = canvas.width;
        this.staticCanvas.height = canvas.height;
        this.staticCtx = this.staticCanvas.getContext('2d');

        this.prevPersonnelPositions = new Map();
        this.PADDING = 20;
        
        this.setupEventListeners();
    }

    markDirty() {
        this.dirty = true;
    }

    setupEventListeners() {
        this.canvas.addEventListener('wheel', (e) => { this.handleZoom(e); this.markDirty(); });
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
    }

    handleZoom(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale = Math.max(0.5, Math.min(2, this.scale * delta));
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    handleMouseMove(e) {
        if (this.isDragging) {
            this.offsetX += (e.clientX - this.lastMouseX);
            this.offsetY += (e.clientY - this.lastMouseY);
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.markDirty();
        }
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    resetView() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.markDirty();
    }

    zoomIn() {
        this.scale = Math.min(2, this.scale * 1.2);
        this.markDirty();
    }

    zoomOut() {
        this.scale = Math.max(0.5, this.scale * 0.8);
        this.markDirty();
    }

    screenToWorld(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (screenX - rect.left - this.offsetX) / this.scale;
        const y = (screenY - rect.top - this.offsetY) / this.scale;
        return { x, y };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.offsetX,
            y: worldY * this.scale + this.offsetY
        };
    }

    setPowerOffZones(zones) {
        const newSet = new Set(zones);
        if (newSet.size !== this.powerOffZones.size || 
            [...newSet].some(z => !this.powerOffZones.has(z))) {
            this.powerOffZones = newSet;
            this.markDirty();
        }
    }

    clear(ctx) {
        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    drawGrid(ctx) {
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1 / this.scale;
        
        const gridSize = 50;
        const startX = -this.offsetX / this.scale;
        const startY = -this.offsetY / this.scale;
        const endX = startX + this.canvas.width / this.scale;
        const endY = startY + this.canvas.height / this.scale;
        
        for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        
        for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
        
        ctx.restore();
    }

    getTunnels() {
        return this.config.tunnels || [];
    }

    drawTunnels(ctx) {
        const tunnels = this.getTunnels();
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        tunnels.forEach(tunnel => {
            if (tunnel.points.length < 2 && tunnel.type !== 'entrance') {
                this.drawTerminal(ctx, tunnel);
                return;
            }
            
            if (tunnel.type === 'entrance') {
                this.drawEntrance(ctx, tunnel);
                return;
            }
            
            this.drawTunnelPath(ctx, tunnel);
        });
        
        ctx.restore();
    }

    drawTunnelPath(ctx, tunnel) {
        const isPowerOff = this.powerOffZones.has(tunnel.id);
        const colors = this.config.COLORS;
        
        ctx.beginPath();
        ctx.moveTo(tunnel.points[0][0], tunnel.points[0][1]);
        
        for (let i = 1; i < tunnel.points.length; i++) {
            ctx.lineTo(tunnel.points[i][0], tunnel.points[i][1]);
        }
        
        ctx.strokeStyle = isPowerOff ? colors.powerOff : colors.tunnelBorder;
        ctx.lineWidth = tunnel.width || 30;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        ctx.strokeStyle = isPowerOff ? '#4b5563' : colors.tunnel;
        ctx.lineWidth = (tunnel.width || 30) - 6;
        ctx.stroke();
        
        this.drawTunnelLabel(ctx, tunnel);
    }

    drawTerminal(ctx, tunnel) {
        const [x, y] = tunnel.points[0];
        const isPowerOff = this.powerOffZones.has(tunnel.id);
        const colors = this.config.COLORS;
        const width = tunnel.width || 30;
        
        ctx.beginPath();
        ctx.arc(x, y, width / 2, 0, Math.PI * 2);
        
        if (tunnel.type === 'face') {
            ctx.fillStyle = isPowerOff ? colors.powerOff : colors.face;
        } else if (tunnel.type === 'shaft') {
            ctx.fillStyle = isPowerOff ? colors.powerOff : colors.shaft;
        } else {
            ctx.fillStyle = isPowerOff ? colors.powerOff : colors.tunnel;
        }
        
        ctx.fill();
        ctx.strokeStyle = isPowerOff ? '#6b7280' : colors.tunnelBorder;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        this.drawTunnelLabel(ctx, tunnel);
    }

    drawEntrance(ctx, tunnel) {
        const [x, y] = tunnel.points[0];
        const colors = this.config.COLORS;
        
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.fillStyle = colors.entrance;
        ctx.fill();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('入', x, y);
        
        this.drawTunnelLabel(ctx, tunnel);
    }

    drawTunnelLabel(ctx, tunnel) {
        const lastPoint = tunnel.points[tunnel.points.length - 1];
        const labelOffset = tunnel.type === 'face' ? 30 : 20;
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(tunnel.name, lastPoint[0], lastPoint[1] - labelOffset);
    }

    drawSensor(ctx, sensor, status = 'normal') {
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        const x = sensor.x;
        const y = sensor.y;
        const baseColor = this.config.getSensorColor(sensor.type);
        const colors = this.config.COLORS;
        
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        
        if (status === 'danger') {
            ctx.fillStyle = colors.danger;
            ctx.shadowColor = colors.danger;
            ctx.shadowBlur = 15;
        } else if (status === 'warning') {
            ctx.fillStyle = colors.warning;
            ctx.shadowColor = colors.warning;
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = baseColor;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const icons = { gas: 'G', dust: 'D', roof: 'R', wind: 'W' };
        ctx.fillText(icons[sensor.type] || '?', x, y);
        
        ctx.restore();
    }

    drawPersonnel(ctx, person) {
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        const x = person.x;
        const y = person.y;
        const colors = this.config.COLORS;
        
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = colors.personnel;
        ctx.shadowColor = colors.personnel;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.beginPath();
        ctx.arc(x, y - 2, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(person.name ? person.name.charAt(0) : '?', x, y + 16);
        
        ctx.restore();
    }

    getPersonnelDirtyRect(x, y) {
        const screen = this.worldToScreen(x, y);
        const r = 14 * this.scale;
        const p = this.PADDING * this.scale;
        return {
            x: Math.floor(screen.x - r - p),
            y: Math.floor(screen.y - r - p),
            w: Math.ceil((r + p) * 2),
            h: Math.ceil((r + p) * 2 + 18 * this.scale)
        };
    }

    mergeRects(rects) {
        if (rects.length === 0) return null;
        return rects.reduce((merged, rect) => ({
            x: Math.min(merged.x, rect.x),
            y: Math.min(merged.y, rect.y),
            w: Math.max(merged.x + merged.w, rect.x + rect.w) - Math.min(merged.x, rect.x),
            h: Math.max(merged.y + merged.h, rect.y + rect.h) - Math.min(merged.y, rect.y)
        }));
    }

    clipRectToCanvas(rect) {
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        
        return {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            w: Math.min(canvasW - Math.max(0, rect.x), rect.w),
            h: Math.min(canvasH - Math.max(0, rect.y), rect.h)
        };
    }

    redrawStaticInRect(rect) {
        const clipped = this.clipRectToCanvas(rect);
        if (clipped.w <= 0 || clipped.h <= 0) return;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(clipped.x, clipped.y, clipped.w, clipped.h);
        this.ctx.clip();

        this.ctx.drawImage(this.staticCanvas, 0, 0);

        this.ctx.restore();
    }

    incrementalUpdatePersonnel(movedPersonnel) {
        if (movedPersonnel.length === 0) return;

        const dirtyRects = [];

        movedPersonnel.forEach(person => {
            const prevX = this.prevPersonnelPositions.get(person.tag_id + '_x');
            const prevY = this.prevPersonnelPositions.get(person.tag_id + '_y');

            if (prevX !== undefined && prevY !== undefined) {
                const oldRect = this.getPersonnelDirtyRect(prevX, prevY);
                dirtyRects.push(oldRect);
            }

            const newRect = this.getPersonnelDirtyRect(person.x, person.y);
            dirtyRects.push(newRect);
        });

        const mergedRect = this.mergeRects(dirtyRects);
        if (mergedRect) {
            this.redrawStaticInRect(mergedRect);
        }

        movedPersonnel.forEach(person => {
            this.drawPersonnel(this.ctx, person);
            this.prevPersonnelPositions.set(person.tag_id + '_x', person.x);
            this.prevPersonnelPositions.set(person.tag_id + '_y', person.y);
        });
    }

    getSensorAtPosition(screenX, screenY, sensors) {
        const world = this.screenToWorld(screenX, screenY);
        const clickRadius = 15 / this.scale;
        
        for (const sensor of sensors) {
            const dx = world.x - sensor.x;
            const dy = world.y - sensor.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < clickRadius) {
                return sensor;
            }
        }
        
        return null;
    }

    renderStatic(sensors, sensorStatuses) {
        this.clear(this.staticCtx);
        this.drawGrid(this.staticCtx);
        this.drawTunnels(this.staticCtx);
        
        sensors.forEach(sensor => {
            const status = sensorStatuses.get(sensor.sensor_id) || 'normal';
            this.drawSensor(this.staticCtx, sensor, status);
        });

        this.prevPersonnelPositions.clear();
        this.dirty = false;
    }

    render(sensors, sensorStatuses, personnel) {
        if (this.dirty) {
            this.renderStatic(sensors, sensorStatuses);
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.staticCanvas, 0, 0);

        personnel.forEach(person => {
            this.drawPersonnel(this.ctx, person);
            this.prevPersonnelPositions.set(person.tag_id + '_x', person.x);
            this.prevPersonnelPositions.set(person.tag_id + '_y', person.y);
        });
    }

    renderIncremental(movedPersonnel) {
        if (this.dirty) return false;
        if (movedPersonnel.length === 0) return true;

        this.incrementalUpdatePersonnel(movedPersonnel);
        return true;
    }
}
