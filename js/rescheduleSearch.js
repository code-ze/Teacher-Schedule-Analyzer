// Reschedule Search - Slot finding and conflict detection
class RescheduleSearch {
    constructor() {
        this.core = null;
    }

    initialize(core) {
        this.core = core;
    }

    // Find available slots for rescheduling
    // Now supports per-group conflicts and scheduling constraints
    findAvailableSlots(duration, globalConflictCodes, specificClassrooms, constraints = {}) {
        if (!this.core) return {};
        
        // Default constraints
        const noThursdayAfternoon = constraints.noThursdayAfternoon !== false; // Default to true
        
        // Collect all conflict courses (global + per-group)
        const allConflictCourses = [];
        const notFoundCourses = [];
        const groupConflictMaps = {}; // groupId -> Set of busy hour keys per day
        
        // Parse global conflict codes (legacy support)
        globalConflictCodes.forEach(code => {
            const course = this.core.findCourseByCode(code);
            if (course) {
                allConflictCourses.push({ course, groupId: 'global' });
            } else {
                notFoundCourses.push(code);
            }
        });
        
        // Parse per-group conflict codes
        const groups = this.core.getGroupsArray();
        groups.forEach(group => {
            groupConflictMaps[group.id] = {};
            
            group.conflictCourses.forEach(code => {
                const course = this.core.findCourseByCode(code);
                if (course) {
                    allConflictCourses.push({ course, groupId: group.id });
                } else if (!notFoundCourses.includes(code)) {
                    notFoundCourses.push(code);
                }
            });
        });

        // Find available slots for each selected day
        const allAvailableSlots = {};
        
        this.core.selectedDays.forEach(day => {
            // Build per-group busy slots
            groups.forEach(group => {
                groupConflictMaps[group.id][day] = new Set();
                
                group.conflictCourses.forEach(code => {
                    const course = this.core.findCourseByCode(code);
                    if (course) {
                        const busyHours = this.getBusySlotsForCourses([course], day);
                        busyHours.forEach(h => groupConflictMaps[group.id][day].add(h));
                    }
                });
            });
            
            // Get global busy times (applies to all sections)
            const globalBusySlots = new Set();
            globalConflictCodes.forEach(code => {
                const course = this.core.findCourseByCode(code);
                if (course) {
                    const busy = this.getBusySlotsForCourses([course], day);
                    busy.forEach(h => globalBusySlots.add(h));
                }
            });
            
            // Get classroom schedules (excluding current sections)
            const classroomSchedules = this.getClassroomSchedulesExcluding(day);
            
            // Find non-conflicting slots with per-SECTION availability
            // Each section is checked against its OWN instructor and group conflicts
            allAvailableSlots[day] = this.findNonConflictingSlotsWithGroups(
                day, 
                duration, 
                globalBusySlots,
                groupConflictMaps,
                classroomSchedules,
                specificClassrooms,
                noThursdayAfternoon
            );
        });

        return {
            slots: allAvailableSlots,
            conflictCourses: allConflictCourses.map(c => c.course),
            notFoundCourses: notFoundCourses,
            groupConflictMaps: groupConflictMaps
        };
    }

