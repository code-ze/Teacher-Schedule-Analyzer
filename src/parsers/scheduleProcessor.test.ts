import { describe, it, expect } from 'vitest';
import { processScheduleData } from './scheduleProcessor';

describe('processScheduleData', () => {
  it('reads every meeting when one day cell holds several', () => {
    const data = processScheduleData([
      {
        'Course Name': 'GFE0101 English',
        'Section No': '3',
        Sunday: '08:00-10:00 - EH205\\Mohamed Ali 10:00-12:00 - EH206\\Sara Al Hinai',
        Monday: '14:00-16:00 - FB111\\Mohamed Ali',
        'Department Name': 'Preparatory Study Center'
      }
    ]);
    expect(Object.keys(data.teachers).sort()).toEqual(['Mohamed Ali', 'Sara Al Hinai']);
    expect(data.totalClasses).toBe(3);
    expect(data.courses['GFE0101-3'].schedule.Sunday.map((m) => `${m.startTime}-${m.endTime} ${m.room}`)).toEqual([
      '08:00-10:00 EH205',
      '10:00-12:00 EH206'
    ]);
    expect(data.classrooms.EH206.schedule.Sunday['11:00'].teacher).toBe('Sara Al Hinai');
  });
});
