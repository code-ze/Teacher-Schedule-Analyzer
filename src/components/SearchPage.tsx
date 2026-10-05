import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ProcessedData } from '../types';
import type { SearchScope } from '../tabs';
import type { StudentIndex } from '../utils/students/students';
import CourseSearch, { searchSections } from './CourseSearch';
import TeacherSchedules, { searchTeachers } from './TeacherSchedules';
import ClassroomsSection, { searchRooms } from './ClassroomsSection';
import SubNav from './SubNav';

interface Props {
  data: ProcessedData;
  query: string;
  onQuery: (q: string) => void;
  scope: SearchScope;
  onScope: (s: SearchScope) => void;
  sectionSizes?: Map<string, number>;
  studentIndex: StudentIndex | null;
  onOpenStudent: (id: string) => void;
  onOpenStudentsTab: () => void;
  /** Room list props (virtual / assigned rooms). */
  roomProps: Omit<Parameters<typeof ClassroomsSection>[0], 'classrooms' | 'part' | 'query' | 'roomsHeader'>;
  /** Room settings (online rooms, rooms with no classes), shown under Rooms. */
  roomSettings: ReactNode;
}

const ORDER: SearchScope[] = ['classes', 'rooms', 'instructors', 'students'];

// One search box for the whole timetable: classes, rooms, instructors and students.
export default function SearchPage({
  data,
  query,
  onQuery,
  scope,
  onScope,
  sectionSizes,
  studentIndex,
  onOpenStudent,
  onOpenStudentsTab,
  roomProps,
  roomSettings
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const sections = useMemo(() => Object.values(data.courses), [data.courses]);
  const teachers = useMemo(() => Object.values(data.teachers), [data.teachers]);
  const roomNames = useMemo(
    () => Array.from(new Set([...Object.keys(data.classrooms), ...(roomProps.assignedRooms ?? []).map((a) => a.room)])),
    [data.classrooms, roomProps.assignedRooms]
  );
  const profiles = useMemo(() => (studentIndex ? Array.from(studentIndex.profiles.values()) : []), [studentIndex]);
  const lower = q.toLowerCase();
  const studentMatches =
    lower.length >= 2 ? profiles.filter((p) => p.id.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower)) : [];

  const counts: Record<SearchScope, number | undefined> = q
    ? {
        classes: searchSections(sections, q).length,
        rooms: searchRooms(roomNames, q).length,
        instructors: searchTeachers(teachers, q).length,
        students: studentIndex ? studentMatches.length : undefined
      }
    : { classes: undefined, rooms: undefined, instructors: undefined, students: undefined };

  // Jump to the first kind of result when the current one has none (e.g. a student ID typed under Classes).
  useEffect(() => {
    if (!q || (counts[scope] ?? 0) > 0) return;
    const next = ORDER.find((s) => (counts[s] ?? 0) > 0);
    if (next) onScope(next);
  }, [q]);

  return (
    <>
      <section className="panel search-bar">
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          aria-label="Search"
          placeholder="🔍 Course code or name, room, instructor or student ID…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus
        />
        <SubNav
          label="Search in"
          value={scope}
          onChange={onScope}
          items={[
            { id: 'classes', label: 'Classes', icon: '📚', count: counts.classes },
            { id: 'rooms', label: 'Rooms', icon: '🏫', count: counts.rooms },
            { id: 'instructors', label: 'Instructors', icon: '👩‍🏫', count: counts.instructors },
            { id: 'students', label: 'Students', icon: '🎓', count: counts.students }
          ]}
        />
        <p className="search-hint">
          Tip: type several words to narrow it down, e.g. “CIDN1101 HL203”. For rooms, separate several with commas.
        </p>
      </section>

      {scope === 'classes' && (
        <CourseSearch courses={data.courses} departments={data.departments} sectionSizes={sectionSizes} query={query} />
      )}
      {scope === 'instructors' && <TeacherSchedules teachers={data.teachers} query={query} />}
      {scope === 'rooms' && (
        <>
          <details className="settings-details">
            <summary>⚙️ Room settings: online rooms (e.g. BO004) and rooms with no classes (e.g. HL103)</summary>
            {roomSettings}
          </details>
          <ClassroomsSection classrooms={data.classrooms} part="rooms" query={query} {...roomProps} />
        </>
      )}
      {scope === 'students' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Students</h2>
              <p className="panel-sub">Search by student ID or name, then open a student to see their week.</p>
            </div>
          </div>
          {!studentIndex ? (
            <div className="empty-state">
              No student file loaded.{' '}
              <button className="btn-link" onClick={onOpenStudentsTab}>
                Add it in Students
              </button>
            </div>
          ) : lower.length < 2 ? (
            <div className="empty-state">Type at least 2 characters of a student ID or name.</div>
          ) : studentMatches.length === 0 ? (
            <div className="empty-state">No students match “{q}”.</div>
          ) : (
            <div className="student-results">
              {studentMatches.slice(0, 50).map((p) => (
                <button key={p.id} className="student-result" onClick={() => onOpenStudent(p.id)}>
                  <strong>{p.name || p.id}</strong>
                  <span className="muted">
                    {p.id} · {p.department} · {p.enrolments.length} courses
                    {p.clashes.length ? ' · ⚠ clash' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          {studentMatches.length > 50 && <p className="muted">Showing 50 of {studentMatches.length}. Type more to narrow it down.</p>}
        </section>
      )}
    </>
  );
}
