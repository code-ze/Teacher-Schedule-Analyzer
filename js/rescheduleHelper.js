// Conflict-Free Rescheduling Helper - Main Coordinator
// Coordinates between Core, Search, Preview, UI, AutoAssign, and Report modules
class RescheduleHelper {
    constructor() {
        // DOM Elements - will be set in initialize()
        this.rescheduleSection = null;
        this.courseToMove = null;
        this.courseToMoveSuggestions = null;
        this.dayCheckboxes = null;
        this.requiredDuration = null;
        this.conflictCourses = null;
        this.specificClassrooms = null;
        this.instructorSelectionRow = null;
        this.instructorChips = null;
        this.findSlotsBtn = null;
        this.clearRescheduleBtn = null;
        this.rescheduleResults = null;

        // Module references
        this.core = null;
        this.search = null;
        this.preview = null;
        this.report = null;
        this.ui = null;
        this.autoAssign = null;
    }

    initialize(courses, classrooms, teachers) {
        // Get DOM elements (now that DOM is ready)
        this.rescheduleSection = document.getElementById('rescheduleSection');
        this.courseToMove = document.getElementById('courseToMove');
        this.courseToMoveSuggestions = document.getElementById('courseToMoveSuggestions');
        this.dayCheckboxes = document.getElementById('dayCheckboxes');
        this.requiredDuration = document.getElementById('requiredDuration');
        this.conflictCourses = document.getElementById('conflictCourses');
        this.specificClassrooms = document.getElementById('specificClassrooms');
        this.instructorSelectionRow = document.getElementById('instructorSelectionRow');
        this.instructorChips = document.getElementById('instructorChips');
        this.findSlotsBtn = document.getElementById('findSlotsBtn');
        this.clearRescheduleBtn = document.getElementById('clearRescheduleBtn');
        this.rescheduleResults = document.getElementById('rescheduleResults');

        // Initialize core state
        this.core = window.rescheduleCore;
        this.core.initialize(courses, classrooms, teachers);

        // Initialize modules
        this.search = window.rescheduleSearch;
        this.search.initialize(this.core);

        this.preview = window.reschedulePreview;
        this.preview.initialize(this.core);

        this.report = window.rescheduleReport;
        this.report.initialize(this.core);

        this.ui = window.rescheduleUI;
        this.ui.initialize(this.core, this.preview);
        this.ui.onAssignmentChange = (course) => this.onAssignmentChange(course);

        this.autoAssign = window.rescheduleAutoAssign;
        this.autoAssign.initialize(this.core, this.search);

        // Setup UI
        this.renderDayCheckboxes();
        this.setupEventListeners();
        this.rescheduleSection.style.display = 'block';
    }

    // ===== UI RENDERING =====
    
