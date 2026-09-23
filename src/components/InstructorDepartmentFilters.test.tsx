import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import MeetingFinder from './MeetingFinder';
import TeacherSchedules from './TeacherSchedules';
import { parseOracleTimetableHtml } from '../parsers/oracleHtmlParser';
import { normalizeRows, processScheduleData } from '../parsers/scheduleProcessor';

const fixturePath = path.resolve(__dirname, '../../CollegeTimeTable.xls');

function loadRealData() {
  const html = fs.readFileSync(fixturePath, 'utf-8');
  const rows = normalizeRows(parseOracleTimetableHtml(html));
  return processScheduleData(rows);
}

describe('MeetingFinder department filter', () => {
  it('narrows the instructor chip list down to the selected department', () => {
    if (!fs.existsSync(fixturePath)) {
      // Real timetable data isn't committed to the repo (it contains real names); skip locally without it.
      return;
    }
    const { teachers } = loadRealData();
    const totalTeachers = Object.keys(teachers).length;

    render(<MeetingFinder teachers={teachers} />);

    const initialChips = document.querySelectorAll('.mf-chip');
    expect(initialChips.length).toBe(totalTeachers);

    const select = screen.getByDisplayValue('All Departments') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Design' } });

    const filteredChips = document.querySelectorAll('.mf-chip');
    expect(filteredChips.length).toBeGreaterThan(0);
    expect(filteredChips.length).toBeLessThan(totalTeachers);

    Array.from(filteredChips).forEach((chip) => {
      const name = chip.querySelector('.mf-chip-name')?.textContent;
      expect(name).toBeTruthy();
      expect(teachers[name as string].department).toBe('Design');
    });
  });
});

describe('TeacherSchedules department filter', () => {
  it('narrows the instructor card list down to the selected department', () => {
    if (!fs.existsSync(fixturePath)) {
      return;
    }
    const { teachers } = loadRealData();
    const totalTeachers = Object.keys(teachers).length;

    render(<TeacherSchedules teachers={teachers} />);

    const initialCards = document.querySelectorAll('.teacher-card');
    expect(initialCards.length).toBe(totalTeachers);

    const select = screen.getByDisplayValue('All Departments') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Engineering' } });

    const filteredCards = document.querySelectorAll('.teacher-card');
    expect(filteredCards.length).toBeGreaterThan(0);
    expect(filteredCards.length).toBeLessThan(totalTeachers);

    Array.from(filteredCards).forEach((card) => {
      const name = card.querySelector('.teacher-name')?.textContent;
      expect(name).toBeTruthy();
      expect(teachers[name as string].department).toBe('Engineering');
    });
  });

  it('combines the search box and department filter together', () => {
    if (!fs.existsSync(fixturePath)) {
      return;
    }
    const { teachers } = loadRealData();
    render(<TeacherSchedules teachers={teachers} />);

    const select = screen.getByDisplayValue('All Departments') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Engineering' } });

    const search = screen.getByPlaceholderText('Enter instructor name to filter...');
    fireEvent.change(search, { target: { value: 'zzzznomatch' } });

    expect(document.querySelectorAll('.teacher-card').length).toBe(0);
  });
});
