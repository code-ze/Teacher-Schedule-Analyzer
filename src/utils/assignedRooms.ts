import { WORK_DAYS, DISPLAY_HOURS } from '../config';
import type { Classroom } from '../types';
import type { AssignedRoom } from './departmentReport';

// Rooms the user assigns to departments even when nothing is scheduled in
// them this semester (e.g. HL103 belongs to Design but is empty), so they
// count as free capacity instead of silently disappearing. Saved in this browser.

const STORAGE_KEY = 'tsa.assignedRooms';

export function loadAssignedRooms(): AssignedRoom[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is AssignedRoom =>
        !!r && typeof r.room === 'string' && Array.isArray(r.departments) && r.departments.every((d: unknown) => typeof d === 'string')
    );
  } catch {
    return [];
  }
}

export function saveAssignedRooms(rooms: AssignedRoom[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch {
    // Storage can be unavailable (private mode); the list then lasts for this visit only.
  }
}

/** An empty classroom record for an assigned room with no classes in the loaded file. */
export function emptyClassroom(room: AssignedRoom): Classroom {
  const schedule: Classroom['schedule'] = {};
  WORK_DAYS.forEach((day) => {
    schedule[day] = {};
    DISPLAY_HOURS.forEach((hour) => {
      schedule[day][hour] = { isOccupied: false, course: null, teacher: null };
    });
  });
  return { name: room.room, schedule, totalHours: 0, totalClasses: 0, departments: new Set(room.departments) };
}
