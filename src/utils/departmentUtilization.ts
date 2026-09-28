import { WORK_DAYS, DISPLAY_HOURS, FULL_OCCUPANCY_HOURS } from '../config';
import type { Classroom, DepartmentUtilization } from '../types';
import type { AssignedRoom } from './departmentReport';

// Builds a per-department utilization summary from the classroom data:
// for every department, find the rooms it uses, and measure how full
// those rooms run (weekly average and single busiest day), so admins can
// spot which departments are packed vs. which have slack room capacity.
export function computeDepartmentUtilization(
  classrooms: Record<string, Classroom>,
  /** Rooms assigned to departments by the user; empty ones add free capacity. */
  assignedRooms: AssignedRoom[] = []
): DepartmentUtilization[] {
  const byDepartment: Record<
    string,
    { rooms: Set<string>; teachers: Set<string>; totalClasses: number; totalHours: number; dailyHours: Record<string, number> }
  > = {};

  Object.values(classrooms).forEach((classroom) => {
    WORK_DAYS.forEach((day) => {
      const daySchedule = classroom.schedule[day];
      if (!daySchedule) return;
      DISPLAY_HOURS.forEach((hourKey) => {
        const slot = daySchedule[hourKey];
        if (!slot || !slot.isOccupied || !slot.department) return;

        const dept = slot.department;
        if (!byDepartment[dept]) {
          byDepartment[dept] = {
            rooms: new Set(),
            teachers: new Set(),
            totalClasses: 0,
            totalHours: 0,
            dailyHours: {}
          };
        }
        const entry = byDepartment[dept];
        entry.rooms.add(classroom.name);
        if (slot.teacher) entry.teachers.add(slot.teacher);
        entry.totalHours += 1;
        const dayKey = `${day}`;
        entry.dailyHours[dayKey] = (entry.dailyHours[dayKey] || 0) + 1;
      });
    });
  });

  assignedRooms.forEach(({ room, departments }) => {
    departments.forEach((dept) => byDepartment[dept]?.rooms.add(room));
  });

  // totalClasses (weekly meeting count) is easier to derive from courses upstream;
  // here we approximate using distinct (room, day, timeRange) occurrences via hour cells
  // is already captured as totalHours per hour-cell, so count separately per department
  // by scanning again for slot starts (timeRange) to avoid double counting duration>1h.
  const seenMeetings: Record<string, Set<string>> = {};
  Object.values(classrooms).forEach((classroom) => {
    WORK_DAYS.forEach((day) => {
      const daySchedule = classroom.schedule[day];
      if (!daySchedule) return;
      DISPLAY_HOURS.forEach((hourKey) => {
        const slot = daySchedule[hourKey];
        if (!slot || !slot.isOccupied || !slot.department) return;
        const dept = slot.department;
        if (!seenMeetings[dept]) seenMeetings[dept] = new Set();
        const meetingId = `${classroom.name}|${day}|${slot.timeRange}|${slot.course}|${slot.section}`;
        seenMeetings[dept].add(meetingId);
      });
    });
  });

  const results: DepartmentUtilization[] = Object.keys(byDepartment).map((dept) => {
    const entry = byDepartment[dept];
    const dailyValues = WORK_DAYS.map((day) => entry.dailyHours[day] || 0);
    const maxDailyHours = Math.max(0, ...dailyValues);
    const roomCount = entry.rooms.size || 1;
    const avgDailyUtilization =
      (dailyValues.reduce((sum, h) => sum + h, 0) / WORK_DAYS.length / (roomCount * FULL_OCCUPANCY_HOURS)) * 100;

    return {
      name: dept,
      totalClasses: seenMeetings[dept] ? seenMeetings[dept].size : 0,
      totalHours: entry.totalHours,
      teacherCount: entry.teachers.size,
      roomCount: entry.rooms.size,
      rooms: Array.from(entry.rooms).sort((a, b) => a.localeCompare(b)),
      maxDailyHours,
      utilizationPercentage: Math.min(100, Math.round(avgDailyUtilization * 10) / 10)
    };
  });

  return results.sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);
}
