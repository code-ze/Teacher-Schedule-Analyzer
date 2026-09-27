import { useMemo, useState } from 'react';
import { WORK_DAYS, WORK_HOURS } from '../config';
import type { Teacher } from '../types';
import { exportTeachersExcel, exportTeachersPDF } from '../utils/exporters';

const PAGE_SIZE = 40;

function TeacherCard({ teacher }: { teacher: Teacher }) {
  const [open, setOpen] = useState(false);
  // Only show the days the instructor actually teaches, plus the standard hours.
  const days = WORK_DAYS.filter((day) => Object.values(teacher.schedule[day] || {}).some((s) => s?.isBusy));

  return (
    <div className={`teacher-card${open ? ' open' : ''}`}>
      <button className="teacher-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="teacher-avatar" aria-hidden>
          {teacher.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="teacher-main">
          <span className="teacher-name">{teacher.name}</span>
          <span className="class-count">
            {teacher.totalClasses} classes / week
            {teacher.department ? ` · ${teacher.department}` : ''}
          </span>
        </span>
        <span className="chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="schedule-content">
          {days.length === 0 ? (
            <div className="no-slots-day">No classes.</div>
          ) : (
            <div className="week-grid-scroll">
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
                  {WORK_HOURS.map((hour) => (
                    <tr key={hour}>
                      <th>{hour}</th>
                      {days.map((day) => {
                        const slot = teacher.schedule[day]?.[hour];
                        return slot?.isBusy ? (
                          <td
                            key={day}
                            className="busy-slot"
                            title={`${slot.timeRange || hour}: ${slot.course || ''} @ ${slot.room || ''}`}
                          >
                            <strong>{slot.classId}</strong>
                            <span>{slot.room}</span>
                          </td>
                        ) : (
                          <td key={day} className="free-slot" />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherSchedules({ teachers }: { teachers: Record<string, Teacher> }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const sorted = useMemo(() => Object.values(teachers).sort((a, b) => a.name.localeCompare(b.name)), [teachers]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    sorted.forEach((t) => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sorted]);

  const filtered = sorted.filter((t) => {
    if (deptFilter !== 'ALL' && t.department !== deptFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="panel" id="teacherSchedules">
      <div className="panel-header">
        <div>
          <h2>Instructors</h2>
          <p className="panel-sub">Click an instructor to see their week.</p>
        </div>
        <div className="panel-actions">
          <button className="export-pdf-btn" onClick={() => exportTeachersPDF(filtered)}>
            📄 PDF
          </button>
          <button className="export-excel-btn" onClick={() => exportTeachersExcel(filtered)}>
            📊 Excel
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          id="teacherSearch"
          type="search"
          className="grow"
          aria-label="Search instructors"
          placeholder="🔍 Search instructors…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
        {departments.length > 0 && (
          <select
            aria-label="Department"
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <span className="muted">{filtered.length} instructors</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No instructors match your search.</div>
      ) : (
        <div className="teacher-list">
          {filtered.slice(0, limit).map((teacher) => (
            <TeacherCard teacher={teacher} key={teacher.name} />
          ))}
        </div>
      )}
      {filtered.length > limit && (
        <div className="show-more">
          <button className="btn-outline" onClick={() => setLimit((l) => l + PAGE_SIZE * 2)}>
            Show more ({filtered.length - limit} more)
          </button>
        </div>
      )}
    </section>
  );
}
