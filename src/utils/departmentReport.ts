import { WORK_DAYS, FULL_OCCUPANCY_HOURS } from '../config';
import type { CourseSection } from '../types';

// Detailed room-use report for one or more departments: every class they
// teach, every room they use, and how much of each room's week goes to them
// vs. the other departments sharing it. Built from the course sections (not
// the hour grid) so combined or double-booked classes are all counted.

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
  /** Hours per selected department that uses this room. */
  hoursByDepartment: Record<string, number>;
  selectedHours: number;
  /** Hours per non-selected department sharing this room. */
  otherHours: Record<string, number>;
  otherHoursTotal: number;
  totalHours: number;
  capacityHours: number;
  freeHours: number;
  selectedUtilization: number;
  totalUtilization: number;
  selectedShare: number;
  selectedClasses: number;
  otherClasses: number;
  /** Selected departments using the room (or assigned to it, if it has no classes). */
  usedBy: string[];
  /** Non-selected departments using (or assigned to) the room. */
  sharedWith: string[];
  /** Departments the user assigned this room to (see AssignedRoom). */
  assignedTo: string[];
  /** True when nothing is scheduled in the room this semester. */
  noClasses: boolean;
}

/** A room the user assigned to departments, e.g. one with no classes this semester. */
export interface AssignedRoom {
  room: string;
  departments: string[];
}

/** Totals for a group of rooms (e.g. rooms only one department uses). */
export interface RoomGroupTotals {
  rooms: string[];
  selectedHours: number;
  otherHours: number;
  capacityHours: number;
  freeHours: number;
  selectedUtilization: number;
  totalUtilization: number;
}

export interface DepartmentSummary {
  department: string;
  courses: number;
  sections: number;
  weeklyClasses: number;
  weeklyHours: number;
  instructors: number;
  rooms: number;
  /** Classes / hours held in rooms marked as virtual (online). Not in weeklyClasses. */
  onlineClasses: number;
  onlineHours: number;
  /** Rooms no other department (selected or not) teaches in. */
  ownRooms: RoomGroupTotals;
  /** Rooms this department shares with any other department. */
  sharedRooms: RoomGroupTotals & { departmentHours: number; departmentShare: number };
}

export interface RoomClash {
  room: string;
  day: string;
  first: ReportMeeting;
  second: ReportMeeting;
}

export interface InstructorLoad {
  name: string;
  departments: string[];
  sections: number;
  classes: number;
  hours: number;
}

export interface Finding {
  tone: 'good' | 'warn' | 'info';
  text: string;
}

export interface DepartmentReport {
  departments: string[];
  /** "Design" for one department, "Selected departments" for several. */
  label: string;
  days: string[];
  capacityPerRoom: number;
  summary: {
    courses: number;
    sections: number;
    /** Classes and hours in real rooms (virtual rooms excluded). */
    weeklyClasses: number;
    weeklyHours: number;
    /** Classes and hours in rooms marked as virtual / online. */
    onlineClasses: number;
    onlineHours: number;
    instructors: number;
    rooms: number;
    capacityHours: number;
    otherDepartmentHours: number;
    freeHours: number;
    selectedUtilization: number;
    totalUtilization: number;
    selectedShare: number;
  };
  /** Rooms only the selected departments use vs. rooms shared with others. */
  selectedOnlyRooms: RoomGroupTotals;
  sharedRooms: RoomGroupTotals;
  byDepartment: DepartmentSummary[];
  findings: Finding[];
  meetings: ReportMeeting[];
  /** Selected departments' classes in virtual rooms, kept out of every room figure. */
  virtualMeetings: ReportMeeting[];
  /** Virtual rooms the selected departments use. */
  virtualRooms: string[];
  rooms: RoomUsage[];
  otherMeetings: ReportMeeting[];
  clashes: RoomClash[];
  instructors: InstructorLoad[];
}

