// Reschedule Preview - Schedule preview generation
class ReschedulePreview {
    constructor() {
        this.core = null;
    }

    initialize(core) {
        this.core = core;
    }

    // Build schedule preview HTML for instructor or classroom
    buildPreviewCard(type, title, schedule, newSlots, courseCode, isClassroom = false, targetClassroom = null, targetInstructor = null) {
        // University hours: 8am to 6pm
        const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
        const daysToShow = CONFIG.WORK_DAYS;
        
        // Create new slot hours lookup
        const newSlotHours = new Map();
        const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;
        
        newSlots.forEach(slot => {
            if (!newSlotHours.has(slot.day)) {
                newSlotHours.set(slot.day, new Set());
            }
            const slotDuration = slot.duration || duration;
            for (let h = slot.startHour; h < slot.startHour + slotDuration; h++) {
                newSlotHours.get(slot.day).add(h);
            }
        });
        
        // Create removing slots lookup
        // For classroom: filter by specific classroom
        // For instructor: filter by sections this instructor teaches
        const removingSlots = new Map();
        this.core.currentSlotsToRemove.forEach(slot => {
            // For classroom preview, only show slots from this classroom
            if (isClassroom && targetClassroom && slot.room !== targetClassroom) {
                return;
            }
            
            // For instructor preview, only show slots from sections they teach
            if (!isClassroom && targetInstructor) {
                const section = this.core.courses[slot.section];
                if (!section || section.teacher !== targetInstructor) {
                    return;
                }
            }
            
            if (!removingSlots.has(slot.day)) {
                removingSlots.set(slot.day, new Set());
            }
            removingSlots.get(slot.day).add(slot.hour);
        });
        
        const dayRowsHTML = daysToShow.map(day => {
            const daySchedule = schedule[day] || {};
            const hasNewSlot = newSlotHours.has(day);
            const hasRemovingSlot = removingSlots.has(day);
            
            const workingHoursInfo = this.calculateWorkingHours(
                daySchedule, 
                isClassroom, 
                removingSlots.get(day), 
                newSlotHours.get(day)
            );
            
            const timeBlocksHTML = hours.map(hour => {
                const hourNum = parseInt(hour.split(':')[0]);
                const isNewSlot = hasNewSlot && newSlotHours.get(day).has(hourNum);
                const isRemovingSlot = hasRemovingSlot && removingSlots.get(day).has(hourNum);
                
                return this.buildTimeBlock(
                    hour, hourNum, daySchedule, 
                    isNewSlot, isRemovingSlot, 
                    courseCode, isClassroom, day
                );
            }).join('');
            
            const dayMarker = hasNewSlot ? ' ⭐' : (hasRemovingSlot ? ' 🔄' : '');
            
            return `
                <div class="preview-day-row">
                    <div class="preview-day-name">
                        ${day}${dayMarker}
                        ${workingHoursInfo ? 
                            `<span class="working-hours-badge">${workingHoursInfo}</span>` : 
                            '<span class="working-hours-badge free-day">Free</span>'}
                    </div>
                    <div class="preview-time-grid">
                        ${timeBlocksHTML}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="preview-card">
                <div class="preview-card-header ${type}">
                    ${title}
                </div>
                <div class="preview-card-body">
                    ${dayRowsHTML}
                </div>
            </div>
        `;
    }

    buildTimeBlock(hour, hourNum, daySchedule, isNewSlot, isRemovingSlot, courseCode, isClassroom, day) {
        let blockClass = 'free';
        let label = hour.substring(0, 2);
        let tooltip = `${hour}: Free`;
        
        if (isNewSlot) {
            blockClass = 'new-slot';
            const newSlotInfo = this.core.getNewSlotInfo(day, hourNum);
            label = newSlotInfo.courseCode || courseCode;
            const sectionInfo = newSlotInfo.section ? `Section ${newSlotInfo.section}` : '';
            tooltip = `${hour}: ${newSlotInfo.courseCode || courseCode}\n${sectionInfo}\nRoom: ${newSlotInfo.classroom || '?'}\n(NEW SLOT)`;
        } else if (isRemovingSlot) {
            blockClass = 'removing';
            const removingInfo = this.core.getRemovingSlotInfo(day, hourNum);
            label = removingInfo.courseCode || 'Moving';
            tooltip = `${hour}: ${removingInfo.courseCode || 'Course'}\nSection ${removingInfo.section || '?'}\nRoom: ${removingInfo.room || '?'}\n(BEING MOVED)`;
        } else if (isClassroom) {
            if (daySchedule[hour] && daySchedule[hour].isOccupied) {
                blockClass = 'busy';
                label = daySchedule[hour].classId || 'Occ';
                const sectionNum = daySchedule[hour].section || '';
                tooltip = `${hour}: ${daySchedule[hour].course || label}\nSection ${sectionNum}\nInstructor: ${daySchedule[hour].teacher || '?'}`;
            }
        } else {
            if (daySchedule[hour] && daySchedule[hour].isBusy) {
                blockClass = 'busy';
                label = daySchedule[hour].classId || 'Busy';
                const sectionNum = daySchedule[hour].section || '';
                tooltip = `${hour}: ${daySchedule[hour].course || label}\nSection ${sectionNum}\nRoom: ${daySchedule[hour].room || '?'}`;
            }
        }
        
        return `<div class="preview-time-block ${blockClass}" title="${tooltip}">${label}</div>`;
    }

    calculateWorkingHours(daySchedule, isClassroom, removingHours, newSlotHours) {
        // Calculate instructor's time at university AFTER proposed changes:
        // - Existing classes minus removed slots plus new slots
        
        if (!daySchedule) return null;
        
        const busyHours = [];
        
        // Find all hours with classes
        CONFIG.WORK_HOURS.forEach(hourKey => {
            const h = parseInt(hourKey.split(':')[0]);
            const slot = daySchedule[hourKey];
            
            let isBusy = false;
            
            // Check existing schedule
            if (slot) {
                isBusy = isClassroom ? !!slot.isOccupied : !!slot.isBusy;
            }
            
            // Remove hours being moved away
            if (removingHours && removingHours.has(h)) {
                isBusy = false;
            }
            
            // Add new slots being scheduled
            if (newSlotHours && newSlotHours.has(h)) {
                isBusy = true;
            }
            
            if (isBusy) busyHours.push(h);
        });
        
        if (busyHours.length === 0) return null;
        
        // Working hours = from first class to end of last class
        const firstHour = Math.min(...busyHours);
        const lastHour = Math.max(...busyHours) + 1; // +1 for end of class
        
        const formatHour = (h) => {
            if (h === 0 || h === 24) return '12am';
            if (h === 12) return '12pm';
            if (h < 12) return `${h}am`;
            return `${h - 12}pm`;
        };
        
        return `${formatHour(firstHour)} - ${formatHour(lastHour)}`;
    }

    // Render full schedule preview section
    renderSchedulePreview(container, courseToMove) {
        if (!container) return;
        
        const slotsWithClassrooms = this.core.getSlotsWithClassrooms();
        
        if (slotsWithClassrooms.length === 0) {
            container.innerHTML = '';
            return;
        }

        const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;

        // Build new slots info with section/instructor data
        const newSlots = slotsWithClassrooms.map(slot => {
            // Get the section info to know which instructor teaches it
            const section = this.core.courses[slot.sectionKey];
            return {
                day: slot.day,
                startHour: parseInt(slot.startTime.split(':')[0]),
                duration,
                classroom: slot.classroom,
                sectionKey: slot.sectionKey,
                instructor: section ? section.teacher : null
            };
        });

        // Build instructor previews for all selected instructors
        let instructorPreviewHTML = '';
        if (this.core.selectedInstructors && this.core.selectedInstructors.length > 0) {
            instructorPreviewHTML = this.core.selectedInstructors.map(instructorName => {
                if (!this.core.teachers[instructorName]) return '';
                const instructorSchedule = this.core.teachers[instructorName].schedule;
                
                // Only include slots for sections this instructor teaches
                const instructorSlots = newSlots.filter(slot => slot.instructor === instructorName);
                
                return this.buildPreviewCard(
                    'instructor',
                    `👨‍🏫 ${instructorName}'s Schedule`,
                    instructorSchedule,
                    instructorSlots,
                    courseToMove.code,
                    false,
                    null,
                    instructorName  // Pass instructor name to filter removing slots
                );
            }).join('');
        }

        // Build classroom previews
        const uniqueClassrooms = [...new Set(slotsWithClassrooms.map(s => s.classroom))];
        const classroomPreviewsHTML = uniqueClassrooms.map(classroom => {
            if (!this.core.classrooms[classroom]) return '';
            const classroomSchedule = this.core.classrooms[classroom].schedule;
            const classroomSlots = newSlots.filter(s => s.classroom === classroom);
            return this.buildPreviewCard(
                'classroom',
                `🏫 ${classroom} Schedule`,
                classroomSchedule,
                classroomSlots,
                courseToMove.code,
                true,
                classroom
            );
        }).join('');

        // Summary
        const slotsSummary = slotsWithClassrooms.map(slot => 
            `<strong>${slot.day}</strong> ${slot.startTime}-${slot.endTime} @ <strong>${slot.classroom}</strong>`
        ).join(' • ');

        container.innerHTML = `
            <div class="schedule-preview-section">
                <div class="schedule-preview-title">
                    <span>📋</span>
                    <span>Schedule Preview After Moving ${courseToMove.code}</span>
                </div>
                <div style="text-align: center; margin-bottom: 20px; color: #2e7d32; font-weight: 500; line-height: 1.8;">
                    <div style="font-size: 0.95em; color: #1565C0; margin-bottom: 8px;">📌 New schedule (${slotsWithClassrooms.length} slot${slotsWithClassrooms.length > 1 ? 's' : ''}):</div>
                    ${slotsSummary}
                </div>
                <div class="preview-container">
                    ${instructorPreviewHTML}
                    ${classroomPreviewsHTML}
                </div>
                <div class="preview-legend">
                    <div class="legend-item">
                        <div class="legend-color busy"></div>
                        <span>Busy/Occupied</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color free"></div>
                        <span>Free/Available</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #ffcdd2; text-decoration: line-through;"></div>
                        <span>Being Freed Up (old slot)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color new-slot"></div>
                        <span>New ${courseToMove.code} Slot</span>
                    </div>
                </div>
                <div class="export-buttons-container">
                    <div class="export-section-title">📥 Export Professional Reports</div>
                    <div class="export-buttons-row">
                        <button class="export-btn teacher-report" id="exportTeacherReportBtn">
                            <span class="export-btn-icon">👨‍🏫</span>
                            <span class="export-btn-text">
                                <span class="export-btn-title">Teacher Report</span>
                                <span class="export-btn-desc">Instructor schedule changes</span>
                            </span>
                            <span class="export-btn-badge">PDF</span>
                        </button>
                        <button class="export-btn classroom-report" id="exportClassroomReportBtn">
                            <span class="export-btn-icon">🏫</span>
                            <span class="export-btn-text">
                                <span class="export-btn-title">Classroom Report</span>
                                <span class="export-btn-desc">Room allocation changes</span>
                            </span>
                            <span class="export-btn-badge">PDF</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Attach export handlers
        this.attachExportHandlers(courseToMove);
    }

    attachExportHandlers(courseToMove) {
        const teacherBtn = document.getElementById('exportTeacherReportBtn');
        const classroomBtn = document.getElementById('exportClassroomReportBtn');

        if (teacherBtn && window.rescheduleReport) {
            teacherBtn.addEventListener('click', () => {
                window.rescheduleReport.exportTeacherReport(courseToMove);
            });
        }

        if (classroomBtn && window.rescheduleReport) {
            classroomBtn.addEventListener('click', () => {
                window.rescheduleReport.exportClassroomReport(courseToMove);
            });
        }
    }
}

// Export singleton instance
window.reschedulePreview = new ReschedulePreview();

