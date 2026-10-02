import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { processScheduleData } from '../../parsers/scheduleProcessor';
import { buildStudentIndex, isStudentWorkbook, readStudentWorkbook } from './students';

const header = ['Student ID', 'Student Name', 'Level', 'Department', 'Status', 'Course No', 'Course Name', 'Section', 'Credit Hours', 'In CIMS class list'];

function workbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Read me']]), 'Read Me');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      header,
      ['S1', 'Student One', 'Diploma', 'Design', 'Studying', 'CIDN1101', 'Intro to Design', '1', '3', 'Yes'],
      ['S1', 'Student One', 'Diploma', 'Design', 'Studying', 'CIDN1102', 'Fundamentals', '1', '3', 'Yes'],
      ['S1', 'Student One', 'Diploma', 'Design', 'Studying', 'MAET0001', 'Math test', '1', '0', 'No – test, no class'],
      ['S2', 'Student Two', 'Bachelor', 'Mass Communication', 'Studying', 'CIDN1101', 'Intro to Design', '1', '3', 'Yes'],
      ['S2', 'Student Two', 'Bachelor', 'Mass Communication', 'Studying', 'CIJR2101', 'Journalism', '1', '3', 'Yes']
    ]),
    'Student Courses'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Student ID', 'Level', 'Department', 'Status'],
      ['S9', 'Diploma', 'Design', 'OJT']
    ]),
    'No Courses'
  );
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// CIDN1101-1 Sun 08-10; CIDN1102-1 Sun 09-11 (clashes with CIDN1101 for S1); CIJR2101-1 Mon 10-12; CIDN1101-2 has nobody.
const timetable = processScheduleData([
  { 'Course Name': 'CIDN1101 Intro to Design', 'Section No': '1', Sunday: '08:00-10:00 - R1\\T1', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1101 Intro to Design', 'Section No': '2', Monday: '08:00-10:00 - R1\\T1', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1102 Fundamentals', 'Section No': '1', Sunday: '09:00-11:00 - R2\\T2', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Monday: '10:00-12:00 - R3\\T3', 'Department Name': 'Mass Communication' }
]);

describe('student workbook', () => {
  const bytes = workbook();

  it('is recognised and read', () => {
    expect(isStudentWorkbook(bytes)).toBe(true);
    const data = readStudentWorkbook(bytes);
    expect(data.students.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(data.students[0]).toMatchObject({ name: 'Student One', level: 'Diploma', department: 'Design', status: 'Studying' });
    expect(data.enrolments).toHaveLength(5);
    expect(data.noCourses).toEqual([{ id: 'S9', level: 'Diploma', department: 'Design', status: 'OJT' }]);
  });

  it('a timetable-style workbook is not mistaken for student data', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Course Name', 'Section No', 'Sunday']]), 'Sheet1');
    expect(isStudentWorkbook(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))).toBe(false);
  });

  it('joins with the timetable: schedules, clashes, sizes and campus hours', () => {
    const index = buildStudentIndex(readStudentWorkbook(bytes), timetable.courses);
    const s1 = index.profiles.get('S1')!;
    expect(s1).toMatchObject({ creditHours: 6, weeklyHours: 4, daysOnCampus: 1 });
    expect(s1.notScheduled.map((e) => e.courseNo)).toEqual(['MAET0001']);
    expect(s1.clashes.map((c) => `${c.first.sectionKey}/${c.second.sectionKey}`)).toEqual(['CIDN1101-1/CIDN1102-1']);
    expect(index.clashes).toHaveLength(1);
    expect(index.sectionSizes.get('CIDN1101-1')).toBe(2);
    expect(index.emptySections.map((c) => c.key)).toEqual(['CIDN1101-2']);
    expect(index.unmatched).toEqual([{ courseNo: 'MAET0001', courseName: 'Math test', count: 1 }]);
    // Sunday 09:00: S1 is in two classes but counted once, plus S2 in CIDN1101-1.
    expect(index.heat.Sunday['09:00']).toBe(2);
    expect(index.heat.Sunday['10:00']).toBe(1);
    expect(index.heat.Monday['10:00']).toBe(1);
    expect(index.heatByDept['Mass Communication'].Monday['11:00']).toBe(1);
  });
});
