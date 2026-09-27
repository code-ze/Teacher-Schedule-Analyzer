import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WORK_DAYS } from '../config';
import type { DepartmentReport, ReportMeeting, RoomUsage } from './departmentReport';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function departmentReportFileName(report: DepartmentReport, ext: 'pdf' | 'xlsx'): string {
  return `${slug(report.department)}-room-utilization-${today()}.${ext}`;
}

const dayOrder = (day: string) => WORK_DAYS.indexOf(day as (typeof WORK_DAYS)[number]);

function byCourse(a: ReportMeeting, b: ReportMeeting): number {
  return (
    a.code.localeCompare(b.code) ||
    a.section.localeCompare(b.section, undefined, { numeric: true }) ||
    dayOrder(a.day) - dayOrder(b.day) ||
    a.startTime.localeCompare(b.startTime)
  );
}

function sharedWithText(room: RoomUsage): string {
  return room.sharedWith.map((d) => `${d} (${room.otherHours[d]}h)`).join(', ');
}

function summaryRows(report: DepartmentReport): [string, string | number][] {
  const s = report.summary;
  const dept = report.department;
  return [
    ['Courses', s.courses],
    ['Sections', s.sections],
    ['Classes per week', s.weeklyClasses],
    ['Teaching hours per week', s.weeklyHours],
    ['Instructors', s.instructors],
    ['Rooms used', s.rooms],
    [`Rooms used only by ${dept}`, s.exclusiveRooms],
    ['Rooms shared with other departments', s.sharedRooms],
    ['Available hours in these rooms (per week)', s.capacityHours],
    [`Hours used by ${dept}`, s.weeklyHours],
    ['Hours used by other departments', s.otherDepartmentHours],
    ['Free hours', s.freeHours],
    [`${dept} utilization of its rooms`, `${s.departmentUtilization}%`],
    ['Total utilization of these rooms (all departments)', `${s.totalUtilization}%`],
    [`${dept} share of the booked time`, `${s.departmentShare}%`],
    ['Room clashes / combined classes', report.clashes.length]
  ];
}

export function hourShareOfWeek(report: DepartmentReport): number {
  return report.capacityPerRoom > 0 ? Math.round((1000 / report.capacityPerRoom)) / 10 : 0;
}

function methodNote(report: DepartmentReport): string {
  return (
    `Available time = ${report.days.length} teaching days (${report.days.join(', ')}) x 8 hours (08:00-16:00) = ` +
    `${report.capacityPerRoom} hours per room per week. Utilization = booked hours / available hours. ` +
    `1 hour = 12.5% of a room's day (${hourShareOfWeek(report)}% of its week); exact class times matter less than total hours.`
  );
}

// ---------- Excel ----------

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  return h * 60 + (m || 0);
}

function roomTimetableRows(report: DepartmentReport): (string | number)[][] {
  const all = [...report.meetings, ...report.otherMeetings];
  const rows: (string | number)[][] = [];
  const minHour = Math.min(8, ...all.map((m) => Math.floor(toMinutes(m.startTime) / 60)));
  const maxHour = Math.max(16, ...all.map((m) => Math.ceil(toMinutes(m.endTime) / 60)));
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

  report.rooms.forEach((room) => {
    rows.push([
      `${room.room} - ${room.totalUtilization}% used (${report.department}: ${room.departmentHours}h, ` +
        `others: ${room.otherHoursTotal}h, free: ${room.freeHours}h)`
    ]);
    rows.push(['Time', ...report.days]);
    for (let h = minHour; h < maxHour; h++) {
      const cells = report.days.map((day) =>
        all
          .filter(
            (m) =>
              m.room === room.room &&
              m.day === day &&
              toMinutes(m.startTime) < (h + 1) * 60 &&
              toMinutes(m.endTime) > h * 60
          )
          .map((m) => `${m.code}-${m.section} (${m.department})`)
          .join(' + ')
      );
      rows.push([`${hh(h)}-${hh(h + 1)}`, ...cells]);
    }
    rows.push([]);
  });
  return rows;
}

