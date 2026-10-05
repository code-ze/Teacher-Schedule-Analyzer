import type { CourseSection } from '../types';
import { allMeetings, toMinutes, type ReportMeeting } from './departmentReport';
import { SPACE_REPORT_CONFIG, type Windows } from './spaceReport/config';
import type { DepartmentFacilities } from './spaceReport/facilities';
import type { StudentData } from './students/students';

// Campus consolidation figures for any chosen departments, laid out like the
// DAVCAA consolidation proposal: teaching hours, classrooms and labs needed at
// full use and at the 80% planning standard, the rooms used today, timetabling
// issues (Tuesday break, Thursday afternoon, evening, online), students and staff.
// Rooms needed = weekly hours / hours a room offers in the department's week, rounded up.

const config = SPACE_REPORT_CONFIG;
const TUESDAY_BREAK: [number, number] = [12 * 60, 14 * 60];
const THURSDAY_AFTER_2PM: [number, number] = [14 * 60, 18 * 60];

/** The proposal's teaching week for every unit: Tuesday 12-14 reserved, Thursday ends at 14:00. */
export const PROPOSAL_WEEK: Windows = { Tuesday: TUESDAY_BREAK, Thursday: THURSDAY_AFTER_2PM };

/** Blocked times per department: the confirmed rules, else the proposal's week. */
export const blockedFor = (dept: string): Windows => config.blocked[dept] ?? PROPOSAL_WEEK;

export interface Week {
  dayHours: Record<string, number>;
  total: number;
  /** Hours per room at the 80% planning standard. */
  planning: number;
  thursdayTo14: boolean;
}

export function weekFor(blocked: Windows): Week {
  const dayHours = Object.fromEntries(
    config.days.map((d) => [d, (config.close - config.open) / 60 - (blocked[d] ? (blocked[d][1] - blocked[d][0]) / 60 : 0)])
  );
  const total = config.days.reduce((s, d) => s + dayHours[d], 0);
  return { dayHours, total, planning: total * config.comfort, thursdayTo14: !!blocked.Thursday };
}

export interface ClassBrief {
  department: string;
  code: string;
  name: string;
  section: string;
  day: string;
  time: string;
  hours: number;
  room: string;
  teacher: string;
}

export interface Need {
  hours: number;
  full: number;
  planning: number;
}

export interface DepartmentPlan {
  department: string;
  week: Week;
  /** Set when the department's week differs from the proposal's (e.g. Business keeps Thursday afternoon). */
  proposalWeek: Week | null;
  courses: number;
  sections: number;
  instructors: number;
  hours: { total: number; classroom: number; lab: number; online: number };
  onlineClasses: number;
  /** Classroom hours between opening and closing time, which set the room need. */
  daytimeClassroomHours: number;
  classroomsNow: number;
  labsNow: number;
  classrooms: Need & { busiestDay: string; busiestDayRooms: number; planningProposalWeek: number | null };
  labs: Need;
  /** Daytime classroom hours per teaching day. */
  byDay: Record<string, number>;
  /** Rooms this department teaches in, with its hours and the use of a 40-hour week. */
  rooms: { room: string; kind: 'classroom' | 'lab'; hours: number; usePct: number }[];
  tuesdayBreak: ClassBrief[];
  thursdayAfter2: ClassBrief[];
  evening: ClassBrief[];
  online: ClassBrief[];
}

export interface LabGroup {
  departments: string[];
  labs: string[];
  need: Need;
}

export interface RoomRow {
  room: string;
  building: string;
  kind: 'classroom' | 'lab';
  /** Hours per department (every department using the room, selected or not). */
  byDept: Record<string, number>;
  selectedHours: number;
  total: number;
  usePct: number;
}

export interface StudentRow {
  department: string;
  studying: number;
  registered: number;
  other: Record<string, number>;
}

export interface CampusPlan {
  departments: string[];
  plans: DepartmentPlan[];
  /** Departments sharing labs, with their hours combined (only when more than one is selected). */
  labGroups: LabGroup[];
  totals: { classroomsNow: number; classroomsPlanning: number; classroomsFull: number; labsPlanning: number; labsFull: number };
  rooms: RoomRow[];
  students: StudentRow[] | null;
  offices: DepartmentFacilities[] | null;
}

