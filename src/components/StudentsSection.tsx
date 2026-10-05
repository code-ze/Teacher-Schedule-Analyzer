import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import SubNav from './SubNav';
import * as XLSX from 'xlsx';
import { WORK_DAYS } from '../config';
import type { CourseSection } from '../types';
import { toMinutes } from '../utils/departmentReport';
import { buildStudentIndex, HEAT_HOURS, type StudentData, type StudentProfile } from '../utils/students/students';

interface Props {
  students: StudentData | null;
  fileName: string;
  courses: Record<string, CourseSection>;
  onFiles: (files: FileList) => void;
  onClear: () => void;
  /** Open this student's timetable (e.g. picked in Search). */
  focus?: { id: string; at: number } | null;
}

type View = 'overview' | 'status' | 'find' | 'clashes' | 'sizes' | 'campus';

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fmt = (n: number) => n.toLocaleString();
const today = () => new Date().toISOString().split('T')[0];

function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  items.forEach((t) => {
    const k = key(t) || '—';
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  });
  return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
}

function sectionRow(c: CourseSection) {
  const ms = WORK_DAYS.flatMap((d) => c.schedule[d] ?? []);
  return {
    days: ms.map((m) => `${m.day.slice(0, 3)} ${m.startTime}-${m.endTime}`).join(', '),
    rooms: Array.from(new Set(ms.map((m) => m.room))).join(', '),
    teacher: c.teacher
  };
}

