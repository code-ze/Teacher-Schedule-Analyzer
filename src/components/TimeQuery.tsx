import { useState } from 'react';
import { WORK_DAYS, WORK_HOURS, extractClassId } from '../config';
import type { Teacher } from '../types';

function parseTimeToHourKey(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/\s+/g, '');

  const ampmMatch = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);
  const colonMatch = s.match(/^(\d{1,2})(?::(\d{2}))$/);
  const hourOnly = s.match(/^(\d{1,2})$/);

  let hours: number | null = null;
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const meridian = ampmMatch[3];
    if (h === 12) h = 0;
    if (meridian === 'pm') h += 12;
    hours = h;
  } else if (colonMatch) {
    hours = parseInt(colonMatch[1], 10);
  } else if (hourOnly) {
    hours = parseInt(hourOnly[1], 10);
  } else {
    return null;
  }

  if (Number.isNaN(hours) || hours < 0 || hours > 23) return null;
  return hours.toString().padStart(2, '0') + ':00';
}

interface BusyResult {
  name: string;
  course: string | null;
  classId: string;
  room: string | null;
  timeRange: string;
}

function findBusyTeachersAt(
  teachers: Record<string, Teacher>,
  hourKey: string,
  daySel: string
): Record<string, BusyResult[]> {
  const days = daySel === 'ALL' ? WORK_DAYS : [daySel as (typeof WORK_DAYS)[number]];
  const result: Record<string, BusyResult[]> = {};
  days.forEach((day) => {
    const arr: BusyResult[] = [];
    Object.values(teachers).forEach((teacher) => {
      const slot = teacher.schedule[day]?.[hourKey];
      if (slot && slot.isBusy) {
        arr.push({
          name: teacher.name,
          course: slot.course,
          classId: slot.classId || (slot.course ? extractClassId(slot.course) : ''),
          room: slot.room,
          timeRange: slot.timeRange || hourKey
        });
      }
    });
    arr.sort((a, b) => a.name.localeCompare(b.name));
    result[day] = arr;
  });
  return result;
}

interface FreeResult {
  name: string;
  freeHours: number;
}

function findFreeTeachersInRange(
  teachers: Record<string, Teacher>,
  startHour: string,
  endHour: string,
  daySel: string
): Record<string, FreeResult[]> {
  const days = daySel === 'ALL' ? WORK_DAYS : [daySel as (typeof WORK_DAYS)[number]];
  const startIndex = WORK_HOURS.indexOf(startHour as (typeof WORK_HOURS)[number]);
  const endIndex = WORK_HOURS.indexOf(endHour as (typeof WORK_HOURS)[number]);
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return {};

  const hoursToCheck = WORK_HOURS.slice(startIndex, endIndex);
  const result: Record<string, FreeResult[]> = {};
  days.forEach((day) => {
    const arr: FreeResult[] = [];
    Object.values(teachers).forEach((teacher) => {
      const isFree = hoursToCheck.every((hour) => !teacher.schedule[day]?.[hour]?.isBusy);
      if (isFree) arr.push({ name: teacher.name, freeHours: hoursToCheck.length });
    });
    arr.sort((a, b) => a.name.localeCompare(b.name));
    result[day] = arr;
  });
  return result;
}

