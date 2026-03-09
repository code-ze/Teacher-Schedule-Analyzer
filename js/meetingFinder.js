// Instructor Availability Meeting Finder
class MeetingFinder {
    constructor() {
        this.teachers = {};
        this.selectedInstructors = new Set();
        this.searchTerm = '';
    }

    init(teachers) {
        this.teachers = teachers;
        this.selectedInstructors = new Set();
        this.searchTerm = '';

        const section = document.getElementById('meetingFinderSection');
        if (section) section.style.display = 'block';

        this._ensureModal();
        this.setupSearch();
        this.renderInstructorList();
        this.renderGrid();
    }

    // ── Modal ──────────────────────────────────────────────────────────────

    _ensureModal() {
        if (document.getElementById('mfModal')) return;
        const el = document.createElement('div');
        el.id = 'mfModal';
        el.className = 'mf-modal-overlay';
        el.innerHTML = `
            <div class="mf-modal" role="dialog" aria-modal="true">
                <div class="mf-modal-header">
                    <div class="mf-modal-title" id="mfModalTitle"></div>
                    <button class="mf-modal-close" onclick="meetingFinder.closeModal()" aria-label="Close">✕</button>
                </div>
                <div class="mf-modal-status" id="mfModalStatus"></div>
                <div class="mf-modal-body" id="mfModalBody"></div>
            </div>`;
        el.addEventListener('click', e => { if (e.target === el) this.closeModal(); });
        document.body.appendChild(el);
    }