export function toMinutes(time: string): number {
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

function sum<T>(items: T[], f: (item: T) => number): number {
  return items.reduce((s, item) => s + f(item), 0);
}

function groupTotals(rooms: RoomUsage[], capacityPerRoom: number): RoomGroupTotals {
  const capacityHours = capacityPerRoom * rooms.length;
  const selectedHours = sum(rooms, (r) => r.selectedHours);
  const otherHours = sum(rooms, (r) => r.otherHoursTotal);
  return {
    rooms: rooms.map((r) => r.room),
    selectedHours,
    otherHours,
    capacityHours,
    freeHours: sum(rooms, (r) => r.freeHours),
    selectedUtilization: pct(selectedHours, capacityHours),
    totalUtilization: pct(selectedHours + otherHours, capacityHours)
  };
}

const MAX_LISTED_ROOMS = 8;

function listRooms(rooms: RoomUsage[], detail: (r: RoomUsage) => string): string {
  const listed = rooms.slice(0, MAX_LISTED_ROOMS).map((r) => `${r.room} (${detail(r)})`).join(', ');
  const more = rooms.length - MAX_LISTED_ROOMS;
  return more > 0 ? `${listed} and ${more} more` : listed;
}

function buildFindings(report: Omit<DepartmentReport, 'findings'>): Finding[] {
  const findings: Finding[] = [];
  const { rooms, label, capacityPerRoom } = report;
  const single = report.departments.length === 1;

  report.byDepartment.forEach((d) => {
    if (d.ownRooms.rooms.length > 0) {
      findings.push({
        tone: 'info',
        text:
          `${d.department} has ${d.ownRooms.rooms.length} room(s) of its own, used ${d.ownRooms.totalUtilization}% ` +
          `(${d.ownRooms.freeHours} free hours a week). It shares ${d.sharedRooms.rooms.length} more room(s), ` +
          `where it has ${d.sharedRooms.departmentShare}% of the booked time.`
      });
    } else if (d.rooms > 0) {
      findings.push({
        tone: 'info',
        text: `${d.department} has no room of its own; all ${d.rooms} of its rooms are shared (it has ${d.sharedRooms.departmentShare}% of their booked time).`
      });
    }
  });

  const full = rooms.filter((r) => r.totalUtilization >= 90 && r.totalUtilization <= 100);
  if (full.length) {
    findings.push({ tone: 'warn', text: `Nearly full (90%+): ${listRooms(full, (r) => `${r.totalUtilization}%`)}.` });
  }
  const over = rooms.filter((r) => r.totalUtilization > 100);
  if (over.length) {
    findings.push({
      tone: 'warn',
      text: `Over 100% (classes also run before 08:00 or after 16:00): ${listRooms(over, (r) => `${r.totalUtilization}%`)}.`
    });
  }
  const low = rooms.filter((r) => r.totalUtilization < 50 && !r.noClasses).reverse();
  if (low.length) {
    findings.push({
      tone: 'good',
      text: `Spare capacity (under 50% used): ${listRooms(low, (r) => `${r.totalUtilization}%, ${r.freeHours}h free`)}.`
    });
  }
  const mostlyOthers = rooms.filter((r) => r.selectedShare < 25 && !r.noClasses);
  if (mostlyOthers.length) {
    findings.push({
      tone: 'info',
      text:
        `Mostly used by other departments (${single ? label : 'selected departments'} under 25% of the time): ` +
        `${listRooms(mostlyOthers, (r) => `${r.selectedHours}h vs ${r.otherHoursTotal}h ${r.sharedWith.join(' / ')}`)}.`
    });
  }
  if (report.clashes.length) {
    findings.push({
      tone: 'warn',
      text: `${report.clashes.length} time clash(es): two classes booked in the same room at the same time (see the Clashes table).`
    });
  }
  const empty = rooms.filter((r) => r.noClasses);
  if (empty.length) {
    findings.push({
      tone: 'good',
      text:
        `No classes this semester (fully free, ${capacityPerRoom}h a week each): ` +
        `${empty.map((r) => `${r.room} (${r.assignedTo.join(', ')})`).join(', ')}.`
    });
  }
  if (report.virtualMeetings.length) {
    findings.push({
      tone: 'info',
      text:
        `${report.summary.onlineClasses} online class(es) (${report.summary.onlineHours}h a week) are in virtual rooms ` +
        `(${report.virtualRooms.join(', ')}) and are not counted in any room figure (see "Online / virtual room classes").`
    });
  }
  findings.push({
    tone: 'info',
    text: `Each room has ${capacityPerRoom} hours a week available; 1 hour = 12.5% of a room's day.`
  });
  return findings;
}

export interface DepartmentReportOptions {
  /** Placeholder rooms for online classes; left out of all room figures. */
  virtualRooms?: string[];
  /** Rooms assigned to departments by the user; included even with no classes. */
  assignedRooms?: AssignedRoom[];
}

export function buildDepartmentReport(
  courses: Record<string, CourseSection>,
  departmentOrList: string | string[],
  options: DepartmentReportOptions = {}
): DepartmentReport {
  const departments = (Array.isArray(departmentOrList) ? departmentOrList : [departmentOrList])
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const selected = new Set(departments);
  const label = departments.length === 1 ? departments[0] : 'Selected departments';
  const everyMeeting = allMeetings(courses);
  const virtual = new Set(options.virtualRooms ?? []);
  const meetings = everyMeeting.filter((m) => !virtual.has(m.room));
  const virtualMeetings = everyMeeting
    .filter((m) => virtual.has(m.room) && selected.has(m.department))
    .sort((a, b) => a.department.localeCompare(b.department) || compareMeetings(a, b));

  // Capacity is counted over the days the timetable actually uses (e.g. Sun–Thu).
  const days = WORK_DAYS.filter((day) => everyMeeting.some((m) => m.day === day));
  const capacityPerRoom = days.length * FULL_OCCUPANCY_HOURS;

  const selectedMeetings = meetings.filter((m) => selected.has(m.department)).sort(compareMeetings);
  const assignedTo = new Map<string, string[]>();
  (options.assignedRooms ?? []).forEach((a) => {
    if (!virtual.has(a.room)) assignedTo.set(a.room, a.departments);
  });
  const roomNames = Array.from(
    new Set([
      ...selectedMeetings.map((m) => m.room),
      ...Array.from(assignedTo.entries())
        .filter(([, depts]) => depts.some((d) => selected.has(d)))
        .map(([room]) => room)
    ])
  );
  const roomSet = new Set(roomNames);
  const otherMeetings = meetings
    .filter((m) => !selected.has(m.department) && roomSet.has(m.room))
    .sort(compareMeetings);

  const rooms: RoomUsage[] = roomNames
    .map((room) => {
      const mine = selectedMeetings.filter((m) => m.room === room);
      const others = otherMeetings.filter((m) => m.room === room);
      const hoursByDepartment: Record<string, number> = {};
      mine.forEach((m) => {
        hoursByDepartment[m.department] = (hoursByDepartment[m.department] || 0) + m.hours;
      });
      const otherHours: Record<string, number> = {};
      others.forEach((m) => {
        otherHours[m.department] = (otherHours[m.department] || 0) + m.hours;
      });
      const selectedHours = sum(mine, (m) => m.hours);
      const otherHoursTotal = sum(others, (m) => m.hours);
      const totalHours = selectedHours + otherHoursTotal;
      const assigned = assignedTo.get(room) ?? [];
      const unique = (list: string[]) => Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
      return {
        room,
        hoursByDepartment,
        selectedHours,
        otherHours,
        otherHoursTotal,
        totalHours,
        capacityHours: capacityPerRoom,
        freeHours: Math.max(0, capacityPerRoom - totalHours),
        selectedUtilization: pct(selectedHours, capacityPerRoom),
        totalUtilization: pct(totalHours, capacityPerRoom),
        selectedShare: pct(selectedHours, totalHours),
        selectedClasses: mine.length,
        otherClasses: others.length,
        usedBy: unique([...Object.keys(hoursByDepartment), ...assigned.filter((d) => selected.has(d))]),
        sharedWith: unique([...Object.keys(otherHours), ...assigned.filter((d) => !selected.has(d))]),
        assignedTo: assigned,
        noClasses: mine.length + others.length === 0
      };
    })
    .sort((a, b) => b.totalUtilization - a.totalUtilization || a.room.localeCompare(b.room));

  // Two classes in the same room whose times overlap (combined sections or a booking clash).
  const clashes: RoomClash[] = [];
  const roomMeetings = [...selectedMeetings, ...otherMeetings].sort(compareMeetings);
  roomMeetings.forEach((a, i) => {
    for (let j = i + 1; j < roomMeetings.length; j++) {
      const b = roomMeetings[j];
      if (b.room !== a.room || b.day !== a.day) break;
      if (toMinutes(b.startTime) >= toMinutes(a.endTime)) break;
      if (selected.has(a.department) || selected.has(b.department)) {
        clashes.push({ room: a.room, day: a.day, first: a, second: b });
      }
    }
  });

  const instructorMap: Record<string, { departments: Set<string>; sections: Set<string>; classes: number; hours: number }> = {};
  [...selectedMeetings, ...virtualMeetings].forEach((m) => {
    const entry = (instructorMap[m.teacher] ||= { departments: new Set(), sections: new Set(), classes: 0, hours: 0 });
    entry.departments.add(m.department);
    entry.sections.add(`${m.code}-${m.section}`);
    entry.classes++;
    entry.hours += m.hours;
  });
  const instructors = Object.entries(instructorMap)
    .map(([name, e]) => ({
      name,
      departments: Array.from(e.departments).sort((a, b) => a.localeCompare(b)),
      sections: e.sections.size,
      classes: e.classes,
      hours: e.hours
    }))
    .sort((a, b) => a.departments[0].localeCompare(b.departments[0]) || b.hours - a.hours || a.name.localeCompare(b.name));

  const byDepartment: DepartmentSummary[] = departments.map((department) => {
    const own = selectedMeetings.filter((m) => m.department === department);
    const online = virtualMeetings.filter((m) => m.department === department);
    const deptRooms = rooms.filter((r) => r.hoursByDepartment[department] || r.assignedTo.includes(department));
    const isOwn = (r: RoomUsage) => r.usedBy.length === 1 && r.sharedWith.length === 0;
    const shared = deptRooms.filter((r) => !isOwn(r));
    const sharedTotals = groupTotals(shared, capacityPerRoom);
    const departmentHours = sum(shared, (r) => r.hoursByDepartment[department] || 0);
    return {
      department,
      courses: new Set([...own, ...online].map((m) => m.code)).size,
      sections: new Set([...own, ...online].map((m) => `${m.code}-${m.section}`)).size,
      weeklyClasses: own.length,
      weeklyHours: sum(own, (m) => m.hours),
      instructors: new Set([...own, ...online].map((m) => m.teacher)).size,
      rooms: deptRooms.length,
      onlineClasses: online.length,
      onlineHours: sum(online, (m) => m.hours),
      ownRooms: groupTotals(deptRooms.filter(isOwn), capacityPerRoom),
      sharedRooms: {
        ...sharedTotals,
        departmentHours,
        departmentShare: pct(departmentHours, sharedTotals.selectedHours + sharedTotals.otherHours)
      }
    };
  });

  const weeklyHours = sum(selectedMeetings, (m) => m.hours);
  const otherDepartmentHours = sum(otherMeetings, (m) => m.hours);
  const capacityHours = capacityPerRoom * rooms.length;

  const partial: Omit<DepartmentReport, 'findings'> = {
    departments,
    label,
    days,
    capacityPerRoom,
    summary: {
      courses: new Set([...selectedMeetings, ...virtualMeetings].map((m) => `${m.department}|${m.code}`)).size,
      sections: new Set([...selectedMeetings, ...virtualMeetings].map((m) => `${m.department}|${m.code}-${m.section}`)).size,
      weeklyClasses: selectedMeetings.length,
      weeklyHours,
      onlineClasses: virtualMeetings.length,
      onlineHours: sum(virtualMeetings, (m) => m.hours),
      instructors: instructors.length,
      rooms: rooms.length,
      capacityHours,
      otherDepartmentHours,
      freeHours: sum(rooms, (r) => r.freeHours),
      selectedUtilization: pct(weeklyHours, capacityHours),
      totalUtilization: pct(weeklyHours + otherDepartmentHours, capacityHours),
      selectedShare: pct(weeklyHours, weeklyHours + otherDepartmentHours)
    },
    selectedOnlyRooms: groupTotals(rooms.filter((r) => r.sharedWith.length === 0), capacityPerRoom),
    sharedRooms: groupTotals(rooms.filter((r) => r.sharedWith.length > 0), capacityPerRoom),
    byDepartment,
    meetings: selectedMeetings,
    virtualMeetings,
    virtualRooms: Array.from(new Set(virtualMeetings.map((m) => m.room))).sort((a, b) => a.localeCompare(b)),
    rooms,
    otherMeetings,
    clashes,
    instructors
  };
  return { ...partial, findings: buildFindings(partial) };
}
