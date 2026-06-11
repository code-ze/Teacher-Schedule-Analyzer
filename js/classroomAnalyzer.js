// Classroom occupancy analysis functionality
class ClassroomAnalyzer {
    constructor() {
        this.classroomSection = document.getElementById('classroomSection');
        this.classrooms = {};
        this.filteredClassrooms = []; // Tracks what is currently visible on screen
    }

    displayClassroomOccupancy(classrooms) {
        // Store classrooms for filtering
        this.classrooms = classrooms;
        const classroomArray = Object.values(classrooms);
        
        // Get or create container elements
        this.classroomGridContainer = document.getElementById('classroomGridContainer');
        this.classroomSearch = document.getElementById('classroomSearch');
        
        // Calculate occupancy percentages
        classroomArray.forEach(classroom => {
            let maxDailyHours = 0;
            
            // Check each day to find the maximum hours used in a single day
            CONFIG.WORK_DAYS.forEach(day => {
                let dailyHours = 0;
                for (let h = 6; h <= 20; h++) {
                    const hourKey = h.toString().padStart(2, '0') + ':00';
                    if (classroom.schedule[day][hourKey] && classroom.schedule[day][hourKey].isOccupied) {
                        dailyHours++;
                    }
                }
                maxDailyHours = Math.max(maxDailyHours, dailyHours);
            });
            
            // 8 hours = 100%, so each hour = 12.5%
            classroom.occupancyPercentage = (maxDailyHours * 12.5).toFixed(1);
            classroom.occupancyCategory = this.getOccupancyCategory(classroom.occupancyPercentage);
        });

        // Add title if it doesn't exist (before search filter)
        if (!this.classroomSection.querySelector('.classroom-title')) {
            const searchContainer = this.classroomSection.querySelector('.search-filter-container');
            const titleDiv = document.createElement('div');
            titleDiv.className = 'classroom-title';
            titleDiv.innerHTML = `
                📚 Classroom Occupancy Analysis
                <button class="export-pdf-btn" id="exportClassroomPdfBtn" onclick="exportClassroomPDF()">
                    📄 Export PDF
                </button>
                <button class="export-excel-btn" id="exportClassroomExcelBtn" onclick="exportClassroomExcel()">
                    📊 Export Excel
                </button>
            `;
            if (searchContainer) {
                this.classroomSection.insertBefore(titleDiv, searchContainer);
            } else {
                this.classroomSection.insertBefore(titleDiv, this.classroomSection.firstChild);
            }
        }

        // Set up search functionality
        if (this.classroomSearch) {
            this.setupSearchFilter();
        }

        // Initial render
        if (this.classroomGridContainer) {
            this.renderClassrooms(classroomArray);
        }
    }

    setupSearchFilter() {
        // Clear previous event listeners by cloning and replacing
        const newSearch = this.classroomSearch.cloneNode(true);
        this.classroomSearch.parentNode.replaceChild(newSearch, this.classroomSearch);
        this.classroomSearch = newSearch;

        this.classroomSearch.addEventListener('input', () => {
            this.filterClassrooms();
        });

        // Building search setup
        const buildingSearchEl = document.getElementById('buildingSearch');
        if (buildingSearchEl) {
            const newBuildingSearch = buildingSearchEl.cloneNode(true);
            buildingSearchEl.parentNode.replaceChild(newBuildingSearch, buildingSearchEl);
            this.buildingSearch = newBuildingSearch;
            this.buildingCoursesContainer = document.getElementById('buildingCoursesContainer');
            this.buildingSearch.addEventListener('input', () => {
                this.filterByBuilding();
            });
        }
    }

