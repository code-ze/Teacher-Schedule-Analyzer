import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { processScheduleData } from '../../parsers/scheduleProcessor';
import { analyzeSpace } from './analyze';
import type { SpaceReportConfig } from './config';
import { parseDeskText, readFacilitiesWorkbook } from './facilities';
import { buildSpaceReportPDF, facilitiesContent } from './pdf';

describe('parseDeskText', () => {
  it('reads the free-text desk descriptions used in the forms', () => {
    expect(parseDeskText('4 Fully used')).toMatchObject({ desks: 4, used: 4, held: 0, otherDept: 0 });
    expect(parseDeskText('4 Only 3 desks used currently')).toMatchObject({ desks: 4, used: 3 });
    expect(parseDeskText('4 Only 3 used')).toMatchObject({ desks: 4, used: 3 });
    expect(parseDeskText('3 used and 1 for maternity leave')).toMatchObject({ desks: 4, used: 3, held: 1 });
    expect(parseDeskText('4 and 1 used by PSC staff member')).toMatchObject({ desks: 4, used: 4, otherDept: 1 });
    expect(parseDeskText('1 HoD Office')).toMatchObject({ desks: 1, used: 1 });
  });
});

function sheet(rows: string[][]) {
  return XLSX.utils.aoa_to_sheet(rows);
}

describe('readFacilitiesWorkbook', () => {
  const wb = XLSX.utils.book_new();
  // Structured layout (like the Business form): numbers in columns, HoD counted inside.
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ['Department Facilities Requirements – Current Semester'],
      ['Department / Centre', 'Economics and Business Administration'],
      ['Category', 'Required Information', 'Required Number', 'Current Number Available', 'Gap (+/-)'],
      ['Staff Offices', 'Total number of staff offices required', '20', '3', '-17'],
      ['Staff Workstations', 'Total number of staff desks/workstations required', '77', '8', '-69'],
      ['3. Staff Office / Desk Distribution'],
      ['Office / Room Number', 'Names of Staff', 'Desks available', ' Desks used', 'Furniture', 'Remarks'],
      ['206', 'HoD Office', '2', '2'],
      ['209', 'Staff A, Staff B + part timers', '3', '3'],
      ['228', 'Staff C', '3', '1'],
      ['', 'TOTAL', '8', '6'],
      ['4. Specialized Facilities Requirements']
    ]),
    'CEBA- Department Facilities'
  );
  // Free-text layout (like the Design / Mass Communication forms), HoD not counted.
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ['Department / Centre', 'Mass Communication'],
      ['Staff Offices', 'x', '9', '2', '7'],
      ['Staff Workstations', 'x', '30', '6', '24'],
      ['Office / Room Number', '', 'Desks Available per Office', '', 'Remarks', ''],
      ['BO 227', '', '1 HoD Office', '', '', ''],
      ['BO 121', '', '4 and 1 used by PSC staff member', '', '', ''],
      ['BO 131', '', '3 used and 1 for maternity leave', '', '', ''],
      [''],
      ['4. Specialized Facilities Requirements']
    ]),
    'MC - Department Facilities'
  );
  XLSX.utils.book_append_sheet(wb, sheet([['Guidance for Completing the Facilities Data']]), 'Guidance');
  const data = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const result = readFacilitiesWorkbook(data);

  it('finds each department sheet and ignores the guidance sheet', () => {
    expect(result.map((r) => r.department)).toEqual(['Business Studies', 'Mass Communication']);
  });

  it('keeps current numbers only and separates the HoD office', () => {
    const [ceba, mc] = result;
    expect(ceba).toMatchObject({ formOffices: 3, formDesks: 8, staffOffices: 2, staffDesks: 6, staffUsed: 4, free: 2 });
    expect(ceba.hod?.office).toBe('206');
    expect(ceba.offices[1].note).toBe('Also used by part-time staff');
    // BO121: 4 desks, one used by another department's staff; BO131: 3 used + 1 held.
    expect(mc).toMatchObject({ formOffices: 2, formDesks: 6, staffOffices: 2, staffDesks: 7, staffUsed: 6, held: 1, free: 0 });
    expect(mc.hod?.office).toBe('BO 227');
  });

  it('turns into the report section', () => {
    const content = facilitiesContent(result, ['Business Studies', 'Design', 'Mass Communication']);
    expect(content.tables[0].body.map((r) => r[0])).toEqual(['Business Studies', 'Mass Communication']);
    expect(content.findings[0]).toBe('Business Studies: 2 staff offices and 6 desks (plus the HoD office); 4 desks in use, 2 free (228).');
  });
});

describe('analyzeSpace', () => {
  const config: SpaceReportConfig = {
    departments: ['Design'],
    labs: { Design: ['LAB1'] },
    unlistedLabs: {},
    onlineRooms: ['ONLINE'],
    blocked: { Design: { Thursday: [14 * 60, 18 * 60] } },
    open: 8 * 60,
    close: 18 * 60,
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    comfort: 0.8,
    standardWeek: 40
  };
  // Two classrooms each used 4h a week; one lab; one online class; one class in the blocked time.
  const data = processScheduleData([
    { 'Course Name': 'CIDN1001 A', 'Section No': '1', Sunday: '08:00-10:00 - R1\\T1', Tuesday: '08:00-10:00 - R1\\T1', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1002 B', 'Section No': '1', Monday: '08:00-10:00 - R2\\T2', Thursday: '14:00-16:00 - R2\\T2', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1003 C', 'Section No': '1', Sunday: '10:00-12:00 - LAB1\\T3', 'Department Name': 'Design' },
    { 'Course Name': 'CIDN1004 D', 'Section No': '1', Monday: '10:00-12:00 - ONLINE\\T4', 'Department Name': 'Design' }
  ]);
  const analysis = analyzeSpace(data.courses, config, { iterations: 5 });
  const design = analysis.result[0];

  it('splits labs, classrooms and online', () => {
    expect(design.inPerson.hours).toBe(10);
    expect(design.labs.hours).toBe(2);
    expect(design.classroom).toMatchObject({ hours: 8, rooms: 2 });
    expect(design.online).toMatchObject({ classes: 1, hours: 2 });
  });

  it('applies the time rules: capacity, displaced classes and packing', () => {
    expect(design.rules.roomHours).toBe(46);
    expect(design.displaced.map((m) => `${m.code} ${m.day} ${m.time}`)).toEqual(['CIDN1002 Thursday 14:00-16:00']);
    // Both classrooms' classes fit in one room once they may shift within the day.
    expect(design.scenario.classrooms).toMatchObject({ roomsNow: 2, busiestDayRooms: 1 });
    expect(design.scenario.classrooms.comfortable.rooms).toBe(1);
    expect(design.scenario.labsDept.comfortable.rooms).toBe(1);
  });

  it('builds the PDF', () => {
    const noBlock = analyzeSpace(data.courses, config, { iterations: 5, noBlock: true });
    expect(noBlock.result[0].displaced).toEqual([]);
    const pdf = buildSpaceReportPDF(analysis, noBlock, null, { timetableName: 'test.xls' });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
  });
});
