import type { CourseSection } from '../types';
import { allMeetings, toMinutes } from './departmentReport';

// "Virtual" rooms are placeholder rooms in the timetable used for online
// classes (e.g. BO004). Several classes can sit in one at the same time, so
// counting them as real rooms distorts utilization. The user marks them;
// we suggest likely ones and remember the choice in this browser.

const STORAGE_KEY = 'tsa.virtualRooms';

export interface VirtualRoomSuggestion {
  room: string;
  /** Most classes booked in the room at the same moment. */
  maxConcurrent: number;
  classes: number;
  hours: number;
  departments: string[];
}

/** Rooms that have two or more classes at the same time: a real room can't. */
export function suggestVirtualRooms(courses: Record<string, CourseSection>): VirtualRoomSuggestion[] {
  const byRoom: Record<string, ReturnType<typeof allMeetings>> = {};
  allMeetings(courses).forEach((m) => {
    (byRoom[m.room] ||= []).push(m);
  });

  return Object.entries(byRoom)
    .map(([room, meetings]) => {
      let maxConcurrent = 0;
      // Sweep start/end events per day to find the peak number of classes at once.
      const days = new Set(meetings.map((m) => m.day));
      days.forEach((day) => {
        const events = meetings
          .filter((m) => m.day === day)
          .flatMap((m) => [
            [toMinutes(m.startTime), 1],
            [toMinutes(m.endTime), -1]
          ])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let current = 0;
        events.forEach(([, delta]) => {
          current += delta;
          maxConcurrent = Math.max(maxConcurrent, current);
        });
      });
      return {
        room,
        maxConcurrent,
        classes: meetings.length,
        hours: meetings.reduce((s, m) => s + m.hours, 0),
        departments: Array.from(new Set(meetings.map((m) => m.department))).sort((a, b) => a.localeCompare(b))
      };
    })
    .filter((r) => r.maxConcurrent > 1)
    .sort((a, b) => b.maxConcurrent - a.maxConcurrent || b.classes - a.classes);
}

export function loadVirtualRooms(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function saveVirtualRooms(rooms: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit only.
  }
}
