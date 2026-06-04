class AlertManager {
    constructor() {
        this.alerts = [];
        this.maxAlerts = 50;
        this.audioContext = null;
        this.isFlashing = false;
    }

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    playAlertSound(type = 'danger') {
        if (!this.audioContext) {
            this.initAudio();
        }
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        if (type === 'danger') {
            oscillator.frequency.value = 800;
            oscillator.type = 'square';
            gainNode.gain.value = 0.3;
        } else {
            oscillator.frequency.value = 600;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.2;
        }

        oscillator.start();
        
        setTimeout(() => {
            oscillator.stop();
        }, type === 'danger' ? 500 : 300);
    }

    addAlert(alert, powerCutoffController) {
        const exists = this.alerts.find(a => 
            a.sensor_id === alert.sensor_id && 
            a.alert_type === alert.alert_type &&
            a.level === alert.level
        );
        
        if (exists) return;

        this.alerts.unshift(alert);
        
        if (this.alerts.length > this.maxAlerts) {
            this.alerts.pop();
        }

        if (alert.level === 'danger') {
            this.playAlertSound('danger');
            this.startFlash();
        } else {
            this.playAlertSound('warning');
        }

        if (alert.power_cut && alert.zone_id && powerCutoffController) {
            powerCutoffController.applyPowerCut(alert.zone_id);
        }

        this.renderAlerts();
        this.updateAlertCount();
    }

    startFlash() {
        if (this.isFlashing) return;
        
        this.isFlashing = true;
        const flashEl = document.getElementById('alertFlash');
        if (flashEl) flashEl.style.display = 'block';

        setTimeout(() => {
            if (flashEl) flashEl.style.display = 'none';
            this.isFlashing = false;
        }, 2000);
    }

    clearAlerts() {
        this.alerts = [];
        this.renderAlerts();
        this.updateAlertCount();
    }

    renderAlerts() {
        const alertListEl = document.getElementById('alertList');
        if (!alertListEl) return;
        
        if (this.alerts.length === 0) {
            alertListEl.innerHTML = '<div class="no-alerts">暂无告警信息</div>';
            return;
        }

        alertListEl.innerHTML = this.alerts.map(alert => `
            <div class="alert-item ${alert.level}">
                <div class="alert-type">${this.getAlertTypeLabel(alert.alert_type)} - ${alert.level === 'danger' ? '危险' : '预警'}</div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-time">${this.formatTime(alert.created_at)}</div>
            </div>
        `).join('');
    }

    updateAlertCount() {
        const countEl = document.getElementById('alertCount');
        if (!countEl) return;
        const dangerCount = this.alerts.filter(a => a.level === 'danger' && a.status === 'active').length;
        countEl.textContent = dangerCount;
    }

    getAlertTypeLabel(type) {
        if (MineConfig.sensorTypes && MineConfig.sensorTypes[type]) {
            const info = MineConfig.sensorTypes[type];
            const labels = { gas: '瓦斯超限', dust: '粉尘超标', roof: '顶板异常', wind: '通风不足' };
            return labels[type] || info.name;
        }
        const labels = { gas: '瓦斯超限', dust: '粉尘超标', roof: '顶板异常', wind: '通风不足' };
        return labels[type] || type;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}
