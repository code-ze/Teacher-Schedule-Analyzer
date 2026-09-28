import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WORK_DAYS } from '../config';
import { toMinutes, type DepartmentReport, type ReportMeeting, type RoomUsage } from './departmentReport';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function departmentReportFileName(report: DepartmentReport, ext: 'pdf' | 'xlsx'): string {
  const who = report.departments.length <= 3 ? report.departments.map(slug).join('_') : `${report.departments.length}-departments`;
  return `${who}-room-utilization-${today()}.${ext}`;
}

export function hourShareOfWeek(report: DepartmentReport): number {
  return report.capacityPerRoom > 0 ? Math.round(1000 / report.capacityPerRoom) / 10 : 0;
}

/** "Only Design" / "Only selected departments" */
export function onlyLabel(report: DepartmentReport): string {
  return report.departments.length === 1 ? `Only ${report.label}` : 'Only selected departments';
}

function titleDepartments(report: DepartmentReport): string {
  return report.departments.join(' + ');
}

function methodNote(report: DepartmentReport): string {
  return (
    `Available time = ${report.days.length} teaching days (${report.days.join(', ')}) x 8 hours (08:00-16:00) = ` +
    `${report.capacityPerRoom} hours per room per week. Utilization = booked hours / available hours. ` +
    `1 hour = 12.5% of a room's day (${hourShareOfWeek(report)}% of its week).` +
    (report.virtualRooms.length
      ? ` Virtual / online rooms (${report.virtualRooms.join(', ')}) are excluded from all room figures.`
      : '')
  );
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

function hoursText(hours: Record<string, number>): string {
  return Object.keys(hours)
    .sort((a, b) => a.localeCompare(b))
    .map((d) => `${d} ${hours[d]}h`)
    .join(', ');
}

function roomStatus(report: DepartmentReport, r: RoomUsage): string {
  if (r.sharedWith.length > 0) return r.noClasses ? 'Shared (no classes)' : 'Shared';
  const status = report.departments.length > 1 && r.usedBy.length > 1 ? 'Selected depts only' : `Only ${r.usedBy[0]}`;
  return r.noClasses ? `${status} (no classes)` : status;
}

function keyFigures(report: DepartmentReport): [string, string][] {
  const s = report.summary;
  const online = s.onlineClasses > 0;
  return [
    [String(s.weeklyClasses), online ? 'Classes in rooms / week' : 'Classes / week'],
    ...(online ? ([[String(s.onlineClasses), 'Online classes (virtual rooms)']] as [string, string][]) : []),
    [String(s.weeklyHours), 'Teaching hours / week'],
    [String(s.rooms), 'Rooms used'],
    [`${s.totalUtilization}%`, 'Room use (all depts)'],
    [`${s.selectedShare}%`, `${report.departments.length === 1 ? report.label : 'Selected'} share of booked time`],
    [String(s.freeHours), 'Free room-hours / week']
  ];
}

function roomGroupRows(report: DepartmentReport): (string | number)[][] {
  const g = [
    [onlyLabel(report), report.selectedOnlyRooms],
    ['Shared with other departments', report.sharedRooms]
  ] as const;
  const s = report.summary;
  return [
    ...g.map(([name, t]) => [
      name, t.rooms.length, t.selectedHours, t.otherHours, t.freeHours, `${t.totalUtilization}%`, t.rooms.join(', ')
    ]),
    ['All rooms', s.rooms, s.weeklyHours, s.otherDepartmentHours, s.freeHours, `${s.totalUtilization}%`, '']
  ];
}

function departmentRows(report: DepartmentReport): (string | number)[][] {
  return report.byDepartment.map((d) => [
    d.department,
    d.weeklyClasses,
    d.weeklyHours,
    d.instructors,
    d.rooms,
    d.ownRooms.rooms.length,
    d.ownRooms.rooms.length ? `${d.ownRooms.totalUtilization}%` : '-',
    d.sharedRooms.rooms.length,
    d.sharedRooms.rooms.length ? `${d.sharedRooms.departmentShare}%` : '-',
    d.onlineClasses ? `${d.onlineClasses} (${d.onlineHours}h)` : '-'
  ]);
}

const DEPARTMENT_HEADER = ['Department', 'Classes / wk', 'Hours / wk', 'Instructors', 'Rooms', 'Own rooms', 'Own rooms used', 'Shared rooms', 'Its share of shared rooms', 'Online classes'];
function groupHeader(report: DepartmentReport): string[] {
  const who = report.departments.length === 1 ? report.label : 'Selected depts';
  return ['Rooms', 'Count', `${who} hrs`, 'Other depts hrs', 'Free hrs', 'Use', 'Room list'];
}

// ---------- Excel ----------

function roomTimetableRows(report: DepartmentReport): (string | number)[][] {
  const all = [...report.meetings, ...report.otherMeetings];
  const rows: (string | number)[][] = [];
  const minHour = Math.min(8, ...all.map((m) => Math.floor(toMinutes(m.startTime) / 60)));
  const maxHour = Math.max(16, ...all.map((m) => Math.ceil(toMinutes(m.endTime) / 60)));
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

  [...report.rooms].sort((a, b) => a.room.localeCompare(b.room)).forEach((room) => {
    rows.push([`${room.room} - ${room.totalUtilization}% used (${hoursText({ ...room.hoursByDepartment, ...room.otherHours })}; free ${room.freeHours}h)`]);
    rows.push(['Time', ...report.days]);
    for (let h = minHour; h < maxHour; h++) {
      const cells = report.days.map((day) =>
        all
          .filter((m) => m.room === room.room && m.day === day && toMinutes(m.startTime) < (h + 1) * 60 && toMinutes(m.endTime) > h * 60)
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

  const summary = XLSX.utils.aoa_to_sheet([
    [`Room Utilization Report - ${titleDepartments(report)}`],
    [`Generated ${today()}`],
    [methodNote(report)],
    [],
    ['KEY FIGURES'],
    ...keyFigures(report).map(([v, l]) => [l, v]),
    [],
    ['KEY FINDINGS'],
    ...report.findings.map((f) => [f.text]),
    [],
    ['BY DEPARTMENT'],
    DEPARTMENT_HEADER,
    ...departmentRows(report),
    [],
    ['OWN ROOMS VS SHARED ROOMS'],
    groupHeader(report),
    ...roomGroupRows(report)
  ]);
  summary['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 13 }, { wch: 15 }, { wch: 12 }, { wch: 11 }, { wch: 15 }, { wch: 13 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  const rooms = XLSX.utils.aoa_to_sheet([
    ['Room', 'Status', ...report.departments.map((d) => `${d} hrs`), 'Other depts hrs', 'Other depts', 'Free hrs', 'Total use %', 'Selected share %'],
    ...report.rooms.map((r) => [
      r.room, roomStatus(report, r), ...report.departments.map((d) => r.hoursByDepartment[d] || 0),
      r.otherHoursTotal, hoursText(r.otherHours), r.freeHours, r.totalUtilization, r.selectedShare
    ])
  ]);
  rooms['!cols'] = [{ wch: 10 }, { wch: 22 }, ...report.departments.map(() => ({ wch: 16 })), { wch: 15 }, { wch: 55 }, { wch: 9 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, rooms, 'Rooms');

  const classes = XLSX.utils.aoa_to_sheet([
    ['Department', 'Course', 'Course Name', 'Section', 'Day', 'Time', 'Hours', 'Room', 'Instructor'],
    ...[...report.meetings]
      .sort((a, b) => a.department.localeCompare(b.department) || byCourse(a, b))
      .map((m) => [m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.hours, m.room, m.teacher])
  ]);
  classes['!cols'] = [{ wch: 26 }, { wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 9 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, classes, 'Classes');

  const others = XLSX.utils.aoa_to_sheet([
    ['Room', 'Department', 'Course', 'Course Name', 'Section', 'Day', 'Time', 'Hours', 'Instructor'],
    ...report.otherMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.hours, m.teacher])
  ]);
  others['!cols'] = [{ wch: 9 }, { wch: 30 }, { wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, others, 'Other Depts in These Rooms');

  const timetable = XLSX.utils.aoa_to_sheet(roomTimetableRows(report));
  timetable['!cols'] = [{ wch: 13 }, ...report.days.map(() => ({ wch: 34 }))];
  XLSX.utils.book_append_sheet(wb, timetable, 'Room Timetables');

  const instructors = XLSX.utils.aoa_to_sheet([
    ['Instructor', 'Department', 'Sections', 'Classes per week', 'Hours per week'],
    ...report.instructors.map((i) => [i.name, i.departments.join(', '), i.sections, i.classes, i.hours])
  ]);
  instructors['!cols'] = [{ wch: 32 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, instructors, 'Instructors');

  if (report.virtualMeetings.length > 0) {
    const online = XLSX.utils.aoa_to_sheet([
      ['These classes are in rooms marked as virtual / online and are not counted in any room figure.'],
      [],
      ['Virtual room', 'Department', 'Course', 'Course Name', 'Section', 'Day', 'Time', 'Hours', 'Instructor'],
      ...report.virtualMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.hours, m.teacher])
    ]);
    online['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 7 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, online, 'Online Classes');
  }

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

type RGB = [number, number, number];
const BLUE: RGB = [21, 101, 192];
const DARK: RGB = [33, 33, 33];
const MUTED: RGB = [110, 110, 110];
const LIGHT: RGB = [240, 245, 252];
const TONE: Record<'good' | 'warn' | 'info', RGB> = { good: [46, 125, 50], warn: [211, 47, 47], info: BLUE };

function useColor(pct: number): RGB {
  if (pct >= 75) return [211, 47, 47];
  if (pct >= 40) return [245, 124, 0];
  return [56, 142, 60];
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

const MARGIN = 14;

export function buildDepartmentReportPDF(report: DepartmentReport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape' }) as DocWithTable;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const tableStyle = {
    styles: { fontSize: 8.5, cellPadding: 2, textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 16 }
  };

  const ensureSpace = (y: number, needed: number): number => {
    if (y + needed > pageH - 18) {
      doc.addPage();
      return 18;
    }
    return y;
  };
  const afterTable = () => (doc.lastAutoTable?.finalY ?? 0) + 10;
  const heading = (text: string, y: number, sub?: string): number => {
    y = ensureSpace(y, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BLUE);
    doc.text(text, MARGIN, y);
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 1.8, pageW - MARGIN, y + 1.8);
    doc.setFont('helvetica', 'normal');
    if (sub) {
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(sub, MARGIN, y + 6.5);
      return y + 9;
    }
    return y + 5;
  };

  // Header band
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('Room Utilization Report', MARGIN, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(titleDepartments(report), MARGIN, 20);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, pageW - MARGIN, 12, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(methodNote(report), contentW), MARGIN, 32);

  // Key figure tiles
  const figures = keyFigures(report);
  const gap = 4;
  const tileW = (contentW - gap * (figures.length - 1)) / figures.length;
  const tileY = 40;
  figures.forEach(([value, label], i) => {
    const x = MARGIN + i * (tileW + gap);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, tileY, tileW, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...BLUE);
    doc.text(value, x + tileW / 2, tileY + 10, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(label, tileW - 4), x + tileW / 2, tileY + 16, { align: 'center' });
  });

  // Key findings
  let y = heading('Key findings', tileY + 32);
  y += 2;
  doc.setFontSize(9.5);
  report.findings.forEach((f) => {
    const lines = doc.splitTextToSize(f.text, contentW - 8);
    y = ensureSpace(y, lines.length * 4.6 + 2);
    doc.setFillColor(...TONE[f.tone]);
    doc.circle(MARGIN + 1.8, y - 1.2, 1.2, 'F');
    doc.setTextColor(...DARK);
    doc.text(lines, MARGIN + 6, y);
    y += lines.length * 4.6 + 1.6;
  });

  // By department
  autoTable(doc, {
    ...tableStyle,
    startY: heading('By department', y + 6, '"Own rooms" = rooms no other department teaches in.'),
    head: [DEPARTMENT_HEADER],
    body: departmentRows(report),
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  // Own vs shared rooms
  autoTable(doc, {
    ...tableStyle,
    startY: heading('Own rooms vs shared rooms', afterTable()),
    head: [groupHeader(report)],
    body: roomGroupRows(report),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 6: { cellWidth: 95 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 2) data.cell.styles.fontStyle = 'bold';
    }
  });

  // Room by room, busiest first, with a usage bar
  const USE_COL = 5;
  autoTable(doc, {
    ...tableStyle,
    startY: heading('Room by room', afterTable(), 'Sorted from most to least used. Hours are per week.'),
    head: [['Room', 'Status', report.departments.length === 1 ? `${report.label} hrs` : 'Selected depts (hrs)', 'Other departments (hrs)', 'Free hrs', 'Total use']],
    body: report.rooms.map((r) => [
      r.room,
      roomStatus(report, r),
      report.departments.length === 1 ? String(r.selectedHours) : hoursText(r.hoursByDepartment),
      hoursText(r.otherHours) || '-',
      r.freeHours,
      `${r.totalUtilization}%`
    ]),
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 18 },
      1: { cellWidth: 36 },
      4: { cellWidth: 16 },
      [USE_COL]: { cellWidth: 62, fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === USE_COL) {
        data.cell.styles.textColor = useColor(parseFloat(String(data.cell.raw)));
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== USE_COL) return;
      const pctValue = parseFloat(String(data.cell.raw)) || 0;
      const barX = data.cell.x + 17;
      const barW = data.cell.width - 20;
      const barY = data.cell.y + data.cell.height / 2 - 1.5;
      doc.setFillColor(225, 225, 225);
      doc.rect(barX, barY, barW, 3, 'F');
      doc.setFillColor(...useColor(pctValue));
      doc.rect(barX, barY, (barW * Math.min(pctValue, 100)) / 100, 3, 'F');
    }
  });

  if (report.clashes.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading('Time clashes', afterTable(), 'Two classes booked in the same room at overlapping times.'),
      head: [['Room', 'Day', 'Class 1', 'Time 1', 'Department 1', 'Class 2', 'Time 2', 'Department 2']],
      body: report.clashes.map((c) => [
        c.room, c.day,
        `${c.first.code}-${c.first.section}`, `${c.first.startTime}-${c.first.endTime}`, c.first.department,
        `${c.second.code}-${c.second.section}`, `${c.second.startTime}-${c.second.endTime}`, c.second.department
      ])
    });
  }

  // ----- Details (start on a new page) -----
  doc.addPage();
  y = 18;
  if (report.otherMeetings.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading('Other departments in these rooms', y, 'Classes of departments not in this report that use the same rooms.'),
      head: [['Room', 'Department', 'Course', 'Course Name', 'Sec', 'Day', 'Time', 'Instructor']],
      body: report.otherMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.teacher])
    });
    y = afterTable();
  }

  autoTable(doc, {
    ...tableStyle,
    startY: heading('Instructors', y),
    head: [['Instructor', 'Department', 'Sections', 'Classes / week', 'Hours / week']],
    body: report.instructors.map((i) => [i.name, i.departments.join(', '), i.sections, i.classes, i.hours])
  });

  if (report.virtualMeetings.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: heading(
        'Online / virtual room classes',
        afterTable(),
        `${report.virtualMeetings.length} classes in rooms marked as virtual (${report.virtualRooms.join(', ')}); not counted in any room figure.`
      ),
      head: [['Virtual room', 'Department', 'Course', 'Course Name', 'Sec', 'Day', 'Time', 'Instructor']],
      body: report.virtualMeetings.map((m) => [m.room, m.department, m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.teacher])
    });
  }

  report.departments.forEach((dept) => {
    const rows = report.meetings.filter((m) => m.department === dept).sort(byCourse);
    if (rows.length === 0) return;
    autoTable(doc, {
      ...tableStyle,
      startY: heading(`${dept} classes`, afterTable(), `${rows.length} classes per week`),
      head: [['Course', 'Course Name', 'Sec', 'Day', 'Time', 'Room', 'Instructor']],
      body: rows.map((m) => [m.code, m.courseName, m.section, m.day, `${m.startTime}-${m.endTime}`, m.room, m.teacher]),
      columnStyles: { 0: { fontStyle: 'bold' } }
    });
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Room Utilization Report - ${titleDepartments(report)}`, MARGIN, pageH - 8);
    doc.text(`Page ${p} of ${pages}`, pageW - MARGIN, pageH - 8, { align: 'right' });
  }

  return doc;
}

export function exportDepartmentReportPDF(report: DepartmentReport): void {
  buildDepartmentReportPDF(report).save(departmentReportFileName(report, 'pdf'));
}