export function buildDepartmentReportWorkbook(report: DepartmentReport): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const dept = report.department;

  const summary = XLSX.utils.aoa_to_sheet([
    [`${dept} - Room Utilization Report`],
    [`Generated ${today()}`],
    [],
    ['Measure', 'Value'],
    ...summaryRows(report),
    [],
    [methodNote(report)]
  ]);
  summary['!cols'] = [{ wch: 48 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  const rooms = XLSX.utils.aoa_to_sheet([
    ['Room', `${dept} hours`, 'Other dept hours', 'Free hours', 'Available hours', `${dept} use %`, 'Total use %', `${dept} share of booked time %`, `${dept} classes`, 'Other classes', 'Shared with'],
    ...report.rooms.map((r) => [
      r.room, r.departmentHours, r.otherHoursTotal, r.freeHours, r.capacityHours,
      r.departmentUtilization, r.totalUtilization, r.departmentShare, r.departmentClasses, r.otherClasses,
      sharedWithText(r) || `Only ${dept}`
    ])
  ]);
  rooms['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 11 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 13 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, rooms, 'Rooms');

  const meetingHeader = ['Course', 'Course Name', 'Section', 'Day', 'Time', 'Hours', 'Room', 'Instructor'];
  const meetingRow = (m: ReportMeeting) => [m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.hours, m.room, m.teacher];

  const classes = XLSX.utils.aoa_to_sheet([meetingHeader, ...[...report.meetings].sort(byCourse).map(meetingRow)]);
  classes['!cols'] = [{ wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 9 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, classes, `${dept} Classes`.slice(0, 31));

  const others = XLSX.utils.aoa_to_sheet([
    ['Room', 'Department', ...meetingHeader.filter((h) => h !== 'Room')],
    ...report.otherMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.hours, m.teacher])
  ]);
  others['!cols'] = [{ wch: 9 }, { wch: 30 }, { wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, others, 'Other Depts in These Rooms');

  const timetable = XLSX.utils.aoa_to_sheet(roomTimetableRows(report));
  timetable['!cols'] = [{ wch: 13 }, ...report.days.map(() => ({ wch: 34 }))];
  XLSX.utils.book_append_sheet(wb, timetable, 'Room Timetables');

  const instructors = XLSX.utils.aoa_to_sheet([
    ['Instructor', 'Sections', 'Classes per week', 'Hours per week'],
    ...report.instructors.map((i) => [i.name, i.sections, i.classes, i.hours])
  ]);
  instructors['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, instructors, 'Instructors');

  if (report.clashes.length > 0) {
    const clashes = XLSX.utils.aoa_to_sheet([
      ['Room', 'Day', 'Class 1', 'Time 1', 'Department 1', 'Class 2', 'Time 2', 'Department 2'],
      ...report.clashes.map((c) => [
        c.room, c.day,
        `${c.first.code}-${c.first.section}`, `${c.first.startTime}-${c.first.endTime}`, c.first.department,
        `${c.second.code}-${c.second.section}`, `${c.second.startTime}-${c.second.endTime}`, c.second.department
      ])
    ]);
    clashes['!cols'] = [{ wch: 9 }, { wch: 11 }, { wch: 13 }, { wch: 12 }, { wch: 28 }, { wch: 13 }, { wch: 12 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, clashes, 'Clashes');
  }

  return wb;
}

export function exportDepartmentReportExcel(report: DepartmentReport): void {
  XLSX.writeFile(buildDepartmentReportWorkbook(report), departmentReportFileName(report, 'xlsx'));
}

// ---------- PDF ----------

const BLUE: [number, number, number] = [21, 101, 192];
const LIGHT: [number, number, number] = [236, 243, 252];

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function nextY(doc: DocWithTable, gap = 10): number {
  const y = (doc.lastAutoTable?.finalY ?? 20) + gap;
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    return 18;
  }
  return y;
}

function heading(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(13);
  doc.setTextColor(...BLUE);
  doc.text(text, 14, y);
  doc.setTextColor(0);
  return y + 3;
}

export function buildDepartmentReportPDF(report: DepartmentReport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape' }) as DocWithTable;
  const dept = report.department;
  const s = report.summary;
  const tableStyle = {
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: BLUE },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14 }
  };

  doc.setFontSize(18);
  doc.text(`${dept} - Room Utilization Report`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 25);
  doc.text(doc.splitTextToSize(methodNote(report), 265), 14, 31);
  doc.setTextColor(0);

  doc.setFontSize(11);
  const headline =
    `${dept} teaches ${s.weeklyClasses} classes (${s.weeklyHours} hours) a week in ${s.rooms} rooms. ` +
    `It uses ${s.departmentUtilization}% of those rooms' available time; with other departments included they are ` +
    `${s.totalUtilization}% used. ${s.sharedRooms} of the ${s.rooms} rooms are shared with other departments.`;
  doc.text(doc.splitTextToSize(headline, 265), 14, 42);

  autoTable(doc, {
    ...tableStyle,
    startY: 54,
    head: [['Measure', 'Value']],
    body: summaryRows(report),
    tableWidth: 150,
    styles: { fontSize: 9, cellPadding: 2 }
  });

  autoTable(doc, {
    ...tableStyle,
    startY: heading(doc, 'Room by room', nextY(doc, 12)),
    head: [['Room', `${dept} h`, 'Other h', 'Free h', `${dept} use`, 'Total use', `${dept} share`, 'Shared with']],
    body: report.rooms.map((r) => [
      r.room, r.departmentHours, r.otherHoursTotal, r.freeHours,
      `${r.departmentUtilization}%`, `${r.totalUtilization}%`, `${r.departmentShare}%`,
      sharedWithText(r) || `Only ${dept}`
    ]),
    columnStyles: { 7: { cellWidth: 110 } }
  });

  if (report.otherMeetings.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading(doc, `Other departments' classes in ${dept} rooms`, nextY(doc, 12)),
      head: [['Room', 'Department', 'Course', 'Course Name', 'Sec', 'Day', 'Time', 'Instructor']],
      body: report.otherMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.teacher])
    });
  }

  autoTable(doc, {
    ...tableStyle,
    startY: heading(doc, `${dept} classes`, nextY(doc, 12)),
    head: [['Course', 'Course Name', 'Sec', 'Day', 'Time', 'Room', 'Instructor']],
    body: [...report.meetings].sort(byCourse).map((m) => [m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.room, m.teacher])
  });

  autoTable(doc, {
    ...tableStyle,
    startY: heading(doc, 'Instructors', nextY(doc, 12)),
    head: [['Instructor', 'Sections', 'Classes / week', 'Hours / week']],
    body: report.instructors.map((i) => [i.name, i.sections, i.classes, i.hours]),
    tableWidth: 150
  });

  if (report.clashes.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading(doc, 'Room clashes / combined classes (same room, overlapping time)', nextY(doc, 12)),
      head: [['Room', 'Day', 'Class 1', 'Time 1', 'Department 1', 'Class 2', 'Time 2', 'Department 2']],
      body: report.clashes.map((c) => [
        c.room, c.day,
        `${c.first.code}-${c.first.section}`, `${c.first.startTime}-${c.first.endTime}`, c.first.department,
        `${c.second.code}-${c.second.section}`, `${c.second.startTime}-${c.second.endTime}`, c.second.department
      ])
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${dept} room utilization - page ${p} of ${pages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  return doc;
}

export function exportDepartmentReportPDF(report: DepartmentReport): void {
  buildDepartmentReportPDF(report).save(departmentReportFileName(report, 'pdf'));
}
