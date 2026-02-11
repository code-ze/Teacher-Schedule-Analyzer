// Reschedule Core - State management and shared utilities
class RescheduleCore {
    constructor() {
        this.courses = {};
        this.classrooms = {};
        this.teachers = {};
        this.selectedInstructors = []; // Now supports multiple instructors
        this.courseInstructors = [];
        this.selectedDays = [];
        this.selectedSlots = [];
        this.availableSlots = [];
        this.selectedSections = [];
        this.currentSlotsToRemove = [];
        
        // Conflict groups - each group has its own conflict courses
        // Structure: { groupId: { id, name, color, sectionKeys: [], conflictCourses: [] } }
        this.conflictGroups = {};
        this.nextGroupId = 1;
        
        // Section settings (timesPerWeek, hoursPerSession)
        // Structure: { sectionKey: { timesPerWeek: 2, hoursPerSession: 2 } }
        this.sectionSettings = {};
        
        // Track which specific slots to move (not all slots of a section)
        // Structure: { "sectionKey-day-startTime": { sectionKey, day, startTime, endTime, room, selected: true } }
        this.slotsToMove = {};
        
        // Default group colors
        this.groupColors = [
            { bg: '#E3F2FD', border: '#1976D2', text: '#1565C0', name: 'Year 1' },
            { bg: '#E8F5E9', border: '#388E3C', text: '#2E7D32', name: 'Year 2' },
            { bg: '#FFF3E0', border: '#F57C00', text: '#E65100', name: 'Year 3' },
            { bg: '#F3E5F5', border: '#7B1FA2', text: '#6A1B9A', name: 'Year 4' },
            { bg: '#FFEBEE', border: '#D32F2F', text: '#C62828', name: 'Group 5' },
            { bg: '#E0F7FA', border: '#00838F', text: '#006064', name: 'Group 6' }
        ];
    }

    initialize(courses, classrooms, teachers) {
        this.courses = courses;
        this.classrooms = classrooms;
        this.teachers = teachers;
    }

    // Conflict Group Management
    createConflictGroup(name = null) {
        const colorIndex = (this.nextGroupId - 1) % this.groupColors.length;
        const colorScheme = this.groupColors[colorIndex];
        
        const groupId = `group_${this.nextGroupId++}`;
        this.conflictGroups[groupId] = {
            id: groupId,
            name: name || colorScheme.name,
            color: colorScheme,
            sectionKeys: [],
            conflictCourses: [] // Array of course codes
        };
        
        return groupId;
    }

    getOrCreateDefaultGroup() {
        const groups = Object.keys(this.conflictGroups);
        if (groups.length === 0) {
            return this.createConflictGroup();
        }
        return groups[0];
    }

    updateGroupName(groupId, name) {
        if (this.conflictGroups[groupId]) {
            this.conflictGroups[groupId].name = name;
        }
    }

    updateGroupConflicts(groupId, conflictCourses) {
        if (this.conflictGroups[groupId]) {
            this.conflictGroups[groupId].conflictCourses = conflictCourses;
        }
    }

    removeConflictGroup(groupId) {
        if (this.conflictGroups[groupId]) {
            // Remove all sections in this group
            const sectionsToRemove = this.conflictGroups[groupId].sectionKeys.slice();
            sectionsToRemove.forEach(key => this.removeSection(key));
            delete this.conflictGroups[groupId];
        }
    }

    getGroupForSection(sectionKey) {
        for (const groupId in this.conflictGroups) {
            if (this.conflictGroups[groupId].sectionKeys.includes(sectionKey)) {
                return this.conflictGroups[groupId];
            }
        }
        return null;
    }

    getSectionConflicts(sectionKey) {
        const group = this.getGroupForSection(sectionKey);
        return group ? group.conflictCourses : [];
    }

    // Section Settings Management
    getSectionSettings(sectionKey) {
        if (!this.sectionSettings[sectionKey]) {
            // Default: 2 times per week, 2 hours each
            this.sectionSettings[sectionKey] = {
                timesPerWeek: 2,
                hoursPerSession: 2
            };
        }
        return this.sectionSettings[sectionKey];
    }