const sum = (ms: ReportMeeting[]) => ms.reduce((s, m) => s + m.hours, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : 0);
const roomsFor = (hours: number, perRoom: number) => (perRoom > 0 ? Math.ceil(hours / perRoom - 1e-9) : 0);
const need = (hours: number, week: Week): Need => ({
  hours: round1(hours),
  full: roomsFor(hours, week.total),
  planning: roomsFor(hours, week.planning)
});
const brief = (m: ReportMeeting): ClassBrief => ({
  department: m.department,
  code: m.code,
  name: m.courseName.replace(m.code, '').trim() || m.courseName,
  section: m.section,
  day: m.day,
  time: `${m.startTime}-${m.endTime}`,
  hours: m.hours,
  room: m.room,
  teacher: m.teacher
});
const building = (room: string) => room.match(/^[A-Z]+/)?.[0] ?? room;

export interface CampusPlanOptions {
  /** Rooms that are placeholders for online classes. */
  onlineRooms?: string[];
  students?: StudentData | null;
  facilities?: DepartmentFacilities[] | null;
}

export function buildCampusPlan(
  courses: Record<string, CourseSection>,
  departments: string[],
  opts: CampusPlanOptions = {}
): CampusPlan {
  const online = new Set([...config.onlineRooms, ...(opts.onlineRooms ?? [])].map((r) => r.toUpperCase()));
  const labRooms = new Set(Object.values(config.labs).flat());
  const all = allMeetings(courses).map((m) => ({ ...m, room: m.room.toUpperCase() }));
  const { open, close } = config;
  const inDaytime = (m: ReportMeeting) => toMinutes(m.startTime) >= open && toMinutes(m.endTime) <= close;
  const overlaps = (m: ReportMeeting, [a, b]: [number, number]) => toMinutes(m.startTime) < b && toMinutes(m.endTime) > a;
  const proposal = weekFor(PROPOSAL_WEEK);

  const plans = departments.map((dept): DepartmentPlan => {
    const blocked = blockedFor(dept);
    const week = weekFor(blocked);
    const differs = week.total !== proposal.total;
    const mine = all.filter((m) => m.department === dept);
    const onlineMs = mine.filter((m) => online.has(m.room));
    const inPerson = mine.filter((m) => !online.has(m.room));
    const labMs = inPerson.filter((m) => labRooms.has(m.room));
    const classMs = inPerson.filter((m) => !labRooms.has(m.room));
    const dayClass = classMs.filter(inDaytime);
    const daytime = sum(dayClass);

    const byDay = Object.fromEntries(config.days.map((d) => [d, round1(sum(dayClass.filter((m) => m.day === d)))]));
    let busiestDay = '';
    let busiestDayRooms = 0;
    config.days.forEach((d) => {
      const r = roomsFor(byDay[d], week.dayHours[d]);
      if (r > busiestDayRooms) {
        busiestDayRooms = r;
        busiestDay = d;
      }
    });

    const roomHours: Record<string, number> = {};
    inPerson.forEach((m) => (roomHours[m.room] = (roomHours[m.room] || 0) + m.hours));
    const rooms = Object.entries(roomHours)
      .map(([room, hours]) => ({
        room,
        kind: labRooms.has(room) ? ('lab' as const) : ('classroom' as const),
        hours: round1(hours),
        usePct: pct(hours, config.standardWeek)
      }))
      .sort((a, b) => b.hours - a.hours || a.room.localeCompare(b.room));

    const tue = blocked.Tuesday;
    return {
      department: dept,
      week,
      proposalWeek: differs ? proposal : null,
      courses: new Set(mine.map((m) => m.code)).size,
      sections: new Set(mine.map((m) => `${m.code}-${m.section}`)).size,
      instructors: new Set(mine.map((m) => m.teacher).filter(Boolean)).size,
      hours: { total: round1(sum(mine)), classroom: round1(sum(classMs)), lab: round1(sum(labMs)), online: round1(sum(onlineMs)) },
      onlineClasses: onlineMs.length,
      daytimeClassroomHours: round1(daytime),
      classroomsNow: rooms.filter((r) => r.kind === 'classroom').length,
      labsNow: rooms.filter((r) => r.kind === 'lab').length,
      classrooms: {
        ...need(daytime, week),
        busiestDay,
        busiestDayRooms,
        planningProposalWeek: differs ? roomsFor(daytime, proposal.planning) : null
      },
      labs: need(sum(labMs), week),
      byDay,
      rooms,
      tuesdayBreak: tue ? inPerson.filter((m) => m.day === 'Tuesday' && overlaps(m, tue)).map(brief) : [],
      thursdayAfter2: inPerson
        .filter((m) => m.day === 'Thursday' && toMinutes(m.endTime) > THURSDAY_AFTER_2PM[0] && toMinutes(m.startTime) < close)
        .map(brief),
      evening: mine.filter((m) => !online.has(m.room) && toMinutes(m.endTime) > close).map(brief),
      online: onlineMs.map(brief)
    };
  });

  // Departments that share a lab plan their labs together (e.g. Design and Mass Communication).
  const labGroups: LabGroup[] = [];
  const seen = new Set<string>();
  plans.forEach((p) => {
    if (seen.has(p.department)) return;
    const group = [p];
    const labs = new Set(config.labs[p.department] ?? []);
    let grew = true;
    while (grew) {
      grew = false;
      plans.forEach((q) => {
        if (group.includes(q) || !(config.labs[q.department] ?? []).some((l) => labs.has(l))) return;
        group.push(q);
        (config.labs[q.department] ?? []).forEach((l) => labs.add(l));
        grew = true;
      });
    }
    group.forEach((q) => seen.add(q.department));
    if (group.length < 2) return;
    const week = group.map((q) => q.week).sort((a, b) => a.total - b.total)[0];
    labGroups.push({
      departments: group.map((q) => q.department),
      labs: Array.from(labs).sort(),
      need: need(
        group.reduce((s, q) => s + q.hours.lab, 0),
        week
      )
    });
  });
  const grouped = new Set(labGroups.flatMap((g) => g.departments));

  const selected = new Set(departments);
  const used = new Set(all.filter((m) => selected.has(m.department) && !online.has(m.room)).map((m) => m.room));
  const rooms: RoomRow[] = Array.from(used)
    .map((room) => {
      const ms = all.filter((m) => m.room === room);
      const byDept: Record<string, number> = {};
      ms.forEach((m) => (byDept[m.department] = round1((byDept[m.department] || 0) + m.hours)));
      const total = sum(ms);
      return {
        room,
        building: building(room),
        kind: labRooms.has(room) ? ('lab' as const) : ('classroom' as const),
        byDept,
        selectedHours: round1(sum(ms.filter((m) => selected.has(m.department)))),
        total: round1(total),
        usePct: pct(total, config.standardWeek)
      };
    })
    .sort((a, b) => a.building.localeCompare(b.building) || a.room.localeCompare(b.room, undefined, { numeric: true }));

  let students: StudentRow[] | null = null;
  if (opts.students) {
    const { students: list, noCourses } = opts.students;
    students = departments.map((dept) => {
      const other: Record<string, number> = {};
      const mine = list.filter((s) => s.department === dept);
      const add = (status: string) => (other[status] = (other[status] || 0) + 1);
      mine.filter((s) => s.status !== 'Studying').forEach((s) => add(s.status || 'Unknown'));
      noCourses
        .filter((s) => s.department === dept)
        .forEach((s) => add(s.status === 'Studying' ? 'Studying, no courses' : s.status || 'Unknown'));
      return { department: dept, studying: mine.filter((s) => s.status === 'Studying').length, registered: mine.length, other };
    });
  }

  return {
    departments,
    plans,
    labGroups,
    totals: {
      classroomsNow: rooms.filter((r) => r.kind === 'classroom').length,
      classroomsPlanning: plans.reduce((s, p) => s + Math.max(p.classrooms.planning, p.classrooms.busiestDayRooms), 0),
      classroomsFull: plans.reduce((s, p) => s + Math.max(p.classrooms.full, p.classrooms.busiestDayRooms), 0),
      labsPlanning:
        labGroups.reduce((s, g) => s + g.need.planning, 0) +
        plans.filter((p) => !grouped.has(p.department)).reduce((s, p) => s + p.labs.planning, 0),
      labsFull:
        labGroups.reduce((s, g) => s + g.need.full, 0) +
        plans.filter((p) => !grouped.has(p.department)).reduce((s, p) => s + p.labs.full, 0)
    },
    rooms,
    students,
    offices: opts.facilities ? opts.facilities.filter((f) => selected.has(f.department)) : null
  };
}
