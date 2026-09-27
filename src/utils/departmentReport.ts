import { WORK_DAYS, FULL_OCCUPANCY_HOURS } from '../config';
import type { CourseSection } from '../types';

// Detailed room-use report for one department: every class it teaches, every
// room it uses, and how much of each room's week goes to this department vs.
// the other departments sharing it. Built from the course sections (not the
// hour grid) so combined or double-booked classes are all counted.

export interface ReportMeeting {
  department: string;
  code: string;
  courseName: string;
  section: string;
  teacher: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  hours: number;
}

export interface RoomUsage {
  room: string;
  departmentHours: number;
  otherHours: Record<string, number>;
  otherHoursTotal: number;
  totalHours: number;
  capacityHours: number;
  freeHours: number;
  departmentUtilization: number;
  totalUtilization: number;
  departmentShare: number;
  departmentClasses: number;
  otherClasses: number;
  sharedWith: string[];
}

export interface RoomClash {
  room: string;
  day: string;
  first: ReportMeeting;
  second: ReportMeeting;
}

export interface InstructorLoad {
  name: string;
  sections: number;
  classes: number;
  hours: number;
}

export interface DepartmentReport {
  department: string;
  days: string[];
  capacityPerRoom: number;
  summary: {
    courses: number;
    sections: number;
    weeklyClasses: number;
    weeklyHours: number;
    instructors: number;
    rooms: number;
    sharedRooms: number;
    exclusiveRooms: number;
    capacityHours: number;
    otherDepartmentHours: number;
    freeHours: number;
    departmentUtilization: number;
    totalUtilization: number;
    departmentShare: number;
  };
  meetings: ReportMeeting[];
  rooms: RoomUsage[];
  otherMeetings: ReportMeeting[];
  clashes: RoomClash[];
  instructors: InstructorLoad[];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  return h * 60 + (m || 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? round1((part / whole) * 100) : 0;
}

const dayOrder = (day: string) => WORK_DAYS.indexOf(day as (typeof WORK_DAYS)[number]);

function compareMeetings(a: ReportMeeting, b: ReportMeeting): number {
  return (
    a.room.localeCompare(b.room) ||
    dayOrder(a.day) - dayOrder(b.day) ||
    a.startTime.localeCompare(b.startTime) ||
    a.code.localeCompare(b.code) ||
    a.section.localeCompare(b.section, undefined, { numeric: true })
  );
}

export function allMeetings(courses: Record<string, CourseSection>): ReportMeeting[] {
  const meetings: ReportMeeting[] = [];
  Object.values(courses).forEach((course) => {
    WORK_DAYS.forEach((day) => {
      (course.schedule[day] || []).forEach((m) => {
        meetings.push({
          department: course.department || 'Unknown',
          code: course.code,
          courseName: course.name,
          section: course.section,
          teacher: m.teacher,
          day,
          startTime: m.startTime,
          endTime: m.endTime,
          room: m.room,
          hours: Math.max(0, toMinutes(m.endTime) - toMinutes(m.startTime)) / 60
        });
      });
    });
  });
  return meetings;
}

export function buildDepartmentReport(
  courses: Record<string, CourseSection>,
  department: string
): DepartmentReport {
  const meetings = allMeetings(courses);

  // Capacity is counted over the days the timetable actually uses (e.g. Sun–Thu).
  const days = WORK_DAYS.filter((day) => meetings.some((m) => m.day === day));
  const capacityPerRoom = days.length * FULL_OCCUPANCY_HOURS;

  const deptMeetings = meetings.filter((m) => m.department === department).sort(compareMeetings);
  const roomNames = Array.from(new Set(deptMeetings.map((m) => m.room))).sort((a, b) => a.localeCompare(b));
  const roomSet = new Set(roomNames);
  const otherMeetings = meetings
    .filter((m) => m.department !== department && roomSet.has(m.room))
    .sort(compareMeetings);

  const rooms: RoomUsage[] = roomNames.map((room) => {
    const mine = deptMeetings.filter((m) => m.room === room);
    const others = otherMeetings.filter((m) => m.room === room);
    const departmentHours = mine.reduce((s, m) => s + m.hours, 0);
    const otherHours: Record<string, number> = {};
    others.forEach((m) => {
      otherHours[m.department] = (otherHours[m.department] || 0) + m.hours;
    });
    const otherHoursTotal = others.reduce((s, m) => s + m.hours, 0);
    const totalHours = departmentHours + otherHoursTotal;
    return {
      room,
      departmentHours,
      otherHours,
      otherHoursTotal,
      totalHours,
      capacityHours: capacityPerRoom,
      freeHours: Math.max(0, capacityPerRoom - totalHours),
      departmentUtilization: pct(departmentHours, capacityPerRoom),
      totalUtilization: pct(totalHours, capacityPerRoom),
      departmentShare: pct(departmentHours, totalHours),
      departmentClasses: mine.length,
      otherClasses: others.length,
      sharedWith: Object.keys(otherHours).sort((a, b) => a.localeCompare(b))
    };
  });

  // Two classes in the same room whose times overlap (combined sections or a booking clash).
  const clashes: RoomClash[] = [];
  const roomMeetings = [...deptMeetings, ...otherMeetings].sort(compareMeetings);
  roomMeetings.forEach((a, i) => {
    for (let j = i + 1; j < roomMeetings.length; j++) {
      const b = roomMeetings[j];
      if (b.room !== a.room || b.day !== a.day) break;
      if (toMinutes(b.startTime) >= toMinutes(a.endTime)) break;
      if (a.department === department || b.department === department) {
        clashes.push({ room: a.room, day: a.day, first: a, second: b });
      }
    }
  });

  const instructorMap: Record<string, { sections: Set<string>; classes: number; hours: number }> = {};
  deptMeetings.forEach((m) => {
    const entry = (instructorMap[m.teacher] ||= { sections: new Set(), classes: 0, hours: 0 });
    entry.sections.add(`${m.code}-${m.section}`);
    entry.classes++;
    entry.hours += m.hours;
  });
  const instructors = Object.entries(instructorMap)
    .map(([name, e]) => ({ name, sections: e.sections.size, classes: e.classes, hours: e.hours }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const weeklyHours = deptMeetings.reduce((s, m) => s + m.hours, 0);
  const otherDepartmentHours = otherMeetings.reduce((s, m) => s + m.hours, 0);
  const capacityHours = capacityPerRoom * rooms.length;
  const sharedRooms = rooms.filter((r) => r.sharedWith.length > 0).length;

  return {
    department,
    days,
    capacityPerRoom,
    summary: {
      courses: new Set(deptMeetings.map((m) => m.code)).size,
      sections: new Set(deptMeetings.map((m) => `${m.code}-${m.section}`)).size,
      weeklyClasses: deptMeetings.length,
      weeklyHours,
      instructors: instructors.length,
      rooms: rooms.length,
      sharedRooms,
      exclusiveRooms: rooms.length - sharedRooms,
      capacityHours,
      otherDepartmentHours,
      freeHours: rooms.reduce((s, r) => s + r.freeHours, 0),
      departmentUtilization: pct(weeklyHours, capacityHours),
      totalUtilization: pct(weeklyHours + otherDepartmentHours, capacityHours),
      departmentShare: pct(weeklyHours, weeklyHours + otherDepartmentHours)
    },
    meetings: deptMeetings,
    rooms,
    otherMeetings,
    clashes,
    instructors
  };
}
