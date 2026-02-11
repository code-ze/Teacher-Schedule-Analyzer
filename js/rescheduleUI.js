// Reschedule UI - Slot card rendering and assignment handling
class RescheduleUI {
    constructor() {
        this.core = null;
        this.preview = null;
        this.onAssignmentChange = null; // Callback for when assignments change
    }

    initialize(core, preview) {
        this.core = core;
        this.preview = preview;
    }

    // ===== SLOT CARD RENDERING =====

    renderSlotCard(slot, index, day, groups, hasMultipleGroups) {
        const availableSectionKeys = slot.availableForSections || [];
        const conflictingSections = slot.conflictingSections || [];
        const availableSections = this.core.selectedSections.filter(s => availableSectionKeys.includes(s.key));
        
        // Build section availability badges
        let sectionAvailabilityHTML = '';
        if (this.core.selectedSections.length > 1) {
            sectionAvailabilityHTML = `
                <div class="slot-section-availability">
                    ${availableSections.map(sec => {
                        const group = this.core.conflictGroups[sec.groupId];
                        const color = group?.color || { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' };
                        return `
                            <span class="section-availability-badge available" 
                                  style="background: ${color.bg}; border-color: ${color.border}; color: ${color.text};"
                                  title="${sec.teacher} is free">
                                ✓ ${sec.code}-${sec.section}
                            </span>
                        `;
                    }).join('')}
                    ${conflictingSections.map(cs => `
                        <span class="section-availability-badge conflict" title="${cs.reason}">
                            ✕ ${cs.code}-${cs.section}
                        </span>
                    `).join('')}
                </div>
            `;
        }

        // Group availability badges
        let groupAvailabilityHTML = '';
        if (hasMultipleGroups && slot.availableForGroups) {
            const availableGroups = groups.filter(g => slot.availableForGroups.includes(g.id));
            const conflictingGroups = slot.conflictingGroups || [];
            
            groupAvailabilityHTML = `
                <div class="slot-group-availability">
                    ${availableGroups.map(g => `
                        <span class="group-availability-badge available" style="background: ${g.color.bg}; border-color: ${g.color.border}; color: ${g.color.text};">
                            ✓ ${g.name}
                        </span>
                    `).join('')}
                    ${conflictingGroups.map(g => `
                        <span class="group-availability-badge conflict">✕ ${g.name}</span>
                    `).join('')}
                </div>
            `;
        }

        // Filter classrooms upfront to only show valid ones
        const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;
        const validClassrooms = this.filterValidClassrooms(slot.classrooms, day, slot.startTime, duration);
        const maxAssignments = Math.min(availableSections.length, validClassrooms.length);

        return `
            <div class="slot-card" data-day="${day}" data-index="${index}" 
                 data-start="${slot.startTime}" data-end="${slot.endTime}"
                 data-available-sections="${availableSectionKeys.join(',')}"
                 data-classrooms='${JSON.stringify(validClassrooms)}'
                 data-all-classrooms='${JSON.stringify(slot.classrooms)}'>
                <div class="slot-header">
                    <span class="slot-time">🕐 ${slot.startTime} - ${slot.endTime}</span>
                    <span class="slot-capacity">${availableSections.length}sec • ${validClassrooms.length}rm</span>
                </div>
                <div class="slot-body">
                    ${groupAvailabilityHTML}
                    ${sectionAvailabilityHTML}
                    ${validClassrooms.length === 0 ? `
                        <div style="color: #d32f2f; padding: 10px; background: #ffebee; border-radius: 8px; margin-bottom: 10px;">
                            ⚠️ No classrooms available - all rooms have conflicts
                        </div>
                    ` : ''}
                    <div class="slot-assignments" data-day="${day}" data-start="${slot.startTime}" data-max="${maxAssignments}">
                        ${validClassrooms.length > 0 ? this.renderAssignmentRow(0, day, availableSections, validClassrooms, groups, false, slot.startTime, duration) : ''}
                        ${maxAssignments > 1 ? `
                            <button class="add-assignment-btn" data-day="${day}" data-start="${slot.startTime}">
                                ➕ Add section
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderAssignmentRow(rowNum, day, sections, classrooms, groups, showRemove = false, startTime = null, duration = 2) {
        // Filter classrooms to only show those that are truly available
        const validClassrooms = this.filterValidClassrooms(classrooms, day, startTime, duration);
        
        return `
            <div class="assignment-row" data-row="${rowNum}">
                <select class="section-select" data-day="${day}" data-row="${rowNum}">
                    <option value="">Section...</option>
                    ${this.buildSectionOptions(sections, groups)}
                </select>
                <span class="assignment-arrow">→</span>
                <select class="classroom-select" data-day="${day}" data-row="${rowNum}">
                    <option value="">Room...</option>
                    ${validClassrooms.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
                ${showRemove ? '<button class="remove-assignment-btn">×</button>' : ''}
            </div>
        `;
    }

    // Filter classrooms to only show those without conflicts
    filterValidClassrooms(classrooms, day, startTime, duration) {
        if (!startTime || !day) return classrooms;
        
        // Build a set of specific slots being freed: "ROOM-hourKey"
        // Only SELECTED slots are in currentSlotsToRemove
        const slotsBeingFreed = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                slotsBeingFreed.add(`${slot.room.toUpperCase()}-${slot.hourKey}`);
            }
        });
        
        console.log('=== FILTERING CLASSROOMS ===');
        console.log('Day:', day, 'Start:', startTime, 'Duration:', duration);
        console.log('Slots being freed:', Array.from(slotsBeingFreed));
        
        return classrooms.filter(classroomName => {
            const classroom = this.core.classrooms[classroomName];
            if (!classroom || !classroom.schedule || !classroom.schedule[day]) {
                console.log(`${classroomName}: No schedule data, assuming available`);
                return true; // No schedule data, assume available
            }
            
            const startHour = parseInt(startTime.split(':')[0]);
            
            for (let h = startHour; h < startHour + duration; h++) {
                const hourKey = h.toString().padStart(2, '0') + ':00';
                const slot = classroom.schedule[day][hourKey];
                
                console.log(`Checking ${classroomName} at ${hourKey}:`, slot);
                
                if (slot && slot.isOccupied) {
                    // Check if THIS SPECIFIC slot (room + hour) is being freed
                    const slotKey = `${classroomName.toUpperCase()}-${hourKey}`;
                    const isBeingFreed = slotsBeingFreed.has(slotKey);
                    
                    console.log(`  Slot key: ${slotKey}, Is being freed: ${isBeingFreed}`);
                    
                    if (!isBeingFreed) {
                        console.log(`❌ CONFLICT: ${classroomName} on ${day} at ${hourKey} is occupied (NOT being freed)`);
                        return false; // Has a conflict - slot NOT being freed
                    } else {
                        console.log(`✓ ${classroomName} at ${hourKey}: Slot IS being freed`);
                    }
                }
            }
            
            console.log(`✓ ${classroomName} is AVAILABLE`);
            return true; // No conflicts
        });
    }

    buildSectionOptions(sections, groups) {
        const byGroup = {};
        groups.forEach(g => { byGroup[g.id] = []; });
        sections.forEach(sec => {
            if (byGroup[sec.groupId]) byGroup[sec.groupId].push(sec);
        });
        
        return groups.map(group => {
            const secs = byGroup[group.id] || [];
            if (secs.length === 0) return '';
            return `
                <optgroup label="${group.name}">
                    ${secs.map(s => `<option value="${s.key}">${s.code}-${s.section}</option>`).join('')}
                </optgroup>
            `;
        }).join('');
    }

    // ===== SECTION SETTINGS =====

    renderSectionSettings(container) {
        const sections = this.core.selectedSections;
        if (sections.length === 0) return;

        container.innerHTML = `
            <div class="section-settings-panel">
                <div class="settings-header">📋 Section Schedule Requirements</div>
                <div class="settings-grid">
                    ${sections.map(sec => {
                        const settings = this.core.getSectionSettings(sec.key);
                        return `
                            <div class="section-setting-row" data-key="${sec.key}">
                                <span class="setting-label">${sec.code}-${sec.section}</span>
                                <select class="times-per-week" data-key="${sec.key}">
                                    ${[1,2,3,4,5].map(n => `
                                        <option value="${n}" ${settings.timesPerWeek === n ? 'selected' : ''}>${n}x/week</option>
                                    `).join('')}
                                </select>
                                <select class="hours-per-session" data-key="${sec.key}">
                                    ${[1,2,3,4].map(n => `
                                        <option value="${n}" ${settings.hoursPerSession === n ? 'selected' : ''}>${n}hr each</option>
                                    `).join('')}
                                </select>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Setup handlers
        container.querySelectorAll('.times-per-week').forEach(sel => {
            sel.addEventListener('change', () => {
                this.core.updateSectionSettings(sel.dataset.key, { timesPerWeek: parseInt(sel.value) });
            });
        });
        container.querySelectorAll('.hours-per-session').forEach(sel => {
            sel.addEventListener('change', () => {
                this.core.updateSectionSettings(sel.dataset.key, { hoursPerSession: parseInt(sel.value) });
            });
        });
    }

    // ===== SLOT HANDLERS =====

    setupSlotHandlers(container, courseToMove) {
        // Assignment row handlers
        container.querySelectorAll('.assignment-row').forEach(row => {
            this.setupRowHandlers(row, courseToMove);
        });

        // Add section buttons
        container.querySelectorAll('.add-assignment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addAssignmentRow(btn, courseToMove);
            });
        });
    }

    setupRowHandlers(row, courseToMove) {
        const card = row.closest('.slot-card');
        const day = card.dataset.day;
        const startTime = card.dataset.start;
        const endTime = card.dataset.end;
        const index = parseInt(card.dataset.index);
        const rowNum = parseInt(row.dataset.row);

        const sectionSelect = row.querySelector('.section-select');
        const classroomSelect = row.querySelector('.classroom-select');
        const removeBtn = row.querySelector('.remove-assignment-btn');

        const updateAssignment = () => {
            const sectionKey = sectionSelect.value;
            const classroom = classroomSelect.value;

            // Remove existing assignment for this row
            const existingIdx = this.core.selectedSlots.findIndex(s => 
                s.day === day && s.startTime === startTime && s.rowNum === rowNum
            );
            if (existingIdx >= 0) {
                this.core.selectedSlots.splice(existingIdx, 1);
            }

            // Check if section is already assigned in this time slot
            if (sectionKey) {
                const duplicateInSlot = this.core.selectedSlots.find(s => 
                    s.day === day && s.startTime === startTime && s.sectionKey === sectionKey && s.rowNum !== rowNum
                );
                if (duplicateInSlot) {
                    alert(`${sectionKey} is already assigned to this time slot!`);
                    sectionSelect.value = '';
                    return;
                }
            }

            // Check if this would put the section back in its ORIGINAL room/time (pointless move)
            if (sectionKey && classroom) {
                const section = this.core.courses[sectionKey];
                if (section && section.schedule && section.schedule[day]) {
                    const originalSlot = section.schedule[day].find(slot => {
                        const slotStart = slot.startTime;
                        const slotRoom = slot.room;
                        return slotStart === startTime && slotRoom.toUpperCase() === classroom.toUpperCase();
                    });
                    if (originalSlot) {
                        alert(`⚠️ This would put ${sectionKey} back in its original room and time!\n\nNo change would be made. Please select a different room or time.`);
                        classroomSelect.value = '';
                        return;
                    }
                }
            }

            // VALIDATE: Double-check classroom availability against actual schedule
            if (sectionKey && classroom) {
                const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;
                const validation = this.validateClassroomAvailability(classroom, day, startTime, duration, sectionKey);
                
                if (!validation.available) {
                    alert(`⚠️ CONFLICT DETECTED!\n\n${validation.message}\n\nThis assignment will NOT be saved.`);
                    classroomSelect.value = '';
                    return;
                }
            }

            // Add if complete
            if (sectionKey && classroom) {
                const section = this.core.courses[sectionKey];
                this.core.selectedSlots.push({
                    key: `${day}-${startTime}-${sectionKey}`,
                    day, index, rowNum, startTime, endTime, classroom, sectionKey,
                    sectionCode: section?.code || '',
                    sectionNum: section?.section || '',
                    slot: this.core.availableSlots[day]?.[index]
                });
                card.classList.add('selected');
            }

            // Update UI
            const hasAssignments = this.core.selectedSlots.some(s => s.day === day && s.startTime === startTime);
            card.classList.toggle('selected', hasAssignments);
            this.updateUsedOptionsInSlot(card);

            if (this.onAssignmentChange) {
                this.onAssignmentChange(courseToMove);
            }
        };

        sectionSelect.addEventListener('change', updateAssignment);
        classroomSelect.addEventListener('change', updateAssignment);

        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const idx = this.core.selectedSlots.findIndex(s => 
                    s.day === day && s.startTime === startTime && s.rowNum === rowNum
                );
                if (idx >= 0) this.core.selectedSlots.splice(idx, 1);
                
                row.remove();
                card.querySelector('.add-assignment-btn').style.display = 'inline-flex';
                
                const hasAssignments = this.core.selectedSlots.some(s => s.day === day && s.startTime === startTime);
                card.classList.toggle('selected', hasAssignments);

                if (this.onAssignmentChange) {
                    this.onAssignmentChange(courseToMove);
                }
            });
        }
    }

    addAssignmentRow(btn, courseToMove) {
        const card = btn.closest('.slot-card');
        const container = card.querySelector('.slot-assignments');
        const day = card.dataset.day;
        const startTime = card.dataset.start;
        const maxAssignments = parseInt(container.dataset.max);
        const currentRows = container.querySelectorAll('.assignment-row').length;

        if (currentRows >= maxAssignments) {
            btn.style.display = 'none';
            return;
        }

        // Get available sections and rooms (already filtered for conflicts)
        const availableSectionKeys = card.dataset.availableSections.split(',').filter(k => k);
        const validClassrooms = JSON.parse(card.dataset.classrooms); // Already filtered
        const groups = this.core.getGroupsArray();

        // Filter out already used
        const usedSections = new Set();
        const usedRooms = new Set();
        container.querySelectorAll('.assignment-row').forEach(r => {
            const sec = r.querySelector('.section-select').value;
            const room = r.querySelector('.classroom-select').value;
            if (sec) usedSections.add(sec);
            if (room) usedRooms.add(room);
        });

        const availableSections = this.core.selectedSections.filter(s => 
            availableSectionKeys.includes(s.key) && !usedSections.has(s.key)
        );
        const availableRooms = validClassrooms.filter(r => !usedRooms.has(r));

        if (availableSections.length === 0 || availableRooms.length === 0) {
            btn.style.display = 'none';
            return;
        }

        const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;
        const newRow = document.createElement('div');
        newRow.className = 'assignment-row';
        newRow.dataset.row = currentRows;
        newRow.innerHTML = `
            <select class="section-select" data-day="${day}" data-row="${currentRows}">
                <option value="">Section...</option>
                ${this.buildSectionOptions(availableSections, groups)}
            </select>
            <span class="assignment-arrow">→</span>
            <select class="classroom-select" data-day="${day}" data-row="${currentRows}">
                <option value="">Room...</option>
                ${availableRooms.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <button class="remove-assignment-btn">×</button>
        `;

        btn.before(newRow);
        this.setupRowHandlers(newRow, courseToMove);

        if (currentRows + 1 >= maxAssignments) {
            btn.style.display = 'none';
        }
    }

    // Sync UI dropdowns with selectedSlots from core
    syncWithAssignments(container, courseToMove) {
        // Group assignments by slot (day + startTime)
        const slotAssignments = new Map();
        this.core.selectedSlots.forEach(slot => {
            const key = `${slot.day}-${slot.startTime}`;
            if (!slotAssignments.has(key)) {
                slotAssignments.set(key, []);
            }
            slotAssignments.get(key).push(slot);
        });

        // Update each slot card
        container.querySelectorAll('.slot-card').forEach(card => {
            const day = card.dataset.day;
            const startTime = card.dataset.start;
            const key = `${day}-${startTime}`;
            const assignments = slotAssignments.get(key) || [];

            if (assignments.length === 0) {
                card.classList.remove('selected');
                return;
            }

            card.classList.add('selected');
            const assignmentsContainer = card.querySelector('.slot-assignments');
            const addBtn = card.querySelector('.add-assignment-btn');
            const maxAssignments = parseInt(assignmentsContainer?.dataset.max || 1);

            // Get all available options for creating new rows
            const availableSectionKeys = (card.dataset.availableSections || '').split(',').filter(k => k);
            const allClassrooms = JSON.parse(card.dataset.classrooms || '[]');
            const groups = this.core.getGroupsArray();

            assignments.forEach((assignment, index) => {
                let rows = assignmentsContainer.querySelectorAll('.assignment-row');
                let row = rows[index];

                // Create new row if needed
                if (!row && index < maxAssignments) {
                    const newRow = document.createElement('div');
                    newRow.className = 'assignment-row';
                    newRow.dataset.row = index;
                    
                    const availableSections = this.core.selectedSections.filter(s => availableSectionKeys.includes(s.key));
                    
                    newRow.innerHTML = `
                        <select class="section-select" data-day="${day}" data-row="${index}">
                            <option value="">Section...</option>
                            ${this.buildSectionOptions(availableSections, groups)}
                        </select>
                        <span class="assignment-arrow">→</span>
                        <select class="classroom-select" data-day="${day}" data-row="${index}">
                            <option value="">Room...</option>
                            ${allClassrooms.map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>
                        ${index > 0 ? '<button class="remove-assignment-btn">×</button>' : ''}
                    `;

                    if (addBtn) {
                        addBtn.before(newRow);
                    } else {
                        assignmentsContainer.appendChild(newRow);
                    }
                    
                    this.setupRowHandlers(newRow, courseToMove);
                    row = newRow;
                }

                // Set values
                if (row) {
                    const sectionSelect = row.querySelector('.section-select');
                    const classroomSelect = row.querySelector('.classroom-select');
                    
                    if (sectionSelect) sectionSelect.value = assignment.sectionKey;
                    if (classroomSelect) classroomSelect.value = assignment.classroom;
                }
            });

            // Hide add button if max reached
            if (addBtn && assignments.length >= maxAssignments) {
                addBtn.style.display = 'none';
            }

            // Update disabled options
            this.updateUsedOptionsInSlot(card);
        });
    }

    // Validate classroom availability against actual schedule data
    validateClassroomAvailability(classroomName, day, startTime, duration, sectionKey) {
        const classroom = this.core.classrooms[classroomName];
        if (!classroom || !classroom.schedule || !classroom.schedule[day]) {
            return { available: true, message: '' };
        }

        const startHour = parseInt(startTime.split(':')[0]);
        const conflicts = [];
        
        // Build a set of specific slots being freed: "ROOM-hourKey"
        // Only SELECTED slots are in currentSlotsToRemove
        const slotsBeingFreed = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                slotsBeingFreed.add(`${slot.room.toUpperCase()}-${slot.hourKey}`);
            }
        });

        // Check each hour of the slot
        for (let h = startHour; h < startHour + duration; h++) {
            const hourKey = h.toString().padStart(2, '0') + ':00';
            const slot = classroom.schedule[day][hourKey];

            if (slot && slot.isOccupied) {
                // Check if THIS SPECIFIC slot (room + hour) is being freed
                const slotKey = `${classroomName.toUpperCase()}-${hourKey}`;
                const isBeingFreed = slotsBeingFreed.has(slotKey);
                
                if (!isBeingFreed) {
                    // This is a real conflict - this slot is NOT being freed
                    conflicts.push({
                        hour: hourKey,
                        course: slot.classId || slot.course || 'Unknown',
                        section: slot.section || '',
                        teacher: slot.teacher || ''
                    });
                }
            }
        }

        if (conflicts.length > 0) {
            const conflictDetails = conflicts.map(c => 
                `• ${c.hour}: ${c.course} Sec ${c.section} (${c.teacher})`
            ).join('\n');
            
            return {
                available: false,
                message: `${classroomName} is already occupied on ${day}:\n\n${conflictDetails}`
            };
        }

        return { available: true, message: '' };
    }

    updateUsedOptionsInSlot(card) {
        const container = card.querySelector('.slot-assignments');
        const rows = container.querySelectorAll('.assignment-row');
        
        const usedSections = new Set();
        const usedRooms = new Set();
        
        rows.forEach(r => {
            const sec = r.querySelector('.section-select').value;
            const room = r.querySelector('.classroom-select').value;
            if (sec) usedSections.add(sec);
            if (room) usedRooms.add(room);
        });

        // Disable used options in other rows
        rows.forEach(r => {
            const secSelect = r.querySelector('.section-select');
            const roomSelect = r.querySelector('.classroom-select');
            const currentSec = secSelect.value;
            const currentRoom = roomSelect.value;

            secSelect.querySelectorAll('option').forEach(opt => {
                if (opt.value && opt.value !== currentSec) {
                    opt.disabled = usedSections.has(opt.value);
                }
            });
            roomSelect.querySelectorAll('option').forEach(opt => {
                if (opt.value && opt.value !== currentRoom) {
                    opt.disabled = usedRooms.has(opt.value);
                }
            });
        });
    }
}

// Export
window.rescheduleUI = new RescheduleUI();