function StudentProfileView({ p }: { p: StudentProfile }) {
  const days = WORK_DAYS.filter((d) => p.meetings.some((m) => m.day === d));
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const hours = Array.from(
    new Set(
      p.meetings.flatMap((m) => {
        const out: string[] = [];
        for (let h = Math.floor(toMinutes(m.startTime) / 60); h * 60 < toMinutes(m.endTime); h++) out.push(hh(h));
        return out;
      })
    )
  ).sort();
  const sections = Array.from(new Set(p.meetings.map((m) => m.sectionKey)));
  return (
    <div className="subpanel">
      <div className="subpanel-header">
        <div>
          <strong>{p.name || p.id}</strong> <span className="muted">· {p.id}</span>
          <div className="muted">
            {p.department} · {p.level} · {p.status}
          </div>
        </div>
        <div className="student-facts">
          <span className="tag">{p.enrolments.length} courses</span>
          <span className="tag">{p.creditHours} credit hours</span>
          <span className="tag">{p.weeklyHours}h a week</span>
          <span className="tag">{p.daysOnCampus} days on campus</span>
          {p.clashes.length > 0 && <span className="tag tag-warn">{p.clashes.length} clash{p.clashes.length > 1 ? 'es' : ''}</span>}
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Course name</th>
              <th>Sec</th>
              <th>Credits</th>
              <th>Days &amp; times</th>
              <th>Room</th>
              <th>Instructor</th>
            </tr>
          </thead>
          <tbody>
            {p.enrolments.map((e) => {
              const ms = p.meetings.filter((m) => m.sectionKey === `${e.courseNo}-${e.section}`);
              return (
                <tr key={`${e.courseNo}-${e.section}`}>
                  <td className="strong">{e.courseNo}</td>
                  <td>{e.courseName}</td>
                  <td>{e.section}</td>
                  <td>{e.creditHours}</td>
                  <td>
                    {ms.length
                      ? ms.map((m) => `${m.day.slice(0, 3)} ${m.startTime}-${m.endTime}`).join(', ')
                      : e.inClassList.startsWith('No – test')
                        ? 'Test, no class'
                        : 'Not in the timetable'}
                  </td>
                  <td>{Array.from(new Set(ms.map((m) => m.room))).join(', ') || '–'}</td>
                  <td>{Array.from(new Set(ms.map((m) => m.teacher))).join(', ') || '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {days.length > 0 && (
        <div className="week-grid-scroll" style={{ marginTop: 12 }}>
          <table className="week-grid">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d}>{d.slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h}>
                  <th>{h}</th>
                  {days.map((d) => {
                    const start = toMinutes(h);
                    const here = p.meetings.filter(
                      (m) => m.day === d && toMinutes(m.startTime) < start + 60 && toMinutes(m.endTime) > start
                    );
                    if (here.length === 0) return <td key={d} className="free-slot" />;
                    return (
                      <td key={d} className={here.length > 1 ? 'clash-slot' : 'busy-slot'} title={here.map((m) => m.courseName).join(' / ')}>
                        {here.map((m) => (
                          <span key={m.sectionKey}>
                            <strong>{m.code}</strong> {m.room}
                          </span>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {sections.length > 0 && p.clashes.length > 0 && (
            <p className="department-report-note" style={{ marginTop: 6 }}>
              Red cells: two classes at the same time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudentsSection({ students, fileName, courses, onFiles, onClear, focus }: Props) {
  const [view, setView] = useState<View>('overview');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sizeDept, setSizeDept] = useState('ALL');
  const [sizeQuery, setSizeQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState<'ALL' | 'SMALL' | 'EMPTY'>('ALL');
  const [sizeLimit, setSizeLimit] = useState(100);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [heatDept, setHeatDept] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [statusDept, setStatusDept] = useState('ALL');
  const [statusQuery, setStatusQuery] = useState('');

  const index = useMemo(() => (students ? buildStudentIndex(students, courses) : null), [students, courses]);
  // Students in each section, for the class-size details.
  const sectionStudents = useMemo(() => {
    const m = new Map<string, StudentProfile[]>();
    index?.profiles.forEach((p) =>
      new Set(p.meetings.map((x) => x.sectionKey)).forEach((k) => {
        const list = m.get(k);
        if (list) list.push(p);
        else m.set(k, [p]);
      })
    );
    m.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return m;
  }, [index]);
  useEffect(() => {
    if (!focus) return;
    setView('find');
    setQuery(focus.id);
    setSelected(focus.id);
  }, [focus]);

  if (!students || !index) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Students</h2>
            <p className="panel-sub">
              Load the student registration Excel (the “Student Courses” export: one row per student per course) to see
              each student's timetable, clashes, class sizes and when students are on campus.
            </p>
          </div>
        </div>
        <div
          className={`mini-drop${dragOver ? ' dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
          }}
        >
          📥 Drop the student Excel here, or click to choose it
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="file-input"
            onChange={(e) => {
              if (e.target.files?.length) onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <p className="upload-privacy" style={{ textAlign: 'left' }}>
          Student data stays in this browser: it is not uploaded or saved anywhere.
        </p>
      </section>
    );
  }

  const profiles = Array.from(index.profiles.values());
  const enrolled = profiles.filter((p) => p.enrolments.length > 0);
  const clashStudents = new Set(index.clashes.map((c) => c.studentId));
  const departments = countBy(profiles, (p) => p.department);

  const q = query.trim().toLowerCase();
  const matches = q.length >= 2 ? profiles.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 25) : [];
  const chosen = selected ? index.profiles.get(selected) ?? null : null;

  const sizeRows = Object.values(courses)
    .filter((c) => sizeDept === 'ALL' || c.department === sizeDept)
    .map((c) => ({ c, size: index.sectionSizes.get(c.key) ?? 0 }));
  const sizeTerms = sizeQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sizeShown = sizeRows
    .filter(({ size }) => (sizeFilter === 'SMALL' ? size > 0 && size <= 5 : sizeFilter === 'EMPTY' ? size === 0 : true))
    .filter(({ c }) => {
      if (!sizeTerms.length) return true;
      const r = sectionRow(c);
      const text = `${c.key} ${c.name} ${r.rooms} ${r.teacher}`.toLowerCase();
      return sizeTerms.every((t) => text.includes(t));
    })
    .sort((a, b) => b.size - a.size || a.c.key.localeCompare(b.c.key));
  const small = sizeRows.filter((r) => r.size > 0 && r.size <= 5).sort((a, b) => a.size - b.size);
  const empty = sizeRows.filter((r) => r.size === 0);
  const timetableDepts = Array.from(new Set(Object.values(courses).map((c) => c.department).filter(Boolean) as string[])).sort();

  const heat = heatDept === 'ALL' ? index.heat : index.heatByDept[heatDept] ?? index.heat;
  const heatMax = Math.max(1, ...WORK_DAYS.flatMap((d) => HEAT_HOURS.map((h) => heat[d]?.[h] ?? 0)));
  const heatDays = WORK_DAYS.filter((d) => HEAT_HOURS.some((h) => (index.heat[d]?.[h] ?? 0) > 0));

  // Students who are not simply "Studying with courses": OJT, suspended, postponed, ...
  // (from the "No Courses" sheet) plus registered students whose status isn't "Studying".
  const statusRows = [
    ...students.noCourses.map((n) => ({
      id: n.id,
      name: index.profiles.get(n.id)?.name ?? '',
      department: n.department,
      level: n.level,
      status: n.status || '—',
      courses: index.profiles.get(n.id)?.enrolments.length ?? 0,
      note: n.status === 'Studying' ? 'Studying but no courses' : 'No courses this semester'
    })),
    ...profiles
      .filter((p) => p.status !== 'Studying' && !students.noCourses.some((n) => n.id === p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        department: p.department,
        level: p.level,
        status: p.status || '—',
        courses: p.enrolments.length,
        note: 'Registered in courses but not "Studying"'
      }))
  ].sort((a, b) => a.status.localeCompare(b.status) || a.department.localeCompare(b.department) || a.id.localeCompare(b.id));
  const statusNames = Array.from(new Set(statusRows.map((r) => r.status))).sort();
  const statusDepts = Array.from(new Set(statusRows.map((r) => r.department))).sort();
  const sq = statusQuery.trim().toLowerCase();
  const statusShown = statusRows.filter(
    (r) =>
      (statusFilter === 'ALL' || r.status === statusFilter) &&
      (statusDept === 'ALL' || r.department === statusDept) &&
      (!sq || r.id.toLowerCase().includes(sq) || r.name.toLowerCase().includes(sq))
  );
  const exportStatus = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Student ID', 'Name', 'Department', 'Level', 'Status', 'Registered courses', 'Note'],
      ...statusShown.map((r) => [r.id, r.name || '(not in file)', r.department, r.level, r.status, r.courses, r.note])
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 26 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Student status');
    XLSX.writeFile(wb, `student-status-${today()}.xlsx`);
  };

  const exportSizes = () => {
    const wb = XLSX.utils.book_new();
    const rows = Object.values(courses)
      .map((c) => ({ c, size: index.sectionSizes.get(c.key) ?? 0, ...sectionRow(c) }))
      .sort((a, b) => (a.c.department || '').localeCompare(b.c.department || '') || a.c.key.localeCompare(b.c.key));
    const ws = XLSX.utils.aoa_to_sheet([
      ['Department', 'Course', 'Course name', 'Section', 'Students', 'Days & times', 'Rooms', 'Instructor'],
      ...rows.map((r) => [r.c.department || '', r.c.code, r.c.name, r.c.section, r.size, r.days, r.rooms, r.teacher])
    ]);
    ws['!cols'] = [{ wch: 26 }, { wch: 11 }, { wch: 44 }, { wch: 8 }, { wch: 9 }, { wch: 40 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Class sizes');
    const clashes = XLSX.utils.aoa_to_sheet([
      ['Student ID', 'Department', 'Day', 'Class 1', 'Time 1', 'Room 1', 'Class 2', 'Time 2', 'Room 2'],
      ...index.clashes.map((c) => [
        c.studentId,
        index.profiles.get(c.studentId)?.department ?? '',
        c.day,
        c.first.sectionKey,
        `${c.first.startTime}-${c.first.endTime}`,
        c.first.room,
        c.second.sectionKey,
        `${c.second.startTime}-${c.second.endTime}`,
        c.second.room
      ])
    ]);
    XLSX.utils.book_append_sheet(wb, clashes, 'Student clashes');
    XLSX.writeFile(wb, `class-sizes-and-clashes-${today()}.xlsx`);
  };

  return (
    <>
      <SubNav
        label="Student views"
        value={view}
        onChange={setView}
        items={[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'status', label: 'Status (OJT, suspended…)', icon: '🏷️', count: statusRows.length },
          { id: 'find', label: 'Find a student', icon: '🔎' },
          { id: 'clashes', label: 'Clashes', icon: '⚠️', count: index.clashes.length },
          { id: 'sizes', label: 'Class sizes', icon: '👥' },
          { id: 'campus', label: 'On campus', icon: '🗓️' }
        ]}
      />
      {view === 'overview' && (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Students</h2>
            <p className="panel-sub">
              From <strong>{fileName}</strong>, joined with the timetable by course and section. Student data stays in
              this browser.
            </p>
          </div>
          <div className="panel-actions">
            <button className="export-excel-btn" onClick={exportSizes}>
              📊 Class sizes &amp; clashes (Excel)
            </button>
            <button className="btn-link" onClick={onClear}>
              Remove student data
            </button>
          </div>
        </div>

        <div className="stats">
          {[
            ['Students', fmt(profiles.length)],
            ['Course registrations', fmt(students.enrolments.length)],
            ['Typical hours a week', `${median(enrolled.map((p) => p.weeklyHours))}h`],
            ['On campus 5 days', `${Math.round((enrolled.filter((p) => p.daysOnCampus === 5).length / Math.max(1, enrolled.length)) * 100)}%`],
            ['Students with a clash', fmt(clashStudents.size)],
            ['Active, no courses', fmt(students.noCourses.length)]
          ].map(([label, value]) => (
            <div className="stat-item" key={label}>
              <div className="stat-number">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Students</th>
                <th>Typical courses</th>
                <th>Typical hours / week</th>
                <th>On campus 5 days</th>
                <th>With a clash</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(([dept, list]) => (
                <tr key={dept}>
                  <td className="strong">{dept}</td>
                  <td>{fmt(list.length)}</td>
                  <td>{median(list.map((p) => p.enrolments.length))}</td>
                  <td>{median(list.map((p) => p.weeklyHours))}h</td>
                  <td>{Math.round((list.filter((p) => p.daysOnCampus === 5).length / list.length) * 100)}%</td>
                  <td>{list.filter((p) => clashStudents.has(p.id)).length || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="department-report-note" style={{ marginTop: 8 }}>
          By level:{' '}
          {countBy(profiles, (p) => p.level)
            .map(([k, v]) => `${k} ${fmt(v.length)}`)
            .join(' · ')}
          . By status:{' '}
          {countBy(profiles, (p) => p.status)
            .map(([k, v]) => `${k} ${fmt(v.length)}`)
            .join(' · ')}
          .
        </p>
      </section>
      )}

      {view === 'status' && (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Student status: OJT, suspended, postponed…</h2>
            <p className="panel-sub">
              Students with no courses this semester and registered students whose status isn't “Studying”. The “No
              Courses” sheet has no names, so those students show their ID only.
            </p>
          </div>
          <div className="panel-actions">
            <button className="export-excel-btn" onClick={exportStatus} disabled={statusShown.length === 0}>
              📊 Excel
            </button>
          </div>
        </div>

        <div className="table-scroll" style={{ marginBottom: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                {statusDepts.map((d) => (
                  <th key={d}>{d}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {statusNames.map((st) => (
                <tr key={st}>
                  <td className="strong">
                    <button className="btn-link" onClick={() => setStatusFilter(st)}>
                      {st}
                    </button>
                  </td>
                  {statusDepts.map((d) => (
                    <td key={d}>{statusRows.filter((r) => r.status === st && r.department === d).length || '–'}</td>
                  ))}
                  <td className="strong">{statusRows.filter((r) => r.status === st).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="toolbar">
          <input
            type="search"
            className="grow"
            aria-label="Search status list"
            placeholder="🔍 Student ID or name…"
            value={statusQuery}
            onChange={(e) => setStatusQuery(e.target.value)}
          />
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            {statusNames.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select aria-label="Status department" value={statusDept} onChange={(e) => setStatusDept(e.target.value)}>
            <option value="ALL">All departments</option>
            {statusDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="muted">{statusShown.length} students</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Level</th>
                <th>Status</th>
                <th>Courses</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {statusShown.map((r) => (
                <tr key={r.id} className={r.courses ? 'row-flag' : undefined}>
                  <td className="strong">
                    {r.courses ? (
                      <button
                        className="btn-link"
                        onClick={() => {
                          setQuery(r.id);
                          setSelected(r.id);
                          setView('find');
                        }}
                      >
                        {r.id}
                      </button>
                    ) : (
                      r.id
                    )}
                  </td>
                  <td>{r.name || <span className="muted">not in file</span>}</td>
                  <td>{r.department}</td>
                  <td>{r.level}</td>
                  <td>{r.status}</td>
                  <td>{r.courses || '–'}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {view === 'find' && (
      <section className="panel" id="find-student">
        <div className="panel-header">
          <div>
            <h2>Find a student</h2>
            <p className="panel-sub">Search by student ID or name to see their courses, rooms, instructors and week.</p>
          </div>
        </div>
        <div className="toolbar">
          <input
            type="search"
            className="grow"
            aria-label="Search students"
            placeholder="🔍 Student ID or name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
          {q.length >= 2 && <span className="muted">{matches.length === 25 ? '25+ matches' : `${matches.length} found`}</span>}
        </div>
        {!chosen && matches.length > 0 && (
          <div className="student-results">
            {matches.map((p) => (
              <button key={p.id} className="student-result" onClick={() => setSelected(p.id)}>
                <strong>{p.name || p.id}</strong>
                <span className="muted">
                  {p.id} · {p.department} · {p.enrolments.length} courses
                  {p.clashes.length ? ' · ⚠ clash' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        {chosen && (
          <>
            <button className="btn-link" onClick={() => setSelected(null)}>
              ← Back to results
            </button>
            <StudentProfileView p={chosen} />
          </>
        )}
      </section>
      )}

      {view === 'clashes' && (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Student clashes</h2>
            <p className="panel-sub">Students registered in two classes that meet at the same time.</p>
          </div>
        </div>
        {index.clashes.length === 0 ? (
          <div className="empty-state">No student has two classes at the same time. 🎉</div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Day</th>
                  <th>Class 1</th>
                  <th>Class 2</th>
                </tr>
              </thead>
              <tbody>
                {index.clashes.map((c, i) => {
                  const p = index.profiles.get(c.studentId);
                  return (
                    <tr key={i}>
                      <td>
                        <button className="btn-link" onClick={() => { setQuery(c.studentId); setSelected(c.studentId); }}>
                          {c.studentId}
                        </button>
                      </td>
                      <td>{p?.department}</td>
                      <td>{c.day}</td>
                      <td>
                        <strong>{c.first.sectionKey}</strong> {c.first.startTime}-{c.first.endTime} · {c.first.room}
                      </td>
                      <td>
                        <strong>{c.second.sectionKey}</strong> {c.second.startTime}-{c.second.endTime} · {c.second.room}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {view === 'sizes' && (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Class sizes</h2>
            <p className="panel-sub">Students registered in each timetable section.</p>
          </div>
          <div className="panel-actions">
            <select aria-label="Department" value={sizeDept} onChange={(e) => setSizeDept(e.target.value)}>
              <option value="ALL">All departments</option>
              {timetableDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="toolbar">
          <input
            type="search"
            className="grow"
            aria-label="Filter sections"
            placeholder="🔍 Course code, name, instructor or room…"
            value={sizeQuery}
            onChange={(e) => setSizeQuery(e.target.value)}
          />
          <div className="seg">
            {(
              [
                ['ALL', `All ${sizeRows.length}`],
                ['SMALL', `5 or fewer ${small.length}`],
                ['EMPTY', `Empty ${empty.length}`]
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={`seg-btn${sizeFilter === id ? ' active' : ''}`} onClick={() => setSizeFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <span className="muted">{sizeShown.length} sections · click one to see its students</span>
        </div>
        <div className="table-scroll">
          <table className="data-table size-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Course name</th>
                <th>Students</th>
                <th>Days &amp; times</th>
                <th>Room</th>
                <th>Instructor</th>
              </tr>
            </thead>
            <tbody>
              {sizeShown.slice(0, sizeLimit).map(({ c, size }) => {
                const row = sectionRow(c);
                const open = openSection === c.key;
                const list = open ? sectionStudents.get(c.key) ?? [] : [];
                return (
                  <Fragment key={c.key}>
                    <tr
                      className={`size-row${open ? ' open' : ''}${size <= 5 ? ' row-flag' : ''}`}
                      onClick={() => setOpenSection(open ? null : c.key)}
                      aria-expanded={open}
                    >
                      <td className="strong">
                        <span className="chevron-sm" aria-hidden>
                          {open ? '▾' : '▸'}
                        </span>{' '}
                        {c.key}
                      </td>
                      <td>{c.name.replace(c.code, '').trim() || c.name}</td>
                      <td className="strong">{size || 'none'}</td>
                      <td>{row.days}</td>
                      <td>{row.rooms}</td>
                      <td>{row.teacher}</td>
                    </tr>
                    {open && (
                      <tr className="size-detail">
                        <td colSpan={6}>
                          {list.length === 0 ? (
                            <span className="muted">No students are registered in this section.</span>
                          ) : (
                            <>
                              <div className="size-detail-head">
                                <strong>{list.length} students</strong>
                                <span className="muted">
                                  {countBy(list, (p) => p.department)
                                    .map(([k, v]) => `${k} ${v.length}`)
                                    .join(' · ')}
                                </span>
                              </div>
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Student ID</th>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Level</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {list.map((p) => (
                                    <tr key={p.id}>
                                      <td>
                                        <button
                                          className="btn-link"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setQuery(p.id);
                                            setSelected(p.id);
                                            setView('find');
                                          }}
                                        >
                                          {p.id}
                                        </button>
                                      </td>
                                      <td>{p.name}</td>
                                      <td>{p.department}</td>
                                      <td>{p.level}</td>
                                      <td>{p.status}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {sizeShown.length > sizeLimit && (
          <div className="show-more">
            <button className="btn-outline" onClick={() => setSizeLimit((l) => l + 100)}>
              Show more ({sizeShown.length - sizeLimit} more)
            </button>
          </div>
        )}
        {index.unmatched.length > 0 && (
          <p className="department-report-note" style={{ marginTop: 10 }}>
            {fmt(index.unmatched.reduce((s, u) => s + u.count, 0))} registrations are for courses or sections not in the
            timetable (mostly 0-credit tests with no class):{' '}
            {index.unmatched
              .slice(0, 8)
              .map((u) => `${u.courseNo} (${u.count})`)
              .join(', ')}
            {index.unmatched.length > 8 ? '…' : ''}.
          </p>
        )}
      </section>
      )}

      {view === 'campus' && (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>When students are on campus</h2>
            <p className="panel-sub">Students in class at each hour (a student with two classes in the same hour is counted once).</p>
          </div>
          <div className="panel-actions">
            <select aria-label="Department" value={heatDept} onChange={(e) => setHeatDept(e.target.value)}>
              <option value="ALL">All departments</option>
              {Object.keys(index.heatByDept)
                .sort()
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="heat-table">
            <thead>
              <tr>
                <th />
                {HEAT_HOURS.map((h) => (
                  <th key={h}>{h.slice(0, 2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatDays.map((d) => (
                <tr key={d}>
                  <th>{d}</th>
                  {HEAT_HOURS.map((h) => {
                    const v = heat[d]?.[h] ?? 0;
                    const a = v / heatMax;
                    return (
                      <td
                        key={h}
                        title={`${d} ${h}: ${fmt(v)} students`}
                        style={{ background: v ? `rgba(79, 70, 229, ${0.08 + a * 0.85})` : undefined, color: a > 0.55 ? '#fff' : undefined }}
                      >
                        {v ? fmt(v) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </>
  );
}