    updateSectionSettings(sectionKey, updates) {
        if (!this.sectionSettings[sectionKey]) {
            this.sectionSettings[sectionKey] = { timesPerWeek: 2, hoursPerSession: 2 };
        }
        Object.assign(this.sectionSettings[sectionKey], updates);
    }

    // Section management
    addSection(sectionKey, groupId = null) {
        const section = this.courses[sectionKey];
        if (!section) return false;
        if (this.selectedSections.find(s => s.key === sectionKey)) return false;
        
        // Get or create group
        const targetGroupId = groupId || this.getOrCreateDefaultGroup();
        
        // Add section to group
        if (this.conflictGroups[targetGroupId]) {
            this.conflictGroups[targetGroupId].sectionKeys.push(sectionKey);
        }
        
        // Store group reference on section
        section.groupId = targetGroupId;
        
        this.selectedSections.push(section);
        
        // Initialize individual slot tracking (all slots selected by default)
        this.initializeSlotsForSection(sectionKey);
        
        this.updateSlotsToRemove();
        return targetGroupId;
    }

    moveSectionToGroup(sectionKey, newGroupId) {
        // Remove from current group
        for (const groupId in this.conflictGroups) {
            const idx = this.conflictGroups[groupId].sectionKeys.indexOf(sectionKey);
            if (idx >= 0) {
                this.conflictGroups[groupId].sectionKeys.splice(idx, 1);
                break;
            }
        }
        
        // Add to new group
        if (this.conflictGroups[newGroupId]) {
            this.conflictGroups[newGroupId].sectionKeys.push(sectionKey);
            
            // Update section's group reference
            const section = this.selectedSections.find(s => s.key === sectionKey);
            if (section) {
                section.groupId = newGroupId;
            }
        }
    }

    removeSection(sectionKey) {
        // Remove from conflict group
        for (const groupId in this.conflictGroups) {
            const idx = this.conflictGroups[groupId].sectionKeys.indexOf(sectionKey);
            if (idx >= 0) {
                this.conflictGroups[groupId].sectionKeys.splice(idx, 1);
                break;
            }
        }
        
        // Remove individual slot tracking
        this.removeSlotsForSection(sectionKey);
        
        this.selectedSections = this.selectedSections.filter(s => s.key !== sectionKey);
        this.updateSlotsToRemove();
    }

    // Slot-level selection management
    getSlotKey(sectionKey, day, startTime) {
        return `${sectionKey}-${day}-${startTime}`;
    }

    initializeSlotsForSection(sectionKey) {
        const section = this.courses[sectionKey];
        if (!section) return;
        
        CONFIG.WORK_DAYS.forEach(day => {
            if (section.schedule[day]) {
                section.schedule[day].forEach(slot => {
                    const slotKey = this.getSlotKey(sectionKey, day, slot.startTime);
                    // Default: all slots are selected for moving
                    this.slotsToMove[slotKey] = {
                        sectionKey,
                        day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        room: slot.room,
                        selected: true
                    };
                });
            }
        });
    }

    toggleSlotSelection(sectionKey, day, startTime) {
        const slotKey = this.getSlotKey(sectionKey, day, startTime);
        if (this.slotsToMove[slotKey]) {
            this.slotsToMove[slotKey].selected = !this.slotsToMove[slotKey].selected;
            this.updateSlotsToRemove();
            return this.slotsToMove[slotKey].selected;
        }
        return false;
    }

    isSlotSelected(sectionKey, day, startTime) {
        const slotKey = this.getSlotKey(sectionKey, day, startTime);
        return this.slotsToMove[slotKey]?.selected ?? true;
    }

    getSelectedSlotsForSection(sectionKey) {
        return Object.values(this.slotsToMove).filter(s => 
            s.sectionKey === sectionKey && s.selected
        );
    }

