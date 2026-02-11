// Time query functionality
class TimeQuery {
    constructor() {
        this.timeQuerySection = document.getElementById('timeQuerySection');
        this.timeQueryInput = document.getElementById('timeQueryInput');
        this.timeQueryDay = document.getElementById('timeQueryDay');
        this.timeQueryBtn = document.getElementById('timeQueryBtn');
        this.timeQueryResults = document.getElementById('timeQueryResults');
        
        // Time range query elements
        this.timeRangeStart = document.getElementById('timeRangeStart');
        this.timeRangeEnd = document.getElementById('timeRangeEnd');
        this.timeRangeDay = document.getElementById('timeRangeDay');
        this.timeRangeBtn = document.getElementById('timeRangeBtn');
        this.timeRangeResults = document.getElementById('timeRangeResults');
    }

    setupTimeQueryUI(teachers) {
        // Populate day dropdowns
        this.timeQueryDay.innerHTML = '<option value="ALL">All Days</option>' +
            CONFIG.WORK_DAYS.map(d => `<option value="${d}">${d}</option>`).join('');
        
        this.timeRangeDay.innerHTML = '<option value="ALL">All Days</option>' +
            CONFIG.WORK_DAYS.map(d => `<option value="${d}">${d}</option>`).join('');

        const runQuery = () => {
            const input = (this.timeQueryInput.value || '').trim();
            if (!input) {
                this.timeQueryResults.innerHTML = '';
                return;
            }
            const hourKey = this.parseTimeToHourKey(input);
            if (!hourKey) {
                this.timeQueryResults.innerHTML = `<div class="error"><strong>Invalid time:</strong> Use formats like 11am, 3:00 pm, or 13:00</div>`;
                return;
            }
            const daySel = this.timeQueryDay.value;
            const results = this.findBusyTeachersAt(teachers, hourKey, daySel);
            this.renderTimeQueryResults(results, hourKey);
        };

        const runTimeRangeQuery = () => {
            const startInput = (this.timeRangeStart.value || '').trim();
            const endInput = (this.timeRangeEnd.value || '').trim();
            
            if (!startInput || !endInput) {
                this.timeRangeResults.innerHTML = '';
                return;
            }
            
            const startHour = this.parseTimeToHourKey(startInput);
            const endHour = this.parseTimeToHourKey(endInput);
            
            if (!startHour || !endHour) {
                this.timeRangeResults.innerHTML = `<div class="error"><strong>Invalid time:</strong> Use formats like 10am, 12pm, or 10:00, 12:00</div>`;
                return;
            }
            
            const daySel = this.timeRangeDay.value;
            const results = this.findFreeTeachersInRange(teachers, startHour, endHour, daySel);
            this.renderTimeRangeResults(results, startHour, endHour);
        };

        this.timeQueryBtn.addEventListener('click', runQuery);
        this.timeQueryInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') runQuery(); });
        
        this.timeRangeBtn.addEventListener('click', runTimeRangeQuery);
        this.timeRangeStart.addEventListener('keyup', (e) => { if (e.key === 'Enter') runTimeRangeQuery(); });
        this.timeRangeEnd.addEventListener('keyup', (e) => { if (e.key === 'Enter') runTimeRangeQuery(); });
    }

    parseTimeToHourKey(input) {
        // Normalize e.g., 11am, 11 am, 11:00am, 11:30am -> 11:00; 1p, 1 pm -> 13:00
        let s = String(input).trim().toLowerCase();
        s = s.replace(/\s+/g, '');

        const ampmMatch = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);
        const colonMatch = s.match(/^(\d{1,2})(?::(\d{2}))$/);
        const hourOnly = s.match(/^(\d{1,2})$/);

        let hours = null;
        if (ampmMatch) {
            let h = parseInt(ampmMatch[1], 10);
            const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
            const meridian = ampmMatch[3];
            if (h === 12) h = 0;
            if (meridian === 'pm') h += 12;
            hours = h;
            // We collapse to the containing hour
        } else if (colonMatch) {
            hours = parseInt(colonMatch[1], 10);
            // ignore minutes, snap to hour
        } else if (hourOnly) {
            hours = parseInt(hourOnly[1], 10);
        } else {
            return null;
        }