    showSlotModal(day, hour) {
        const status = this.getSlotStatus(day, hour);
        if (status.type === 'none') return;

        const timeLabel = this.formatTime(hour);
        const selected = Array.from(this.selectedInstructors);
        const busyNames = new Set(status.busyList.map(b => b.name));
        const freeList = selected.filter(n => !busyNames.has(n));

        // Title
        document.getElementById('mfModalTitle').textContent = `${day}  ·  ${timeLabel}`;

        // Status bar
        const statusEl = document.getElementById('mfModalStatus');
        if (status.type === 'all-free') {
            statusEl.className = 'mf-modal-status mf-modal-status-free';
            statusEl.innerHTML = `<span class="mf-modal-status-icon">✓</span> All ${status.total} instructors are free at this time`;
        } else if (status.type === 'all-busy') {
            statusEl.className = 'mf-modal-status mf-modal-status-busy';
            statusEl.innerHTML = `<span class="mf-modal-status-icon">✗</span> All ${status.total} instructors have class at this time`;
        } else {
            statusEl.className = 'mf-modal-status mf-modal-status-partial';
            statusEl.innerHTML = `<span class="mf-modal-status-icon">◑</span> ${status.free} of ${status.total} instructors are free`;
        }

        // Body
        let html = '';

        if (status.busyList.length > 0) {
            html += `<div class="mf-modal-section-title mf-section-busy-title">
                        <span class="mf-section-icon">✗</span> In Class (${status.busyList.length})
                     </div>
                     <div class="mf-modal-busy-list">`;
            status.busyList.forEach(({ name, slot }) => {
                const course = slot.classId || slot.course || '—';
                const room   = slot.room || '';
                const range  = slot.timeRange || '';
                html += `
                    <div class="mf-modal-busy-card">
                        <div class="mf-busy-name">${name}</div>
                        <div class="mf-busy-details">
                            <span class="mf-busy-course">${course}</span>
                            ${room  ? `<span class="mf-busy-room">${room}</span>`   : ''}
                            ${range ? `<span class="mf-busy-time">${range}</span>` : ''}
                        </div>
                    </div>`;
            });
            html += '</div>';
        }

        if (freeList.length > 0) {
            html += `<div class="mf-modal-section-title mf-section-free-title">
                        <span class="mf-section-icon">✓</span> Available (${freeList.length})
                     </div>
                     <div class="mf-modal-free-list">`;
            freeList.forEach(name => {
                html += `<div class="mf-modal-free-row">
                            <span class="mf-free-check">✓</span>
                            <span class="mf-free-name">${name}</span>
                         </div>`;
            });
            html += '</div>';
        }

        document.getElementById('mfModalBody').innerHTML = html;

        const modal = document.getElementById('mfModal');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('mf-modal-visible'));
    }

    closeModal() {
        const modal = document.getElementById('mfModal');
        if (!modal) return;
        modal.classList.remove('mf-modal-visible');
        setTimeout(() => { modal.style.display = 'none'; }, 200);
    }

    // ── Instructor list ────────────────────────────────────────────────────

    setupSearch() {
        const input = document.getElementById('mfSearch');
        if (!input) return;
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        newInput.addEventListener('input', () => {
            this.searchTerm = newInput.value.trim().toLowerCase();
            this.renderInstructorList();
        });
    }

    renderInstructorList() {
        const container = document.getElementById('mfInstructorList');
        if (!container) return;

        const sorted = Object.values(this.teachers).sort((a, b) => a.name.localeCompare(b.name));
        const filtered = this.searchTerm
            ? sorted.filter(t => t.name.toLowerCase().includes(this.searchTerm))
            : sorted;

        if (filtered.length === 0) {
            container.innerHTML = '<div class="mf-no-match">No instructors match your search.</div>';
        } else {
            container.innerHTML = filtered.map(teacher => {
                const sel = this.selectedInstructors.has(teacher.name);
                const safeName = teacher.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `
                    <div class="mf-chip ${sel ? 'mf-chip-selected' : ''}"
                         onclick="meetingFinder.toggleInstructor('${safeName}')">
                        <span class="mf-chip-check">${sel ? '✓' : ''}</span>
                        <span class="mf-chip-name">${teacher.name}</span>
                        <span class="mf-chip-meta">${teacher.totalClasses} classes</span>
                    </div>`;
            }).join('');
        }

        const countEl = document.getElementById('mfSelectedCount');
        if (countEl) {
            const n = this.selectedInstructors.size;
            countEl.textContent = n === 0
                ? 'Select instructors above to see common availability'
                : `${n} instructor${n !== 1 ? 's' : ''} selected`;
            countEl.className = n === 0 ? 'mf-count-hint' : 'mf-count-active';
        }
    }

    toggleInstructor(name) {
        if (this.selectedInstructors.has(name)) {
            this.selectedInstructors.delete(name);
        } else {
            this.selectedInstructors.add(name);
        }
        this.renderInstructorList();
        this.renderGrid();
    }

    selectAll() {
        Object.keys(this.teachers).forEach(n => this.selectedInstructors.add(n));
        this.renderInstructorList();
        this.renderGrid();
    }

    clearAll() {
        this.selectedInstructors.clear();
        this.renderInstructorList();
        this.renderGrid();
    }

    // ── Slot logic ─────────────────────────────────────────────────────────

    getSlotStatus(day, hour) {
        const selected = Array.from(this.selectedInstructors);
        if (selected.length === 0) return { type: 'none' };

        const busyList = [];
        selected.forEach(name => {
            const t = this.teachers[name];
            if (t && t.schedule[day] && t.schedule[day][hour] && t.schedule[day][hour].isBusy) {
                busyList.push({ name, slot: t.schedule[day][hour] });
            }
        });

        const total = selected.length;
        const busy  = busyList.length;
        const free  = total - busy;
        const type  = busy === 0 ? 'all-free' : (free === 0 ? 'all-busy' : 'partial');
        return { type, free, busy, total, busyList };
    }

    formatTime(hour) {
        const [h] = hour.split(':').map(Number);
        const period  = h < 12 ? 'AM' : 'PM';
        const display = h % 12 || 12;
        return `${display}:00 ${period}`;
    }

    // ── Grid ───────────────────────────────────────────────────────────────

    renderGrid() {
        const container = document.getElementById('mfGridWrapper');
        if (!container) return;

        const days  = CONFIG.WORK_DAYS;
        const hours = CONFIG.WORK_HOURS;
        const hasSel = this.selectedInstructors.size > 0;

        let html = '<div class="mf-table-scroll"><table class="mf-table">';
        html += '<thead><tr><th class="mf-th-time">Time</th>';
        days.forEach(d => { html += `<th class="mf-th-day">${d}</th>`; });
        html += '</tr></thead><tbody>';

        hours.forEach(hour => {
            html += `<tr><td class="mf-td-time">${this.formatTime(hour)}</td>`;

            days.forEach(day => {
                if (!hasSel) {
                    html += '<td class="mf-td mf-td-empty"><span class="mf-td-label">—</span></td>';
                } else {
                    const s = this.getSlotStatus(day, hour);
                    const safeDay  = day.replace(/'/g, "\\'");
                    const safeHour = hour.replace(/'/g, "\\'");
                    let cls, label;
                    if (s.type === 'all-free') {
                        cls = 'mf-td-free';    label = 'Free';
                    } else if (s.type === 'all-busy') {
                        cls = 'mf-td-busy';    label = 'Busy';
                    } else {
                        cls = 'mf-td-partial'; label = `${s.free}/${s.total} free`;
                    }
                    html += `<td class="mf-td ${cls} mf-td-clickable"
                                 onclick="meetingFinder.showSlotModal('${safeDay}','${safeHour}')">
                                 <span class="mf-td-label">${label}</span>
                             </td>`;
                }
            });

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        this.renderSummary();
    }

    // ── Summary ────────────────────────────────────────────────────────────

    renderSummary() {
        const el = document.getElementById('mfSummary');
        if (!el) return;

        if (this.selectedInstructors.size === 0) { el.innerHTML = ''; return; }

        const freeSlots = [];
        CONFIG.WORK_DAYS.forEach(day => {
            CONFIG.WORK_HOURS.forEach(hour => {
                if (this.getSlotStatus(day, hour).type === 'all-free') freeSlots.push({ day, hour });
            });
        });

        if (freeSlots.length === 0) {
            el.innerHTML = `<div class="mf-summary-empty">
                No common free slot for all ${this.selectedInstructors.size} selected instructors.
                Try selecting fewer.
            </div>`;
            return;
        }

        const byDay = {};
        CONFIG.WORK_DAYS.forEach(d => { byDay[d] = []; });
        freeSlots.forEach(({ day, hour }) => byDay[day].push(hour));

        el.innerHTML = `
            <div class="mf-summary-title">Common Free Slots — ${freeSlots.length} total</div>
            <div class="mf-summary-grid">
                ${CONFIG.WORK_DAYS.map(day => `
                    <div class="mf-summary-day">
                        <div class="mf-summary-day-name">${day}</div>
                        <div class="mf-summary-slots">
                            ${byDay[day].length > 0
                                ? byDay[day].map(h => `<span class="mf-summary-slot">${this.formatTime(h)}</span>`).join('')
                                : '<span class="mf-summary-none">No free slot</span>'}
                        </div>
                    </div>`).join('')}
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.meetingFinder = new MeetingFinder();
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') meetingFinder.closeModal();
    });
});
