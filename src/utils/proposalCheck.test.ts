import { describe, it, expect } from 'vitest';
import { processScheduleData } from '../parsers/scheduleProcessor';
import { checkProposal } from './proposalCheck';

describe('checkProposal', () => {
  const data = processScheduleData([
    { 'Course Name': 'CIDN1001 Drawing', 'Section No': '1', Sunday: '08:00-12:00 - HL203\\T1', Monday: '08:00-12:00 - HL203\\T1', 'Department Name': 'Design' },
    { 'Course Name': 'BSAC1001 Accounting', 'Section No': '1', Sunday: '08:00-10:00 - FB107\\T2', 'Department Name': 'Business Studies' }
  ]);
  const check = checkProposal({ courses: data.courses });
  const byItem = (item: string) => check.rows.find((r) => r.item === item)!;

  it('sets the proposal figure next to ours and marks the result', () => {
    expect(byItem('Teaching hours per room per week')).toMatchObject({ doc: 44, ours: 44, status: 'match' });
    expect(byItem('Design instructors in the timetable')).toMatchObject({ doc: 20, ours: 1, status: 'differs', design: true });
  });

  it('leaves figures that need another file open', () => {
    expect(byItem('Design students')).toMatchObject({ ours: null, status: 'open' });
    expect(byItem('Design desks held today').status).toBe('open');
  });

  it('compares every appendix room by department', () => {
    const hl203 = check.rooms.find((r) => r.room === 'HL203')!;
    expect(hl203).toMatchObject({ docTotal: 39, oursTotal: 8, status: 'differs' });
    expect(check.rooms).toHaveLength(48);
  });
});
