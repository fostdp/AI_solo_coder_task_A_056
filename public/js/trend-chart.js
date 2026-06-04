class TrendChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = [];
        this.sensorType = null;
    }

    setData(data, sensorType) {
        this.data = data || [];
        this.sensorType = sensorType;
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        if (this.data.length === 0) {
            ctx.fillStyle = '#7b8794';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据', width / 2, height / 2);
            return;
        }

        const values = this.data.map(d => d.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;
        const config = CONFIG.THRESHOLDS[this.sensorType];

        this.drawThresholdLine(ctx, config, padding, chartWidth, chartHeight, minVal, range);

        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 1;
        
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight * i / 4);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            const value = maxVal - (range * i / 4);
            ctx.fillStyle = '#7b8794';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(value.toFixed(2), padding.left - 5, y + 3);
        }

        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();

        const colors = {
            gas: '#ff4444',
            dust: '#ffaa00',
            roof: '#aa44ff',
            wind: '#44aaff'
        };
        const lineColor = colors[this.sensorType] || '#ffffff';

        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;

        this.data.forEach((point, index) => {
            const x = padding.left + (chartWidth * index / (this.data.length - 1 || 1));
            const y = padding.top + chartHeight - (chartHeight * (point.value - minVal) / range);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = lineColor + '33';
        
        this.data.forEach((point, index) => {
            const x = padding.left + (chartWidth * index / (this.data.length - 1 || 1));
            const y = padding.top + chartHeight - (chartHeight * (point.value - minVal) / range);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#7b8794';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('时间轴', width / 2, height - 5);

        ctx.save();
        ctx.translate(12, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('数值', 0, 0);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        const unit = config ? config.unit : '';
        ctx.fillText(`单位: ${unit}`, padding.left + 5, padding.top - 5);
    }

    drawThresholdLine(ctx, config, padding, chartWidth, chartHeight, minVal, range) {
        if (!config) return;

        const thresholdY = padding.top + chartHeight - (chartHeight * (config.threshold - minVal) / range);
        
        if (thresholdY >= padding.top && thresholdY <= padding.top + chartHeight) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = config.isLower ? '#4ade80' : '#ef4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, thresholdY);
            ctx.lineTo(padding.left + chartWidth, thresholdY);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = config.isLower ? '#4ade80' : '#ef4444';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`阈值: ${config.threshold}`, padding.left + chartWidth - 60, thresholdY - 3);
        }
    }
}