    // New method: Find slots with per-SECTION conflict awareness
    // Each section is checked against its OWN instructor and its OWN group's conflicts
    findNonConflictingSlotsWithGroups(day, duration, globalBusySlots, groupConflictMaps, classroomSchedules, specificClassrooms = [], noThursdayAfternoon = true) {
        const availableSlots = [];
        const groups = this.core.getGroupsArray();
        const sections = this.core.selectedSections;
        
        // University hours: 8am to 6pm
        const startHour = 8;
        let endHour = 18;
        
        // Apply Thursday afternoon constraint
        if (noThursdayAfternoon && day === 'Thursday') {
            endHour = 14; // No classes after 2pm on Thursday
        }
        
        // Get hours being freed up (current sections being moved)
        const removingHours = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                removingHours.add(slot.hourKey);
            }
        });
        
        for (let h = startHour; h <= endHour - duration; h++) {
            const slotStart = h.toString().padStart(2, '0') + ':00';
            const slotEnd = (h + duration).toString().padStart(2, '0') + ':00';
            
            // Check global conflicts (applies to all)
            let globalConflict = false;
            for (let hour = h; hour < h + duration; hour++) {
                const hourKey = hour.toString().padStart(2, '0') + ':00';
                if (globalBusySlots.has(hourKey)) {
                    globalConflict = true;
                    break;
                }
            }
            if (globalConflict) continue;
            
            // Check which SECTIONS can use this slot
            // Each section is checked against its own instructor and group conflicts
            const availableForSections = [];
            const conflictingSections = [];
            
            sections.forEach(section => {
                let sectionCanUse = true;
                let conflictReason = null;
                
                // 1. Check THIS section's instructor availability
                const instructorName = section.teacher;
                if (instructorName && this.core.teachers[instructorName]) {
                    const teacherSchedule = this.core.teachers[instructorName].schedule || {};
                    const daySchedule = teacherSchedule[day] || {};
                    
                    for (let hour = h; hour < h + duration; hour++) {
                        const hourKey = hour.toString().padStart(2, '0') + ':00';
                        
                        // Skip if this hour is being freed up by THIS section
                        const isBeingFreed = this.core.currentSlotsToRemove.some(
                            slot => slot.day === day && slot.hourKey === hourKey && slot.section === section.key
                        );
                        if (isBeingFreed) continue;
                        
                        if (daySchedule[hourKey] && daySchedule[hourKey].isBusy) {
                            sectionCanUse = false;
                            conflictReason = `${instructorName} busy`;
                            break;
                        }
                    }
                }
                
                // 2. Check THIS section's group conflict courses
                if (sectionCanUse && section.groupId) {
                    const groupBusy = groupConflictMaps[section.groupId]?.[day] || new Set();
                    
                    for (let hour = h; hour < h + duration; hour++) {
                        const hourKey = hour.toString().padStart(2, '0') + ':00';
                        if (groupBusy.has(hourKey)) {
                            sectionCanUse = false;
                            const group = this.core.conflictGroups[section.groupId];
                            conflictReason = `${group?.name || 'Group'} conflict`;
                            break;
                        }
                    }
                }
                
                if (sectionCanUse) {
                    availableForSections.push(section);
                } else {
                    conflictingSections.push({ section, reason: conflictReason });
                }
            });
            
            // Build group availability from sections that can use this slot
            const availableForGroups = [];
            const conflictingGroups = [];
            
            groups.forEach(group => {
                const groupSectionsThatCanUse = availableForSections.filter(s => s.groupId === group.id);
                const groupSectionsThatCant = conflictingSections.filter(cs => cs.section.groupId === group.id);
                
                if (groupSectionsThatCanUse.length > 0) {
                    availableForGroups.push(group);
                }
                if (groupSectionsThatCant.length > 0 && groupSectionsThatCanUse.length === 0) {
                    conflictingGroups.push({ id: group.id, name: group.name });
                }
            });
            
            // Slot is available if NOT ALL sections conflict (i.e., at least one section can use it)
            // If only 1 or 2 sections conflict, that's fine - slot is still available
            const allSectionsConflict = conflictingSections.length === sections.length;
            const atLeastOneSectionCanUse = availableForSections.length > 0;
            
            if (!allSectionsConflict && atLeastOneSectionCanUse) {
                // Find available classrooms
                const availableClassrooms = [];
                let classroomsToCheck = Object.keys(classroomSchedules);
                
                if (specificClassrooms.length > 0) {
                    classroomsToCheck = classroomsToCheck.filter(room => 
                        specificClassrooms.some(specific => 
                            room.toUpperCase().includes(specific) || specific.includes(room.toUpperCase())
                        )
                    );
                }
                
                classroomsToCheck.forEach(classroomName => {
                    const classroomBusy = classroomSchedules[classroomName];
                    let classroomAvailable = true;
                    
                    for (let hour = h; hour < h + duration; hour++) {
                        const hourKey = hour.toString().padStart(2, '0') + ':00';
                        if (classroomBusy.has(hourKey)) {
                            classroomAvailable = false;
                            break;
                        }
                    }
                    
                    if (classroomAvailable) {
                        availableClassrooms.push(classroomName);
                    }
                });
                
                if (availableClassrooms.length > 0) {
                    availableSlots.push({
                        startTime: slotStart,
                        endTime: slotEnd,
                        classrooms: availableClassrooms.sort(),
                        availableForGroups: availableForGroups.map(g => g.id),
                        conflictingGroups: conflictingGroups,
                        availableForSections: availableForSections.map(s => s.key),
                        conflictingSections: conflictingSections.map(cs => ({ 
                            key: cs.section.key, 
                            code: cs.section.code,
                            section: cs.section.section,
                            reason: cs.reason 
                        }))
                    });
                }
            }
        }
        
        return availableSlots;
    }

    getBusySlotsForCourses(courses, day) {
        const busySlots = new Set();
        
        courses.forEach(course => {
            if (course.schedule && course.schedule[day]) {
                course.schedule[day].forEach(slot => {
                    const startHour = parseInt(slot.startTime.split(':')[0]);
                    const endHour = parseInt(slot.endTime.split(':')[0]);
                    
                    for (let h = startHour; h < endHour; h++) {
                        busySlots.add(h.toString().padStart(2, '0') + ':00');
                    }
                });
            }
        });
        
        return busySlots;
    }

    getInstructorBusySlotsExcluding(day) {
        const busySlots = new Set();
        
        // Check all selected instructors
        if (!this.core.selectedInstructors || this.core.selectedInstructors.length === 0) {
            return busySlots;
        }

        // Get hours being removed for this day
        const removingHours = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                removingHours.add(slot.hourKey);
            }
        });
        
        // Check each selected instructor
        this.core.selectedInstructors.forEach(instructorName => {
            const teacher = this.core.teachers[instructorName];
            if (!teacher) return;
            
            if (teacher.schedule && teacher.schedule[day]) {
                Object.keys(teacher.schedule[day]).forEach(hour => {
                    // Skip if this hour is being freed up
                    if (removingHours.has(hour)) return;
                    
                    if (teacher.schedule[day][hour] && teacher.schedule[day][hour].isBusy) {
                        busySlots.add(hour);
                    }
                });
            }
        });
        
        return busySlots;
    }

    getClassroomSchedulesExcluding(day) {
        const schedules = {};
        
        // Build a set of specific slots being freed up: "room-hourKey"
        // Only selected slots are in currentSlotsToRemove
        const slotsBeingFreed = new Set();
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.day === day) {
                // Add with room normalization
                slotsBeingFreed.add(`${slot.room.toUpperCase()}-${slot.hourKey}`);
            }
        });
        
        Object.values(this.core.classrooms).forEach(classroom => {
            schedules[classroom.name] = new Set();
            
            if (classroom.schedule && classroom.schedule[day]) {
                Object.keys(classroom.schedule[day]).forEach(hour => {
                    const slotData = classroom.schedule[day][hour];
                    
                    // Check if this slot is occupied
                    if (slotData && slotData.isOccupied) {
                        // Check if THIS SPECIFIC slot (room + hour) is being freed
                        const slotKey = `${classroom.name.toUpperCase()}-${hour}`;
                        const isBeingFreed = slotsBeingFreed.has(slotKey);
                        
                        if (!isBeingFreed) {
                            // This slot is NOT being freed - classroom is busy
                            schedules[classroom.name].add(hour);
                        }
                    }
                });
            }
        });
        
        return schedules;
    }

    findNonConflictingSlots(day, duration, busySlots, classroomSchedules, specificClassrooms = []) {
        const availableSlots = [];
        
        // University hours: 8am to 6pm
        const startHour = 8;
        const endHour = 18;
        
        for (let h = startHour; h <= endHour - duration; h++) {
            const slotStart = h.toString().padStart(2, '0') + ':00';
            const slotEnd = (h + duration).toString().padStart(2, '0') + ':00';
            
            // Check for conflicts
            let hasConflict = false;
            for (let hour = h; hour < h + duration; hour++) {
                const hourKey = hour.toString().padStart(2, '0') + ':00';
                if (busySlots.has(hourKey)) {
                    hasConflict = true;
                    break;
                }
            }
            
            if (hasConflict) continue;
            
            // Find available classrooms
            const availableClassrooms = [];
            let classroomsToCheck = Object.keys(classroomSchedules);
            
            // Filter to specific classrooms if requested
            if (specificClassrooms.length > 0) {
                classroomsToCheck = classroomsToCheck.filter(room => 
                    specificClassrooms.some(specific => 
                        room.toUpperCase().includes(specific) || specific.includes(room.toUpperCase())
                    )
                );
            }
            
            classroomsToCheck.forEach(classroomName => {
                const classroomBusy = classroomSchedules[classroomName];
                let classroomAvailable = true;
                
                for (let hour = h; hour < h + duration; hour++) {
                    const hourKey = hour.toString().padStart(2, '0') + ':00';
                    if (classroomBusy.has(hourKey)) {
                        classroomAvailable = false;
                        break;
                    }
                }
                
                if (classroomAvailable) {
                    availableClassrooms.push(classroomName);
                }
            });
            
            if (availableClassrooms.length > 0) {
                availableSlots.push({
                    startTime: slotStart,
                    endTime: slotEnd,
                    classrooms: availableClassrooms.sort()
                });
            }
        }
        
        return availableSlots;
    }

    // Get all instructors' busy slots for a day (for preview)
    getInstructorBusySlots(day) {
        const busySlots = new Set();
        
        if (!this.core.selectedInstructors || this.core.selectedInstructors.length === 0) {
            return busySlots;
        }

        this.core.selectedInstructors.forEach(instructorName => {
            const teacher = this.core.teachers[instructorName];
            if (!teacher) return;
            
            if (teacher.schedule && teacher.schedule[day]) {
                Object.keys(teacher.schedule[day]).forEach(hour => {
                    if (teacher.schedule[day][hour] && teacher.schedule[day][hour].isBusy) {
                        busySlots.add(hour);
                    }
                });
            }
        });
        
        return busySlots;
    }
}

// Export singleton instance
window.rescheduleSearch = new RescheduleSearch();