    filterByBuilding() {
        if (!this.buildingCoursesContainer) return;

        const prefix = (this.buildingSearch.value || '').trim().toLowerCase();

        if (!prefix) {
            this.buildingCoursesContainer.innerHTML = '';
            return;
        }

        // Collect all unique courses from rooms whose name starts with the prefix
        const courseMap = {}; // key: courseId+room -> {course, room, teacher, days}

        Object.values(this.classrooms).forEach(classroom => {
            if (!classroom.name.toLowerCase().startsWith(prefix)) return;

            CONFIG.WORK_DAYS.forEach(day => {
                for (let h = 6; h <= 20; h++) {
                    const hourKey = h.toString().padStart(2, '0') + ':00';
                    const slot = classroom.schedule[day][hourKey];
                    if (!slot || !slot.isOccupied) continue;

                    const courseId = slot.classId || (slot.course ? UTILS.extractClassId(slot.course) : '') || slot.course || '';
                    const mapKey = `${courseId}||${classroom.name}`;

                    if (!courseMap[mapKey]) {
                        courseMap[mapKey] = {
                            courseId,
                            courseName: slot.course || '',
                            room: classroom.name,
                            teacher: slot.teacher || '',
                            days: new Set(),
                            timeRange: slot.timeRange || hourKey,
                        };
                    }
                    courseMap[mapKey].days.add(day);
                }
            });
        });

        const courses = Object.values(courseMap);

        if (courses.length === 0) {
            this.buildingCoursesContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; background: #f1f8e9; border-radius: 10px; margin-bottom: 20px; color: #555;">
                    No courses found in building "<strong>${prefix.toUpperCase()}</strong>".
                </div>`;
            return;
        }

        // Sort by room then course
        courses.sort((a, b) => a.room.localeCompare(b.room) || a.courseId.localeCompare(b.courseId));

        const rows = courses.map(c => `
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-weight: 600;">${c.courseId}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${c.courseName}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${c.room}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${[...c.days].join(', ')}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${c.timeRange}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${c.teacher}</td>
            </tr>
        `).join('');

        this.buildingCoursesContainer.innerHTML = `
            <div style="background: white; border-radius: 10px; border: 1px solid #4caf50; padding: 16px; margin-bottom: 20px;">
                <div style="font-weight: 700; color: #2e7d32; font-size: 1.1em; margin-bottom: 12px;">
                    🏢 Building <span style="text-transform: uppercase;">${prefix}</span> — ${courses.length} course(s) found
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #e8f5e9;">
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Course ID</th>
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Course Name</th>
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Room</th>
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Days</th>
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Time</th>
                                <th style="padding: 10px 12px; text-align: left; color: #2e7d32;">Instructor</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    filterClassrooms() {
        if (!this.classroomGridContainer) return;
        
        const searchTerm = (this.classroomSearch.value || '').trim().toLowerCase();
        
        if (!searchTerm) {
            // Show all classrooms if search is empty
            const allClassrooms = Object.values(this.classrooms);
            this.renderClassrooms(allClassrooms);
            return;
        }

        // Split by comma and trim each term
        const searchTerms = searchTerm.split(',').map(term => term.trim()).filter(term => term.length > 0);
        
        // Filter classrooms that match any of the search terms
        const filtered = Object.values(this.classrooms).filter(classroom => {
            const classroomName = classroom.name.toLowerCase();
            return searchTerms.some(term => classroomName.includes(term));
        });

        this.renderClassrooms(filtered);
    }

    renderClassrooms(classroomArray) {
        // Sort by occupancy percentage (highest first)
        classroomArray.sort((a, b) => b.occupancyPercentage - a.occupancyPercentage);

        // Keep a reference to whatever is currently on screen for export
        this.filteredClassrooms = classroomArray;

        if (classroomArray.length === 0) {
            this.classroomGridContainer.innerHTML = `
                <div class="no-common-time" style="text-align: center; padding: 20px;">
                    No classrooms found matching your search criteria.
                </div>
            `;
            return;
        }

        this.classroomGridContainer.innerHTML = `
            <div class="classroom-grid">
                ${classroomArray.map(classroom => this.createClassroomCard(classroom)).join('')}
            </div>
        `;
    }

    getOccupancyCategory(percentage) {
        if (percentage >= 75) return 'high';
        if (percentage >= 40) return 'medium';
        return 'low';
    }

    createClassroomCard(classroom) {
        const occupancyClass = `occupancy-${classroom.occupancyCategory}`;
        
        return `
            <div class="classroom-card">
                <div class="classroom-header" onclick="toggleClassroom('${classroom.name.replace(/'/g, "\\'")}')">
                    <div class="classroom-name">${classroom.name}</div>
                    <div class="occupancy-badge ${occupancyClass}">${classroom.occupancyPercentage}%</div>
                </div>
                <div class="classroom-details" id="classroom-${classroom.name.replace(/[^a-zA-Z0-9]/g, '_')}">
                    <div class="occupancy-bar">
                        <div class="occupancy-fill ${occupancyClass}" style="width: ${Math.min(classroom.occupancyPercentage, 100)}%; background: ${this.getOccupancyColor(classroom.occupancyPercentage)};"></div>
                    </div>
                    
                    <div class="occupancy-stats">
                        <div class="stat-box">
                            <div class="stat-value">${Math.max(...CONFIG.WORK_DAYS.map(day => {
                                let dailyHours = 0;
                                for (let h = 6; h <= 20; h++) {
                                    const hourKey = h.toString().padStart(2, '0') + ':00';
                                    if (classroom.schedule[day][hourKey] && classroom.schedule[day][hourKey].isOccupied) {
                                        dailyHours++;
                                    }
                                }
                                return dailyHours;
                            }))}h</div>
                            <div class="stat-label-small">Max Daily Hours</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${classroom.totalClasses}</div>
                            <div class="stat-label-small">Total Classes</div>
                        </div>
                    </div>

                    <div class="daily-schedule">
                        ${CONFIG.WORK_DAYS.map(day => this.createDaySchedule(classroom, day)).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    createDaySchedule(classroom, day) {
        const daySchedule = classroom.schedule[day];
        // Show hours from 6am to 8pm to capture all possible class times
        const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
        
        // Calculate daily occupancy percentage
        let dailyHours = 0;
        hours.forEach(hour => {
            if (daySchedule[hour] && daySchedule[hour].isOccupied) {
                dailyHours++;
            }
        });
        const dailyPercentage = (dailyHours * 12.5).toFixed(1);
        
        return `
            <div class="day-schedule">
                <div class="day-name">${day} (${dailyPercentage}%)</div>
                <div class="time-blocks">
                    ${hours.map(hour => {
                        const slot = daySchedule[hour];
                        const blockClass = slot && slot.isOccupied ? 'occupied' : 'free';
                        const tooltip = slot && slot.isOccupied 
                            ? `${slot.timeRange || hour}\n${slot.classId || (slot.course && UTILS.extractClassId(slot.course)) || ''} • ${slot.room || ''}\n${slot.course || ''}\nLecturer: ${slot.teacher || ''}`.trim()
                            : `${hour}: Free`;
                        return `<div class="time-block ${blockClass} has-tooltip" data-tooltip="${tooltip}"></div>`;
                    }).join('')}
                </div>
                <div class="time-labels">
                    ${hours.map(hour => `<div class="time-label">${hour.substring(0, 2)}</div>`).join('')}
                </div>
            </div>
        `;
    }

    getOccupancyColor(percentage) {
        if (percentage >= 75) return '#d32f2f';
        if (percentage >= 40) return '#f57c00';
        return '#388e3c';
    }
}

// Global function for toggling classroom (called from HTML)
function toggleClassroom(classroomName) {
    const classroomId = 'classroom-' + classroomName.replace(/[^a-zA-Z0-9]/g, '_');
    const classroomElement = document.getElementById(classroomId);
    classroomElement.classList.toggle('expanded');
}

// Initialize classroom analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.classroomAnalyzer = new ClassroomAnalyzer();
});


