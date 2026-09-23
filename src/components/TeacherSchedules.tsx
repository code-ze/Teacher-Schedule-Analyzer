import { useMemo, useState } from 'react';
import { WORK_DAYS, WORK_HOURS } from '../config';
import type { Teacher } from '../types';
import { exportTeachersExcel, exportTeachersPDF } from '../utils/exporters';

export default function TeacherSchedules({ teachers }: { teachers: Record<string, Teacher> }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div id="teacherSchedules">
      <div className="search-filter-container" style={{ border: '1px solid #667eea' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <label htmlFor="teacherSearch" style={{ display: 'block', fontWeight: 600, color: '#2c3e50', flex: '1 1 260px' }}>
            🔍 Search Instructors
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="export-pdf-btn" onClick={() => exportTeachersPDF(filtered)}>
              📄 Export PDF
            </button>
            <button className="export-excel-btn" onClick={() => exportTeachersExcel(filtered)}>
              📊 Export Excel
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <input
            id="teacherSearch"
            type="text"
            placeholder="Enter instructor name to filter..."
            style={{ flex: '1 1 260px', padding: '10px 12px', border: '2px solid #667eea', borderRadius: 8, fontSize: 14 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{ padding: '10px 12px', border: '2px solid #667eea', borderRadius: 8, fontSize: 14, background: 'white', color: '#2c3e50', fontWeight: 600, minWidth: 200 }}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div id="teacherCardsContainer">
        {filtered.map((teacher) => (
          <div className="teacher-card" key={teacher.name}>
            <div className="teacher-header" onClick={() => toggle(teacher.name)}>
              <div className="teacher-name">{teacher.name}</div>
              <div className="class-count">
                {teacher.totalClasses} classes{teacher.department ? ` • ${teacher.department}` : ''}
              </div>
            </div>
            {expanded.has(teacher.name) && (
              <div className="schedule-content expanded">
                {WORK_DAYS.map((day) => (
                  <div className="day-section" key={day}>
                    <div className="day-title">{day}</div>
                    <div className="time-slots">
                      {WORK_HOURS.map((hour) => {
                        const slot = teacher.schedule[day]?.[hour];
                        const busy = slot?.isBusy;
                        return (
                          <div
                            key={hour}
                            className={`time-slot ${busy ? 'busy-slot' : 'free-slot'}`}
                            title={busy ? `${slot?.timeRange || hour}: ${slot?.course || ''} @ ${slot?.room || ''}` : undefined}
                          >
                            {hour} {busy ? `— ${slot?.classId || ''}` : '— Free'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
