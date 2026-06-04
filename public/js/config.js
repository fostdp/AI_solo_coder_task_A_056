const MineConfig = {
    WS_URL: `ws://${window.location.host}`,
    API_BASE: `http://${window.location.host}`,
    COLORS: {
        tunnel: '#2d3748',
        tunnelBorder: '#4a5568',
        face: '#553c9a',
        shaft: '#1e40af',
        entrance: '#065f46',
        normal: '#4ade80',
        warning: '#fbbf24',
        danger: '#ef4444',
        personnel: '#3b82f6',
        powerOff: '#374151'
    },
    tunnels: null,
    zones: null,
    sensorTypes: null,
    thresholds: null,

    async load() {
        try {
            const res = await fetch(`${this.API_BASE}/api/config`);
            if (res.ok) {
                const config = await res.json();
                this.tunnels = config.tunnels || [];
                this.zones = config.zones || [];
                this.sensorTypes = config.sensorTypes || {};
                this.thresholds = {};
                Object.entries(this.sensorTypes).forEach(([type, info]) => {
                    this.thresholds[type] = {
                        threshold: info.threshold,
                        warning: info.warning,
                        name: info.name,
                        unit: info.unit,
                        isLower: type === 'wind'
                    };
                });
                return true;
            }
        } catch (e) {
            console.warn('Failed to load config from server, using defaults');
        }
        this.tunnels = this.getDefaultTunnels();
        this.zones = this.getDefaultZones();
        this.sensorTypes = this.getDefaultSensorTypes();
        this.thresholds = this.getDefaultThresholds();
        return false;
    },

    getDefaultTunnels() {
        return [
            { id: 'main_entrance', name: '主井口', points: [[100, 400]], type: 'entrance' },
            { id: 'tunnel_1', name: '1号巷道', points: [[100, 400], [300, 400], [500, 350], [700, 350]], type: 'main', width: 40 },
            { id: 'tunnel_2', name: '2号巷道', points: [[300, 400], [300, 600], [500, 650], [700, 650]], type: 'main', width: 40 },
            { id: 'tunnel_3', name: '3号巷道', points: [[700, 350], [900, 350], [1050, 250]], type: 'branch', width: 35 },
            { id: 'face_1', name: '1号掘进面', points: [[700, 350], [700, 200]], type: 'face', width: 30 },
            { id: 'face_2', name: '2号掘进面', points: [[700, 650], [700, 500]], type: 'face', width: 30 },
            { id: 'face_3', name: '3号掘进面', points: [[1050, 250]], type: 'face', width: 30 },
            { id: 'face_4', name: '4号掘进面', points: [[500, 350]], type: 'face', width: 30 },
            { id: 'air_shaft', name: '通风井', points: [[500, 100]], type: 'shaft', width: 25 }
        ];
    },

    getDefaultZones() {
        return [
            { id: 'main_entrance', name: '主井口' },
            { id: 'tunnel_1', name: '1号巷道' },
            { id: 'tunnel_2', name: '2号巷道' },
            { id: 'tunnel_2b', name: '2号巷道B段' },
            { id: 'tunnel_3', name: '3号巷道' },
            { id: 'face_1', name: '1号掘进面' },
            { id: 'face_2', name: '2号掘进面' },
            { id: 'face_3', name: '3号掘进面' },
            { id: 'face_4', name: '4号掘进面' }
        ];
    },

    getDefaultSensorTypes() {
        return {
            gas: { name: '瓦斯浓度', unit: '%', threshold: 1.0, warning: 0.8, color: '#ff4444' },
            dust: { name: '粉尘浓度', unit: 'mg/m³', threshold: 10, warning: 8, color: '#ffaa00' },
            roof: { name: '顶板位移', unit: 'mm', threshold: 10, warning: 7, color: '#aa44ff' },
            wind: { name: '风速', unit: 'm/s', threshold: 0.25, warning: 0.4, color: '#44aaff' }
        };
    },

    getDefaultThresholds() {
        return {
            gas: { threshold: 1.0, warning: 0.8, name: '瓦斯浓度', unit: '%' },
            dust: { threshold: 10, warning: 8, name: '粉尘浓度', unit: 'mg/m³' },
            roof: { threshold: 10, warning: 7, name: '顶板位移', unit: 'mm' },
            wind: { threshold: 0.25, warning: 0.4, name: '风速', unit: 'm/s', isLower: true }
        };
    },

    getSensorColor(type) {
        if (this.sensorTypes && this.sensorTypes[type]) {
            return this.sensorTypes[type].color;
        }
        const defaults = { gas: '#ff4444', dust: '#ffaa00', roof: '#aa44ff', wind: '#44aaff' };
        return defaults[type] || '#ffffff';
    },

    getSensorTypeLabel(type) {
        if (this.sensorTypes && this.sensorTypes[type]) {
            return this.sensorTypes[type].name;
        }
        const labels = { gas: '瓦斯浓度', dust: '粉尘浓度', roof: '顶板位移', wind: '风速' };
        return labels[type] || type;
    },

    getSensorUnit(type) {
        if (this.sensorTypes && this.sensorTypes[type]) {
            return this.sensorTypes[type].unit;
        }
        const units = { gas: '%', dust: 'mg/m³', roof: 'mm', wind: 'm/s' };
        return units[type] || '';
    },

    getZoneName(zoneId) {
        const zone = this.zones.find(z => z.id === zoneId);
        return zone ? zone.name : zoneId;
    }
};
