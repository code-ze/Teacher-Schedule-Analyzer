// Schedule analysis and display functionality
class ScheduleAnalyzer {
    constructor() {
        this.teacherSchedules = document.getElementById('teacherSchedules');
        this.statsSection = document.getElementById('statsSection');
        this.commonFreeSection = document.getElementById('commonFreeSection');
        this.teachers = {}; // Store teachers data for filtering
    }

    displayResults(teachers, classrooms, totalClasses) {
        // Store teachers for filtering
        this.teachers = teachers;
        
        // Get container elements
        this.teacherCardsContainer = document.getElementById('teacherCardsContainer');
        this.teacherSearch = document.getElementById('teacherSearch');
        
        const teacherCount = Object.keys(teachers).length;
        const teachersArray = Object.values(teachers);
        const classroomCount = Object.keys(classrooms).length;
        
        // Calculate statistics
        const avgClassesPerTeacher = teacherCount > 0 ? (totalClasses / teacherCount).toFixed(1) : 0;
        const mostBusyTeacher = teachersArray.length > 0 ? teachersArray.reduce((prev, current) => 
            (prev.totalClasses > current.totalClasses) ? prev : current) : null;

        // Find common free time slots
        const commonFreeSlots = this.findCommonFreeTime(teachers);

        // Display statistics
        this.displayStatistics(teacherCount, classroomCount, totalClasses, avgClassesPerTeacher);

        // Display common free time slots
        this.displayCommonFreeTime(commonFreeSlots);

        // Set up teacher search functionality
        if (this.teacherSearch) {
            this.setupTeacherSearch();
        }

        // Initial render of teachers
        if (this.teacherCardsContainer) {
            this.renderTeachers(teachersArray);
        }

        // Show results section
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = 'block';
        
        // Show time query section now that results are ready
        const timeQuerySection = document.getElementById('timeQuerySection');
        if (timeQuerySection) {
            timeQuerySection.style.display = 'block';
        }
    }

    setupTeacherSearch() {
        // Clear previous event listeners by cloning and replacing
        const newSearch = this.teacherSearch.cloneNode(true);
        this.teacherSearch.parentNode.replaceChild(newSearch, this.teacherSearch);
        this.teacherSearch = newSearch;

        // Add event listener for real-time filtering
        this.teacherSearch.addEventListener('input', () => {
            this.filterTeachers();
        });
    }

    filterTeachers() {
        if (!this.teacherCardsContainer) return;
        
        const searchTerm = (this.teacherSearch.value || '').trim().toLowerCase();
        
        let teachersArray;
        if (!searchTerm) {
            // Show all teachers if search is empty
            teachersArray = Object.values(this.teachers);
        } else {
            // Filter teachers whose name contains the search term
            teachersArray = Object.values(this.teachers).filter(teacher => 
                teacher.name.toLowerCase().includes(searchTerm)
            );
        }

        // Sort teachers by name
        teachersArray.sort((a, b) => a.name.localeCompare(b.name));

        this.renderTeachers(teachersArray);
    }

    renderTeachers(teachersArray) {
        if (teachersArray.length === 0) {
            this.teacherCardsContainer.innerHTML = `
                <div class="no-common-time" style="text-align: center; padding: 20px;">
                    No instructors found matching your search criteria.
                </div>
            `;
            return;
        }

        this.teacherCardsContainer.innerHTML = teachersArray.map(teacher => this.createTeacherCard(teacher)).join('');
    }

