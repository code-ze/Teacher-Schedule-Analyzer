import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseSearch from './CourseSearch';
import { processScheduleData } from '../parsers/scheduleProcessor';

const data = processScheduleData([
  { 'Course Name': 'CIDN1101 Introduction to Design', 'Section No': '1', Sunday: '08:00-10:00 - HL203\\Teacher A', Tuesday: '08:00-10:00 - HL203\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIDN1101 Introduction to Design', 'Section No': '2', Monday: '12:00-14:00 - HL107\\Teacher B', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Monday: '12:00-15:00 - AB213\\Teacher C', 'Department Name': 'Mass Communication' }
]);

function search(text: string) {
  fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: text } });
}

describe('CourseSearch', () => {
  it('finds every section of a course with its day, time, room and instructor', () => {
    render(<CourseSearch courses={data.courses} departments={data.departments} />);
    expect(screen.getByText('Start typing to find a class.')).toBeTruthy();

    search('cidn1101');
    expect(screen.getByText('2 sections found')).toBeTruthy();
    const rows = Array.from(document.querySelectorAll('.section-card tbody tr')).map((tr) => tr.textContent);
    expect(rows).toEqual([
      'Sunday08:00–10:00HL203Teacher A',
      'Tuesday08:00–10:00HL203Teacher A',
      'Monday12:00–14:00HL107Teacher B'
    ]);
  });

  it('matches a room, and narrows with several words and the filters', () => {
    render(<CourseSearch courses={data.courses} departments={data.departments} />);
    search('ab213');
    expect(screen.getByText('1 section found')).toBeTruthy();

    search('Teacher B');
    expect(screen.getByText('1 section found')).toBeTruthy();

    search('cidn1101 hl107');
    expect(screen.getByText('1 section found')).toBeTruthy();

    search('monday');
    expect(screen.getByText('No classes match “monday”.')).toBeTruthy();

    search('cidn');
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'Monday' } });
    expect(screen.getByText('1 section found')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Mass Communication' } });
    expect(screen.getByText('No classes match “cidn”.')).toBeTruthy();
  });
});
