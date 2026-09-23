import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseOracleTimetableHtml, looksLikeOracleTimetableHtml } from './oracleHtmlParser';
import { normalizeRows } from './scheduleProcessor';
import { processScheduleData } from './scheduleProcessor';

const SYNTHETIC_HTML = `
<html>
<body>
<h2><span>Academic Year : 2026 - 2027</span></h2>
<h2><span>Department Name : Business Studies</span></h2>
<table>
<tr>
<td><b>Course Name</b></td>
<td><b>Section No</b></td>
<td><b>Sunday</b></td>
<td><b>Monday</b></td>
</tr>
<tr>
<td rowspan="2">BSAC1104 Principles of Accounting</td>
<td>1</td>
<td>12:00-14:00 - FB109\\Alyaa AL Nairi </td>
<td></td>
</tr>
<tr>
<td>2</td>
<td></td>
<td>10:00-12:00 - FB208\\Alyaa AL Nairi </td>
</tr>
</table>
<h2><span>Department Name : Design</span></h2>
<table>
<tr>
<td><b>Course Name</b></td>
<td><b>Section No</b></td>
<td><b>Sunday</b></td>
<td><b>Monday</b></td>
</tr>
<tr>
<td>DSGN1000 Intro to Design</td>
<td>1</td>
<td></td>
<td>08:00-10:00 - A100\\Jane Doe </td>
</tr>
</table>
</body>
</html>
`;

describe('parseOracleTimetableHtml', () => {
  it('detects the Oracle timetable HTML format', () => {
    expect(looksLikeOracleTimetableHtml(SYNTHETIC_HTML)).toBe(true);
    expect(looksLikeOracleTimetableHtml('course,section\nA,1')).toBe(false);
  });

  it('carries the rowspan-merged course name down to every section row', () => {
    const rows = parseOracleTimetableHtml(SYNTHETIC_HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]['Course Name']).toBe('BSAC1104 Principles of Accounting');
    expect(rows[1]['Course Name']).toBe('BSAC1104 Principles of Accounting');
    expect(rows[0]['Section No']).toBe('1');
    expect(rows[1]['Section No']).toBe('2');
  });

  it('tags each row with the department from the preceding heading', () => {
    const rows = parseOracleTimetableHtml(SYNTHETIC_HTML);
    expect(rows[0]['Department Name']).toBe('Business Studies');
    expect(rows[1]['Department Name']).toBe('Business Studies');
    expect(rows[2]['Department Name']).toBe('Design');
  });

  it('feeds straight into processScheduleData and yields a room/teacher schedule', () => {
    const rows = normalizeRows(parseOracleTimetableHtml(SYNTHETIC_HTML));
    const processed = processScheduleData(rows);
    expect(processed.departments).toEqual(['Business Studies', 'Design']);
    expect(processed.teachers['Alyaa AL Nairi']).toBeDefined();
    expect(processed.classrooms['FB109']).toBeDefined();
    expect(processed.classrooms['FB109'].schedule['Sunday']['12:00'].isOccupied).toBe(true);
  });
});

describe('parseOracleTimetableHtml against the real CollegeTimeTable export', () => {
  const fixturePath = path.resolve(__dirname, '../../CollegeTimeTable.xls');

  it('parses the real file into plausible teacher/room/department data', () => {
    if (!fs.existsSync(fixturePath)) {
      // Fixture not present in this environment; skip without failing the suite.
      return;
    }
    const html = fs.readFileSync(fixturePath, 'utf-8');
    expect(looksLikeOracleTimetableHtml(html)).toBe(true);

    const rows = normalizeRows(parseOracleTimetableHtml(html));
    expect(rows.length).toBeGreaterThan(500);

    const processed = processScheduleData(rows);
    expect(processed.departments.length).toBeGreaterThanOrEqual(6);
    expect(processed.departments).toContain('Business Studies');
    expect(processed.departments).toContain('Information Technology');
    expect(Object.keys(processed.teachers).length).toBeGreaterThan(20);
    expect(Object.keys(processed.classrooms).length).toBeGreaterThan(10);
    expect(processed.totalClasses).toBeGreaterThan(500);
  });
});
