import * as XLSX from 'xlsx';
import { WORK_DAYS } from '../../config';
import type { CourseSection, SectionMeeting } from '../../types';
import { toMinutes } from '../departmentReport';

// Student registration data ("Student Courses" workbook: one row per student per
// course) joined with the timetable: each student's weekly schedule, clashes,
// section sizes and how many students are in class at each hour.
// The data contains personal information; it is only ever processed in the browser.

export interface Enrolment {
  studentId: string;
  courseNo: string;
  courseName: string;
  section: string;
  creditHours: number;
  inClassList: string;
}

export interface Student {
  id: string;
  name: string;
  level: string;
  department: string;
  status: string;
}

export interface StudentData {
  students: Student[];
  enrolments: Enrolment[];
  /** Students on the active roster with no registered course. */
  noCourses: Omit<Student, 'name'>[];
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, string>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false }).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [clean(k), clean(v)]))
  );
}

function enrolmentSheet(wb: XLSX.WorkBook): string | null {
  return (
    wb.SheetNames.find((n) => /student\s*courses/i.test(n)) ??
    wb.SheetNames.find((n) => {
      const header = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1 })[0] ?? []).map(clean);
      return header.includes('Student ID') && header.includes('Course No');
    }) ??
    null
  );
}

/** True when the workbook is a student registration export (not a timetable). */
export function isStudentWorkbook(data: ArrayBuffer | Uint8Array): boolean {
  try {
    return enrolmentSheet(XLSX.read(data, { type: 'array', sheetRows: 2 })) !== null;
  } catch {
    return false;
  }
}

export function readStudentWorkbook(data: ArrayBuffer | Uint8Array): StudentData {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = enrolmentSheet(wb);
  if (!sheet) throw new Error('No "Student Courses" sheet (with Student ID and Course No columns) was found.');
  const students = new Map<string, Student>();
  const enrolments: Enrolment[] = [];
  sheetRows(wb, sheet).forEach((r) => {
    const id = r['Student ID'];
    if (!id || !r['Course No']) return;
    if (!students.has(id)) {
      students.set(id, { id, name: r['Student Name'], level: r['Level'], department: r['Department'], status: r['Status'] });
    }
    enrolments.push({
      studentId: id,
      courseNo: r['Course No'].toUpperCase(),
      courseName: r['Course Name'],
      section: r['Section'],
      creditHours: Number(r['Credit Hours']) || 0,
      inClassList: r['In CIMS class list']
    });
  });
  const noCourseSheet = wb.SheetNames.find((n) => /no\s*courses/i.test(n));
  const noCourses = noCourseSheet
    ? sheetRows(wb, noCourseSheet)
        .filter((r) => r['Student ID'])
        .map((r) => ({ id: r['Student ID'], level: r['Level'], department: r['Department'], status: r['Status'] }))
    : [];
  return { students: Array.from(students.values()), enrolments, noCourses };
}

// ---------------- Joining with the timetable ----------------

export interface StudentMeeting extends SectionMeeting {
  sectionKey: string;
  code: string;
  courseName: string;
  section: string;
}

export interface StudentClash {
  studentId: string;
  day: string;
  first: StudentMeeting;
  second: StudentMeeting;
}

export interface StudentProfile extends Student {
  enrolments: Enrolment[];
  meetings: StudentMeeting[];
  /** Registered courses with no class in the timetable (e.g. 0-credit tests). */
  notScheduled: Enrolment[];
  creditHours: number;
  weeklyHours: number;
  daysOnCampus: number;
  clashes: StudentClash[];
}

export interface StudentIndex {
  profiles: Map<string, StudentProfile>;
  /** Students registered in each timetable section ("CODE-section"). */
  sectionSizes: Map<string, number>;
  clashes: StudentClash[];
  /** Timetable sections no student is registered in. */
  emptySections: CourseSection[];
  /** Registrations whose course/section is not in the timetable, grouped by course. */
  unmatched: { courseNo: string; courseName: string; count: number }[];
  /** Students in class per day and hour ("HH:00"), overall and by department. */
  heat: Record<string, Record<string, number>>;
  heatByDept: Record<string, Record<string, Record<string, number>>>;
}

