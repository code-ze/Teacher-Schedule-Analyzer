// File handling and CSV parsing functionality
class FileHandler {
    constructor() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // File drop handling
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files);
            }
        });

        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files);
            }
        });
    }

    handleFile(files) {
        if (files.length === 0) {
            UTILS.showError('Please select at least one CSV file.');
            return;
        }

        UTILS.showLoading();
        
        const allRows = [];
        let processed = 0;

        Array.from(files).forEach(file => {
            const lower = file.name.toLowerCase();
            const isCsv = lower.endsWith('.csv');
            const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls');

            const pushNormalized = (rawRow) => {
                if (!rawRow) return;
                const normalized = {};
                Object.keys(rawRow).forEach(k => {
                    const key = (k || '').trim();
                    const val = rawRow[k];
                    normalized[key] = typeof val === 'string' ? val.trim() : val;
                });
                if (normalized['Course Name'] && normalized['Section No']) {
                    allRows.push(normalized);
                }
            };

            if (isCsv) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: false,
                    complete: function(results) {
                        if (Array.isArray(results.data)) {
                            results.data.forEach(pushNormalized);
                        }
                        processed++;
                        if (processed === files.length) {
                            try {
                                this.processScheduleData(allRows);
                            } catch (error) {
                                UTILS.showError('Error processing the data: ' + error.message);
                                UTILS.hideLoading();
                            }
                        }
                    }.bind(this),
                    error: function(error) {
                        processed++;
                        if (processed === files.length) {
                            UTILS.showError('Error reading one or more files: ' + error.message);
                            UTILS.hideLoading();
                        }
                    }
                });
            } else if (isXlsx) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
                        json.forEach(pushNormalized);
                    } catch (err) {
                        // swallow and report below
                    } finally {
                        processed++;
                        if (processed === files.length) {
                            try {
                                this.processScheduleData(allRows);
                            } catch (error) {
                                UTILS.showError('Error processing the data: ' + error.message);
                                UTILS.hideLoading();
                            }
                        }
                    }
                };
                reader.onerror = () => {
                    processed++;
                    if (processed === files.length) {
                        UTILS.showError('Error reading one or more files.');
                        UTILS.hideLoading();
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                processed++;
                if (processed === files.length) {
                    this.processScheduleData(allRows);
                }
            }
        });
    }

    processScheduleData(data) {
        const teachers = {};
        const classrooms = {};
        const courses = {}; // Track all courses with their schedules
        let totalClasses = 0;

        // Process each row of header-based data
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row) continue;

            const courseName = row['Course Name'];
            const section = row['Section No'];
            const departmentName = row['Department Name'];
            if (!courseName || !section) continue;
            
            // Extract course code
            const courseCode = UTILS.extractClassId(courseName);

            for (let dayIndex = 0; dayIndex < CONFIG.WORK_DAYS.length; dayIndex++) {
                const dayName = CONFIG.WORK_DAYS[dayIndex];
                const dayData = row[dayName];
                if (!dayData || dayData === '-' || (typeof dayData === 'string' && dayData.trim() === '')) continue;

                const scheduleMatch = String(dayData).match(/(\d{2}:\d{2})-(\d{2}:\d{2})\s*-\s*([^\\]+)\\(.+)/);
                if (!scheduleMatch) continue;

                const [, startTime, endTime, room, teacher] = scheduleMatch;
                const cleanTeacher = String(teacher).trim();
                const cleanRoom = String(room).trim();

                if (!teachers[cleanTeacher]) {
                    teachers[cleanTeacher] = {
                        name: cleanTeacher,
                        schedule: {},
                        totalClasses: 0,
                        department: departmentName || null
                    };
                    CONFIG.WORK_DAYS.forEach(day => {
                        teachers[cleanTeacher].schedule[day] = {};
                        CONFIG.WORK_HOURS.forEach(hour => {
                            teachers[cleanTeacher].schedule[day][hour] = {
                                isBusy: false,
                                course: null,
                                room: null
                            };
                        });
                    });
                }

                if (!classrooms[cleanRoom]) {
                    classrooms[cleanRoom] = {
                        name: cleanRoom,
                        schedule: {},
                        totalHours: 0,
                        totalClasses: 0
                    };
                    CONFIG.WORK_DAYS.forEach(day => {
                        classrooms[cleanRoom].schedule[day] = {};
                        for (let h = 6; h <= 20; h++) {
                            const hourKey = h.toString().padStart(2, '0') + ':00';
                            classrooms[cleanRoom].schedule[day][hourKey] = {
                                isOccupied: false,
                                course: null,
                                teacher: null
                            };
                        }
                    });
                }

                // Track sections with their schedules for rescheduling
                // Use section key like "CIGD3212-01" to uniquely identify each section
                const sectionKey = `${courseCode}-${section}`;
                
                if (!courses[sectionKey]) {
                    courses[sectionKey] = {
                        key: sectionKey,
                        code: courseCode,
                        name: courseName,
                        section: section,
                        department: departmentName,
                        teacher: cleanTeacher,
                        schedule: {}
                    };
                    CONFIG.WORK_DAYS.forEach(day => {
                        courses[sectionKey].schedule[day] = [];
                    });
                }
                
                // Add this time slot to the section schedule
                courses[sectionKey].schedule[dayName].push({
                    day: dayName,
                    startTime: startTime,
                    endTime: endTime,
                    room: cleanRoom,
                    teacher: cleanTeacher
                });

                const startHour = parseInt(startTime.split(':')[0]);
                const endHour = parseInt(endTime.split(':')[0]);
                const classDuration = Math.max(0, endHour - startHour);

                for (let hour = startHour; hour < endHour; hour++) {
                    const hourKey = hour.toString().padStart(2, '0') + ':00';
                    if (teachers[cleanTeacher].schedule[dayName][hourKey]) {
                        teachers[cleanTeacher].schedule[dayName][hourKey] = {
                            isBusy: true,
                            course: courseName,
                            room: cleanRoom,
                            classId: UTILS.extractClassId(courseName),
                            section: section,
                            timeRange: `${startTime}-${endTime}`
                        };
                    }
                    if (classrooms[cleanRoom].schedule[dayName][hourKey]) {
                        classrooms[cleanRoom].schedule[dayName][hourKey] = {
                            isOccupied: true,
                            course: courseName,
                            teacher: cleanTeacher,
                            classId: UTILS.extractClassId(courseName),
                            section: section,
                            timeRange: `${startTime}-${endTime}`
                        };
                    }
                }

                teachers[cleanTeacher].totalClasses++;
                classrooms[cleanRoom].totalHours += classDuration;
                classrooms[cleanRoom].totalClasses++;
                totalClasses++;
            }
        }

        // Initialize other modules with the processed data
        if (window.scheduleAnalyzer) {
            window.scheduleAnalyzer.displayResults(teachers, classrooms, totalClasses);
        }
        if (window.timeQuery) {
            window.timeQuery.setupTimeQueryUI(teachers);
        }
        if (window.classroomAnalyzer) {
            window.classroomAnalyzer.displayClassroomOccupancy(classrooms);
        }
        if (window.rescheduleHelper) {
            window.rescheduleHelper.initialize(courses, classrooms, teachers);
        }

        UTILS.hideLoading();
    }
}

// Initialize file handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fileHandler = new FileHandler();
});