    renderDayCheckboxes() {
        this.dayCheckboxes.innerHTML = CONFIG.WORK_DAYS.map(day => `
            <label class="day-checkbox-label">
                <input type="checkbox" value="${day}" class="day-checkbox">
                <span class="day-checkbox-text">${day}</span>
            </label>
        `).join('');

        this.dayCheckboxes.querySelectorAll('.day-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const label = checkbox.closest('.day-checkbox-label');
                label.classList.toggle('checked', checkbox.checked);
                this.core.toggleDay(checkbox.value);
                if (this.core.selectedInstructors.length > 0) {
                    this.showInstructorSchedulePreview();
                }
            });
        });
    }

    renderSelectedSections() {
        const container = document.getElementById('selectedSectionsList');
        const row = document.getElementById('selectedSectionsRow');
        if (!container || !row) return;
        
        if (this.core.selectedSections.length === 0) {
            row.style.display = 'none';
            return;
        }
        
        row.style.display = 'block';
        const groups = this.core.getGroupsArray();
        
        container.innerHTML = `
            <div class="conflict-groups-container">
                ${groups.map(group => this.renderConflictGroup(group)).join('')}
                <button class="add-group-btn" id="addNewGroupBtn">
                    <span>➕</span> Add Year/Group
                </button>
            </div>
            <div id="sectionSettingsContainer"></div>
        `;
        
        this.setupConflictGroupHandlers();
        
        // Render section settings
        const settingsContainer = document.getElementById('sectionSettingsContainer');
        if (settingsContainer) {
            this.ui.renderSectionSettings(settingsContainer);
        }
    }

    renderConflictGroup(group) {
        const sections = this.core.selectedSections.filter(s => s.groupId === group.id);
        const color = group.color;
        
        return `
            <div class="conflict-group" data-group-id="${group.id}" style="border-color: ${color.border}; background: ${color.bg};">
                <div class="conflict-group-header" style="background: ${color.border};">
                    <input type="text" class="group-name-input" value="${group.name}" data-group-id="${group.id}">
                    <button class="remove-group-btn" data-group-id="${group.id}">×</button>
                </div>
                <div class="conflict-group-body">
                    <div class="group-sections">
                        <div class="group-section-label">📚 Sections:</div>
                        <div class="group-sections-list">
                            ${sections.map(s => this.renderGroupSection(s, group)).join('')}
                            ${sections.length === 0 ? '<div class="no-sections-msg">No sections</div>' : ''}
                        </div>
                    </div>
                    <div class="group-conflicts">
                        <div class="group-conflicts-label">⚠️ Avoid conflicts with:</div>
                        <input type="text" class="group-conflicts-input" data-group-id="${group.id}"
                               placeholder="e.g., CPEN2101, CISC2200" value="${group.conflictCourses.join(', ')}">
                    </div>
                </div>
            </div>
        `;
    }

    renderGroupSection(section, group) {
        // Build individual slot checkboxes
        const slotItems = [];
        CONFIG.WORK_DAYS.forEach(day => {
            if (section.schedule[day]?.length > 0) {
                section.schedule[day].forEach(slot => {
                    const isSelected = this.core.isSlotSelected(section.key, day, slot.startTime);
                    slotItems.push({
                        day,
                        dayShort: day.substring(0, 3),
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        room: slot.room,
                        selected: isSelected
                    });
                });
            }
        });
        
        const slotsHTML = slotItems.map(slot => `
            <label class="slot-checkbox-item ${slot.selected ? 'selected' : 'not-selected'}" 
                   data-section="${section.key}" 
                   data-day="${slot.day}" 
                   data-start="${slot.startTime}">
                <input type="checkbox" class="slot-move-checkbox" 
                       data-section="${section.key}" 
                       data-day="${slot.day}" 
                       data-start="${slot.startTime}"
                       ${slot.selected ? 'checked' : ''}>
                <span class="slot-info">
                    <span class="slot-day">${slot.dayShort}</span>
                    <span class="slot-time">${slot.startTime}</span>
                    <span class="slot-room">${slot.room}</span>
                </span>
            </label>
        `).join('');
        
        return `
            <div class="group-section-chip expanded" data-key="${section.key}" style="border-color: ${group.color.border};">
                <div class="group-section-header">
                    <span class="group-section-code" style="color: ${group.color.text};">${section.code}-${section.section}</span>
                    <button class="group-section-remove" data-key="${section.key}">×</button>
                </div>
                <div class="group-section-slots">
                    <div class="slots-label">Select slots to move:</div>
                    <div class="slots-list">
                        ${slotsHTML}
                    </div>
                </div>
            </div>
        `;
    }

    setupConflictGroupHandlers() {
        const container = document.getElementById('selectedSectionsList');
        if (!container) return;
        
        container.querySelectorAll('.group-name-input').forEach(input => {
            input.addEventListener('change', () => this.core.updateGroupName(input.dataset.groupId, input.value));
        });
        
        container.querySelectorAll('.group-conflicts-input').forEach(input => {
            input.addEventListener('change', () => {
                const conflicts = input.value.split(',').map(c => c.trim().toUpperCase()).filter(c => c);
                this.core.updateGroupConflicts(input.dataset.groupId, conflicts);
            });
        });
        
        // Slot checkbox handlers
        container.querySelectorAll('.slot-move-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', e => {
                const sectionKey = checkbox.dataset.section;
                const day = checkbox.dataset.day;
                const startTime = checkbox.dataset.start;
                
                const isSelected = this.core.toggleSlotSelection(sectionKey, day, startTime);
                
                // Update visual state
                const label = checkbox.closest('.slot-checkbox-item');
                if (label) {
                    label.classList.toggle('selected', isSelected);
                    label.classList.toggle('not-selected', !isSelected);
                }
                
                // Update instructor preview if showing
                if (this.core.selectedInstructors.length > 0) {
                    this.showInstructorSchedulePreview();
                }
            });
        });

        container.querySelectorAll('.group-section-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.core.removeSection(btn.dataset.key);
                this.renderSelectedSections();
                this.updateInstructorsFromSections();
            });
        });
        
        container.querySelectorAll('.remove-group-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (confirm('Remove this group?')) {
                    this.core.removeConflictGroup(btn.dataset.groupId);
                    this.renderSelectedSections();
                    this.updateInstructorsFromSections();
                }
            });
        });
        
        const addBtn = document.getElementById('addNewGroupBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.core.createConflictGroup();
                this.renderSelectedSections();
            });
        }
    }

    renderInstructorChips(instructors) {
        if (instructors.length === 0) {
            this.instructorChips.innerHTML = '<div class="no-instructors-msg">No instructors found</div>';
            return;
        }

        this.instructorChips.innerHTML = `
            <div class="instructor-selection-header">
                <span>👨‍🏫 Instructors:</span>
                <button class="select-all-instructors-btn" id="selectAllInstructorsBtn">
                    ${this.core.selectedInstructors.length === instructors.length ? '☑️ All' : '☐ All'}
                </button>
            </div>
            <div class="instructor-chips-grid">
                ${instructors.map(inst => `
                    <div class="instructor-chip ${this.core.isInstructorSelected(inst.name) ? 'selected' : ''}" 
                         data-instructor="${inst.name}">
                        <span class="instructor-chip-name">👨‍🏫 ${inst.name}</span>
                        <span class="instructor-chip-check">${this.core.isInstructorSelected(inst.name) ? '✓' : ''}</span>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('selectAllInstructorsBtn')?.addEventListener('click', () => {
            if (this.core.selectedInstructors.length === instructors.length) {
                this.core.clearInstructors();
            } else {
                this.core.selectAllInstructors();
            }
            this.renderInstructorChips(instructors);
            this.showInstructorSchedulePreview();
        });

        this.instructorChips.querySelectorAll('.instructor-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const name = chip.dataset.instructor;
                const selected = this.core.toggleInstructor(name);
                chip.classList.toggle('selected', selected);
                chip.querySelector('.instructor-chip-check').textContent = selected ? '✓' : '';
                this.showInstructorSchedulePreview();
            });
        });
    }

    // ===== EVENT LISTENERS =====

    setupEventListeners() {
        this.courseToMove.addEventListener('input', () => this.showCourseSuggestions());
        this.courseToMove.addEventListener('focus', () => this.showCourseSuggestions());
        this.courseToMove.addEventListener('blur', () => {
            setTimeout(() => this.courseToMoveSuggestions.classList.remove('show'), 200);
        });

        this.findSlotsBtn.addEventListener('click', () => this.findAvailableSlots());
        this.clearRescheduleBtn.addEventListener('click', () => this.clearForm());
        
        this.conflictCourses?.addEventListener('keyup', e => { if (e.key === 'Enter') this.findAvailableSlots(); });
        this.specificClassrooms?.addEventListener('keyup', e => { if (e.key === 'Enter') this.findAvailableSlots(); });
    }

    // ===== COURSE/SECTION HANDLING =====

    showCourseSuggestions() {
        const input = (this.courseToMove.value || '').trim().toLowerCase();
        if (input.length < 1) {
            this.courseToMoveSuggestions.classList.remove('show');
            return;
        }

        const matches = Object.values(this.core.courses).filter(s => 
            s.code.toLowerCase().includes(input) || 
            s.name.toLowerCase().includes(input) ||
            s.key.toLowerCase().includes(input)
        ).slice(0, 15);

        if (matches.length === 0) {
            this.courseToMoveSuggestions.classList.remove('show');
            return;
        }

        this.courseToMoveSuggestions.innerHTML = matches.map(section => {
            const slots = [];
            const rooms = new Set();
            CONFIG.WORK_DAYS.forEach(day => {
                if (section.schedule[day]?.length > 0) {
                    section.schedule[day].forEach(slot => {
                        slots.push(`${day.substring(0, 3)} ${slot.startTime}`);
                        if (slot.room) rooms.add(slot.room);
                    });
                }
            });
            
            const roomsArr = Array.from(rooms);
            const roomsDisplay = roomsArr.length > 0 ? roomsArr.join(', ') : 'No room';
            
            return `
                <div class="suggestion-item section" data-key="${section.key}">
                    <span class="suggestion-code">${section.code}</span>
                    <span class="suggestion-section">Sec ${section.section}</span>
                    <div class="suggestion-room">🏫 ${roomsDisplay}</div>
                    <div class="suggestion-schedule">📅 ${slots.join(', ') || 'No schedule'}</div>
                </div>
            `;
        }).join('');

        this.courseToMoveSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const key = item.dataset.key;
                const groups = this.core.getGroupsArray();
                
                if (groups.length > 1) {
                    this.showGroupSelectionPopup(key, event.clientX, event.clientY);
                } else {
                    this.core.addSection(key);
                    this.courseToMove.value = '';
                    this.courseToMoveSuggestions.classList.remove('show');
                    this.renderSelectedSections();
                    this.updateInstructorsFromSections();
                }
            });
        });

        this.courseToMoveSuggestions.classList.add('show');
    }

    showGroupSelectionPopup(sectionKey, x, y) {
        document.querySelector('.group-selection-popup')?.remove();
        
        const groups = this.core.getGroupsArray();
        const popup = document.createElement('div');
        popup.className = 'group-selection-popup';
        popup.innerHTML = `
            <div class="popup-header">Add to group:</div>
            ${groups.map(g => `
                <div class="popup-group-option" data-group-id="${g.id}">
                    <span class="popup-group-color" style="background: ${g.color.border};"></span>
                    <span>${g.name}</span>
                </div>
            `).join('')}
            <div class="popup-group-option new-group" data-group-id="new">➕ New Group</div>
        `;
        
        popup.style.cssText = `position: fixed; left: ${Math.min(x, window.innerWidth - 220)}px; top: ${Math.min(y, window.innerHeight - 200)}px; z-index: 10001;`;
        document.body.appendChild(popup);
        
        popup.querySelectorAll('.popup-group-option').forEach(opt => {
            opt.addEventListener('click', () => {
                let groupId = opt.dataset.groupId;
                if (groupId === 'new') groupId = this.core.createConflictGroup();
                this.core.addSection(sectionKey, groupId);
                this.courseToMove.value = '';
                this.courseToMoveSuggestions.classList.remove('show');
                popup.remove();
                this.renderSelectedSections();
                this.updateInstructorsFromSections();
            });
        });
        
        setTimeout(() => {
            document.addEventListener('click', function close(e) {
                if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); }
            });
        }, 100);
    }

    updateInstructorsFromSections() {
        const instructors = this.core.getInstructorsForSections();
        
        if (instructors.length === 0) {
            this.instructorSelectionRow.style.display = 'none';
            this.core.clearInstructors();
            return;
        }
        
        this.instructorSelectionRow.style.display = 'block';
        this.core.selectAllInstructors();
        this.renderInstructorChips(instructors);
        this.showInstructorSchedulePreview();
    }

    showInstructorSchedulePreview() {
        this.instructorSelectionRow.querySelectorAll('.multi-instructor-preview').forEach(el => el.remove());
        
        if (this.core.selectedInstructors.length === 0) return;

        const days = this.core.selectedDays.length > 0 ? this.core.selectedDays : CONFIG.WORK_DAYS;
        const previews = this.core.selectedInstructors.map(name => {
            const teacher = this.core.teachers[name];
            if (!teacher) return null;
            
            const slots = [];
            days.forEach(day => {
                CONFIG.WORK_HOURS.forEach(hour => {
                    if (teacher.schedule[day]?.[hour]?.isBusy) {
                        slots.push({ day: day.substring(0, 3), time: hour });
                    }
                });
            });
            return { name, slots: [...new Map(slots.map(s => [`${s.day}-${s.time}`, s])).values()] };
        }).filter(Boolean);

        if (previews.length === 0) return;

        const html = `
            <div class="multi-instructor-preview">
                <div class="multi-instructor-header">📋 ${previews.length} Instructor(s)</div>
                <div class="multi-instructor-grid">
                    ${previews.map(p => `
                        <div class="instructor-preview-card">
                            <div class="instructor-preview-name">👨‍🏫 ${p.name}</div>
                            <div class="instructor-preview-slots">
                                ${p.slots.slice(0, 5).map(s => `<span class="instructor-busy-slot">${s.day} ${s.time}</span>`).join('')}
                                ${p.slots.length > 5 ? `<span class="instructor-busy-slot more">+${p.slots.length - 5}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        this.instructorSelectionRow.insertAdjacentHTML('beforeend', html);
    }

    // ===== SLOT FINDING =====

    findAvailableSlots() {
        const duration = parseInt(this.requiredDuration?.value) || 2;
        const conflictCodes = (this.conflictCourses?.value || '').split(',').map(c => c.trim().toUpperCase()).filter(c => c);
        const classrooms = (this.specificClassrooms?.value || '').split(',').map(c => c.trim().toUpperCase()).filter(c => c);
        
        if (this.core.selectedSections.length === 0) {
            this.showError('Select at least one section');
            return;
        }
        if (this.core.selectedDays.length === 0) {
            this.showError('Select at least one day');
            return;
        }

        // Get scheduling constraints
        const constraints = {
            noThursdayAfternoon: document.getElementById('noThursdayAfternoon')?.checked ?? true
        };

        const result = this.search.findAvailableSlots(duration, conflictCodes, classrooms, constraints);
        this.core.availableSlots = result.slots;
        this.core.selectedSlots = [];

        this.renderResults(result.slots, this.core.selectedSections[0], result.notFoundCourses, duration, classrooms);
    }

    renderResults(slotsByDay, courseToMove, notFound, duration, classrooms) {
        const total = Object.values(slotsByDay).reduce((sum, s) => sum + s.length, 0);
        
        if (total === 0) {
            this.rescheduleResults.innerHTML = `<div class="no-common-time">No available slots found</div>`;
            return;
        }

        const groups = this.core.getGroupsArray();
        const hasMultipleGroups = groups.length > 1;

        const daySections = this.core.selectedDays.map(day => {
            const slots = slotsByDay[day] || [];
            if (slots.length === 0) return `<div class="day-section"><h3>📅 ${day} (None)</h3></div>`;
            
            return `
                <div class="day-section">
                    <h3 style="color: #1565C0; border-bottom: 2px solid #90CAF9; padding-bottom: 8px; margin-bottom: 15px;">
                        📅 ${day} <span style="color: #4CAF50;">(${slots.length} options)</span>
                    </h3>
                    <div class="available-slots-grid">
                        ${slots.map((slot, i) => this.ui.renderSlotCard(slot, i, day, groups, hasMultipleGroups)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        this.rescheduleResults.innerHTML = `
            <div class="common-free-title" style="color: #1565C0; margin-bottom: 15px;">
                ✅ ${total} Available Slots
            </div>
            <div style="background: #e3f2fd; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px;">
                Select section → room pairs. Same section won't be scheduled twice on one day.
            </div>
            <div style="margin-bottom: 20px;">
                <button class="auto-assign-btn" id="autoAssignBtn">🤖 Auto-Distribute Sections</button>
            </div>
            <div id="selectedSlotsIndicator" style="display: none; background: #c8e6c9; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px;">
                <strong>📌 Assigned:</strong> <span id="selectedSlotsList"></span>
                <button id="clearSlotsBtn" style="margin-left: 15px; background: #f44336; color: white; border: none; padding: 5px 12px; border-radius: 15px; cursor: pointer;">Clear</button>
            </div>
            <div id="unassignedSectionsIndicator"></div>
            ${daySections}
            <div id="schedulePreviewContainer"></div>
        `;

        this.setupResultHandlers(courseToMove);
        
        // Show initial unassigned sections
        this.updateUnassignedSectionsIndicator();
    }

    setupResultHandlers(courseToMove) {
        // Setup slot handlers via UI module
        this.ui.setupSlotHandlers(this.rescheduleResults, courseToMove);

        // Auto-assign button
        document.getElementById('autoAssignBtn')?.addEventListener('click', () => {
            const result = this.autoAssign.autoDistribute();
            
            if (result.assignments.length > 0) {
                // Sync UI dropdowns with the assignments
                this.syncUIWithAssignments(courseToMove);
                this.updateSelectedSlotsIndicator();
                this.preview.renderSchedulePreview(document.getElementById('schedulePreviewContainer'), courseToMove);
                
                let msg = `Auto-assigned ${result.assignments.length} slot(s)`;
                if (result.unassigned.length > 0) {
                    msg += `\n\n⚠️ Could not fully assign: ${result.unassigned.map(u => u.section.code).join(', ')}`;
                }
                if (result.warnings.length > 0) {
                    msg += `\n\n${result.warnings.join('\n')}`;
                }
                alert(msg);
            } else {
                alert('Could not auto-assign. Try selecting more days or fewer sections.');
            }
        });

        // Clear button
        document.getElementById('clearSlotsBtn')?.addEventListener('click', () => {
            this.core.selectedSlots = [];
            this.rescheduleResults.querySelectorAll('.slot-card').forEach(c => c.classList.remove('selected'));
            this.rescheduleResults.querySelectorAll('select').forEach(s => s.value = '');
            this.updateSelectedSlotsIndicator();
            document.getElementById('schedulePreviewContainer').innerHTML = '';
        });
    }

    onAssignmentChange(courseToMove) {
        this.updateSelectedSlotsIndicator();
        this.preview.renderSchedulePreview(document.getElementById('schedulePreviewContainer'), courseToMove);
    }

    updateSelectedSlotsIndicator() {
        const indicator = document.getElementById('selectedSlotsIndicator');
        const list = document.getElementById('selectedSlotsList');
        if (!indicator || !list) return;
        
        if (this.core.selectedSlots.length === 0) {
            indicator.style.display = 'none';
        } else {
            indicator.style.display = 'block';
            list.innerHTML = this.core.selectedSlots.map(s => `
                <span style="background: #4CAF50; color: white; padding: 4px 10px; border-radius: 12px; margin: 2px; display: inline-block;">
                    ${s.sectionCode}-${s.sectionNum} ${s.day} ${s.startTime} @ ${s.classroom}
                </span>
            `).join('');
        }
        
        // Update unassigned sections indicator
        this.updateUnassignedSectionsIndicator();
    }

    updateUnassignedSectionsIndicator() {
        let container = document.getElementById('unassignedSectionsIndicator');
        
        // Create container if it doesn't exist
        if (!container) {
            const resultsArea = this.rescheduleResults;
            if (!resultsArea) return;
            
            const assignedIndicator = document.getElementById('selectedSlotsIndicator');
            if (assignedIndicator) {
                container = document.createElement('div');
                container.id = 'unassignedSectionsIndicator';
                assignedIndicator.insertAdjacentElement('afterend', container);
            }
        }
        
        if (!container) return;
        
        // Calculate which sections still need assignments
        const unassignedSections = this.getUnassignedSections();
        
        if (unassignedSections.length === 0) {
            container.innerHTML = `
                <div style="background: #c8e6c9; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4CAF50;">
                    <strong>✅ All sections scheduled!</strong> All selected sections have been assigned time slots.
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div style="background: #fff3e0; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
                <strong>⚠️ Sections still need scheduling (${unassignedSections.length}):</strong>
                <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                    ${unassignedSections.map(s => `
                        <span style="background: #ffcc80; color: #e65100; padding: 6px 12px; border-radius: 15px; font-size: 0.9em; display: inline-flex; align-items: center; gap: 5px;">
                            <span style="font-weight: 600;">${s.code}-${s.section}</span>
                            <span style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 10px; font-size: 0.85em;">
                                ${s.assigned}/${s.required} slots
                            </span>
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getUnassignedSections() {
        const unassigned = [];
        
        this.core.selectedSections.forEach(section => {
            const settings = this.core.getSectionSettings(section.key);
            const required = settings.timesPerWeek;
            
            // Count how many slots are assigned for this section
            const assigned = this.core.selectedSlots.filter(s => s.sectionKey === section.key).length;
            
            if (assigned < required) {
                unassigned.push({
                    key: section.key,
                    code: section.code,
                    section: section.section,
                    required,
                    assigned,
                    remaining: required - assigned
                });
            }
        });
        
        return unassigned;
    }

    syncUIWithAssignments(courseToMove) {
        // Use UI module's sync method
        this.ui.syncWithAssignments(this.rescheduleResults, courseToMove);
    }

    // ===== UTILITY =====

    showError(msg) {
        this.rescheduleResults.innerHTML = `<div class="no-common-time" style="color: #d32f2f;">${msg}</div>`;
    }

    clearForm() {
        this.core.reset();
        this.courseToMove.value = '';
        if (this.conflictCourses) this.conflictCourses.value = '';
        if (this.specificClassrooms) this.specificClassrooms.value = '';
        this.dayCheckboxes.querySelectorAll('.day-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('.day-checkbox-label').classList.remove('checked');
        });
        this.renderSelectedSections();
        this.instructorSelectionRow.style.display = 'none';
        this.instructorChips.innerHTML = '';
        this.rescheduleResults.innerHTML = '';
    }
}

// Export
window.rescheduleHelper = new RescheduleHelper();
