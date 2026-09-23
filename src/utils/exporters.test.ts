import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { exportAllDataJSON } from './exporters';
import { parseOracleTimetableHtml } from '../parsers/oracleHtmlParser';
import { normalizeRows, processScheduleData } from '../parsers/scheduleProcessor';

const fixturePath = path.resolve(__dirname, '../../CollegeTimeTable.xls');

describe('exportAllDataJSON', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes the full processed data set (with Set fields flattened) and triggers a download', async () => {
    if (!fs.existsSync(fixturePath)) {
      // Real timetable data isn't committed to the repo (it contains real names); skip locally without it.
      return;
    }
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const data = processScheduleData(normalizeRows(parseOracleTimetableHtml(html)));

    let capturedBlob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    exportAllDataJSON(data);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toBe('application/json');

    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(capturedBlob!);
    });
    const parsed = JSON.parse(text);

    expect(parsed.summary.totalClasses).toBe(data.totalClasses);
    expect(parsed.summary.departments).toEqual(data.departments);
    expect(Array.isArray(parsed.departmentUtilization)).toBe(true);
    expect(parsed.departmentUtilization.length).toBeGreaterThan(0);

    // Classroom "departments" is a Set at runtime; the JSON export must flatten it to a plain array.
    const someRoom = Object.keys(parsed.classrooms)[0];
    expect(Array.isArray(parsed.classrooms[someRoom].departments)).toBe(true);

    expect(Object.keys(parsed.teachers).length).toBe(Object.keys(data.teachers).length);
    expect(Object.keys(parsed.courses).length).toBe(Object.keys(data.courses).length);

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
