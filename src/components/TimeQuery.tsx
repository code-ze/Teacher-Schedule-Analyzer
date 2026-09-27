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

  const daySelect = (value: string, onChange: (v: string) => void, id: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="ALL">All days</option>
      {WORK_DAYS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );

  return (
    <section className="panel time-query-section">
      <div className="panel-header">
        <div>
          <h2>Availability</h2>
          <p className="panel-sub">Type a time like 11am, 1:30pm or 13:00.</p>
        </div>
      </div>

      <div className="query-grid">
        <div className="query-card">
          <h3>Who has class at…</h3>
          <div className="form-row">
            <input
              id="timeQueryInput"
              type="text"
              aria-label="Time"
              placeholder="e.g. 11am or 13:00"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyUp={(e) => e.key === 'Enter' && runQuery()}
            />
            {daySelect(queryDay, setQueryDay, 'timeQueryDay')}
            <button className="btn" onClick={runQuery}>
              Find
            </button>
          </div>
        </div>

        <div className="query-card">
          <h3>Who is free between…</h3>
          <div className="form-row">
            <input
              id="timeRangeStart"
              type="text"
              aria-label="From"
              placeholder="From: 10am"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              onKeyUp={(e) => e.key === 'Enter' && runRangeQuery()}
            />
            <input
              id="timeRangeEnd"
              type="text"
              aria-label="To"
              placeholder="To: 12pm"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              onKeyUp={(e) => e.key === 'Enter' && runRangeQuery()}
            />
            {daySelect(rangeDay, setRangeDay, 'timeRangeDay')}
            <button className="btn" onClick={runRangeQuery}>
              Find free
            </button>
          </div>
        </div>
      </div>

      {queryError && <div className="error">{queryError}</div>}
      {busyResults && (
        <div className="results">
          <div className="results-title">
            📅 In class at {busyHourKey} <span className="count-pill">{busyTotal}</span>
          </div>
          {busyTotal === 0 ? (
            <div className="empty-state">No classes found at {busyHourKey}.</div>
          ) : (
            WORK_DAYS.filter((day) => busyResults[day]).map((day) => {
              const items = busyResults[day] || [];
              return (
                <div className="day-group" key={day}>
                  <div className="day-group-title">
                    {day} <span className="muted">· {items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="no-slots-day">No classes</div>
                  ) : (
                    <ul className="result-grid">
                      {items.map((it, i) => (
                        <li
                          key={i}
                          className="result-item has-tooltip"
                          data-tooltip={`${it.timeRange}\n${it.classId} • ${it.room}\n${it.course}`}
                        >
                          <div className="result-name">{it.name}</div>
                          <div className="result-meta">
                            <span className="tag">{it.classId}</span> {it.room} · {it.timeRange}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {rangeError && <div className="error">{rangeError}</div>}
      {freeResults && (
        <div className="results">
          <div className="results-title">
            🆓 Free from {freeRange[0]} to {freeRange[1]} <span className="count-pill">{freeTotal}</span>
          </div>
          {freeTotal === 0 ? (
            <div className="empty-state">
              No instructors are free from {freeRange[0]} to {freeRange[1]}.
            </div>
          ) : (
            WORK_DAYS.filter((day) => freeResults[day]).map((day) => {
              const items = freeResults[day] || [];
              return (
                <div className="day-group" key={day}>
                  <div className="day-group-title">
                    {day} <span className="muted">· {items.length}</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="no-slots-day">No free instructors</div>
                  ) : (
                    <ul className="result-grid">
                      {items.map((it) => (
                        <li key={it.name} className="result-item result-free">
                          <div className="result-name">{it.name}</div>
                          <div className="result-meta">✅ Free for {it.freeHours} hours</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
