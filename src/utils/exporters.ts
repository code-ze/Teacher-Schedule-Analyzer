import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WORK_DAYS, DISPLAY_HOURS } from '../config';
import type { Classroom, Teacher, DepartmentUtilization, ProcessedData } from '../types';
import { computeDepartmentUtilization } from './departmentUtilization';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function capitalize(s: string | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Classroom occupancy ----------

export function exportClassroomsExcel(classrooms: Classroom[], virtualRooms: Set<string> = new Set()): void {
  const wb = XLSX.utils.book_new();

  const dayHeaders = WORK_DAYS.map((d) => `${d} (%)`);
  const summaryHeaders = ['Room', 'Occupancy %', 'Category', 'Total Classes', 'Departments', ...dayHeaders];
  const category = (c: Classroom) => (virtualRooms.has(c.name) ? 'Virtual / online room' : capitalize(c.occupancyCategory));
  const summaryRows = classrooms.map((classroom) => {
    const dailyOccupancy = WORK_DAYS.map((day) => {
      const count = DISPLAY_HOURS.filter((h) => classroom.schedule[day]?.[h]?.isOccupied).length;
      return parseFloat((count * 12.5).toFixed(1));
    });
    return [
      classroom.name,
      parseFloat(String(classroom.occupancyPercentage ?? 0)),
      category(classroom),
      classroom.totalClasses,
      Array.from(classroom.departments).sort().join(', '),
      ...dailyOccupancy
    ];
  });
  const summarySheet = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  summarySheet['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 32 },
    ...WORK_DAYS.map(() => ({ wch: 16 }))
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Occupancy Summary');

  const scheduleHeaders = ['Room', 'Department', 'Day', 'Time Range', 'Course Code', 'Course Name', 'Lecturer', 'Section'];
  const scheduleRows: (string | number)[][] = [];
  [...classrooms].sort((a, b) => a.name.localeCompare(b.name)).forEach((classroom) => {
    WORK_DAYS.forEach((day) => {
      const seen = new Set<string>();
      DISPLAY_HOURS.forEach((hour) => {
        const slot = classroom.schedule[day]?.[hour];
        if (!slot || !slot.isOccupied) return;
        const dedupeKey = `${slot.timeRange}|${slot.classId}|${slot.section}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        scheduleRows.push([
          classroom.name,
          slot.department || '',
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
  const scheduleSheet = XLSX.utils.aoa_to_sheet([scheduleHeaders, ...scheduleRows]);
  scheduleSheet['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 28 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, scheduleSheet, 'Class Schedule');

  XLSX.writeFile(wb, `classroom-occupancy-${today()}.xlsx`);
}

export function exportClassroomsPDF(classrooms: Classroom[], virtualRooms: Set<string> = new Set()): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Classroom Occupancy Report', 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${classrooms.length} room(s)`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Room', 'Occupancy %', 'Category', 'Total Classes', 'Departments']],
    body: classrooms.map((c) => [
      c.name,
      `${c.occupancyPercentage ?? 0}%`,
      virtualRooms.has(c.name) ? 'Virtual / online' : capitalize(c.occupancyCategory),
      c.totalClasses,
      Array.from(c.departments).sort().join(', ')
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [255, 152, 0] },
    alternateRowStyles: { fillColor: [255, 243, 224] }
  });

  doc.save(`classroom-occupancy-${today()}.pdf`);
}

// ---------- Teachers ----------

export function exportTeachersExcel(teachers: Teacher[]): void {
  const headers = ['Instructor', 'Department', 'Total Classes', 'Day', 'Time', 'Course Code', 'Course Name', 'Room'];
  const rows: (string | number)[][] = [];

  [...teachers].sort((a, b) => a.name.localeCompare(b.name)).forEach((teacher) => {
    WORK_DAYS.forEach((day) => {
      const seen = new Set<string>();
      Object.keys(teacher.schedule[day] || {}).sort().forEach((hourKey) => {
        const slot = teacher.schedule[day][hourKey];
        if (!slot || !slot.isBusy) return;
        const dedupeKey = `${slot.timeRange}|${slot.classId}|${slot.section}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        rows.push([
          teacher.name,
          teacher.department || '',
          teacher.totalClasses,
          day,
          slot.timeRange || hourKey,
          slot.classId || '',
          slot.course || '',
          slot.room || ''
        ]);
      });
    });
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 26 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Instructor Schedules');
  XLSX.writeFile(wb, `instructor-schedules-${today()}.xlsx`);
}

export function exportTeachersPDF(teachers: Teacher[]): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Instructor Schedule Report', 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${teachers.length} instructor(s)`, 14, 28);

  const body: (string | number)[][] = [];
  [...teachers].sort((a, b) => a.name.localeCompare(b.name)).forEach((teacher) => {
    WORK_DAYS.forEach((day) => {
      const seen = new Set<string>();
      Object.keys(teacher.schedule[day] || {}).sort().forEach((hourKey) => {
        const slot = teacher.schedule[day][hourKey];
        if (!slot || !slot.isBusy) return;
        const dedupeKey = `${slot.timeRange}|${slot.classId}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        body.push([teacher.name, day, slot.timeRange || hourKey, slot.classId || '', slot.room || '']);
      });
    });
  });

  autoTable(doc, {
    startY: 35,
    head: [['Instructor', 'Day', 'Time', 'Course', 'Room']],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [102, 126, 234] },
    alternateRowStyles: { fillColor: [237, 240, 253] }
  });

  doc.save(`instructor-schedules-${today()}.pdf`);
}

// ---------- Department utilization ----------

export function exportDepartmentUtilizationExcel(rows: DepartmentUtilization[]): void {
  const headers = ['Department', 'Avg Room Utilization %', 'Room-Hours on Busiest Day', 'Weekly Sections', 'Instructors', 'Rooms Used', 'Room List'];
  const data = rows.map((d) => [
    d.name,
    d.utilizationPercentage,
    d.maxDailyHours,
    d.totalClasses,
    d.teacherCount,
    d.roomCount,
    d.rooms.join(', ')
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Department Utilization');
  XLSX.writeFile(wb, `department-utilization-${today()}.xlsx`);
}

export function exportDepartmentUtilizationPDF(rows: DepartmentUtilization[]): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Department Room Utilization', 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${rows.length} department(s)`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Department', 'Avg Room Util %', 'Room-Hrs (Busiest Day)', 'Weekly Sections', 'Instructors', 'Rooms']],
    body: rows.map((d) => [d.name, `${d.utilizationPercentage}%`, d.maxDailyHours, d.totalClasses, d.teacherCount, d.roomCount]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [21, 101, 192] },
    alternateRowStyles: { fillColor: [227, 242, 253] }
  });

  doc.save(`department-utilization-${today()}.pdf`);
}

// ---------- Building search ----------

export interface BuildingCourseRow {
  courseId: string;
  courseName: string;
  room: string;
  teacher: string;
  timeRange: string;
  days: string[];
}

export function exportBuildingExcel(prefix: string, rows: BuildingCourseRow[]): void {
  const headers = ['Course ID', 'Course Name', 'Room', 'Days', 'Time', 'Instructor'];
  const data = rows.map((c) => [c.courseId, c.courseName, c.room, c.days.join(', '), c.timeRange, c.teacher]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, `Building ${prefix.toUpperCase()}`);
  XLSX.writeFile(wb, `building-${prefix.toUpperCase()}-courses-${today()}.xlsx`);
}

export function exportBuildingPDF(prefix: string, rows: BuildingCourseRow[]): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`Building ${prefix.toUpperCase()} - Course Report`, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${rows.length} course(s)`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Course ID', 'Course Name', 'Room', 'Days', 'Time', 'Instructor']],
    body: rows.map((c) => [c.courseId, c.courseName, c.room, c.days.join(', '), c.timeRange, c.teacher]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [46, 125, 50] },
    alternateRowStyles: { fillColor: [241, 248, 233] }
  });

  doc.save(`building-${prefix.toUpperCase()}-courses-${today()}.pdf`);
}

// ---------- Full data dump (JSON) ----------

export function exportAllDataJSON(data: ProcessedData): void {
  const classrooms = Object.fromEntries(
    Object.entries(data.classrooms).map(([name, classroom]) => [
      name,
      { ...classroom, departments: Array.from(classroom.departments).sort((a, b) => a.localeCompare(b)) }
    ])
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalClasses: data.totalClasses,
      teacherCount: Object.keys(data.teachers).length,
      classroomCount: Object.keys(data.classrooms).length,
      sectionCount: Object.keys(data.courses).length,
      departments: data.departments
    },
    departmentUtilization: computeDepartmentUtilization(data.classrooms),
    teachers: data.teachers,
    classrooms,
    courses: data.courses
  };

  downloadFile(JSON.stringify(payload, null, 2), `schedule-data-${today()}.json`, 'application/json');
}
