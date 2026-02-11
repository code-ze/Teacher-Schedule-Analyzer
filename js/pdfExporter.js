// PDF export functionality
class PDFExporter {
    constructor() {
        this.setupPDFExport();
    }

    setupPDFExport() {
        // Make exportClassroomPDF globally available
        window.exportClassroomPDF = () => this.exportClassroomPDF();
    }

    exportClassroomPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Set up fonts and colors
            doc.setFont("helvetica");
            
            // Title
            doc.setFontSize(CONFIG.PDF.FONT_SIZES.TITLE);
            doc.setTextColor(40, 40, 40);
            doc.text('Detailed Classroom Schedule Report', CONFIG.PDF.MARGIN, 30);
            
            // Date
            doc.setFontSize(CONFIG.PDF.FONT_SIZES.SMALL);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, CONFIG.PDF.MARGIN, 40);
            
            let yPosition = 60;
            const pageHeight = CONFIG.PDF.PAGE_HEIGHT;
            const pageWidth = CONFIG.PDF.PAGE_WIDTH;
            const rightMargin = pageWidth - CONFIG.PDF.MARGIN;
            const contentWidth = pageWidth - (CONFIG.PDF.MARGIN * 2);
            
            // Get classroom data
            const classroomCards = document.querySelectorAll('.classroom-card');
            if (classroomCards.length === 0) {
                doc.setFontSize(CONFIG.PDF.FONT_SIZES.BODY);
                doc.setTextColor(100, 100, 100);
                doc.text('No classroom data available', CONFIG.PDF.MARGIN, yPosition);
                doc.save('classroom-schedule-report.pdf');
                return;
            }
            
            // Summary section
            this.addSummarySection(doc, classroomCards, yPosition);
            yPosition = 60;
            
            // Helper function to check if we need a new page
            const checkPageBreak = (requiredSpace = 50) => {
                if (yPosition > pageHeight - requiredSpace) {
                    doc.addPage();
                    yPosition = 30;
                    return true;
                }
                return false;
            };
            
            // Helper function to add text with word wrapping
            const addWrappedText = (text, x, y, maxWidth, fontSize = 10) => {
                doc.setFontSize(fontSize);
                const lines = doc.splitTextToSize(text, maxWidth);
                doc.text(lines, x, y);
                return y + (lines.length * (fontSize * 0.4));
            };
            
            // Detailed classroom schedules
            classroomCards.forEach((card, index) => {
                // Check if we need a new page for classroom header
                checkPageBreak(80);
                
                const header = card.querySelector('.classroom-header');
                const name = header.querySelector('.classroom-name').textContent;
                const occupancy = header.querySelector('.occupancy-badge').textContent;
                const category = header.querySelector('.occupancy-badge').className.includes('high') ? 'High' :
                               header.querySelector('.occupancy-badge').className.includes('medium') ? 'Medium' : 'Low';
                
                // Classroom header with better spacing
                doc.setFontSize(CONFIG.PDF.FONT_SIZES.HEADER);
                doc.setTextColor(40, 40, 40);
                doc.text(`${index + 1}. ${name}`, CONFIG.PDF.MARGIN, yPosition);
                
                doc.setFontSize(CONFIG.PDF.FONT_SIZES.SMALL);
                doc.setTextColor(100, 100, 100);
                doc.text(`Occupancy: ${occupancy} (${category})`, CONFIG.PDF.MARGIN, yPosition + 8);
                yPosition += 25;
                
                // Get detailed schedule data
                const details = card.querySelector('.classroom-details');
                if (details) {
                    const daySchedules = details.querySelectorAll('.day-schedule');
                    
                    daySchedules.forEach(daySchedule => {
                        const dayName = daySchedule.querySelector('.day-name').textContent.split(' (')[0];
                        const percentage = daySchedule.querySelector('.day-name').textContent.match(/\(([^)]+)\)/);
                        const percent = percentage ? percentage[1] : '0%';
                        
                        // Check if we need a new page for this day
                        checkPageBreak(100);
                        
                        // Day header with background
                        doc.setFillColor(240, 240, 240);
                        doc.rect(15, yPosition - 3, contentWidth, 12, 'F');
                        
                        doc.setFontSize(CONFIG.PDF.FONT_SIZES.SUBHEADER);
                        doc.setTextColor(60, 60, 60);
                        doc.text(`${dayName} (${percent} occupied)`, CONFIG.PDF.MARGIN, yPosition + 5);
                        yPosition += 15;
                        
                        // Get time blocks data
                        const timeBlocks = daySchedule.querySelectorAll('.time-block');
                        
                        if (timeBlocks.length > 0) {
                            // Create a visual schedule representation with better spacing
                            const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
                            const blockWidth = CONFIG.PDF.BLOCK_WIDTH;
                            const startX = CONFIG.PDF.MARGIN;
                            
                            // Draw time blocks with better spacing
                            for (let i = 0; i < timeBlocks.length && i < hours.length; i++) {
                                const block = timeBlocks[i];
                                const isOccupied = block.classList.contains('occupied');
                                const x = startX + (i * blockWidth);
                                
                                // Draw block
                                if (isOccupied) {
                                    doc.setFillColor(255, 152, 0); // Orange for occupied
                                } else {
                                    doc.setFillColor(224, 224, 224); // Gray for free
                                }
                                doc.rect(x, yPosition, blockWidth - 1, 8, 'F');
                                
                                // Add time label every 2 hours
                                if (i % 2 === 0) {
                                    doc.setFontSize(CONFIG.PDF.FONT_SIZES.TINY);
                                    doc.setTextColor(100, 100, 100);
                                    doc.text(hours[i].substring(0, 2), x + 1, yPosition + 10);
                                }
                            }
                            
                            yPosition += 20;
                            
                            // Get and organize class information
                            const classInfo = [];
                            timeBlocks.forEach((block, i) => {
                                if (block.classList.contains('occupied') && block.getAttribute('data-tooltip')) {
                                    const tooltip = block.getAttribute('data-tooltip');
                                    const lines = tooltip.split('\n');
                                    if (lines.length >= 3) {
                                        const timeRange = lines[0];
                                        const classCode = lines[1].split(' • ')[0];
                                        const room = lines[1].split(' • ')[1] || '';
                                        const course = lines[2];
                                        const lecturer = lines[3] ? lines[3].replace('Lecturer: ', '') : '';
                                        
                                        classInfo.push({
                                            time: timeRange,
                                            classCode: classCode,
                                            room: room,
                                            course: course,
                                            lecturer: lecturer
                                        });
                                    }
                                }
                            });
                            
                            // Remove duplicates and sort by time
                            const uniqueClasses = classInfo.filter((item, index, self) => 
                                index === self.findIndex(t => t.time === item.time && t.classCode === item.classCode)
                            );
                            
                            if (uniqueClasses.length > 0) {
                                doc.setFontSize(CONFIG.PDF.FONT_SIZES.BODY);
                                doc.setTextColor(40, 40, 40);
                                doc.text('Scheduled Classes:', CONFIG.PDF.MARGIN, yPosition);
                                yPosition += 8;
                                
                                uniqueClasses.forEach(classItem => {
                                    // Check if we need a new page for class details
                                    checkPageBreak(30);
                                    
                                    // Class time and code
                                    doc.setFontSize(9);
                                    doc.setTextColor(60, 60, 60);
                                    doc.text(`• ${classItem.time} - ${classItem.classCode}`, 25, yPosition);
                                    
                                    // Course name (with wrapping)
                                    yPosition = addWrappedText(`  ${classItem.course}`, 30, yPosition + 4, contentWidth - 10, 8);
                                    
                                    // Lecturer and room
                                    doc.setFontSize(CONFIG.PDF.FONT_SIZES.SMALL);
                                    doc.setTextColor(100, 100, 100);
                                    doc.text(`  Lecturer: ${classItem.lecturer}`, 30, yPosition + 2);
                                    if (classItem.room) {
                                        doc.text(`  Room: ${classItem.room}`, 30, yPosition + 6);
                                        yPosition += 10;
                                    } else {
                                        yPosition += 6;
                                    }
                                    
                                    yPosition += 8;
                                });
                            } else {
                                doc.setFontSize(9);
                                doc.setTextColor(100, 100, 100);
                                doc.text('• No classes scheduled', 25, yPosition);
                                yPosition += 8;
                            }
                        }
                        
                        yPosition += 15;
                    });
                }
                
                yPosition += 10;
            });
            
            // Add footer to all pages
            this.addFooter(doc, pageHeight, rightMargin);
            
            // Save the PDF
            doc.save(`detailed-classroom-schedule-${new Date().toISOString().split('T')[0]}.pdf`);
            
        } catch (error) {
            UTILS.showError('Failed to generate PDF: ' + error.message);
        }
    }

    addSummarySection(doc, classroomCards, yPosition) {
        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);
        doc.text('Summary', CONFIG.PDF.MARGIN, yPosition);
        yPosition += 10;
        
        const totalClassrooms = classroomCards.length;
        const highOccupancy = document.querySelectorAll('.occupancy-high').length;
        const mediumOccupancy = document.querySelectorAll('.occupancy-medium').length;
        const lowOccupancy = document.querySelectorAll('.occupancy-low').length;
        
        doc.setFontSize(CONFIG.PDF.FONT_SIZES.BODY);
        doc.text(`Total Classrooms: ${totalClassrooms}`, CONFIG.PDF.MARGIN, yPosition);
        yPosition += 6;
        doc.text(`High Occupancy (≥75%): ${highOccupancy}`, CONFIG.PDF.MARGIN, yPosition);
        yPosition += 6;
        doc.text(`Medium Occupancy (40-74%): ${mediumOccupancy}`, CONFIG.PDF.MARGIN, yPosition);
        yPosition += 6;
        doc.text(`Low Occupancy (<40%): ${lowOccupancy}`, CONFIG.PDF.MARGIN, yPosition);
    }

    addFooter(doc, pageHeight, rightMargin) {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(CONFIG.PDF.FONT_SIZES.SMALL);
            doc.setTextColor(150, 150, 150);
            doc.text(`Page ${i} of ${pageCount}`, CONFIG.PDF.MARGIN, pageHeight - 10);
            doc.text('Teacher Schedule Analyzer', rightMargin - 60, pageHeight - 10);
        }
    }
}

// Initialize PDF exporter when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pdfExporter = new PDFExporter();
});


