import type { CourseSection } from '../../types';
import { allMeetings, toMinutes, type ReportMeeting } from '../departmentReport';
import type { SpaceReportConfig, Windows } from './config';

// Teaching-space analysis for the space report: where each department teaches
// (labs / classrooms / online), how its labs are shared, and a "compaction"
// scenario: how few rooms would hold the same classes if each section keeps its
// days, length and start-time pattern but may move within the open hours.

const SLOT = 30;

export interface MeetingBrief {
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

export interface PackResult {
  rooms: number;
  perRoom: number[];
  failed: number;
}

export interface ScenarioResult {
  hours: number;
  daytimeHours: number;
  roomsNow: number;
  floor: number;
  busiestDayRooms: number;
  tight: PackResult & { avgUse: number };
  comfortable: PackResult & { avgUse: number };
  perDay: { day: string; hours: number; dayCapacity: number; minRooms: number }[];
  evening: MeetingBrief[];
}

export interface DepartmentSpace {
  department: string;
  rules: { blocked: Windows; dayHours: Record<string, number>; roomHours: number };
  instructors: number;
  courses: number;
  sections: number;
  total: { classes: number; hours: number };
  inPerson: { classes: number; hours: number };
  labs: { classes: number; hours: number; ownHours: number; otherLabHours: Record<string, number>; otherLabRooms: string[] };
  classroom: { classes: number; hours: number; rooms: number };
  online: { classes: number; hours: number; meetings: MeetingBrief[] };
  labList: string[];
  labsInFile: string[];
  labRooms: { room: string; labOf: string[]; byDept: Record<string, number>; total: number; usePct: number; classes: number }[];
  classrooms: { room: string; deptHours: number; byDept: Record<string, number>; total: number; usePct: number }[];
  displaced: MeetingBrief[];
  scenario: { classrooms: ScenarioResult; labsDept: ScenarioResult; labsShared: ScenarioResult };
}

export interface SpaceAnalysis {
  config: SpaceReportConfig;
  noBlock: boolean;
  result: DepartmentSpace[];
}

const sum = (ms: ReportMeeting[]) => ms.reduce((s, m) => s + m.hours, 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const byDept = (ms: ReportMeeting[]) => {
  const out: Record<string, number> = {};
  ms.forEach((m) => (out[m.department] = (out[m.department] || 0) + m.hours));
  return out;
};
const brief = (m: ReportMeeting): MeetingBrief => ({
  department: m.department,
  code: m.code,
  name: m.courseName.replace(m.code, '').trim(),
  section: m.section,
  day: m.day,
  time: `${m.startTime}-${m.endTime}`,
  hours: m.hours,
  room: m.room,
  teacher: m.teacher
});

interface Block {
  days: string[];
  len: number;
  teacher: string;
  hours: number;
}

function makePacker(all: ReportMeeting[], config: SpaceReportConfig, blocked: Windows, iterations: number) {
  const { open, close } = config;
  const SL = (close - open) / SLOT;

  function setup(ms: ReportMeeting[], seed: number) {
    let rnd = seed || 1;
    const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const moving = new Set(ms);
    // Every other class keeps its time and blocks its instructor.
    const tBusy: Record<string, Record<string, boolean[]>> = {};
    const tb = (t: string, day: string) => ((tBusy[t] ||= {})[day] ||= Array(SL).fill(false));
    all.forEach((m) => {
      if (moving.has(m)) return;
      const a = Math.floor((toMinutes(m.startTime) - open) / SLOT);
      const b = Math.ceil((toMinutes(m.endTime) - open) / SLOT);
      for (let k = Math.max(0, a); k < Math.min(SL, b); k++) tb(m.teacher, m.day)[k] = true;
    });
    const groups: Record<string, ReportMeeting[]> = {};
    ms.forEach((m) => (groups[`${m.department}|${m.code}-${m.section}|${m.teacher}|${m.startTime}-${m.endTime}`] ||= []).push(m));
    const blocks: Block[] = Object.values(groups)
      .map((g) => ({
        days: Array.from(new Set(g.map((m) => m.day))),
        len: Math.ceil((toMinutes(g[0].endTime) - toMinutes(g[0].startTime)) / SLOT),
        teacher: g[0].teacher,
        hours: sum(g)
      }))
      .sort((a, b) => b.len * b.days.length - a.len * a.days.length + (seed ? (rand() - 0.5) * 5 : 0));
    const freshDay = (day: string) => {
      const g = Array(SL).fill(false);
      const bl = blocked[day];
      if (bl) for (let k = (bl[0] - open) / SLOT; k < (bl[1] - open) / SLOT; k++) g[k] = true;
      return g;
    };
    type Room = { grid: Record<string, boolean[]>; hours: number; id: number };
    const tryPlace = (room: Room, b: Block, shuffle: boolean) => {
      const starts = Array.from({ length: SL - b.len + 1 }, (_, i) => i);
      if (shuffle) starts.sort(() => rand() - 0.5);
      for (const s of starts) {
        const ok = b.days.every((day) => {
          const g = (room.grid[day] ||= freshDay(day));
          const t = tb(b.teacher, day);
          for (let k = s; k < s + b.len; k++) if (g[k] || t[k]) return false;
          return true;
        });
        if (ok) {
          b.days.forEach((day) => {
            for (let k = s; k < s + b.len; k++) {
              room.grid[day][k] = true;
              tb(b.teacher, day)[k] = true;
            }
          });
          room.hours += b.hours;
          return true;
        }
      }
      return false;
    };
    return { blocks, rand, tryPlace };
  }

  // First fit: open a new room only when no existing room can take the class.
  function firstFit(ms: ReportMeeting[], cap: number, seed: number): PackResult {
    const { blocks, tryPlace } = setup(ms, seed);
    const rooms: { grid: Record<string, boolean[]>; hours: number; id: number }[] = [];
    let failed = 0;
    for (const b of blocks) {
      let placed = false;
      for (const room of rooms) {
        if (room.hours + b.hours > cap + 1e-9) continue;
        if (tryPlace(room, b, seed > 0)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        const room = { grid: {}, hours: 0, id: rooms.length };
        if (b.hours <= cap + 1e-9 && tryPlace(room, b, seed > 0)) {
          rooms.push(room);
          placed = true;
        }
      }
      if (!placed) failed++;
    }
    return { rooms: rooms.length, perRoom: rooms.map((r) => r.hours), failed };
  }

  // Balanced: exactly k rooms, each class to the least-loaded room that can take it.
  function balanced(ms: ReportMeeting[], k: number, cap: number, seed: number): PackResult | null {
    const { blocks, rand, tryPlace } = setup(ms, seed);
    const rooms = Array.from({ length: k }, () => ({ grid: {} as Record<string, boolean[]>, hours: 0, id: rand() }));
    for (const b of blocks) {
      const order = [...rooms].sort((a, c) => a.hours - c.hours || a.id - c.id);
      let placed = false;
      for (const room of order) {
        if (room.hours + b.hours > cap + 1e-9) continue;
        if (tryPlace(room, b, rand() < 0.5)) {
          placed = true;
          break;
        }
      }
      if (!placed) return null;
    }
    const used = rooms.filter((r) => r.hours > 0);
    return { rooms: used.length, perRoom: used.map((r) => r.hours).sort((a, c) => c - a), failed: 0 };
  }

  function best(ms: ReportMeeting[], cap: number): PackResult {
    if (ms.length === 0) return { rooms: 0, perRoom: [], failed: 0 };
    let b = firstFit(ms, cap, 0);
    for (let k = 1; k <= iterations; k++) {
      const r = firstFit(ms, cap, k * 7919);
      if (r.failed === 0 && (b.failed > 0 || r.rooms < b.rooms)) b = r;
    }
    const lower = Math.max(1, Math.ceil(sum(ms) / cap - 1e-9));
    for (let k = lower; k < b.rooms; k++) {
      let found: PackResult | null = null;
      for (let t = 0; t < iterations && !found; t++) found = balanced(ms, k, cap, t * 104729 + 13);
      if (found) return found;
    }
    return b;
  }

  return { best };
}

export function analyzeSpace(
  courses: Record<string, CourseSection>,
  config: SpaceReportConfig,
  opts: { iterations?: number; noBlock?: boolean; onProgress?: (department: string) => void } = {}
): SpaceAnalysis {
  const iterations = opts.iterations ?? 120;
  const all = allMeetings(courses);
  const { open, close, days } = config;
  const online = new Set(config.onlineRooms);
  const allLabs = new Set(Object.values(config.labs).flat());
  const inDaytime = (m: ReportMeeting) => toMinutes(m.startTime) >= open && toMinutes(m.endTime) <= close;

  const result = config.departments.map((dept): DepartmentSpace => {
    opts.onProgress?.(dept);
    const blocked: Windows = opts.noBlock ? {} : config.blocked[dept] ?? {};
    const dayHours = Object.fromEntries(
      days.map((d) => [d, (close - open) / 60 - (blocked[d] ? (blocked[d][1] - blocked[d][0]) / 60 : 0)])
    );
    const roomHours = days.reduce((s, d) => s + dayHours[d], 0);
    const { best } = makePacker(all, config, blocked, iterations);

    const scenario = (ms: ReportMeeting[], roomsNow: number): ScenarioResult => {
      const day = ms.filter(inDaytime);
      const perDay = days.map((d) => {
        const h = sum(day.filter((m) => m.day === d));
        return { day: d, hours: h, dayCapacity: dayHours[d], minRooms: dayHours[d] > 0 ? Math.ceil(h / dayHours[d] - 1e-9) : 0 };
      });
      const tight = best(day, roomHours);
      const comfortable = best(day, roomHours * config.comfort);
      return {
        hours: sum(ms),
        daytimeHours: sum(day),
        roomsNow,
        floor: Math.ceil(sum(day) / roomHours - 1e-9),
        busiestDayRooms: Math.max(0, ...perDay.map((p) => p.minRooms)),
        tight: { ...tight, avgUse: pct(sum(day), tight.rooms * roomHours) },
        comfortable: { ...comfortable, avgUse: pct(sum(day), comfortable.rooms * roomHours) },
        perDay,
        evening: ms.filter((m) => !inDaytime(m)).map(brief)
      };
    };

    const labList = config.labs[dept] ?? [];
    const mine = all.filter((m) => m.department === dept);
    const onlineMs = mine.filter((m) => online.has(m.room));
    const inPerson = mine.filter((m) => !online.has(m.room));
    const labMeetings = inPerson.filter((m) => allLabs.has(m.room));
    const ownLab = labMeetings.filter((m) => labList.includes(m.room));
    const otherLab = labMeetings.filter((m) => !labList.includes(m.room));
    const classroomMeetings = inPerson.filter((m) => !allLabs.has(m.room));
    const labsInFile = labList.filter((r) => all.some((m) => m.room === r));
    const classroomNames = Array.from(new Set(classroomMeetings.map((m) => m.room)));

    return {
      department: dept,
      rules: { blocked, dayHours, roomHours },
      instructors: new Set(mine.map((m) => m.teacher)).size,
      courses: new Set(mine.map((m) => m.code)).size,
      sections: new Set(mine.map((m) => `${m.code}-${m.section}`)).size,
      total: { classes: mine.length, hours: sum(mine) },
      inPerson: { classes: inPerson.length, hours: sum(inPerson) },
      labs: {
        classes: labMeetings.length,
        hours: sum(labMeetings),
        ownHours: sum(ownLab),
        otherLabHours: byDept(otherLab),
        otherLabRooms: Array.from(new Set(otherLab.map((m) => m.room)))
      },
      classroom: { classes: classroomMeetings.length, hours: sum(classroomMeetings), rooms: classroomNames.length },
      online: { classes: onlineMs.length, hours: sum(onlineMs), meetings: onlineMs.map(brief) },
      labList,
      labsInFile,
      labRooms: labList.map((room) => {
        const ms = all.filter((m) => m.room === room);
        return {
          room,
          labOf: config.departments.filter((d) => (config.labs[d] ?? []).includes(room)),
          byDept: byDept(ms),
          total: sum(ms),
          usePct: pct(sum(ms), config.standardWeek),
          classes: ms.length
        };
      }),
      classrooms: classroomNames
        .map((room) => {
          const ms = all.filter((m) => m.room === room);
          const d = byDept(ms);
          return { room, deptHours: d[dept] || 0, byDept: d, total: sum(ms), usePct: pct(sum(ms), config.standardWeek) };
        })
        .sort((a, b) => b.deptHours - a.deptHours || a.room.localeCompare(b.room)),
      displaced: inPerson
        .filter((m) => {
          const bl = blocked[m.day];
          return !!bl && toMinutes(m.startTime) < bl[1] && toMinutes(m.endTime) > bl[0];
        })
        .map(brief),
      scenario: {
        classrooms: scenario(classroomMeetings, classroomNames.length),
        labsDept: scenario(labMeetings, labsInFile.length),
        labsShared: scenario(
          all.filter((m) => labList.includes(m.room)),
          labsInFile.length
        )
      }
    };
  });

  return { config, noBlock: !!opts.noBlock, result };
}