    displayStatistics(teacherCount, classroomCount, totalClasses, avgClassesPerTeacher) {
        this.statsSection.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">${teacherCount}</div>
                <div class="stat-label">Total Teachers</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${classroomCount}</div>
                <div class="stat-label">Total Classrooms</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${totalClasses}</div>
                <div class="stat-label">Total Classes</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${avgClassesPerTeacher}</div>
                <div class="stat-label">Avg Classes/Teacher</div>
            </div>
        `;
    }

    findCommonFreeTime(teachers) {
        const teacherNames = Object.keys(teachers);
        if (teacherNames.length === 0) return {};

        const commonFree = {};

        // Initialize common free time for each day
        CONFIG.WORK_DAYS.forEach(day => {
            commonFree[day] = [];

            CONFIG.WORK_HOURS.forEach(hour => {
                // Check if ALL teachers are free at this time
                const allFree = teacherNames.every(teacherName => 
                    !teachers[teacherName].schedule[day][hour].isBusy
                );

                if (allFree) {
                    commonFree[day].push(hour);
                }
            });
        });

        return commonFree;
    }

    displayCommonFreeTime(commonFreeSlots) {
        const hasAnyCommonTime = Object.values(commonFreeSlots).some(slots => slots.length > 0);

        if (!hasAnyCommonTime) {
            this.commonFreeSection.innerHTML = `
                <div class="common-free-title">🚫 Common Free Time Slots</div>
                <div class="no-common-time">
                    Unfortunately, there are no time slots when ALL teachers are free simultaneously.
                    <br><br>
                    <strong>Suggestions:</strong>
                    <ul style="text-align: left; margin-top: 10px;">
                        <li>Consider meeting with smaller groups of teachers</li>
                        <li>Schedule meetings during lunch breaks or after hours</li>
                        <li>Use online meeting platforms for flexibility</li>
                    </ul>
                </div>
            `;
            return;
        }

        const totalCommonSlots = Object.values(commonFreeSlots).reduce((sum, slots) => sum + slots.length, 0);

        this.commonFreeSection.innerHTML = `
            <div class="common-free-title">✅ Common Free Time Slots (${totalCommonSlots} total)</div>
            <div class="common-slots-grid">
                ${CONFIG.WORK_DAYS.map(day => `
                    <div class="day-common-slots">
                        <div class="day-common-title">${day}</div>
                        <div class="common-time-slots">
                            ${commonFreeSlots[day].length > 0 
                                ? commonFreeSlots[day].map(hour => 
                                    `<div class="common-time-slot">${hour}</div>`
                                ).join('')
                                : '<div class="no-slots-day">No common free time</div>'
                            }
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    createTeacherCard(teacher) {
        const freeSlots = this.countFreeSlots(teacher.schedule);
        
        return `
            <div class="teacher-card">
                <div class="teacher-header" onclick="toggleSchedule('${teacher.name.replace(/'/g, "\\'")}')">
                    <div class="teacher-name">${teacher.name}</div>
                    <div class="class-count">${teacher.totalClasses} classes • ${freeSlots} free slots</div>
                </div>
                <div class="schedule-content" id="schedule-${teacher.name.replace(/[^a-zA-Z0-9]/g, '_')}">
                    ${this.createScheduleGrid(teacher.schedule)}
                </div>
            </div>
        `;
    }

    createScheduleGrid(schedule) {
        return CONFIG.WORK_DAYS.map(day => `
            <div class="day-section">
                <div class="day-title">${day}</div>
                <div class="time-slots">
                    ${CONFIG.WORK_HOURS.map(hour => {
                        const slot = schedule[day][hour];
                        const className = slot.isBusy ? 'busy-slot' : 'free-slot';
                        const label = slot.isBusy ? `${slot.timeRange || hour} ${slot.classId || (slot.course && UTILS.extractClassId(slot.course)) || ''} - ${slot.room || ''}`.trim() : `${hour} (Free)`;
                        const tooltip = slot.isBusy 
                            ? `${slot.timeRange || hour}\n${slot.classId || (slot.course && UTILS.extractClassId(slot.course)) || ''} • ${slot.room || ''}\n${slot.course || ''}`
                            : `${hour}: Free`;
                        return `<div class="time-slot ${className} has-tooltip" data-tooltip="${tooltip}">${label}</div>`;
                    }).join('')}
                </div>
            </div>
        `).join('');
    }

    countFreeSlots(schedule) {
        let freeCount = 0;
        CONFIG.WORK_DAYS.forEach(day => {
            CONFIG.WORK_HOURS.forEach(hour => {
                if (!schedule[day][hour].isBusy) {
                    freeCount++;
                }
            });
        });
        return freeCount;
    }
}

// Global function for toggling schedule (called from HTML)
function toggleSchedule(teacherName) {
    const scheduleId = 'schedule-' + teacherName.replace(/[^a-zA-Z0-9]/g, '_');
    const scheduleElement = document.getElementById(scheduleId);
    scheduleElement.classList.toggle('expanded');
}

// Initialize schedule analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scheduleAnalyzer = new ScheduleAnalyzer();
});