const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`); // 07:00-20:00

export const HEAT_HOURS = HOURS;

export function buildStudentIndex(data: StudentData, courses: Record<string, CourseSection>): StudentIndex {
  const byStudent = new Map<string, Enrolment[]>();
  data.enrolments.forEach((e) => {
    const list = byStudent.get(e.studentId);
    if (list) list.push(e);
    else byStudent.set(e.studentId, [e]);
  });

  const sectionSizes = new Map<string, number>();
  const unmatchedMap = new Map<string, { courseNo: string; courseName: string; count: number }>();
  const heat: StudentIndex['heat'] = {};
  const heatByDept: StudentIndex['heatByDept'] = {};
  WORK_DAYS.forEach((d) => (heat[d] = Object.fromEntries(HOURS.map((h) => [h, 0]))));

  const profiles = new Map<string, StudentProfile>();
  const allClashes: StudentClash[] = [];

  data.students.forEach((s) => {
    const enrolments = byStudent.get(s.id) ?? [];
    const meetings: StudentMeeting[] = [];
    const notScheduled: Enrolment[] = [];
    enrolments.forEach((e) => {
      const key = `${e.courseNo}-${e.section}`;
      const course = courses[key];
      if (!course) {
        notScheduled.push(e);
        const u = unmatchedMap.get(e.courseNo) ?? { courseNo: e.courseNo, courseName: e.courseName, count: 0 };
        u.count++;
        unmatchedMap.set(e.courseNo, u);
        return;
      }
      sectionSizes.set(key, (sectionSizes.get(key) ?? 0) + 1);
      WORK_DAYS.forEach((d) =>
        (course.schedule[d] ?? []).forEach((m) =>
          meetings.push({ ...m, sectionKey: key, code: course.code, courseName: course.name, section: course.section })
        )
      );
    });
    meetings.sort(
      (a, b) => WORK_DAYS.indexOf(a.day as never) - WORK_DAYS.indexOf(b.day as never) || a.startTime.localeCompare(b.startTime)
    );

    // Clashes: two different sections meeting at overlapping times on the same day.
    const clashes: StudentClash[] = [];
    for (let i = 0; i < meetings.length; i++) {
      for (let j = i + 1; j < meetings.length; j++) {
        const a = meetings[i];
        const b = meetings[j];
        if (a.day !== b.day) break;
        if (toMinutes(b.startTime) >= toMinutes(a.endTime)) break;
        if (a.sectionKey !== b.sectionKey) clashes.push({ studentId: s.id, day: a.day, first: a, second: b });
      }
    }
    allClashes.push(...clashes);

    // Hours in class (counted once even if two classes overlap) for the heat map.
    const deptHeat = (heatByDept[s.department] ||= Object.fromEntries(
      WORK_DAYS.map((d) => [d, Object.fromEntries(HOURS.map((h) => [h, 0]))])
    ));
    const busy = new Set<string>();
    meetings.forEach((m) => {
      HOURS.forEach((h) => {
        const start = toMinutes(h);
        if (toMinutes(m.startTime) < start + 60 && toMinutes(m.endTime) > start) busy.add(`${m.day}|${h}`);
      });
    });
    busy.forEach((k) => {
      const [d, h] = k.split('|');
      if (heat[d]) heat[d][h]++;
      if (deptHeat[d]) deptHeat[d][h]++;
    });

    profiles.set(s.id, {
      ...s,
      enrolments,
      meetings,
      notScheduled,
      creditHours: enrolments.reduce((t, e) => t + e.creditHours, 0),
      weeklyHours: meetings.reduce((t, m) => t + (toMinutes(m.endTime) - toMinutes(m.startTime)) / 60, 0),
      daysOnCampus: new Set(meetings.map((m) => m.day)).size,
      clashes
    });
  });

  return {
    profiles,
    sectionSizes,
    clashes: allClashes,
    emptySections: Object.values(courses).filter((c) => !sectionSizes.has(c.key)),
    unmatched: Array.from(unmatchedMap.values()).sort((a, b) => b.count - a.count),
    heat,
    heatByDept
  };
}
