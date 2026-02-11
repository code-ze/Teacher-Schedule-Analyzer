// Reschedule Auto-Assign - Automatic slot distribution
class RescheduleAutoAssign {
    constructor() {
        this.core = null;
        this.search = null;
    }

    initialize(core, search) {
        this.core = core;
        this.search = search;
    }

    /**
     * Auto-distribute sections to available slots
     * Rules:
     * 1. Same section can't be scheduled twice on the same day
     * 2. Prefer early hours first
     * 3. Avoid after 2pm on Thursday if possible
     * 4. Respect each section's timesPerWeek and hoursPerSession settings
     */
    autoDistribute() {
        const result = {
            assignments: [],
            unassigned: [],
            warnings: []
        };

        // Get all sections with their settings
        const sectionsToAssign = this.core.selectedSections.map(section => {
            const settings = this.core.getSectionSettings(section.key);
            return {
                section,
                settings,
                remainingSlots: settings.timesPerWeek,
                assignedDays: new Set()
            };
        });

        // Get all available slots sorted by preference
        const sortedSlots = this.getSortedSlots();
        
        if (sortedSlots.length === 0) {
            result.warnings.push('No available slots found');
            return result;
        }

        // Clear existing assignments
        this.core.selectedSlots = [];

        // Track used classrooms per day-time
        const usedClassrooms = new Map(); // "day-startTime" -> Set of classrooms

        // Assign each section
        for (const sectionInfo of sectionsToAssign) {
            const { section, settings, assignedDays } = sectionInfo;
            let assigned = 0;

            for (const slotInfo of sortedSlots) {
                if (assigned >= settings.timesPerWeek) break;

                const { slot, day } = slotInfo;
                
                // Skip if section already scheduled this day
                if (assignedDays.has(day)) continue;

                // Check if section can use this slot
                if (!slot.availableForSections?.includes(section.key)) continue;

                // Check duration matches
                const slotDuration = this.getSlotDuration(slot);
                if (slotDuration < settings.hoursPerSession) continue;

                // Get available classroom (with validation)
                const slotKey = `${day}-${slot.startTime}`;
                if (!usedClassrooms.has(slotKey)) {
                    usedClassrooms.set(slotKey, new Set());
                }
                const usedRooms = usedClassrooms.get(slotKey);
                
                // Find a classroom that passes validation
                const duration = settings.hoursPerSession;
                const availableRoom = slot.classrooms.find(room => {
                    if (usedRooms.has(room)) return false;
                    
                    // Double-check against actual classroom schedule
                    const validation = this.validateClassroom(room, day, slot.startTime, duration, section.key);
                    return validation.available;
                });

                if (!availableRoom) continue;

                // Make assignment
                usedRooms.add(availableRoom);
                assignedDays.add(day);
                assigned++;

                const assignment = {
                    key: `${day}-${slot.startTime}-${section.key}`,
                    day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    classroom: availableRoom,
                    sectionKey: section.key,
                    sectionCode: section.code,
                    sectionNum: section.section,
                    slot,
                    rowNum: this.core.selectedSlots.filter(s => 
                        s.day === day && s.startTime === slot.startTime
                    ).length
                };

                this.core.selectedSlots.push(assignment);
                result.assignments.push(assignment);
            }

            sectionInfo.remainingSlots = settings.timesPerWeek - assigned;
            
            if (assigned < settings.timesPerWeek) {
                result.unassigned.push({
                    section,
                    assigned,
                    required: settings.timesPerWeek
                });
            }
        }

        // Generate warnings
        if (result.unassigned.length > 0) {
            result.warnings.push(
                `Could not fully assign: ${result.unassigned.map(u => 
                    `${u.section.code} (${u.assigned}/${u.required})`
                ).join(', ')}`
            );
        }

        return result;
    }