    removeSlotsForSection(sectionKey) {
        Object.keys(this.slotsToMove).forEach(key => {
            if (key.startsWith(sectionKey + '-')) {
                delete this.slotsToMove[key];
            }
        });
    }

    updateSlotsToRemove() {
        this.currentSlotsToRemove = [];
        
        // Only include SELECTED slots (not all slots of a section)
        Object.values(this.slotsToMove).forEach(slot => {
            if (!slot.selected) return; // Skip unselected slots
            
            const startHour = parseInt(slot.startTime.split(':')[0]);
            const endHour = parseInt(slot.endTime.split(':')[0]);
            
            for (let h = startHour; h < endHour; h++) {
                this.currentSlotsToRemove.push({
                    day: slot.day,
                    hour: h,
                    hourKey: h.toString().padStart(2, '0') + ':00',
                    section: slot.sectionKey,
                    room: slot.room
                });
            }
        });
    }

    // Instructor management - now supports multiple instructors
    toggleInstructor(instructorName) {
        const index = this.selectedInstructors.indexOf(instructorName);
        if (index >= 0) {
            this.selectedInstructors.splice(index, 1);
            return false; // Removed
        } else {
            this.selectedInstructors.push(instructorName);
            return true; // Added
        }
    }

    selectAllInstructors() {
        const instructors = this.getInstructorsForSections();
        this.selectedInstructors = instructors.map(i => i.name);
    }

    clearInstructors() {
        this.selectedInstructors = [];
    }

    isInstructorSelected(instructorName) {
        return this.selectedInstructors.includes(instructorName);
    }

    getInstructorsForSections() {
        const instructorSet = new Set();
        this.selectedSections.forEach(section => {
            if (section.teacher) {
                instructorSet.add(section.teacher);
            }
        });
        
        return Array.from(instructorSet).map(name => {
            const teacherData = this.teachers[name];
            // Find which group this instructor's sections belong to
            const instructorSections = this.selectedSections.filter(s => s.teacher === name);
            const groupIds = [...new Set(instructorSections.map(s => s.groupId))];
            const groups = groupIds.map(gid => this.conflictGroups[gid]).filter(Boolean);
            
            return {
                name,
                totalClasses: teacherData ? teacherData.totalClasses : 0,
                sectionCount: instructorSections.length,
                groups: groups
            };
        });
    }

    // Day management
    toggleDay(day) {
        const index = this.selectedDays.indexOf(day);
        if (index >= 0) {
            this.selectedDays.splice(index, 1);
        } else {
            this.selectedDays.push(day);
        }
        return this.selectedDays.includes(day);
    }

    // Slot management
    addSlot(slotData) {
        const existingIndex = this.selectedSlots.findIndex(s => s.key === slotData.key);
        if (existingIndex >= 0) return false;
        
        this.selectedSlots.push(slotData);
        return true;
    }

    removeSlot(slotKey) {
        const index = this.selectedSlots.findIndex(s => s.key === slotKey);
        if (index >= 0) {
            this.selectedSlots.splice(index, 1);
            return true;
        }
        return false;
    }

    updateSlotClassroom(day, startTime, classroom) {
        const slot = this.selectedSlots.find(s => s.day === day && s.startTime === startTime);
        if (slot) {
            slot.classroom = classroom;
            return true;
        }
        return false;
    }

    updateSlotSection(day, startTime, sectionKey) {
        const slot = this.selectedSlots.find(s => s.day === day && s.startTime === startTime);
        if (slot) {
            const section = this.courses[sectionKey];
            if (section) {
                slot.key = `${day}-${startTime}-${sectionKey}`;
                slot.sectionKey = sectionKey;
                slot.sectionCode = section.code;
                slot.sectionNum = section.section;
                return true;
            }
        }
        return false;
    }

    getSlotsWithClassrooms() {
        return this.selectedSlots.filter(s => s.classroom);
    }

    // Course utilities
    findCourseByCode(code) {
        if (this.courses[code]) return this.courses[code];
        
        const courseKeys = Object.keys(this.courses);
        const match = courseKeys.find(key => 
            key.toUpperCase().includes(code) || code.includes(key.toUpperCase())
        );
        return match ? this.courses[match] : null;
    }

