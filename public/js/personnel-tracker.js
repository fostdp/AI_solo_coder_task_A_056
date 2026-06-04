class PersonnelTracker {
    constructor() {
        this.personnel = new Map();
        this.movedCallbacks = [];
    }

    onMoved(callback) {
        this.movedCallbacks.push(callback);
    }

    initPersonnel(personnelData) {
        this.personnel.clear();
        personnelData.forEach(person => {
            this.personnel.set(person.tag_id, person);
        });
        this.notifyMoved();
    }

    updateLocations(locationsData) {
        const moved = [];
        locationsData.forEach(person => {
            const existing = this.personnel.get(person.tag_id);
            if (existing) {
                const dx = Math.abs(existing.x - person.x);
                const dy = Math.abs(existing.y - person.y);
                if (dx > 0.5 || dy > 0.5) {
                    moved.push(person);
                }
                this.personnel.set(person.tag_id, {
                    ...existing,
                    x: person.x,
                    y: person.y,
                    zone_id: person.zone_id,
                    last_update: person.last_update
                });
            }
        });
        if (moved.length > 0) {
            this.movedCallbacks.forEach(cb => cb(moved));
        }
        this.renderPersonnelList();
    }

    getMovedPersonnel(locationsData) {
        return locationsData.filter(person => {
            const existing = this.personnel.get(person.tag_id);
            if (!existing) return false;
            const dx = Math.abs(existing.x - person.x);
            const dy = Math.abs(existing.y - person.y);
            return dx > 0.5 || dy > 0.5;
        });
    }

    getAllPersonnel() {
        return Array.from(this.personnel.values());
    }

    getPersonnelByTag(tagId) {
        return this.personnel.get(tagId);
    }

    notifyMoved() {
        this.renderPersonnelList();
    }

    renderPersonnelList() {
        const listEl = document.getElementById('personnelList');
        if (!listEl) return;
        const personnel = this.getAllPersonnel();
        
        listEl.innerHTML = personnel.map(person => `
            <div class="personnel-item" data-tag="${person.tag_id}">
                <div class="personnel-avatar">${person.name.charAt(0)}</div>
                <div class="personnel-info">
                    <div class="personnel-name">${person.name}</div>
                    <div class="personnel-department">${person.department || '未分配'}</div>
                </div>
            </div>
        `).join('');
    }

    updateCount() {
        const countEl = document.getElementById('personnelCount');
        if (countEl) countEl.textContent = this.personnel.size;
    }
}
