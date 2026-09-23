import { useMemo, useState } from 'react';
import { WORK_DAYS, WORK_HOURS } from '../config';
import type { Teacher, TeacherSlot } from '../types';

function formatTime(hour: string): string {
  const h = parseInt(hour.split(':')[0], 10);
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 || 12;
  return `${display}:00 ${period}`;
}

interface SlotStatus {
  type: 'none' | 'all-free' | 'all-busy' | 'partial';
  free: number;
  busy: number;
  total: number;
  busyList: { name: string; slot: TeacherSlot }[];
}

function getSlotStatus(
  teachers: Record<string, Teacher>,
  selected: string[],
  day: string,
  hour: string
): SlotStatus {
  if (selected.length === 0) return { type: 'none', free: 0, busy: 0, total: 0, busyList: [] };
  const busyList: { name: string; slot: TeacherSlot }[] = [];
  selected.forEach((name) => {
    const slot = teachers[name]?.schedule[day]?.[hour];
    if (slot && slot.isBusy) busyList.push({ name, slot });
  });
  const total = selected.length;
  const busy = busyList.length;
  const free = total - busy;
  const type: SlotStatus['type'] = busy === 0 ? 'all-free' : free === 0 ? 'all-busy' : 'partial';
  return { type, free, busy, total, busyList };
}

