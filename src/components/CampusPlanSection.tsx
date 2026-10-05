import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { CourseSection } from '../types';
import { SPACE_REPORT_CONFIG } from '../utils/spaceReport/config';
import type { DepartmentFacilities } from '../utils/spaceReport/facilities';
import type { StudentData } from '../utils/students/students';
import { buildCampusPlan, type CampusPlan, type ClassBrief, type Week } from '../utils/campusPlan';

const config = SPACE_REPORT_CONFIG;
const n = (v: number) => v.toLocaleString();
const SHORT_DAY: Record<string, string> = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu' };

const weekText = (w: Week) =>
  `${w.total}h a week${w.thursdayTo14 ? ', Thursday to 14:00' : ', Thursday to 18:00'} · 80% = ${Math.round(w.planning * 10) / 10}h`;

interface Props {
  courses: Record<string, CourseSection>;
  departments: string[];
  virtualRooms: string[];
  students: StudentData | null;
  facilities: DepartmentFacilities[] | null;
  onOpenTab: (tab: 'space' | 'students' | 'rooms') => void;
}

function Bar({ value, max, tone = 'accent', label }: { value: number; max: number; tone?: string; label?: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="cp-bar" title={label}>
      <div className={`cp-bar-fill cp-${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function ClassTable({ rows, showDept }: { rows: ClassBrief[]; showDept: boolean }) {
  if (rows.length === 0) return <p className="muted">None.</p>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {showDept && <th>Department</th>}
            <th>Course</th>
            <th>Section</th>
            <th>Day</th>
            <th>Time</th>
            <th>Room</th>
            <th>Instructor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              {showDept && <td>{c.department}</td>}
              <td>
                <span className="tag">{c.code}</span> {c.name}
              </td>
              <td>{c.section}</td>
              <td>{c.day}</td>
              <td>{c.time}</td>
              <td className="strong">{c.room}</td>
              <td>{c.teacher}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function exportExcel(plan: CampusPlan) {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'None' }]), name);
  add(
    'Classrooms',
    plan.plans.map((p) => ({
      Department: p.department,
      'Teaching week (h)': p.week.total,
      'Classroom hours': p.hours.classroom,
      'Daytime classroom hours': p.daytimeClassroomHours,
      'Classrooms used now': p.classroomsNow,
      'Rooms at full use': p.classrooms.full,
      'Rooms at 80%': p.classrooms.planning,
      'Busiest day': p.classrooms.busiestDay,
      'Rooms on busiest day': p.classrooms.busiestDayRooms,
      'Rooms at 80% if Thursday ends 14:00': p.classrooms.planningProposalWeek ?? ''
    }))
  );
  add('Labs', [
    ...plan.plans.map((p) => ({
      Group: p.department,
      'Lab hours': p.hours.lab,
      'Labs used now': p.labsNow,
      'Labs at full use': p.labs.full,
      'Labs at 80%': p.labs.planning
    })),
    ...plan.labGroups.map((g) => ({
      Group: `${g.departments.join(' + ')} (shared)`,
      'Lab hours': g.need.hours,
      'Labs used now': '',
      'Labs at full use': g.need.full,
      'Labs at 80%': g.need.planning
    }))
  ]);
  add(
    'Hours by day',
    plan.plans.map((p) => ({ Department: p.department, ...p.byDay }))
  );
  add(
    'Rooms',
    plan.rooms.map((r) => ({
      Room: r.room,
      Building: r.building,
      Type: r.kind,
      'Current users (hours)': Object.entries(r.byDept)
        .map(([d, h]) => `${d} ${h}`)
        .join(', '),
      'Selected departments (h)': r.selectedHours,
      'Total (h)': r.total,
      'Use of 40h week (%)': r.usePct
    }))
  );
  const classes = (key: 'tuesdayBreak' | 'thursdayAfter2' | 'evening' | 'online') =>
    plan.plans.flatMap((p) =>
      p[key].map((c) => ({
        Department: c.department,
        Course: c.code,
        Name: c.name,
        Section: c.section,
        Day: c.day,
        Time: c.time,
        Hours: c.hours,
        Room: c.room,
        Instructor: c.teacher
      }))
    );
  add('Tuesday 12-14', classes('tuesdayBreak'));
  add('Thursday after 14', classes('thursdayAfter2'));
  add('Evening', classes('evening'));
  add('Online', classes('online'));
  if (plan.students)
    add(
      'Students',
      plan.students.map((s) => ({ Department: s.department, Studying: s.studying, ...s.other }))
    );
  if (plan.offices)
    add(
      'Offices',
      plan.offices.map((f) => ({
        Department: f.department,
        'Staff offices': f.staffOffices,
        'Staff desks': f.staffDesks,
        'In use': f.staffUsed,
        Held: f.held,
        Free: f.free,
        'HoD office': f.hod?.office ?? ''
      }))
    );
  XLSX.writeFile(wb, 'Campus-Plan-Figures.xlsx');
}

// Campus consolidation figures for the chosen departments, in the order of the
// consolidation proposal: teaching week, classroom and lab needs, room use,
// timetabling issues, students and staff, and every room used today.
export default function CampusPlanSection({ courses, departments, virtualRooms, students, facilities, onOpenTab }: Props) {
  const [selected, setSelected] = useState<string[]>(() => {
    const preset = config.departments.filter((d) => departments.includes(d));
    return preset.length ? preset : departments.slice(0, 1);
  });
  const toggle = (d: string) =>
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : departments.filter((x) => s.includes(x) || x === d)));

  const plan = useMemo(
    () => buildCampusPlan(courses, selected, { onlineRooms: virtualRooms, students, facilities }),
    [courses, selected, virtualRooms, students, facilities]
  );
  const { plans, totals } = plan;
  const many = plans.length > 1;
  const maxHours = Math.max(1, ...plans.map((p) => p.hours.total));
  const maxRooms = Math.max(1, ...plans.flatMap((p) => [p.classroomsNow, p.classrooms.planning, p.classrooms.busiestDayRooms]));
  const sumOf = (f: (p: (typeof plans)[number]) => number) => plans.reduce((s, p) => s + f(p), 0);
  const corrections = plans.filter((p) => p.proposalWeek && p.classrooms.planningProposalWeek !== p.classrooms.planning);
  const grouped = new Set(plan.labGroups.flatMap((g) => g.departments));
  const studying = plan.students?.reduce((s, r) => s + r.studying, 0);
  const weeks = Array.from(new Map(plans.map((p) => [p.week.total, p.week])).values());

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Campus plan</h2>
          <p className="panel-sub">
            The figures behind the campus consolidation proposal, worked out from the files you loaded: teaching hours,
            classrooms and labs needed at full use and at the 80% planning standard, rooms used today, timetabling issues,
            students and staff.
          </p>
        </div>
        {plans.length > 0 && (
          <div className="panel-actions">
            <button className="export-excel-btn" onClick={() => exportExcel(plan)}>
              📊 Download Excel
            </button>
          </div>
        )}
      </div>

      <div className="department-report-picker">
        <span className="filter-label">Departments</span>
        {departments.map((d) => (
          <label key={d} className={`department-report-chip${selected.includes(d) ? ' selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(d)} onChange={() => toggle(d)} />
            {d}
          </label>
        ))}
        <button className="btn-link" onClick={() => setSelected(departments)}>
          Select all
        </button>
        <button className="btn-link" onClick={() => setSelected([])}>
          Clear
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="empty-state">Select at least one department.</div>
      ) : (
        <>
          <div className="stats" style={{ marginTop: 14 }}>
            {studying !== undefined && (
              <div className="stat-item">
                <div className="stat-number">{n(studying)}</div>
                <div className="stat-label">Students studying</div>
              </div>
            )}
            <div className="stat-item">
              <div className="stat-number">{n(sumOf((p) => p.instructors))}</div>
              <div className="stat-label">Instructors in the timetable</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{n(sumOf((p) => p.hours.classroom + p.hours.lab))}h</div>
              <div className="stat-label">In-person hours a week</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{n(sumOf((p) => p.hours.online))}h</div>
              <div className="stat-label">Online ({sumOf((p) => p.onlineClasses)} classes, no room)</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">
                {totals.classroomsNow} → {totals.classroomsPlanning}
              </div>
              <div className="stat-label">Classrooms used now → needed at 80%</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{totals.labsPlanning}</div>
              <div className="stat-label">Labs needed at 80%</div>
            </div>
          </div>

          {corrections.map((p) => (
            <div className="cp-callout" key={p.department}>
              ⚠️ <strong>{p.department}</strong> keeps Thursday afternoon (classes to 18:00), so its week is {p.week.total}{' '}
              hours and it needs <strong>{p.classrooms.planning} classrooms</strong> at 80%. If Thursday ended at 14:00 for
              it too (as the proposal assumes for every unit), the figure would be {p.classrooms.planningProposalWeek}.
            </div>
          ))}

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Teaching week</h3>
              <span className="muted">08:00–18:00, Sunday to Thursday · Tuesday 12:00–14:00 reserved</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    {config.days.map((d) => (
                      <th key={d}>{SHORT_DAY[d]}</th>
                    ))}
                    <th>Week</th>
                    <th>80% standard</th>
                    <th>Used by</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.total}>
                      <td className="strong">{w.thursdayTo14 ? 'Thursday to 14:00' : 'Thursday to 18:00'}</td>
                      {config.days.map((d) => (
                        <td key={d}>{w.dayHours[d]}</td>
                      ))}
                      <td className="strong">{w.total}</td>
                      <td>{Math.round(w.planning * 10) / 10}</td>
                      <td>
                        {plans
                          .filter((p) => p.week.total === w.total)
                          .map((p) => p.department)
                          .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="department-report-note" style={{ marginTop: 6 }}>
              Rooms needed = weekly hours ÷ hours a room offers in the week (or ÷ 80% of it), rounded up. Use percentages
              below are on a 40-hour week (08:00–16:00), as in the space report.
            </p>
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Weekly teaching hours</h3>
              <span className="cp-legend">
                <span className="cp-dot cp-accent" /> Classroom <span className="cp-dot cp-green" /> Lab{' '}
                <span className="cp-dot cp-muted" /> Online
              </span>
            </div>
            {plans.map((p) => (
              <div className="cp-row" key={p.department}>
                <div className="cp-row-label">{p.department}</div>
                <div className="cp-stack">
                  <div className="cp-accent" style={{ width: `${(p.hours.classroom / maxHours) * 100}%` }} title={`Classroom ${p.hours.classroom}h`} />
                  <div className="cp-green" style={{ width: `${(p.hours.lab / maxHours) * 100}%` }} title={`Lab ${p.hours.lab}h`} />
                  <div className="cp-muted" style={{ width: `${(p.hours.online / maxHours) * 100}%` }} title={`Online ${p.hours.online}h`} />
                </div>
                <div className="cp-row-value">
                  {p.hours.classroom} + {p.hours.lab} + {p.hours.online} = <strong>{p.hours.total}h</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Classrooms</h3>
              <span className="muted">Daytime hours (08:00–18:00); evening classes need no extra room</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Week</th>
                    <th>Classroom hours</th>
                    <th>Daytime hours</th>
                    <th>Used now</th>
                    <th>At full use</th>
                    <th>At 80%</th>
                    <th>Busiest day</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.department}>
                      <td className="strong">{p.department}</td>
                      <td>{p.week.total}h</td>
                      <td>{p.hours.classroom}</td>
                      <td>{p.daytimeClassroomHours}</td>
                      <td>{p.classroomsNow}</td>
                      <td>{p.classrooms.full}</td>
                      <td className="strong">
                        {p.classrooms.planning}
                        {p.classrooms.planningProposalWeek !== null && p.classrooms.planningProposalWeek !== p.classrooms.planning && (
                          <span className="muted"> ({p.classrooms.planningProposalWeek} if Thu to 14:00)</span>
                        )}
                      </td>
                      <td>
                        {p.classrooms.busiestDay
                          ? `${p.classrooms.busiestDay}: ${p.byDay[p.classrooms.busiestDay]}h → ${p.classrooms.busiestDayRooms} rooms`
                          : '–'}
                      </td>
                    </tr>
                  ))}
                  {many && (
                    <tr className="cp-total">
                      <td>Total</td>
                      <td />
                      <td>{n(sumOf((p) => p.hours.classroom))}</td>
                      <td>{n(sumOf((p) => p.daytimeClassroomHours))}</td>
                      <td>{totals.classroomsNow}</td>
                      <td>{totals.classroomsFull}</td>
                      <td>{totals.classroomsPlanning}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {many && (
              <p className="department-report-note" style={{ marginTop: 6 }}>
                “Used now” in the total counts each room once ({totals.classroomsNow} rooms), so it can be less than the sum
                of the rows. Totals take the larger of the 80% figure and the busiest day for each department.
              </p>
            )}
            <div className="cp-chart">
              {plans.map((p) => (
                <div className="cp-row" key={p.department}>
                  <div className="cp-row-label">{p.department}</div>
                  <div className="cp-pair">
                    <Bar value={p.classroomsNow} max={maxRooms} tone="muted" label={`Used now: ${p.classroomsNow}`} />
                    <Bar value={p.classrooms.planning} max={maxRooms} label={`Needed at 80%: ${p.classrooms.planning}`} />
                  </div>
                  <div className="cp-row-value">
                    {p.classroomsNow} now → <strong>{p.classrooms.planning}</strong> at 80%
                  </div>
                </div>
              ))}
              <span className="cp-legend">
                <span className="cp-dot cp-muted" /> Rooms used now <span className="cp-dot cp-accent" /> Needed at 80%
              </span>
            </div>
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Classroom hours by day</h3>
              <span className="muted">Bar = share of the rooms needed at 80% that the day fills</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    {config.days.map((d) => (
                      <th key={d}>{SHORT_DAY[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.department}>
                      <td className="strong">{p.department}</td>
                      {config.days.map((d) => {
                        const cap = p.classrooms.planning * p.week.dayHours[d];
                        return (
                          <td key={d} className="cp-day">
                            {p.byDay[d]}h
                            <Bar value={p.byDay[d]} max={cap} tone={cap > 0 && p.byDay[d] > cap ? 'red' : 'accent'} />
                            <span className="muted">of {p.week.dayHours[d]}h/room</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Computer labs</h3>
              <span className="muted">Labs are known for {config.departments.join(', ')}</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lab group</th>
                    <th>Lab hours</th>
                    <th>Labs used now</th>
                    <th>At full use</th>
                    <th>At 80%</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.department} className={grouped.has(p.department) ? 'cp-sub' : undefined}>
                      <td className="strong">{p.department}</td>
                      <td>{p.hours.lab}</td>
                      <td>{p.labsNow}</td>
                      <td>{p.labs.full}</td>
                      <td>{p.labs.planning}</td>
                    </tr>
                  ))}
                  {plan.labGroups.map((g) => (
                    <tr key={g.departments.join()} className="cp-total">
                      <td>
                        {g.departments.join(' + ')} (shared labs combined)
                        <div className="muted" style={{ fontWeight: 400 }}>
                          {g.labs.join(', ')}
                        </div>
                      </td>
                      <td>{g.need.hours}</td>
                      <td />
                      <td>{g.need.full}</td>
                      <td>{g.need.planning}</td>
                    </tr>
                  ))}
                  {many && (
                    <tr className="cp-total">
                      <td>Total needed</td>
                      <td>{n(sumOf((p) => p.hours.lab))}</td>
                      <td />
                      <td>{totals.labsFull}</td>
                      <td>{totals.labsPlanning}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {plan.labGroups.length > 0 && (
              <p className="department-report-note" style={{ marginTop: 6 }}>
                Departments that share labs are planned together, so their hours are combined before rounding (rows in
                grey are shown for reference and are not added to the total).
              </p>
            )}
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Rooms each department uses</h3>
              <span className="muted">Hours a week and use of a 40-hour week</span>
            </div>
            <div className="cp-dept-grid">
              {plans.map((p) => (
                <div className="cp-dept" key={p.department}>
                  <div className="cp-dept-title">
                    {p.department}
                    <span className="muted">
                      {' '}
                      · {p.classroomsNow} classrooms, {p.labsNow} labs
                    </span>
                  </div>
                  {p.rooms.length === 0 && <p className="muted">No rooms.</p>}
                  {p.rooms.map((r) => (
                    <div className="cp-room" key={r.room}>
                      <span className="cp-room-name">
                        {r.room}
                        {r.kind === 'lab' && <span className="tag">lab</span>}
                      </span>
                      <Bar value={r.usePct} max={100} tone={r.kind === 'lab' ? 'green' : 'accent'} />
                      <span className="cp-room-value">
                        {r.hours}h · {r.usePct}%
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Timetabling</h3>
            </div>
            <ul className="facts-list" style={{ marginBottom: 10 }}>
              {plans.map((p) => (
                <li key={p.department}>
                  <strong>{p.department}</strong>: {p.tuesdayBreak.length} in-person classes in the Tuesday 12:00–14:00
                  break · {p.thursdayAfter2.length} on Thursday after 14:00
                  {p.week.thursdayTo14 ? '' : ' (allowed for this department)'} · {p.evening.length} evening classes after
                  18:00 · {p.onlineClasses} online classes ({p.hours.online}h, no room)
                </li>
              ))}
            </ul>
            {(
              [
                ['Classes in the Tuesday 12:00–14:00 break', plans.flatMap((p) => p.tuesdayBreak)],
                ['Classes on Thursday after 14:00', plans.flatMap((p) => p.thursdayAfter2)],
                ['Evening classes (after 18:00)', plans.flatMap((p) => p.evening)],
                ['Online classes', plans.flatMap((p) => p.online)]
              ] as [string, ClassBrief[]][]
            ).map(([title, rows]) => (
              <details className="cp-details" key={title}>
                <summary>
                  {title} <span className="count-pill">{rows.length}</span>
                </summary>
                <ClassTable rows={rows} showDept={many} />
              </details>
            ))}
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Students and staff</h3>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Students studying</th>
                    <th>Other student status</th>
                    <th>Instructors</th>
                    <th>Staff offices</th>
                    <th>Staff desks</th>
                    <th>Desks in use</th>
                    <th>HoD office</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => {
                    const st = plan.students?.find((s) => s.department === p.department);
                    const off = plan.offices?.find((f) => f.department === p.department);
                    return (
                      <tr key={p.department}>
                        <td className="strong">{p.department}</td>
                        <td>{st ? n(st.studying) : '–'}</td>
                        <td>
                          {st && Object.keys(st.other).length
                            ? Object.entries(st.other)
                                .map(([k, v]) => `${k} ${v}`)
                                .join(', ')
                            : '–'}
                        </td>
                        <td>{p.instructors}</td>
                        <td>{off ? off.staffOffices : '–'}</td>
                        <td>{off ? off.staffDesks : '–'}</td>
                        <td>{off ? `${off.staffUsed}${off.held ? ` (+${off.held} held)` : ''}` : '–'}</td>
                        <td>{off?.hod ? off.hod.office : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="department-report-note" style={{ marginTop: 6 }}>
              Instructors are everyone teaching a class of the department in the timetable, including part-time staff.
              {!plan.students && (
                <>
                  {' '}
                  <button className="btn-link" onClick={() => onOpenTab('students')}>
                    Load the student file
                  </button>{' '}
                  for student numbers.
                </>
              )}
              {!plan.offices && (
                <>
                  {' '}
                  <button className="btn-link" onClick={() => onOpenTab('space')}>
                    Add the facilities workbook
                  </button>{' '}
                  (optional, in the Space Report tab) for offices and desks.
                </>
              )}
            </p>
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h3>Every room used today</h3>
              <span className="muted">
                {plan.rooms.length} room codes · current users from every department ·{' '}
                <button className="btn-link" onClick={() => onOpenTab('rooms')}>
                  mark online rooms
                </button>
              </span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Current users (hours a week)</th>
                    <th>Selected</th>
                    <th>Total</th>
                    <th>Use of 40h week</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rooms.map((r, i) => (
                    <tr key={r.room} className={i > 0 && plan.rooms[i - 1].building !== r.building ? 'cp-group-start' : undefined}>
                      <td className="strong">
                        {r.room} {r.kind === 'lab' && <span className="tag">lab</span>}
                      </td>
                      <td>
                        {Object.entries(r.byDept)
                          .sort((a, b) => b[1] - a[1])
                          .map(([d, h]) => `${d} ${h}`)
                          .join(', ')}
                      </td>
                      <td>{r.selectedHours}</td>
                      <td>{r.total}</td>
                      <td className="cp-day">
                        <Bar value={r.usePct} max={100} tone={r.usePct > 100 ? 'red' : 'accent'} />
                        {r.usePct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="department-report-note" style={{ marginTop: 6 }}>
              {weeks.map(weekText).join(' · ')}. Online rooms ({Array.from(new Set([...config.onlineRooms, ...virtualRooms])).join(', ')}) are left
              out.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