    /**
     * Get all available slots sorted by preference:
     * 1. Early hours first (8am, 9am, etc.)
     * 2. Thursday after 2pm last
     */
    getSortedSlots() {
        const allSlots = [];
        const days = this.core.selectedDays;

        for (const day of days) {
            const daySlots = this.core.availableSlots[day] || [];
            
            for (const slot of daySlots) {
                const startHour = parseInt(slot.startTime.split(':')[0]);
                
                // Calculate preference score (lower = better)
                let score = startHour; // Base: prefer early hours
                
                // Penalty for Thursday after 2pm
                if (day === 'Thursday' && startHour >= 14) {
                    score += 100; // Heavy penalty
                }
                
                allSlots.push({
                    slot,
                    day,
                    startHour,
                    score
                });
            }
        }

        // Sort by score (ascending)
        return allSlots.sort((a, b) => {
            // First by score
            if (a.score !== b.score) return a.score - b.score;
            // Then by day order
            const dayOrder = days.indexOf(a.day) - days.indexOf(b.day);
            if (dayOrder !== 0) return dayOrder;
            // Then by start time
            return a.startHour - b.startHour;
        });
    }

    getSlotDuration(slot) {
        const start = parseInt(slot.startTime.split(':')[0]);
        const end = parseInt(slot.endTime.split(':')[0]);
        return end - start;
    }

    // Validate classroom against actual schedule (from Classroom Occupancy data)
    validateClassroom(classroomName, day, startTime, duration, sectionKey) {
        const classroom = this.core.classrooms[classroomName];
        if (!classroom || !classroom.schedule || !classroom.schedule[day]) {
            return { available: true };
        }

        const startHour = parseInt(startTime.split(':')[0]);
        
        // Build a set of specific slots being freed: "ROOM-hourKey"
        // Only SELECTED slots are in currentSlotsToRemove
        const slotsBeingFreed = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                slotsBeingFreed.add(`${slot.room.toUpperCase()}-${slot.hourKey}`);
            }
        });

        for (let h = startHour; h < startHour + duration; h++) {
            const hourKey = h.toString().padStart(2, '0') + ':00';
            const slot = classroom.schedule[day][hourKey];

            if (slot && slot.isOccupied) {
                // Check if THIS SPECIFIC slot (room + hour) is being freed
                const slotKey = `${classroomName.toUpperCase()}-${hourKey}`;
                const isBeingFreed = slotsBeingFreed.has(slotKey);
                
                // Conflict if this slot is NOT being freed
                if (!isBeingFreed) {
                    return {
                        available: false,
                        conflict: {
                            hour: hourKey,
                            course: slot.classId || slot.course,
                            section: slot.section || ''
                        }
                    };
                }
            }
        }

        return { available: true };
    }

    /**
     * Validate current assignments against constraints
     */
    validateAssignments() {
        const issues = [];
        const sectionDayMap = new Map(); // sectionKey -> Set of days

        for (const slot of this.core.selectedSlots) {
            const key = slot.sectionKey;
            if (!sectionDayMap.has(key)) {
                sectionDayMap.set(key, new Set());
            }
            
            const days = sectionDayMap.get(key);
            if (days.has(slot.day)) {
                issues.push({
                    type: 'duplicate_day',
                    section: key,
                    day: slot.day,
                    message: `${slot.sectionCode}-${slot.sectionNum} is scheduled twice on ${slot.day}`
                });
            }
            days.add(slot.day);
        }

        // Check timesPerWeek constraints
        for (const section of this.core.selectedSections) {
            const settings = this.core.getSectionSettings(section.key);
            const assignedCount = this.core.selectedSlots.filter(s => s.sectionKey === section.key).length;
            
            if (assignedCount > settings.timesPerWeek) {
                issues.push({
                    type: 'over_assigned',
                    section: section.key,
                    message: `${section.code}-${section.section} has ${assignedCount} slots but only needs ${settings.timesPerWeek}`
                });
            } else if (assignedCount < settings.timesPerWeek) {
                issues.push({
                    type: 'under_assigned',
                    section: section.key,
                    message: `${section.code}-${section.section} has ${assignedCount} slots but needs ${settings.timesPerWeek}`
                });
            }
        }

        return issues;
    }
}

// Export
window.rescheduleAutoAssign = new RescheduleAutoAssign();