    findInstructorsForCourse(courseCode) {
        const instructors = [];
        const instructorSet = new Set();

        Object.values(this.courses).forEach(course => {
            if (course.code.toUpperCase().includes(courseCode) || 
                courseCode.includes(course.code.toUpperCase())) {
                
                CONFIG.WORK_DAYS.forEach(day => {
                    if (course.schedule[day]) {
                        course.schedule[day].forEach(slot => {
                            if (slot.teacher && !instructorSet.has(slot.teacher)) {
                                instructorSet.add(slot.teacher);
                                
                                const teacherData = this.teachers[slot.teacher];
                                const totalClasses = teacherData ? teacherData.totalClasses : 0;
                                
                                instructors.push({
                                    name: slot.teacher,
                                    totalClasses: totalClasses,
                                    courseSlot: slot
                                });
                            }
                        });
                    }
                });
            }
        });

        return instructors;
    }

    // Info getters for previews/reports
    getNewSlotInfo(day, hour) {
        for (const slot of this.selectedSlots) {
            if (slot.day !== day) continue;
            
            const startHour = parseInt(slot.startTime.split(':')[0]);
            const duration = parseInt(document.getElementById('requiredDuration')?.value) || 2;
            const endHour = startHour + duration;
            
            if (hour >= startHour && hour < endHour) {
                return {
                    courseCode: slot.sectionCode || '',
                    section: slot.sectionNum || '',
                    classroom: slot.classroom || '',
                    sectionKey: slot.sectionKey || ''
                };
            }
        }
        
        if (this.selectedSections.length > 0) {
            const section = this.selectedSections[0];
            return {
                courseCode: section.code,
                section: section.section,
                classroom: '',
                sectionKey: section.key
            };
        }
        
        return {};
    }

    getRemovingSlotInfo(day, hour) {
        for (const section of this.selectedSections) {
            if (section.schedule[day]) {
                for (const slot of section.schedule[day]) {
                    const startHour = parseInt(slot.startTime.split(':')[0]);
                    const endHour = parseInt(slot.endTime.split(':')[0]);
                    
                    if (hour >= startHour && hour < endHour) {
                        return {
                            courseCode: section.code,
                            section: section.section,
                            courseName: section.name,
                            room: slot.room,
                            teacher: slot.teacher
                        };
                    }
                }
            }
        }
        return {};
    }

    // Reset state
    reset() {
        this.selectedInstructors = [];
        this.courseInstructors = [];
        this.selectedDays = [];
        this.selectedSlots = [];
        this.availableSlots = [];
        this.selectedSections = [];
        this.currentSlotsToRemove = [];
        this.conflictGroups = {};
        this.nextGroupId = 1;
        this.sectionSettings = {};
        this.slotsToMove = {};
    }

    // Get all groups as array for UI rendering
    getGroupsArray() {
        return Object.values(this.conflictGroups);
    }

    // Check if a slot conflicts with any group's conflict courses
    getConflictingGroups(day, hourKey) {
        const conflicting = [];
        
        for (const groupId in this.conflictGroups) {
            const group = this.conflictGroups[groupId];
            
            for (const conflictCode of group.conflictCourses) {
                const course = this.findCourseByCode(conflictCode);
                if (course && course.schedule[day]) {
                    for (const slot of course.schedule[day]) {
                        const startHour = parseInt(slot.startTime.split(':')[0]);
                        const endHour = parseInt(slot.endTime.split(':')[0]);
                        const checkHour = parseInt(hourKey.split(':')[0]);
                        
                        if (checkHour >= startHour && checkHour < endHour) {
                            conflicting.push({
                                groupId,
                                groupName: group.name,
                                conflictCourse: conflictCode
                            });
                            break;
                        }
                    }
                }
            }
        }
        
        return conflicting;
    }
}

// Export singleton instance
window.rescheduleCore = new RescheduleCore();