        if (isNaN(hours) || hours < 0 || hours > 23) return null;
        return hours.toString().padStart(2, '0') + ':00';
    }

    findBusyTeachersAt(teachers, hourKey, daySel) {
        const teacherNames = Object.keys(teachers);
        const days = daySel === 'ALL' ? CONFIG.WORK_DAYS : [daySel];
        const result = {};
        days.forEach(day => {
            result[day] = [];
            teacherNames.forEach(name => {
                const slot = teachers[name].schedule[day] && teachers[name].schedule[day][hourKey];
                if (slot && slot.isBusy) {
                    result[day].push({
                        name,
                        course: slot.course,
                        classId: slot.classId || (slot.course && UTILS.extractClassId(slot.course)) || '',
                        room: slot.room,
                        timeRange: slot.timeRange || hourKey
                    });
                }
            });
            // Sort alphabetically by teacher name
            result[day].sort((a, b) => a.name.localeCompare(b.name));
        });
        return result;
    }

    renderTimeQueryResults(resultsByDay, hourKey) {
        const total = Object.values(resultsByDay).reduce((sum, arr) => sum + arr.length, 0);
        if (total === 0) {
            this.timeQueryResults.innerHTML = `<div class="no-common-time">No classes found at ${hourKey}</div>`;
            return;
        }

        const html = CONFIG.WORK_DAYS.map(day => {
            const items = resultsByDay[day] || [];
            return `
                <div style="background:#f8f9fa; border:1px solid #eee; border-radius:10px; padding:12px; margin:8px 0;">
                    <div style="font-weight:600; color:#2c3e50; margin-bottom:8px;">${day} • ${hourKey}</div>
                    ${items.length === 0 ? '<div class="no-slots-day">No classes</div>' :
                        `<ul style=\"list-style:none; padding:0; margin:0; display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:8px;\">
                            ${items.map(it => `
                                <li style=\"background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:10px;\" class=\"has-tooltip\" data-tooltip=\"${it.timeRange}\n${it.classId} • ${it.room}\n${it.course}\"> 
                                    <div style=\"font-weight:600; color:#34495e;\">${it.name}</div>
                                    <div style=\"color:#667eea; font-weight:600;\">${it.classId}</div>
                                    <div style=\"color:#666;\">${it.room}</div>
                                </li>`).join('')}
                          </ul>`}
                </div>`;
        }).join('');

        this.timeQueryResults.innerHTML = `
            <div class="common-free-title" style="margin:8px 0;">📅 Teachers with class at ${hourKey} (${total} total)</div>
            ${html}
        `;
    }

    findFreeTeachersInRange(teachers, startHour, endHour, daySel) {
        const teacherNames = Object.keys(teachers);
        const days = daySel === 'ALL' ? CONFIG.WORK_DAYS : [daySel];
        
        // Get the range of hours to check
        const startIndex = CONFIG.WORK_HOURS.indexOf(startHour);
        const endIndex = CONFIG.WORK_HOURS.indexOf(endHour);
        
        if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
            return {};
        }
        
        const hoursToCheck = CONFIG.WORK_HOURS.slice(startIndex, endIndex);
        
        const result = {};
        days.forEach(day => {
            result[day] = [];
            teacherNames.forEach(name => {
                // Check if teacher is free for ALL hours in the range
                const isFreeInRange = hoursToCheck.every(hour => 
                    !teachers[name].schedule[day][hour].isBusy
                );
                
                if (isFreeInRange) {
                    result[day].push({
                        name,
                        freeHours: hoursToCheck.length,
                        timeRange: `${startHour} - ${endHour}`
                    });
                }
            });
            // Sort alphabetically by teacher name
            result[day].sort((a, b) => a.name.localeCompare(b.name));
        });
        return result;
    }

    renderTimeRangeResults(resultsByDay, startHour, endHour) {
        const total = Object.values(resultsByDay).reduce((sum, arr) => sum + arr.length, 0);
        if (total === 0) {
            this.timeRangeResults.innerHTML = `<div class="no-common-time">No teachers are free from ${startHour} to ${endHour}</div>`;
            return;
        }

        const html = CONFIG.WORK_DAYS.map(day => {
            const items = resultsByDay[day] || [];
            return `
                <div style="background:#e8f5e8; border:1px solid #c8e6c9; border-radius:10px; padding:12px; margin:8px 0;">
                    <div style="font-weight:600; color:#2e7d32; margin-bottom:8px;">${day} • ${startHour} - ${endHour}</div>
                    ${items.length === 0 ? '<div class="no-slots-day">No free teachers</div>' :
                        `<ul style=\"list-style:none; padding:0; margin:0; display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:8px;\">
                            ${items.map(it => `
                                <li style=\"background:#fff; border:1px solid #4CAF50; border-radius:8px; padding:12px; text-align:center;\"> 
                                    <div style=\"font-weight:600; color:#2e7d32; font-size:1.1em;\">${it.name}</div>
                                    <div style=\"color:#4CAF50; font-size:0.9em; margin-top:4px;\">✅ Free for ${it.freeHours} hours</div>
                                </li>`).join('')}
                          </ul>`}
                </div>`;
        }).join('');

        this.timeRangeResults.innerHTML = `
            <div class="common-free-title" style="margin:8px 0; color:#2e7d32;">🆓 Teachers free from ${startHour} to ${endHour} (${total} total)</div>
            ${html}
        `;
    }
}

// Initialize time query when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.timeQuery = new TimeQuery();
});

