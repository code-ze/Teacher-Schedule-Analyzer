import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { buildDepartmentReport } from './departmentReport';
import { buildDepartmentReportWorkbook } from './departmentReportExport';
import { loadVirtualRooms, saveVirtualRooms, suggestVirtualRooms } from './virtualRooms';
import type { RawRow } from '../types';

// R1 is a real Design room; ONLINE holds two Design classes at the same time
// plus one Mass Communication class, like a placeholder room for online teaching.
const rows: RawRow[] = [
  { 'Course Name': 'CIDN1101 Intro', 'Section No': '1', Sunday: '08:00-10:00 - R1\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1102 Online A', 'Section No': '1', Monday: '10:00-12:00 - ONLINE\\Teacher B', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1103 Online B', 'Section No': '1', Monday: '11:00-13:00 - ONLINE\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Tuesday: '08:00-11:00 - ONLINE\\Teacher C', 'Department Name': 'Mass Communication' }
];
const data = processScheduleData(rows);

describe('suggestVirtualRooms', () => {
  it('suggests rooms that hold more than one class at a time', () => {
    const suggestions = suggestVirtualRooms(data.courses);
    expect(suggestions.map((s) => s.room)).toEqual(['ONLINE']);
    expect(suggestions[0]).toMatchObject({ maxConcurrent: 2, classes: 3, departments: ['Design', 'Mass Communication'] });
  });
});

describe('department report with a virtual room', () => {
  const report = buildDepartmentReport(data.courses, 'Design', { virtualRooms: ['ONLINE'] });

  it('leaves virtual rooms out of every room figure', () => {
    expect(report.rooms.map((r) => r.room)).toEqual(['R1']);
    expect(report.summary).toMatchObject({ weeklyClasses: 1, weeklyHours: 2, rooms: 1, onlineClasses: 2, onlineHours: 4 });
    expect(report.otherMeetings).toEqual([]);
    expect(report.clashes).toEqual([]);
  });

  it('lists the online classes separately and keeps them in instructor loads', () => {
    expect(report.virtualRooms).toEqual(['ONLINE']);
    expect(report.virtualMeetings.map((m) => m.code)).toEqual(['CIDN1102', 'CIDN1103']);
    expect(report.byDepartment[0]).toMatchObject({ onlineClasses: 2, onlineHours: 4, sections: 3 });
    expect(report.instructors.find((i) => i.name === 'Teacher A')).toMatchObject({ classes: 2, hours: 4 });
    expect(report.findings.some((f) => f.text.startsWith('2 online class(es) (4h a week) are in virtual rooms (ONLINE)'))).toBe(true);
  });

  it('adds an Online Classes sheet to the Excel report', () => {
    const wb = buildDepartmentReportWorkbook(report);
    expect(wb.SheetNames).toContain('Online Classes');
    const sheet = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Online Classes'], { header: 1 });
    expect(sheet.filter((r) => r[0] === 'ONLINE')).toHaveLength(2);
  });

  it('without the flag the room is counted like any other', () => {
    const plain = buildDepartmentReport(data.courses, 'Design');
    expect(plain.rooms.map((r) => r.room).sort()).toEqual(['ONLINE', 'R1']);
    expect(plain.summary.onlineClasses).toBe(0);
    expect(plain.clashes).toHaveLength(1);
  });
});

describe('virtual room storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the marked rooms and ignores bad data', () => {
    expect(loadVirtualRooms()).toEqual([]);
    saveVirtualRooms(['BO004', 'A132']);
    expect(loadVirtualRooms()).toEqual(['BO004', 'A132']);
    localStorage.setItem('tsa.virtualRooms', '{not json');
    expect(loadVirtualRooms()).toEqual([]);
  });
});
