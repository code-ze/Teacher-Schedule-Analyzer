// Reschedule Report - Complete Schedule Comparison PDF
// Shows BEFORE and AFTER schedules for all instructors + classroom occupancy

class RescheduleReport {
    constructor() {
        this.core = null;
        
        // Professional color palette
        this.colors = {
            primary: [41, 98, 255],
            primaryDark: [25, 60, 150],
            secondary: [0, 150, 136],
            success: [46, 125, 50],
            danger: [211, 47, 47],
            warning: [255, 152, 0],
            dark: [33, 33, 33],
            gray: [97, 97, 97],
            lightGray: [189, 189, 189],
            background: [248, 249, 250],
            white: [255, 255, 255],
            busyOrange: [255, 183, 77],
            newGreen: [129, 199, 132],
            removedRed: [239, 154, 154]
        };
        
        this.hours = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];
        this.days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    }

    initialize(core) {
        this.core = core;
    }

    // ==================== MAIN EXPORT FUNCTION ====================
    
    exportFullReport(courseToMove) {
        try {
            if (!this.core.selectedInstructors || this.core.selectedInstructors.length === 0) {
                this.showNotification('Please select at least one instructor first.', 'warning');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for better schedule view
            
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;
            let y = 0;
            let pageNum = 0;

            // ===== COVER PAGE =====
            this.createCoverPage(doc, pageWidth, pageHeight);
            
            // ===== SUMMARY PAGE =====
            doc.addPage();
            pageNum++;
            y = this.addPageHeader(doc, 'Schedule Change Summary', pageNum, pageWidth);
            y = this.addSummarySection(doc, margin, y, pageWidth, courseToMove);
            
            // ===== INSTRUCTOR SCHEDULES (BEFORE & AFTER) =====
            for (const instructorName of this.core.selectedInstructors) {
                doc.addPage();
                pageNum++;
                y = this.addPageHeader(doc, instructorName + ' - Schedule Comparison', pageNum, pageWidth);
                y = this.addInstructorComparison(doc, margin, y, pageWidth, instructorName);
            }
            
            // ===== CLASSROOM OCCUPANCY (BEFORE & AFTER) - PREFERRED CLASSROOMS ONLY =====
            const preferredClassrooms = this.getPreferredClassrooms();
            if (preferredClassrooms.length > 0) {
                // Each preferred classroom gets its own page
                preferredClassrooms.forEach((room, index) => {
                    doc.addPage();
                    pageNum++;
                    y = this.addPageHeader(doc, 'Classroom: ' + room, pageNum, pageWidth);
                    y = this.addSingleClassroomComparison(doc, margin, y, pageWidth, room);
                });
            }
            
            // ===== DETAILED CHANGES PAGE =====
            doc.addPage();
            pageNum++;
            y = this.addPageHeader(doc, 'Detailed Change Log', pageNum, pageWidth);
            y = this.addDetailedChanges(doc, margin, y, pageWidth, courseToMove);

            // Add footers to all pages
            this.addFootersToAllPages(doc, 'Schedule Reschedule Report', pageWidth, pageHeight);

            // Save
            const filename = 'Schedule-Reschedule-Report-' + this.formatDate(new Date()) + '.pdf';
            doc.save(filename);
            
            this.showNotification('Report exported successfully!', 'success');

        } catch (error) {
            console.error('PDF export error:', error);
            this.showNotification('Failed to generate PDF: ' + error.message, 'error');
        }
    }

    // Alias for backward compatibility
    exportTeacherReport(courseToMove) {
        this.exportFullReport(courseToMove);
    }

    exportClassroomReport(courseToMove) {
        this.exportFullReport(courseToMove);
    }

    // ==================== COVER PAGE ====================
    
    createCoverPage(doc, pageWidth, pageHeight) {
        // Clean gradient background
        doc.setFillColor(30, 60, 114); // Dark navy
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Lighter accent section at bottom
        doc.setFillColor(42, 82, 152);
        doc.rect(0, pageHeight * 0.55, pageWidth, pageHeight * 0.45, 'F');
        
        // Decorative accent line
        doc.setFillColor(0, 150, 136); // Teal
        doc.rect(0, pageHeight * 0.54, pageWidth, 4, 'F');
        
        // Main title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(48);
        doc.setFont('helvetica', 'bold');
        doc.text('Schedule Change', pageWidth / 2, 55, { align: 'center' });
        
        doc.setFontSize(42);
        doc.setTextColor(0, 200, 180);
        doc.text('Report', pageWidth / 2, 75, { align: 'center' });
        
        // Decorative line under title
        doc.setDrawColor(0, 150, 136);
        doc.setLineWidth(1.5);
        doc.line(pageWidth / 2 - 50, 85, pageWidth / 2 + 50, 85);
        
        // Stats section
        const statsY = 105;
        const boxWidth = 50;
        const boxHeight = 40;
        const gap = 20;
        const totalWidth = (boxWidth * 4) + (gap * 3);
        const startX = (pageWidth - totalWidth) / 2;
        
        const stats = [
            { label: 'Instructors', value: this.core.selectedInstructors.length },
            { label: 'Sections', value: this.core.selectedSections.length },
            { label: 'Slots Moving', value: Object.keys(this.core.slotsToMove).filter(k => this.core.slotsToMove[k].selected).length },
            { label: 'New Slots', value: this.core.selectedSlots.length }
        ];
        
        stats.forEach((stat, i) => {
            const bx = startX + i * (boxWidth + gap);
            
            // Box with border
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(bx, statsY, boxWidth, boxHeight, 5, 5, 'F');
            
            // Value
            doc.setTextColor(30, 60, 114);
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text(String(stat.value), bx + boxWidth / 2, statsY + 22, { align: 'center' });
            
            // Label
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(stat.label, bx + boxWidth / 2, statsY + 34, { align: 'center' });
        });
        
        // Instructors section
        const instructorsY = statsY + boxHeight + 25;
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('Affected Instructors:', pageWidth / 2, instructorsY, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 220, 255);
        
        // Split instructors into lines if too many
        const instructors = this.core.selectedInstructors;
        if (instructors.length <= 3) {
            doc.text(instructors.join('   |   '), pageWidth / 2, instructorsY + 12, { align: 'center' });
        } else {
            const line1 = instructors.slice(0, 3).join('   |   ');
            const line2 = instructors.slice(3).join('   |   ');
            doc.text(line1, pageWidth / 2, instructorsY + 12, { align: 'center' });
            doc.text(line2, pageWidth / 2, instructorsY + 22, { align: 'center' });
        }
        
        // Date and time at bottom
        doc.setTextColor(180, 200, 230);
        doc.setFontSize(11);
        const now = new Date();
        const dateStr = 'Generated: ' + now.toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        }) + ' at ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        doc.text(dateStr, pageWidth / 2, pageHeight - 25, { align: 'center' });
        
        // Footer branding
        doc.setFontSize(10);
        doc.setTextColor(150, 170, 200);
        doc.text('Teacher Schedule Analyzer', pageWidth / 2, pageHeight - 12, { align: 'center' });
    }

    // ==================== PAGE HEADER ====================
    
    addPageHeader(doc, title, pageNum, pageWidth) {
        // Header bar
        doc.setFillColor(...this.colors.primary);
        doc.rect(0, 0, pageWidth, 18, 'F');
        
        // Accent line
        doc.setFillColor(...this.colors.secondary);
        doc.rect(0, 18, pageWidth, 2, 'F');
        
        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 12, 12);
        
        // Page number
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Page ' + (pageNum + 1), pageWidth - 25, 12);
        
        return 28;
    }

    // ==================== SUMMARY SECTION ====================
    
    addSummarySection(doc, x, y, pageWidth, courseToMove) {
        // Section title
        doc.setFillColor(...this.colors.primary);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Overview', x + 8, y + 6);
        y += 14;
        
        // Sections being moved table
        const sections = this.core.selectedSections;
        const tableData = sections.map(section => {
            const selectedSlots = this.core.getSelectedSlotsForSection(section.key);
            const slotsInfo = selectedSlots.map(s => s.day.substring(0, 3) + ' ' + s.startTime + ' @ ' + s.room).join(', ');
            
            const newSlots = this.core.selectedSlots.filter(s => s.sectionKey === section.key);
            const newSlotsInfo = newSlots.map(s => s.day.substring(0, 3) + ' ' + s.startTime + ' @ ' + s.classroom).join(', ');
            
            return [
                section.code,
                'Sec ' + section.section,
                section.teacher,
                slotsInfo || 'None selected',
                newSlotsInfo || 'Not assigned'
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['Course', 'Section', 'Instructor', 'Original Slots (Moving)', 'New Slots (Proposed)']],
            body: tableData,
            margin: { left: x, right: x },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 8,
                textColor: this.colors.dark
            },
            alternateRowStyles: {
                fillColor: this.colors.background
            },
            columnStyles: {
                0: { cellWidth: 25, fontStyle: 'bold' },
                1: { cellWidth: 20 },
                2: { cellWidth: 40 },
                3: { cellWidth: 55 },
                4: { cellWidth: 55 }
            },
            styles: {
                cellPadding: 3,
                lineWidth: 0.1,
                lineColor: this.colors.lightGray
            }
        });

        return doc.lastAutoTable.finalY + 10;
    }

    // ==================== INSTRUCTOR COMPARISON ====================
    
    addInstructorComparison(doc, x, y, pageWidth, instructorName) {
        const gridWidth = (pageWidth - x * 3) / 2;
        
        // Build current and proposed schedules
        const currentSchedule = this.buildCurrentSchedule(instructorName);
        const proposedSchedule = this.buildProposedSchedule(instructorName);
        
        // Calculate working hours (time at university - first to last class)
        const currentHours = this.calculateWorkingHoursFromGrid(currentSchedule);
        const proposedHours = this.calculateWorkingHoursFromGrid(proposedSchedule);
        
        // ===== TIME AT UNIVERSITY BOX =====
        const boxWidth = pageWidth - x * 2;
        const boxHeight = 32;
        
        // Box background
        doc.setFillColor(245, 248, 255);
        doc.roundedRect(x, y, boxWidth, boxHeight, 4, 4, 'F');
        doc.setDrawColor(...this.colors.primary);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, y, boxWidth, boxHeight, 4, 4, 'S');
        
        // Title
        doc.setTextColor(...this.colors.primary);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Time at University (First Class to Last Class)', x + 8, y + 9);
        
        // Find longest day for current and proposed
        const currentLongest = this.findLongestWorkDay(currentHours.byDay);
        const proposedLongest = this.findLongestWorkDay(proposedHours.byDay);
        
        // Current box
        const halfWidth = (boxWidth - 30) / 2;
        doc.setFillColor(...this.colors.removedRed);
        doc.roundedRect(x + 8, y + 14, halfWidth, 14, 3, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('CURRENT:', x + 12, y + 23);
        
        doc.setFont('helvetica', 'normal');
        let currentText = 'No classes';
        if (currentLongest.hours > 0) {
            currentText = currentLongest.start + ' to ' + currentLongest.end + ' = ' + currentLongest.hours + 'h (' + currentLongest.day + ')';
        }
        doc.text(currentText, x + 40, y + 23);
        
        // Proposed box
        doc.setFillColor(...this.colors.newGreen);
        doc.roundedRect(x + 16 + halfWidth, y + 14, halfWidth, 14, 3, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('PROPOSED:', x + 20 + halfWidth, y + 23);
        
        doc.setFont('helvetica', 'normal');
        let proposedText = 'No classes';
        if (proposedLongest.hours > 0) {
            proposedText = proposedLongest.start + ' to ' + proposedLongest.end + ' = ' + proposedLongest.hours + 'h (' + proposedLongest.day + ')';
        }
        doc.text(proposedText, x + 52 + halfWidth, y + 23);
        
        y += boxHeight + 8;
        
        // Schedule comparison titles
        doc.setFillColor(...this.colors.danger);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CURRENT Schedule (' + currentHours.totalTeaching + 'h teaching)', x + 8, y + 6);
        
        doc.setFillColor(...this.colors.success);
        doc.roundedRect(x + gridWidth + x, y, 4, 8, 1, 1, 'F');
        doc.text('PROPOSED Schedule (' + proposedHours.totalTeaching + 'h teaching)', x + gridWidth + x + 8, y + 6);
        
        y += 12;
        
        // Draw both grids
        this.drawScheduleGrid(doc, x, y, gridWidth, currentSchedule, 'current');
        this.drawScheduleGrid(doc, x + gridWidth + x, y, gridWidth, proposedSchedule, 'proposed');
        
        // Calculate grid height
        const gridHeight = (this.days.length + 1) * 10 + 15;
        y += gridHeight;
        
        // Daily breakdown table
        y += 5;
        doc.setFillColor(...this.colors.secondary);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Daily Breakdown (First to Last Class)', x + 8, y + 6);
        y += 12;
        
        const dayTableData = this.days.map(day => {
            const curr = currentHours.byDay[day] || { start: '-', end: '-', teaching: 0, atUni: 0 };
            const prop = proposedHours.byDay[day] || { start: '-', end: '-', teaching: 0, atUni: 0 };
            
            const currStr = curr.atUni > 0 ? (curr.start + ' to ' + curr.end + ' (' + curr.atUni + 'h)') : 'Free';
            const propStr = prop.atUni > 0 ? (prop.start + ' to ' + prop.end + ' (' + prop.atUni + 'h)') : 'Free';
            
            const diff = prop.atUni - curr.atUni;
            let changeStr = '-';
            if (diff > 0) changeStr = '+' + diff + 'h more';
            else if (diff < 0) changeStr = diff + 'h less';
            else if (curr.atUni > 0 || prop.atUni > 0) changeStr = 'Same';
            
            return [day.substring(0, 3), currStr, curr.teaching + 'h', propStr, prop.teaching + 'h', changeStr];
        });

        doc.autoTable({
            startY: y,
            head: [['Day', 'Current (At Uni)', 'Teaching', 'Proposed (At Uni)', 'Teaching', 'Change']],
            body: dayTableData,
            margin: { left: x, right: x },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontStyle: 'bold',
                fontSize: 8
            },
            bodyStyles: {
                fontSize: 8,
                textColor: this.colors.dark
            },
            columnStyles: {
                0: { cellWidth: 20, fontStyle: 'bold' },
                1: { cellWidth: 45 },
                2: { cellWidth: 22 },
                3: { cellWidth: 45 },
                4: { cellWidth: 22 },
                5: { cellWidth: 30 }
            },
            styles: {
                cellPadding: 2
            },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body') {
                    const text = data.cell.raw;
                    if (text.includes('more')) {
                        data.cell.styles.textColor = this.colors.danger;
                    } else if (text.includes('less')) {
                        data.cell.styles.textColor = this.colors.success;
                    }
                }
            }
        });

        return doc.lastAutoTable.finalY + 10;
    }

    // ==================== CLASSROOM COMPARISON ====================
    
    addSingleClassroomComparison(doc, x, y, pageWidth, roomName) {
        const gridWidth = (pageWidth - x * 3) / 2;
        
        // Build current and proposed schedules for this room
        const currentSchedule = this.buildCurrentClassroomSchedule(roomName);
        const proposedSchedule = this.buildProposedClassroomSchedule(roomName);
        
        // Room name header (larger, more prominent)
        doc.setFillColor(...this.colors.secondary);
        doc.roundedRect(x, y, pageWidth - x * 2, 14, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Classroom: ' + roomName, x + 10, y + 10);
        y += 18;
        
        // Section title for BEFORE
        doc.setFillColor(...this.colors.danger);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('BEFORE (Current Schedule)', x + 8, y + 6);
        
        // Section title for AFTER
        doc.setFillColor(...this.colors.success);
        doc.roundedRect(x + gridWidth + x, y, 4, 8, 1, 1, 'F');
        doc.text('AFTER (Proposed Schedule)', x + gridWidth + x + 8, y + 6);
        
        y += 12;
        
        // Draw both grids side by side
        this.drawScheduleGrid(doc, x, y, gridWidth, currentSchedule, 'current');
        this.drawScheduleGrid(doc, x + gridWidth + x, y, gridWidth, proposedSchedule, 'proposed');
        
        // Calculate grid height
        const gridHeight = (this.days.length + 1) * 10 + 15;
        y += gridHeight;
        
        // Summary table showing changes
        y += 8;
        doc.setFillColor(...this.colors.primary);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Schedule Changes Summary', x + 8, y + 6);
        y += 12;
        
        // Count slots being freed and added
        const slotsFreed = this.countSlotsInSchedule(currentSchedule, 'removing');
        const slotsAdded = this.countSlotsInSchedule(proposedSchedule, 'new');
        const slotsRemaining = this.countSlotsInSchedule(proposedSchedule, 'busy');
        
        const summaryData = [
            ['Slots Being Freed', String(slotsFreed)],
            ['New Slots Added', String(slotsAdded)],
            ['Slots Remaining', String(slotsRemaining)],
            ['Total After Change', String(slotsRemaining + slotsAdded)]
        ];
        
        doc.autoTable({
            startY: y,
            head: [['Metric', 'Count']],
            body: summaryData,
            margin: { left: x, right: x },
            headStyles: {
                fillColor: this.colors.primary,
                textColor: this.colors.white,
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 9,
                textColor: this.colors.dark
            },
            columnStyles: {
                0: { cellWidth: 80, fontStyle: 'bold' },
                1: { cellWidth: 40 }
            },
            styles: {
                cellPadding: 4
            }
        });
        
        return doc.lastAutoTable.finalY + 10;
    }
    
    countSlotsInSchedule(schedule, status) {
        let count = 0;
        this.days.forEach(day => {
            const daySchedule = schedule[day] || {};
            this.hours.forEach(hour => {
                const hourKey = hour + ':00';
                const cell = daySchedule[hourKey];
                if (cell && cell.status === status) {
                    count++;
                }
            });
        });
        return count;
    }

    // ==================== DETAILED CHANGES ====================
    
    addDetailedChanges(doc, x, y, pageWidth, courseToMove) {
        // Removed slots table
        doc.setFillColor(...this.colors.danger);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Slots Being Removed (Freed Up)', x + 8, y + 6);
        y += 12;
        
        const removedData = [];
        Object.values(this.core.slotsToMove).forEach(slot => {
            if (slot.selected) {
                const section = this.core.courses[slot.sectionKey];
                removedData.push([
                    section ? section.code : slot.sectionKey,
                    section ? 'Sec ' + section.section : '-',
                    slot.day,
                    slot.startTime + ' - ' + slot.endTime,
                    slot.room,
                    section ? section.teacher : '-'
                ]);
            }
        });

        if (removedData.length > 0) {
            doc.autoTable({
                startY: y,
                head: [['Course', 'Section', 'Day', 'Time', 'Room', 'Instructor']],
                body: removedData,
                margin: { left: x, right: x },
                headStyles: {
                    fillColor: this.colors.danger,
                    textColor: this.colors.white,
                    fontStyle: 'bold',
                    fontSize: 9
                },
                bodyStyles: { fontSize: 8 },
                styles: { cellPadding: 2 }
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...this.colors.gray);
            doc.text('No slots selected for removal.', x, y + 5);
            y += 15;
        }
        
        // New slots table
        doc.setFillColor(...this.colors.success);
        doc.roundedRect(x, y, 4, 8, 1, 1, 'F');
        doc.setTextColor(...this.colors.dark);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('New Slots (Proposed)', x + 8, y + 6);
        y += 12;
        
        const newData = this.core.selectedSlots.map(slot => {
            const section = this.core.courses[slot.sectionKey];
            return [
                section ? section.code : (slot.sectionCode || '-'),
                slot.sectionNum ? 'Sec ' + slot.sectionNum : (section ? 'Sec ' + section.section : '-'),
                slot.day,
                slot.startTime + ' - ' + slot.endTime,
                slot.classroom,
                section ? section.teacher : '-'
            ];
        });

        if (newData.length > 0) {
            doc.autoTable({
                startY: y,
                head: [['Course', 'Section', 'Day', 'Time', 'Room', 'Instructor']],
                body: newData,
                margin: { left: x, right: x },
                headStyles: {
                    fillColor: this.colors.success,
                    textColor: this.colors.white,
                    fontStyle: 'bold',
                    fontSize: 9
                },
                bodyStyles: { fontSize: 8 },
                styles: { cellPadding: 2 }
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(9);
            doc.setTextColor(...this.colors.gray);
            doc.text('No new slots assigned.', x, y + 5);
            y += 15;
        }
        
        return y;
    }

    // ==================== SCHEDULE GRID DRAWING ====================
    
    drawScheduleGrid(doc, x, y, width, schedule, mode) {
        const hourColWidth = (width - 22) / this.hours.length;
        const rowHeight = 10;
        const dayColWidth = 22;
        
        // Header row
        doc.setFillColor(...this.colors.primary);
        doc.rect(x, y, width, rowHeight, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text('Day', x + 2, y + 6);
        
        this.hours.forEach((hour, i) => {
            const hx = x + dayColWidth + (i * hourColWidth);
            doc.text(hour, hx + 2, y + 6);
        });
        
        y += rowHeight;
        
        // Day rows
        this.days.forEach((day, dayIndex) => {
            const daySchedule = schedule[day] || {};
            
            // Row background
            if (dayIndex % 2 === 0) {
                doc.setFillColor(...this.colors.background);
            } else {
                doc.setFillColor(255, 255, 255);
            }
            doc.rect(x, y, width, rowHeight, 'F');
            
            // Day name
            doc.setTextColor(...this.colors.dark);
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.text(day.substring(0, 3), x + 2, y + 6);
            
            // Hour cells
            this.hours.forEach((hour, i) => {
                const hx = x + dayColWidth + (i * hourColWidth);
                const hourKey = hour + ':00';
                const cell = daySchedule[hourKey];
                
                let cellColor = [255, 255, 255];
                let symbol = '';
                let textColor = this.colors.lightGray;
                
                if (cell) {
                    if (cell.status === 'new') {
                        cellColor = this.colors.newGreen;
                        textColor = this.colors.success;
                        symbol = '+';
                    } else if (cell.status === 'removing') {
                        cellColor = this.colors.removedRed;
                        textColor = this.colors.danger;
                        symbol = 'X';
                    } else if (cell.status === 'busy') {
                        cellColor = this.colors.busyOrange;
                        textColor = this.colors.warning;
                        symbol = '#';
                    }
                }
                
                // Cell background
                doc.setFillColor(...cellColor);
                doc.rect(hx, y, hourColWidth - 0.3, rowHeight - 0.3, 'F');
                
                // Cell border
                doc.setDrawColor(...this.colors.lightGray);
                doc.setLineWidth(0.1);
                doc.rect(hx, y, hourColWidth - 0.3, rowHeight - 0.3, 'S');
                
                // Symbol
                if (symbol) {
                    doc.setTextColor(...textColor);
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.text(symbol, hx + hourColWidth / 2 - 1.5, y + 6);
                }
            });
            
            y += rowHeight;
        });
        
        // Legend
        y += 3;
        const legendItems = [
            { color: this.colors.busyOrange, label: '# Busy' },
            { color: this.colors.newGreen, label: '+ New' },
            { color: this.colors.removedRed, label: 'X Removed' },
            { color: [255, 255, 255], label: 'o Free' }
        ];
        
        let lx = x;
        doc.setFontSize(5);
        legendItems.forEach(item => {
            doc.setFillColor(...item.color);
            doc.rect(lx, y, 4, 3, 'F');
            doc.setDrawColor(...this.colors.lightGray);
            doc.rect(lx, y, 4, 3, 'S');
            
            doc.setTextColor(...this.colors.gray);
            doc.text(item.label, lx + 5, y + 2.5);
            lx += 22;
        });
        
        return y + 8;
    }

    // ==================== SCHEDULE BUILDERS ====================
    
    buildCurrentSchedule(instructorName) {
        const schedule = {};
        const teacherData = this.core.teachers[instructorName];
        
        if (!teacherData || !teacherData.schedule) return schedule;
        
        this.days.forEach(day => {
            schedule[day] = {};
            const daySchedule = teacherData.schedule[day] || {};
            
            this.hours.forEach(hour => {
                const hourKey = hour + ':00';
                const slot = daySchedule[hourKey];
                
                if (slot && slot.isBusy) {
                    // Check if this slot is being removed
                    const isRemoving = this.core.currentSlotsToRemove.some(s => 
                        s.day === day && s.hourKey === hourKey && 
                        this.core.selectedSections.some(sec => sec.teacher === instructorName)
                    );
                    
                    schedule[day][hourKey] = {
                        status: isRemoving ? 'removing' : 'busy',
                        course: slot.course,
                        section: slot.section
                    };
                }
            });
        });
        
        return schedule;
    }
    
    buildProposedSchedule(instructorName) {
        const schedule = {};
        const teacherData = this.core.teachers[instructorName];
        
        if (!teacherData || !teacherData.schedule) return schedule;
        
        // Get sections taught by this instructor
        const instructorSections = this.core.selectedSections.filter(s => s.teacher === instructorName);
        const instructorSectionKeys = instructorSections.map(s => s.key);
        
        this.days.forEach(day => {
            schedule[day] = {};
            const daySchedule = teacherData.schedule[day] || {};
            
            this.hours.forEach(hour => {
                const hourKey = hour + ':00';
                const hourNum = parseInt(hour);
                const slot = daySchedule[hourKey];
                
                // Check if this is a new slot for this instructor
                const newSlot = this.core.selectedSlots.find(s => 
                    s.day === day && 
                    parseInt(s.startTime.split(':')[0]) <= hourNum &&
                    parseInt(s.endTime.split(':')[0]) > hourNum &&
                    instructorSectionKeys.includes(s.sectionKey)
                );
                
                if (newSlot) {
                    schedule[day][hourKey] = {
                        status: 'new',
                        course: newSlot.sectionCode,
                        section: newSlot.sectionNum
                    };
                } else if (slot && slot.isBusy) {
                    // Check if this slot is being removed
                    const isRemoving = this.core.currentSlotsToRemove.some(s => 
                        s.day === day && s.hourKey === hourKey &&
                        instructorSectionKeys.some(key => {
                            const normalizedKey = key.toUpperCase();
                            const normalizedSection = (s.section || '').toUpperCase();
                            return normalizedKey === normalizedSection || 
                                   normalizedKey.replace(/-0+/, '-') === normalizedSection.replace(/-0+/, '-');
                        })
                    );
                    
                    if (!isRemoving) {
                        schedule[day][hourKey] = {
                            status: 'busy',
                            course: slot.course,
                            section: slot.section
                        };
                    }
                }
            });
        });
        
        return schedule;
    }
    
    buildCurrentClassroomSchedule(roomName) {
        const schedule = {};
        const classroom = this.core.classrooms[roomName];
        
        if (!classroom || !classroom.schedule) return schedule;
        
        this.days.forEach(day => {
            schedule[day] = {};
            const daySchedule = classroom.schedule[day] || {};
            
            this.hours.forEach(hour => {
                const hourKey = hour + ':00';
                const slot = daySchedule[hourKey];
                
                if (slot && slot.isOccupied) {
                    const isRemoving = this.core.currentSlotsToRemove.some(s => 
                        s.day === day && s.hourKey === hourKey && s.room === roomName
                    );
                    
                    schedule[day][hourKey] = {
                        status: isRemoving ? 'removing' : 'busy',
                        course: slot.classId,
                        section: slot.section
                    };
                }
            });
        });
        
        return schedule;
    }
    
    buildProposedClassroomSchedule(roomName) {
        const schedule = {};
        const classroom = this.core.classrooms[roomName];
        
        this.days.forEach(day => {
            schedule[day] = {};
            
            // First, copy non-removing existing slots
            if (classroom && classroom.schedule && classroom.schedule[day]) {
                const daySchedule = classroom.schedule[day];
                
                this.hours.forEach(hour => {
                    const hourKey = hour + ':00';
                    const slot = daySchedule[hourKey];
                    
                    if (slot && slot.isOccupied) {
                        const isRemoving = this.core.currentSlotsToRemove.some(s => 
                            s.day === day && s.hourKey === hourKey && s.room === roomName
                        );
                        
                        if (!isRemoving) {
                            schedule[day][hourKey] = {
                                status: 'busy',
                                course: slot.classId,
                                section: slot.section
                            };
                        }
                    }
                });
            }
            
            // Add new slots assigned to this room
            this.core.selectedSlots.forEach(slot => {
                if (slot.day === day && slot.classroom === roomName) {
                    const startHour = parseInt(slot.startTime.split(':')[0]);
                    const endHour = parseInt(slot.endTime.split(':')[0]);
                    
                    for (let h = startHour; h < endHour; h++) {
                        const hourKey = h.toString().padStart(2, '0') + ':00';
                        schedule[day][hourKey] = {
                            status: 'new',
                            course: slot.sectionCode,
                            section: slot.sectionNum
                        };
                    }
                }
            });
        });
        
        return schedule;
    }

    // ==================== HELPERS ====================
    
    getPreferredClassrooms() {
        // Get preferred classrooms from the input field
        const preferredInput = document.getElementById('specificClassrooms');
        if (!preferredInput || !preferredInput.value) {
            return [];
        }
        
        // Parse comma-separated list and normalize
        const preferred = preferredInput.value
            .split(',')
            .map(c => c.trim().toUpperCase())
            .filter(c => c.length > 0);
        
        // Only return classrooms that exist in the system
        const validRooms = preferred.filter(room => 
            this.core.classrooms && this.core.classrooms[room]
        );
        
        return validRooms.sort();
    }
    
    getAffectedClassrooms() {
        const rooms = new Set();
        
        // Rooms being freed
        this.core.currentSlotsToRemove.forEach(slot => {
            if (slot.room) rooms.add(slot.room);
        });
        
        // Rooms being assigned
        this.core.selectedSlots.forEach(slot => {
            if (slot.classroom) rooms.add(slot.classroom);
        });
        
        return Array.from(rooms).sort();
    }
    
    calculateWorkingHoursFromGrid(schedule) {
        const byDay = {};
        let totalTeaching = 0;
        
        this.days.forEach(day => {
            const daySchedule = schedule[day] || {};
            const busyHours = [];
            
            this.hours.forEach(hour => {
                const hourKey = hour + ':00';
                const cell = daySchedule[hourKey];
                if (cell && (cell.status === 'busy' || cell.status === 'new')) {
                    busyHours.push(parseInt(hour));
                }
            });
            
            if (busyHours.length > 0) {
                const firstClass = Math.min(...busyHours);
                const lastClass = Math.max(...busyHours) + 1; // End of last class
                const hoursAtUni = lastClass - firstClass; // Time from first to last
                
                byDay[day] = {
                    start: firstClass.toString().padStart(2, '0') + ':00',
                    end: lastClass.toString().padStart(2, '0') + ':00',
                    teaching: busyHours.length,
                    atUni: hoursAtUni
                };
                totalTeaching += busyHours.length;
            } else {
                byDay[day] = { start: '-', end: '-', teaching: 0, atUni: 0 };
            }
        });
        
        return { byDay, totalTeaching };
    }
    
    findLongestWorkDay(byDay) {
        let longest = { day: '-', start: '-', end: '-', hours: 0 };
        
        for (const day in byDay) {
            const d = byDay[day];
            if (d.atUni > longest.hours) {
                longest = {
                    day: day.substring(0, 3),
                    start: d.start,
                    end: d.end,
                    hours: d.atUni
                };
            }
        }
        
        return longest;
    }
    
    addFootersToAllPages(doc, reportTitle, pageWidth, pageHeight) {
        const pageCount = doc.internal.getNumberOfPages();
        
        for (let i = 2; i <= pageCount; i++) {
            doc.setPage(i);
            
            doc.setDrawColor(...this.colors.lightGray);
            doc.setLineWidth(0.3);
            doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12);
            
            doc.setTextColor(...this.colors.gray);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(reportTitle, 12, pageHeight - 6);
            doc.text(this.formatDate(new Date()), pageWidth / 2, pageHeight - 6, { align: 'center' });
            doc.text('Page ' + i + ' of ' + pageCount, pageWidth - 12, pageHeight - 6, { align: 'right' });
        }
    }
    
    formatDate(date) {
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });
    }
    
    showNotification(message, type) {
        type = type || 'info';
        const notification = document.createElement('div');
        notification.className = 'pdf-notification ' + type;
        
        let icon = 'i';
        if (type === 'success') icon = 'OK';
        else if (type === 'error') icon = '!';
        
        notification.innerHTML = '<span class="notification-icon">' + icon + '</span><span class="notification-message">' + message + '</span>';
        
        const bgColor = type === 'success' ? '#4CAF50' : (type === 'error' ? '#f44336' : '#2196F3');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;padding:15px 25px;border-radius:8px;background:' + bgColor + ';color:white;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;display:flex;align-items:center;gap:10px;';
        
        document.body.appendChild(notification);
        
        setTimeout(function() {
            notification.remove();
        }, 3000);
    }
}

// Export singleton instance
window.rescheduleReport = new RescheduleReport();
