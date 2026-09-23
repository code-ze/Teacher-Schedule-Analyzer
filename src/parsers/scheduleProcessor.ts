import { WORK_DAYS, DISPLAY_HOURS, extractClassId } from '../config';
import type { RawRow, Teacher, Classroom, CourseSection, ProcessedData } from '../types';

const SLOT_PATTERN = /(\d{2}:\d{2})-(\d{2}:\d{2})\s*-\s*([^\\]+)\\(.+)/;

function normalizeRow(rawRow: RawRow): RawRow | null {
  if (!rawRow) return null;
  const normalized: RawRow = {};
  Object.keys(rawRow).forEach((k) => {
    const key = (k || '').trim();
    const val = rawRow[k];
    normalized[key] = typeof val === 'string' ? val.trim() : val;
  });
  if (normalized['Course Name'] && normalized['Section No']) {
    return normalized;
  }
  return null;
}

export function normalizeRows(rawRows: RawRow[]): RawRow[] {
  const out: RawRow[] = [];
  rawRows.forEach((r) => {
    const n = normalizeRow(r);
    if (n) out.push(n);
  });
  return out;
}

export function processScheduleData(data: RawRow[]): ProcessedData {
  const teachers: Record<string, Teacher> = {};
  const classrooms: Record<string, Classroom> = {};
  const courses: Record<string, CourseSection> = {};
  const departmentSet = new Set<string>();
  let totalClasses = 0;

  for (const row of data) {
    if (!row) continue;

    const courseName = row['Course Name'];
    const section = row['Section No'];
    const departmentName = (row['Department Name'] || '').trim() || null;
    if (!courseName || !section) continue;
    if (departmentName) departmentSet.add(departmentName);

    const courseCode = extractClassId(courseName);

    for (const dayName of WORK_DAYS) {
      const dayData = row[dayName];
      if (!dayData || dayData === '-' || (typeof dayData === 'string' && dayData.trim() === '')) {
        continue;
      }

      const match = String(dayData).match(SLOT_PATTERN);
      if (!match) continue;

      const [, startTime, endTime, room, teacher] = match;
      const cleanTeacher = String(teacher).trim();
      const cleanRoom = String(room).trim();

      if (!teachers[cleanTeacher]) {
        teachers[cleanTeacher] = {
          name: cleanTeacher,
          department: departmentName,
          schedule: {},
          totalClasses: 0
        };
        WORK_DAYS.forEach((day) => {
          teachers[cleanTeacher].schedule[day] = {};
        });
      }

      if (!classrooms[cleanRoom]) {
        classrooms[cleanRoom] = {
          name: cleanRoom,
          schedule: {},
          totalHours: 0,
          totalClasses: 0,
          departments: new Set<string>()
        };
        WORK_DAYS.forEach((day) => {
          classrooms[cleanRoom].schedule[day] = {};
          DISPLAY_HOURS.forEach((hourKey) => {
            classrooms[cleanRoom].schedule[day][hourKey] = {
              isOccupied: false,
              course: null,
              teacher: null
            };
          });
        });
      }

      const sectionKey = `${courseCode}-${section}`;
      if (!courses[sectionKey]) {
        courses[sectionKey] = {
          key: sectionKey,
          code: courseCode,
          name: courseName,
          section,
          department: departmentName,
          teacher: cleanTeacher,
          schedule: {}
        };
        WORK_DAYS.forEach((day) => {
          courses[sectionKey].schedule[day] = [];
        });
      }

      courses[sectionKey].schedule[dayName].push({
        day: dayName,
        startTime,
        endTime,
        room: cleanRoom,
        teacher: cleanTeacher
      });

      const startHour = parseInt(startTime.split(':')[0], 10);
      const endHour = parseInt(endTime.split(':')[0], 10);
      const classDuration = Math.max(0, endHour - startHour);

      for (let hour = startHour; hour < endHour; hour++) {
        const hourKey = hour.toString().padStart(2, '0') + ':00';
        if (teachers[cleanTeacher].schedule[dayName]) {
          teachers[cleanTeacher].schedule[dayName][hourKey] = {
            isBusy: true,
            course: courseName,
            room: cleanRoom,
            classId: extractClassId(courseName),
            section,
            timeRange: `${startTime}-${endTime}`
          };
        }
        if (classrooms[cleanRoom].schedule[dayName][hourKey]) {
          classrooms[cleanRoom].schedule[dayName][hourKey] = {
            isOccupied: true,
            course: courseName,
            teacher: cleanTeacher,
            classId: extractClassId(courseName),
            section,
            department: departmentName,
            timeRange: `${startTime}-${endTime}`
          };
        }
      }

      teachers[cleanTeacher].totalClasses++;
      classrooms[cleanRoom].totalHours += classDuration;
      classrooms[cleanRoom].totalClasses++;
      if (departmentName) {
        classrooms[cleanRoom].departments.add(departmentName);
      }
      totalClasses++;
    }
  }

  return {
    teachers,
    classrooms,
    courses,
    totalClasses,
    departments: Array.from(departmentSet).sort((a, b) => a.localeCompare(b))
  };
}