export default function TimeQuery({ teachers }: { teachers: Record<string, Teacher> }) {
  const [query, setQuery] = useState('');
  const [queryDay, setQueryDay] = useState('ALL');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [busyResults, setBusyResults] = useState<Record<string, BusyResult[]> | null>(null);
  const [busyHourKey, setBusyHourKey] = useState('');

  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeDay, setRangeDay] = useState('ALL');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [freeResults, setFreeResults] = useState<Record<string, FreeResult[]> | null>(null);
  const [freeRange, setFreeRange] = useState<[string, string]>(['', '']);

  const runQuery = () => {
    const input = query.trim();
    if (!input) {
      setBusyResults(null);
      setQueryError(null);
      return;
    }
    const hourKey = parseTimeToHourKey(input);
    if (!hourKey) {
      setQueryError('Invalid time. Use formats like 11am, 3:00 pm, or 13:00');
      setBusyResults(null);
      return;
    }
    setQueryError(null);
    setBusyHourKey(hourKey);
    setBusyResults(findBusyTeachersAt(teachers, hourKey, queryDay));
  };

  const runRangeQuery = () => {
    const startInput = rangeStart.trim();
    const endInput = rangeEnd.trim();
    if (!startInput || !endInput) {
      setFreeResults(null);
      setRangeError(null);
      return;
    }
    const start = parseTimeToHourKey(startInput);
    const end = parseTimeToHourKey(endInput);
    if (!start || !end) {
      setRangeError('Invalid time. Use formats like 10am, 12pm, or 10:00, 12:00');
      setFreeResults(null);
      return;
    }
    setRangeError(null);
    setFreeRange([start, end]);
    setFreeResults(findFreeTeachersInRange(teachers, start, end, rangeDay));
  };

  const busyTotal = busyResults ? Object.values(busyResults).reduce((s, a) => s + a.length, 0) : 0;
  const freeTotal = freeResults ? Object.values(freeResults).reduce((s, a) => s + a.length, 0) : 0;

  return (
    <div className="time-query-section">
      <div>
        <label htmlFor="timeQueryInput">Who has class at</label>
        <input
          id="timeQueryInput"
          type="text"
          placeholder="e.g. 11am or 13:00"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && runQuery()}
        />
        <select value={queryDay} onChange={(e) => setQueryDay(e.target.value)}>
          <option value="ALL">All Days</option>
          {WORK_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button className="btn" onClick={runQuery}>
          Find
        </button>
      </div>

      <div style={{ marginTop: 15 }}>
        {queryError && <div className="error">{queryError}</div>}
        {busyResults && (
          <>
            <div className="common-free-title" style={{ margin: '8px 0' }}>
              📅 Teachers with class at {busyHourKey} ({busyTotal} total)
            </div>
            {busyTotal === 0 ? (
              <div className="no-common-time">No classes found at {busyHourKey}</div>
            ) : (
              WORK_DAYS.map((day) => {
                const items = busyResults[day] || [];
                return (
                  <div
                    key={day}
                    style={{ background: '#f8f9fa', border: '1px solid #eee', borderRadius: 10, padding: 12, margin: '8px 0' }}
                  >
                    <div style={{ fontWeight: 600, color: '#2c3e50', marginBottom: 8 }}>
                      {day} • {busyHourKey}
                    </div>
                    {items.length === 0 ? (
                      <div className="no-slots-day">No classes</div>
                    ) : (
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          margin: 0,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                          gap: 8
                        }}
                      >
                        {items.map((it, i) => (
                          <li
                            key={i}
                            className="has-tooltip"
                            data-tooltip={`${it.timeRange}\n${it.classId} • ${it.room}\n${it.course}`}
                            style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 10 }}
                          >
                            <div style={{ fontWeight: 600, color: '#34495e' }}>{it.name}</div>
                            <div style={{ color: '#667eea', fontWeight: 600 }}>{it.classId}</div>
                            <div style={{ color: '#666' }}>{it.room}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <label htmlFor="timeRangeStart">Who is free from</label>
          <input
            id="timeRangeStart"
            type="text"
            placeholder="e.g. 10am or 10:00"
            style={{ minWidth: 120 }}
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && runRangeQuery()}
          />
          <label htmlFor="timeRangeEnd">to</label>
          <input
            id="timeRangeEnd"
            type="text"
            placeholder="e.g. 12pm or 12:00"
            style={{ minWidth: 120 }}
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && runRangeQuery()}
          />
          <select value={rangeDay} onChange={(e) => setRangeDay(e.target.value)}>
            <option value="ALL">All Days</option>
            {WORK_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="btn" onClick={runRangeQuery}>
            Find Free
          </button>
        </div>

        <div style={{ marginTop: 15 }}>
          {rangeError && <div className="error">{rangeError}</div>}
          {freeResults && (
            <>
              <div className="common-free-title" style={{ margin: '8px 0', color: '#2e7d32' }}>
                🆓 Teachers free from {freeRange[0]} to {freeRange[1]} ({freeTotal} total)
              </div>
              {freeTotal === 0 ? (
                <div className="no-common-time">
                  No teachers are free from {freeRange[0]} to {freeRange[1]}
                </div>
              ) : (
                WORK_DAYS.map((day) => {
                  const items = freeResults[day] || [];
                  return (
                    <div
                      key={day}
                      style={{ background: '#e8f5e8', border: '1px solid #c8e6c9', borderRadius: 10, padding: 12, margin: '8px 0' }}
                    >
                      <div style={{ fontWeight: 600, color: '#2e7d32', marginBottom: 8 }}>
                        {day} • {freeRange[0]} - {freeRange[1]}
                      </div>
                      {items.length === 0 ? (
                        <div className="no-slots-day">No free teachers</div>
                      ) : (
                        <ul
                          style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 8
                          }}
                        >
                          {items.map((it) => (
                            <li
                              key={it.name}
                              style={{ background: '#fff', border: '1px solid #4CAF50', borderRadius: 8, padding: 12, textAlign: 'center' }}
                            >
                              <div style={{ fontWeight: 600, color: '#2e7d32', fontSize: '1.1em' }}>{it.name}</div>
                              <div style={{ color: '#4CAF50', fontSize: '0.9em', marginTop: 4 }}>
                                ✅ Free for {it.freeHours} hours
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
