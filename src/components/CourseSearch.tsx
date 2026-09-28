import { useMemo, useState } from 'react';
import { WORK_DAYS } from '../config';
import type { CourseSection } from '../types';

const PAGE_SIZE = 25;

interface Props {
  courses: Record<string, CourseSection>;
  departments: string[];
}

// Find where and when a class meets: search by course code, course name,
// instructor or room and list every matching section with its meetings.
export default function CourseSearch({ courses, departments }: Props) {
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('ALL');
  const [day, setDay] = useState('ALL');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const sections = useMemo(
    () =>
      Object.values(courses).sort(
        (a, b) => a.code.localeCompare(b.code) || a.section.localeCompare(b.section, undefined, { numeric: true })
      ),
    [courses]
  );

  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => {
    const phrase = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const terms = phrase.split(/[,\s]+/).filter(Boolean);
    if (terms.length === 0) return [];
    const candidates = sections
      .filter((s) => dept === 'ALL' || s.department === dept)
      .filter((s) => day === 'ALL' || (s.schedule[day as (typeof WORK_DAYS)[number]] || []).length > 0)
      .map((s) => {
        const meetings = WORK_DAYS.flatMap((d) => s.schedule[d] || []);
        const text = [s.code, s.name, `${s.code}-${s.section}`, s.department || '', ...meetings.flatMap((m) => [m.room, m.teacher])]
          .join(' | ')
          .toLowerCase();
        return { s, text };
      });
    // Prefer an exact phrase (e.g. a full instructor name); otherwise every word must match.
    const exact = candidates.filter((c) => c.text.includes(phrase));
    const matches = exact.length > 0 ? exact : candidates.filter((c) => terms.every((t) => c.text.includes(t)));
    return matches.map((c) => c.s);
  }, [sections, query, dept, day]);

  const visible = results.slice(0, limit);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Find a class</h2>
          <p className="panel-sub">
            Search by course code (e.g. CIDN1101), course name, instructor or room. Type several words to narrow it
            down, e.g. “CIDN1101 HL203”.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="grow"
          aria-label="Search classes"
          placeholder="🔍 Course code, name, instructor or room…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
        <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="ALL">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="ALL">Any day</option>
          {WORK_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {hasQuery && (
          <span className="muted">
            {results.length} {results.length === 1 ? 'section' : 'sections'} found
          </span>
        )}
      </div>

      {!hasQuery ? (
        <div className="empty-state">Start typing to find a class.</div>
      ) : results.length === 0 ? (
        <div className="empty-state">No classes match “{query}”.</div>
      ) : (
        <div className="section-list">
          {visible.map((s) => {
            const meetings = WORK_DAYS.flatMap((d) => s.schedule[d] || []).filter((m) => day === 'ALL' || m.day === day);
            return (
              <div className="section-card" key={s.key}>
                <div className="section-card-header">
                  <div>
                    <span className="tag">{s.code}</span> <strong>{s.name.replace(s.code, '').trim() || s.name}</strong>
                  </div>
                  <div className="muted">
                    Section {s.section}
                    {s.department ? ` · ${s.department}` : ''}
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Room</th>
                        <th>Instructor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meetings.map((m, i) => (
                        <tr key={i}>
                          <td>{m.day}</td>
                          <td>
                            {m.startTime}–{m.endTime}
                          </td>
                          <td className="strong">{m.room}</td>
                          <td>{m.teacher}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {results.length > limit && (
        <div className="show-more">
          <button className="btn-outline" onClick={() => setLimit((l) => l + PAGE_SIZE * 2)}>
            Show more ({results.length - limit} more)
          </button>
        </div>
      )}
    </section>
  );
}