export default function MeetingFinder({ teachers }: { teachers: Record<string, Teacher> }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalSlot, setModalSlot] = useState<{ day: string; hour: string } | null>(null);

  const sortedTeachers = useMemo(
    () => Object.values(teachers).sort((a, b) => a.name.localeCompare(b.name)),
    [teachers]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    sortedTeachers.forEach((t) => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sortedTeachers]);

  const filtered = sortedTeachers.filter((t) => {
    if (deptFilter !== 'ALL' && t.department !== deptFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected((prev) => new Set([...prev, ...filtered.map((t) => t.name)]));
  const clearAll = () => setSelected(new Set());

  const selectedArr = Array.from(selected);

  const freeSlots = useMemo(() => {
    if (selectedArr.length === 0) return [];
    const slots: { day: string; hour: string }[] = [];
    WORK_DAYS.forEach((day) => {
      WORK_HOURS.forEach((hour) => {
        if (getSlotStatus(teachers, selectedArr, day, hour).type === 'all-free') {
          slots.push({ day, hour });
        }
      });
    });
    return slots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, selected]);

  const freeByDay: Record<string, string[]> = {};
  WORK_DAYS.forEach((d) => (freeByDay[d] = []));
  freeSlots.forEach(({ day, hour }) => freeByDay[day].push(hour));

  const activeStatus = modalSlot ? getSlotStatus(teachers, selectedArr, modalSlot.day, modalSlot.hour) : null;
  const busyNames = new Set(activeStatus?.busyList.map((b) => b.name) || []);
  const freeList = selectedArr.filter((n) => !busyNames.has(n));

  return (
    <div className="meeting-finder-section">
      <div className="mf-title">🗓️ Find a Meeting Time</div>

      <div className="mf-controls">
        <div className="mf-search-wrap">
          <input
            className="mf-search"
            type="text"
            placeholder="Search instructors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {departments.length > 0 && (
          <select className="mf-dept-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <button className="mf-btn-sm mf-btn-select-all" onClick={selectAll}>
          {deptFilter !== 'ALL' || search ? 'Select Filtered' : 'Select All'}
        </button>
        <button className="mf-btn-sm mf-btn-clear" onClick={clearAll}>
          Clear
        </button>
      </div>

      <div className="mf-instructor-list">
        {filtered.length === 0 ? (
          <div className="mf-no-match">No instructors match your search.</div>
        ) : (
          filtered.map((teacher) => {
            const sel = selected.has(teacher.name);
            return (
              <div
                key={teacher.name}
                className={`mf-chip${sel ? ' mf-chip-selected' : ''}`}
                onClick={() => toggle(teacher.name)}
              >
                <span className="mf-chip-check">{sel ? '✓' : ''}</span>
                <span className="mf-chip-name">{teacher.name}</span>
                <span className="mf-chip-meta">{teacher.totalClasses} classes</span>
              </div>
            );
          })
        )}
      </div>

      <div className={selected.size === 0 ? 'mf-count-hint' : 'mf-count-active'}>
        {selected.size === 0
          ? 'Select instructors above to see common availability'
          : `${selected.size} instructor${selected.size !== 1 ? 's' : ''} selected`}
      </div>

      <div className="mf-legend">
        <div className="mf-legend-item">
          <div className="mf-legend-dot mf-legend-free" />
          <span>All free</span>
        </div>
        <div className="mf-legend-item">
          <div className="mf-legend-dot mf-legend-part" />
          <span>Some free (X/Y)</span>
        </div>
        <div className="mf-legend-item">
          <div className="mf-legend-dot mf-legend-busy" />
          <span>All busy</span>
        </div>
      </div>

      <div className="mf-table-scroll">
        <table className="mf-table">
          <thead>
            <tr>
              <th className="mf-th-time">Time</th>
              {WORK_DAYS.map((d) => (
                <th className="mf-th-day" key={d}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORK_HOURS.map((hour) => (
              <tr key={hour}>
                <td className="mf-td-time">{formatTime(hour)}</td>
                {WORK_DAYS.map((day) => {
                  if (selected.size === 0) {
                    return (
                      <td className="mf-td mf-td-empty" key={day}>
                        <span className="mf-td-label">—</span>
                      </td>
                    );
                  }
                  const s = getSlotStatus(teachers, selectedArr, day, hour);
                  let cls = 'mf-td-free';
                  let label = 'Free';
                  if (s.type === 'all-busy') {
                    cls = 'mf-td-busy';
                    label = 'Busy';
                  } else if (s.type === 'partial') {
                    cls = 'mf-td-partial';
                    label = `${s.free}/${s.total} free`;
                  }
                  return (
                    <td
                      className={`mf-td ${cls} mf-td-clickable`}
                      key={day}
                      onClick={() => setModalSlot({ day, hour })}
                    >
                      <span className="mf-td-label">{label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mf-summary">
        {selected.size > 0 &&
          (freeSlots.length === 0 ? (
            <div className="mf-summary-empty">
              No common free slot for all {selected.size} selected instructors. Try selecting fewer.
            </div>
          ) : (
            <>
              <div className="mf-summary-title">Common Free Slots — {freeSlots.length} total</div>
              <div className="mf-summary-grid">
                {WORK_DAYS.map((day) => (
                  <div className="mf-summary-day" key={day}>
                    <div className="mf-summary-day-name">{day}</div>
                    <div className="mf-summary-slots">
                      {freeByDay[day].length > 0 ? (
                        freeByDay[day].map((h) => (
                          <span className="mf-summary-slot" key={h}>
                            {formatTime(h)}
                          </span>
                        ))
                      ) : (
                        <span className="mf-summary-none">No free slot</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ))}
      </div>

      <div
        className={`mf-modal-overlay${modalSlot ? ' mf-modal-visible' : ''}`}
        style={{ display: modalSlot ? 'flex' : 'none' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalSlot(null);
        }}
      >
        {modalSlot && activeStatus && (
          <div className="mf-modal" role="dialog" aria-modal="true">
            <div className="mf-modal-header">
              <div className="mf-modal-title">
                {modalSlot.day} · {formatTime(modalSlot.hour)}
              </div>
              <button className="mf-modal-close" aria-label="Close" onClick={() => setModalSlot(null)}>
                ✕
              </button>
            </div>
            <div
              className={`mf-modal-status ${
                activeStatus.type === 'all-free'
                  ? 'mf-modal-status-free'
                  : activeStatus.type === 'all-busy'
                  ? 'mf-modal-status-busy'
                  : 'mf-modal-status-partial'
              }`}
            >
              <span className="mf-modal-status-icon">
                {activeStatus.type === 'all-free' ? '✓' : activeStatus.type === 'all-busy' ? '✗' : '◑'}
              </span>
              {activeStatus.type === 'all-free' && `All ${activeStatus.total} instructors are free at this time`}
              {activeStatus.type === 'all-busy' && `All ${activeStatus.total} instructors have class at this time`}
              {activeStatus.type === 'partial' && `${activeStatus.free} of ${activeStatus.total} instructors are free`}
            </div>
            <div className="mf-modal-body">
              {activeStatus.busyList.length > 0 && (
                <>
                  <div className="mf-modal-section-title mf-section-busy-title">
                    <span className="mf-section-icon">✗</span> In Class ({activeStatus.busyList.length})
                  </div>
                  <div className="mf-modal-busy-list">
                    {activeStatus.busyList.map(({ name, slot }) => (
                      <div className="mf-modal-busy-card" key={name}>
                        <div className="mf-busy-name">{name}</div>
                        <div className="mf-busy-details">
                          <span className="mf-busy-course">{slot.classId || slot.course || '—'}</span>
                          {slot.room && <span className="mf-busy-room">{slot.room}</span>}
                          {slot.timeRange && <span className="mf-busy-time">{slot.timeRange}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {freeList.length > 0 && (
                <>
                  <div className="mf-modal-section-title mf-section-free-title">
                    <span className="mf-section-icon">✓</span> Available ({freeList.length})
                  </div>
                  <div className="mf-modal-free-list">
                    {freeList.map((name) => (
                      <div className="mf-modal-free-row" key={name}>
                        <span className="mf-free-check">✓</span>
                        <span className="mf-free-name">{name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
