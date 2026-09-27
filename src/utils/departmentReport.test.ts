import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { buildDepartmentReport } from './departmentReport';
import { buildDepartmentReportPDF, buildDepartmentReportWorkbook } from './departmentReportExport';
import type { RawRow } from '../types';

// Small synthetic timetable: Design owns R1, shares R2 with Mass Communication.
const rows: RawRow[] = [
  { 'Course Name': 'CIDN1101 Intro to Design', 'Section No': '1', Sunday: '08:00-10:00 - R1\\Teacher A', Tuesday: '08:00-10:00 - R1\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1102 Fundamentals', 'Section No': '1', Monday: '10:00-12:00 - R2\\Teacher B', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1102 Fundamentals', 'Section No': '2', Monday: '11:00-13:00 - R2\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Monday: '12:00-15:00 - R2\\Teacher C', Thursday: '08:00-12:00 - R2\\Teacher C', 'Department Name': 'Mass Communication' },
  { 'Course Name': 'CIJR2102 Media', 'Section No': '1', Sunday: '08:00-10:00 - R9\\Teacher C', 'Department Name': 'Mass Communication' }
];

describe('buildDepartmentReport', () => {
  const data = processScheduleData(rows);
  const report = buildDepartmentReport(data.courses, 'Design');

  it('counts capacity over the days the timetable uses', () => {
    expect(report.days).toEqual(['Sunday', 'Monday', 'Tuesday', 'Thursday']);
    expect(report.capacityPerRoom).toBe(32);
  });

  it('lists every class of the department and only the rooms it uses', () => {
    expect(report.meetings).toHaveLength(4);
    expect(report.rooms.map((r) => r.room)).toEqual(['R1', 'R2']);
    expect(report.summary).toMatchObject({ courses: 2, sections: 3, weeklyClasses: 4, weeklyHours: 8, instructors: 2, sharedRooms: 1, exclusiveRooms: 1 });
  });

  it('splits each room between the department and the others sharing it', () => {
    const r2 = report.rooms.find((r) => r.room === 'R2')!;
    expect(r2.departmentHours).toBe(4);
    expect(r2.otherHours).toEqual({ 'Mass Communication': 7 });
    expect(r2.freeHours).toBe(21);
    expect(r2.totalUtilization).toBe(34.4);
    expect(r2.departmentShare).toBe(36.4);
    expect(report.otherMeetings.every((m) => m.room === 'R2')).toBe(true);
    expect(report.rooms.find((r) => r.room === 'R1')!.sharedWith).toEqual([]);
  });

  it('flags overlapping classes in the same room', () => {
    const pairs = report.clashes.map((c) => `${c.first.code}-${c.first.section}/${c.second.code}-${c.second.section}`);
    expect(pairs).toEqual(['CIDN1102-1/CIDN1102-2', 'CIDN1102-2/CIJR2101-1']);
  });

  it('builds the Excel workbook and PDF', () => {
    const wb = buildDepartmentReportWorkbook(report);
    expect(wb.SheetNames).toEqual(['Summary', 'Rooms', 'Design Classes', 'Other Depts in These Rooms', 'Room Timetables', 'Instructors', 'Clashes']);
    const timetable = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Room Timetables'], { header: 1 });
    expect(timetable.some((row) => row.includes('CIDN1102-2 (Design) + CIJR2101-1 (Mass Communication)'))).toBe(true);
    expect(buildDepartmentReportPDF(report).getNumberOfPages()).toBeGreaterThan(0);
  });
});
