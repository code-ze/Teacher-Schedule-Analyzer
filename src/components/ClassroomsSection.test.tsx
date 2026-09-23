import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import ClassroomsSection from './ClassroomsSection';
import { parseOracleTimetableHtml } from '../parsers/oracleHtmlParser';
import { normalizeRows, processScheduleData } from '../parsers/scheduleProcessor';

const fixturePath = path.resolve(__dirname, '../../CollegeTimeTable.xls');

function loadRealData() {
  const html = fs.readFileSync(fixturePath, 'utf-8');
  const rows = normalizeRows(parseOracleTimetableHtml(html));
  return processScheduleData(rows);
}

describe('ClassroomsSection with the real CollegeTimeTable data', () => {
  it('renders department utilization cards and lets you filter classrooms by department', () => {
    if (!fs.existsSync(fixturePath)) {
      // Real timetable data isn't committed to the repo (it contains real names); skip locally without it.
      return;
    }
    const { classrooms, departments } = loadRealData();
    expect(departments).toContain('Business Studies');
    expect(departments).toContain('Information Technology');

    render(<ClassroomsSection classrooms={classrooms} />);

    // The department utilization panel lists every department found in the file.
    expect(screen.getByText('🏛️ Department Room Utilization')).toBeTruthy();
    const deptCardNames = Array.from(document.querySelectorAll('.department-card-name')).map((el) => el.textContent);
    expect(deptCardNames).toContain('Business Studies');
    expect(deptCardNames).toContain('Information Technology');

    // The classroom grid starts unfiltered: every room from the data set is present.
    const totalRoomCount = Object.keys(classrooms).length;
    const initialCards = document.querySelectorAll('.classroom-card');
    expect(initialCards.length).toBe(totalRoomCount);

    // Selecting a department in the filter dropdown narrows the room grid down to
    // only the rooms that department actually uses.
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Business Studies' } });

    const filteredCards = document.querySelectorAll('.classroom-card');
    expect(filteredCards.length).toBeGreaterThan(0);
    expect(filteredCards.length).toBeLessThan(totalRoomCount);

    Array.from(filteredCards).forEach((card) => {
      const name = card.querySelector('.classroom-name')?.textContent;
      expect(name).toBeTruthy();
      expect(classrooms[name as string].departments.has('Business Studies')).toBe(true);
    });
  });
});
