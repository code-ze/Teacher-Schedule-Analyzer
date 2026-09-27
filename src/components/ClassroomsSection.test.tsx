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
    expect(screen.getByText('Department room utilization')).toBeTruthy();
    const deptCardNames = Array.from(document.querySelectorAll('.department-card-name')).map((el) => el.textContent);
    expect(deptCardNames).toContain('Business Studies');
    expect(deptCardNames).toContain('Information Technology');

    // The classroom grid starts unfiltered (and paged): every room is counted.
    const totalRoomCount = Object.keys(classrooms).length;
    expect(screen.getByText(`${totalRoomCount} rooms found`)).toBeTruthy();
    const initialCards = document.querySelectorAll('.classroom-card');
    expect(initialCards.length).toBe(Math.min(totalRoomCount, 30));

    // Ticking a department in the filter narrows the room grid down to
    // only the rooms that department actually uses.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Business Studies' }));

    const bsRooms = Object.values(classrooms).filter((c) => c.departments.has('Business Studies')).length;
    expect(bsRooms).toBeLessThan(totalRoomCount);
    expect(screen.getByText(`${bsRooms} rooms found`)).toBeTruthy();
    const filteredCards = document.querySelectorAll('.classroom-card');
    expect(filteredCards.length).toBe(Math.min(bsRooms, 30));

    Array.from(filteredCards).forEach((card) => {
      const name = card.querySelector('.classroom-name')?.textContent;
      expect(name).toBeTruthy();
      expect(classrooms[name as string].departments.has('Business Studies')).toBe(true);
    });
  });
});
