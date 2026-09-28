import { describe, it, expect, beforeEach } from 'vitest';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { buildDepartmentReport } from './departmentReport';
import { computeDepartmentUtilization } from './departmentUtilization';
import { emptyClassroom, loadAssignedRooms, saveAssignedRooms } from './assignedRooms';

// Design teaches 8h in R1; HL103 belongs to Design but has no classes this semester.
const data = processScheduleData([
  { 'Course Name': 'CIDN1101 Intro', 'Section No': '1', Sunday: '08:00-12:00 - R1\\Teacher A', Monday: '08:00-12:00 - R1\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Tuesday: '08:00-10:00 - R2\\Teacher C', 'Department Name': 'Mass Communication' }
]);
const assignedRooms = [{ room: 'HL103', departments: ['Design'] }];

describe('rooms with no classes', () => {
  const report = buildDepartmentReport(data.courses, 'Design', { assignedRooms });

  it('counts an assigned empty room as the department’s own free capacity', () => {
    expect(report.rooms.map((r) => r.room)).toEqual(['R1', 'HL103']);
    const hl103 = report.rooms.find((r) => r.room === 'HL103')!;
    expect(hl103).toMatchObject({ noClasses: true, usedBy: ['Design'], totalHours: 0, freeHours: 24, totalUtilization: 0 });
    // capacity = 3 days used in the file x 8h = 24h per room
    expect(report.byDepartment[0].ownRooms).toMatchObject({ rooms: ['R1', 'HL103'], selectedHours: 8, capacityHours: 48, totalUtilization: 16.7 });
    expect(report.summary).toMatchObject({ rooms: 2, totalUtilization: 16.7 });
    expect(report.findings.some((f) => f.text.includes('No classes this semester') && f.text.includes('HL103 (Design)'))).toBe(true);
    expect(report.findings.some((f) => f.text.startsWith('Spare capacity') && f.text.includes('HL103'))).toBe(false);
  });

  it('is left out when none of its departments is selected', () => {
    const mc = buildDepartmentReport(data.courses, 'Mass Communication', { assignedRooms });
    expect(mc.rooms.map((r) => r.room)).toEqual(['R2']);
  });

  it('adds free capacity to the department utilization cards', () => {
    const merged = { ...data.classrooms, HL103: emptyClassroom(assignedRooms[0]) };
    const without = computeDepartmentUtilization(data.classrooms).find((d) => d.name === 'Design')!;
    const withRoom = computeDepartmentUtilization(merged, assignedRooms).find((d) => d.name === 'Design')!;
    expect(without.roomCount).toBe(1);
    expect(withRoom.roomCount).toBe(2);
    expect(withRoom.utilizationPercentage).toBeLessThan(without.utilizationPercentage);
  });
});

describe('assigned room storage', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips and ignores malformed entries', () => {
    expect(loadAssignedRooms()).toEqual([]);
    saveAssignedRooms(assignedRooms);
    expect(loadAssignedRooms()).toEqual(assignedRooms);
    localStorage.setItem('tsa.assignedRooms', JSON.stringify([{ room: 5 }, { room: 'X', departments: ['A'] }]));
    expect(loadAssignedRooms()).toEqual([{ room: 'X', departments: ['A'] }]);
  });
});
