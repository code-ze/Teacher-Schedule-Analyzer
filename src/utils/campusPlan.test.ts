import { describe, it, expect } from 'vitest';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { buildCampusPlan, weekFor, PROPOSAL_WEEK } from './campusPlan';

describe('weekFor', () => {
  it('gives the proposal week: 44 hours, 35.2 at 80%', () => {
    const w = weekFor(PROPOSAL_WEEK);
    expect(w.dayHours).toEqual({ Sunday: 10, Monday: 10, Tuesday: 8, Wednesday: 10, Thursday: 6 });
    expect(w.total).toBe(44);
    expect(w.planning).toBeCloseTo(35.2);
  });
});

describe('buildCampusPlan', () => {
  const data = processScheduleData([
    // Design: two classrooms, two labs (AB213 shared with Mass Communication), one online class.
    { 'Course Name': 'CIDN1001 Drawing', 'Section No': '1', Sunday: '08:00-12:00 - HL203\\T1', Monday: '08:00-12:00 - HL203\\T1', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1002 Colour', 'Section No': '1', Tuesday: '12:00-14:00 - HL102\\T2', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1003 Digital', 'Section No': '1', Sunday: '10:00-12:00 - AB213\\T3', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1004 Theory', 'Section No': '1', Monday: '10:00-12:00 - BO004\\T4', 'Department Name': 'Design' },
    { 'Course Name': 'CIMC1001 Media', 'Section No': '1', Monday: '08:00-10:00 - AB213\\T5', Thursday: '14:00-16:00 - HL206\\T5', 'Department Name': 'Mass Communication' },
    // Business keeps Thursday afternoon; one evening class.
    { 'Course Name': 'BSAC1001 Accounting', 'Section No': '1', Thursday: '14:00-16:00 - fb108\\T6', Sunday: '18:00-20:00 - FB108\\T6', 'Department Name': 'Business Studies' },
    { 'Course Name': 'ENGL1001 Other', 'Section No': '1', Sunday: '12:00-14:00 - HL203\\T7', 'Department Name': 'Preparatory Study Center' }
  ]);
  const plan = buildCampusPlan(data.courses, ['Business Studies', 'Design', 'Mass Communication']);
  const [business, design, masscomm] = plan.plans;

  it('splits classroom, lab and online hours', () => {
    expect(design.hours).toEqual({ total: 14, classroom: 10, lab: 2, online: 2 });
    expect(design.onlineClasses).toBe(1);
    expect(design.instructors).toBe(4);
    expect(design.classroomsNow).toBe(2);
    expect(design.labsNow).toBe(1);
  });

  it('works out rooms at full use and at 80%', () => {
    expect(design.week.total).toBe(44);
    expect(design.classrooms).toMatchObject({ hours: 10, full: 1, planning: 1 });
    expect(design.proposalWeek).toBeNull();
  });

  it('flags classes in the Tuesday break and on Thursday afternoon', () => {
    expect(design.tuesdayBreak.map((c) => c.code)).toEqual(['CIDN1002']);
    expect(masscomm.thursdayAfter2.map((c) => c.code)).toEqual(['CIMC1001']);
    expect(business.thursdayAfter2.map((c) => c.code)).toEqual(['BSAC1001']);
  });

  it('keeps Business on its own week and shows the proposal figure beside it', () => {
    expect(business.week.total).toBe(48);
    expect(business.proposalWeek?.total).toBe(44);
    expect(business.evening.map((c) => c.time)).toEqual(['18:00-20:00']);
    expect(business.daytimeClassroomHours).toBe(2);
  });

  it('combines the hours of departments that share labs', () => {
    expect(plan.labGroups).toHaveLength(1);
    expect(plan.labGroups[0].departments).toEqual(['Design', 'Mass Communication']);
    expect(plan.labGroups[0].need.hours).toBe(4);
  });

  it('lists every room once, with all its users, in upper case', () => {
    const hl203 = plan.rooms.find((r) => r.room === 'HL203')!;
    expect(hl203.byDept).toEqual({ Design: 8, 'Preparatory Study Center': 2 });
    expect(hl203.selectedHours).toBe(8);
    expect(hl203.usePct).toBe(25);
    expect(plan.rooms.filter((r) => r.room === 'FB108')).toHaveLength(1);
    expect(plan.rooms.some((r) => r.room === 'BO004')).toBe(false);
  });

  it('counts students by status when the student file is loaded', () => {
    const withStudents = buildCampusPlan(data.courses, ['Design'], {
      students: {
        students: [
          { id: '1', name: 'A', level: '', department: 'Design', status: 'Studying' },
          { id: '2', name: 'B', level: '', department: 'Design', status: 'Postponed' }
        ],
        enrolments: [],
        noCourses: [{ id: '3', level: '', department: 'Design', status: 'OJT' }]
      }
    });
    expect(withStudents.students).toEqual([{ department: 'Design', studying: 1, registered: 2, other: { Postponed: 1, OJT: 1 } }]);
  });
});
