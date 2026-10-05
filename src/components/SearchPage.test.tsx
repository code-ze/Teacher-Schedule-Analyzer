import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchPage from './SearchPage';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { buildStudentIndex } from '../utils/students/students';
import type { SearchScope } from '../tabs';

const data = processScheduleData([
  { 'Course Name': 'CIDN1101 Introduction to Design', 'Section No': '1', Sunday: '08:00-10:00 - HL203\\Teacher A', 'Department Name': 'Design' },
  { 'Course Name': 'CIJR2101 Journalism', 'Section No': '1', Monday: '12:00-15:00 - AB213\\Teacher C', 'Department Name': 'Mass Communication' }
]);
const studentIndex = buildStudentIndex(
  {
    students: [{ id: '26S1234', name: 'Sara Example', level: 'Diploma', department: 'Design', status: 'Studying' }],
    enrolments: [{ studentId: '26S1234', courseNo: 'CIDN1101', courseName: '', section: '1', creditHours: 3, inClassList: '' }],
    noCourses: []
  },
  data.courses
);

function Harness({ onOpenStudent = () => {} }: { onOpenStudent?: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('classes');
  return (
    <SearchPage
      data={data}
      query={query}
      onQuery={setQuery}
      scope={scope}
      onScope={setScope}
      studentIndex={studentIndex}
      onOpenStudent={onOpenStudent}
      onOpenStudentsTab={() => {}}
      roomProps={{}}
      roomSettings={null}
    />
  );
}

const type = (text: string) => fireEvent.change(screen.getByLabelText('Search'), { target: { value: text } });
const active = () => document.querySelector('.subnav-item.active')?.textContent;

describe('SearchPage', () => {
  it('counts matches in every kind of result from one box', () => {
    render(<Harness />);
    type('HL203');
    expect(active()).toBe('📚Classes1');
    const counts = Array.from(document.querySelectorAll('.subnav-count')).map((e) => e.textContent);
    expect(counts).toEqual(['1', '1', '0', '0']);
    expect(screen.getByText('1 section found')).toBeTruthy();
  });

  it('switches to the kind that has results, e.g. a student ID', () => {
    let opened = '';
    render(<Harness onOpenStudent={(id) => (opened = id)} />);
    type('26S12');
    expect(active()).toBe('🎓Students1');
    fireEvent.click(screen.getByText('Sara Example'));
    expect(opened).toBe('26S1234');
  });

  it('shows an instructor list filtered by the same box', () => {
    render(<Harness />);
    type('Teacher C');
    expect(active()).toBe('📚Classes1');
    fireEvent.click(screen.getByRole('tab', { name: /Instructors/ }));
    expect(screen.getByText('1 instructors')).toBeTruthy();
  });
});
