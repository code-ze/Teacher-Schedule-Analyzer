// Excel export functionality for Classroom Occupancy Analysis
class ExcelExporter {
    constructor() {
        this.setupExcelExport();
    }

    setupExcelExport() {
        window.exportClassroomExcel = () => this.exportClassroomExcel();
    }

    exportClassroomExcel() {
        try {
            const analyzer = window.classroomAnalyzer;
            const classroomArray = analyzer && analyzer.filteredClassrooms;
            if (!classroomArray || classroomArray.length === 0) {
                UTILS.showError('No classroom data available to export.');
                return;
            }

            const wb = XLSX.utils.book_new();
            this._addSummarySheet(wb, classroomArray);
            this._addScheduleSheet(wb, classroomArray);

            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `classroom-occupancy-${date}.xlsx`);
        } catch (error) {
            UTILS.showError('Failed to generate Excel: ' + error.message);
        }
    }

    // Sheet 1: one row per classroom with daily hours breakdown
    _addSummarySheet(wb, classroomArray) {
        const hours = this._getHours();

        const dayHeaders = CONFIG.WORK_DAYS.map(d => `${d} (hrs)`);
        const headers = ['Room', 'Occupancy %', 'Category', 'Total Classes', ...dayHeaders];

        const rows = classroomArray.map(classroom => {
            const dailyHours = CONFIG.WORK_DAYS.map(day =>
                hours.filter(h => classroom.schedule[day][h] && classroom.schedule[day][h].isOccupied).length
            );

            return [
                classroom.name,
                parseFloat(classroom.occupancyPercentage),
                this._capitalize(classroom.occupancyCategory),
                classroom.totalClasses,
                ...dailyHours
            ];
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

        ws['!cols'] = [
            { wch: 14 },
            { wch: 14 },
            { wch: 12 },
            { wch: 15 },
            ...CONFIG.WORK_DAYS.map(() => ({ wch: 16 }))
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Occupancy Summary');
    }

    // Sheet 2: one row per scheduled class across all rooms and days
    _addScheduleSheet(wb, classroomArray) {
        const hours = this._getHours();
        const headers = ['Room', 'Day', 'Time Range', 'Course Code', 'Course Name', 'Lecturer', 'Section'];

        const sorted = [...classroomArray].sort((a, b) => a.name.localeCompare(b.name));

        const rows = [];
        sorted.forEach(classroom => {
            CONFIG.WORK_DAYS.forEach(day => {
                const seen = new Set();
                hours.forEach(hour => {
                    const slot = classroom.schedule[day][hour];
                    if (!slot || !slot.isOccupied) return;

                    // Deduplicate multi-hour blocks by time range + course key
                    const key = `${slot.timeRange || hour}|${slot.classId || slot.course || ''}`;
                    if (seen.has(key)) return;
                    seen.add(key);

                    rows.push([
                        classroom.name,
                        day,
                        slot.timeRange || hour,
                        slot.classId || '',
                        slot.course || '',
                        slot.teacher || '',
                        slot.section || ''
                    ]);
                });
            });
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

        ws['!cols'] = [
            { wch: 12 },
            { wch: 12 },
            { wch: 14 },
            { wch: 14 },
            { wch: 42 },
            { wch: 28 },
            { wch: 10 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Schedule Details');
    }

    _getHours() {
        return ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
                '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    }

    _capitalize(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.excelExporter = new ExcelExporter();
});
