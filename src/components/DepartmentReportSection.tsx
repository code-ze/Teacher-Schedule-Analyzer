import { useMemo, useState } from 'react';
import type { CourseSection } from '../types';
import { buildDepartmentReport } from '../utils/departmentReport';
import {
  exportDepartmentReportExcel,
  exportDepartmentReportPDF,
  hourShareOfWeek,
  onlyLabel
} from '../utils/departmentReportExport';

function utilColor(pct: number): string {
  if (pct >= 75) return '#d32f2f';
  if (pct >= 40) return '#f57c00';
  return '#388e3c';
}

function hoursText(hours: Record<string, number>): string {
  return Object.keys(hours)
    .sort((a, b) => a.localeCompare(b))
    .map((d) => `${d} (${hours[d]}h)`)
    .join(', ');
}

interface Props {
  courses: Record<string, CourseSection>;
  departments: string[];
}

export default function DepartmentReportSection({ courses, departments }: Props) {
  const [selected, setSelected] = useState<string[]>(() =>
    departments.includes('Design') ? ['Design'] : departments.slice(0, 1)
  );
  const report = useMemo(
    () => (selected.length > 0 ? buildDepartmentReport(courses, selected) : null),
    [courses, selected]
  );

  if (departments.length === 0) return null;

  const toggle = (dept: string) =>
    setSelected((prev) => (prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]));

  const s = report?.summary;
  const single = selected.length === 1;
  const who = single ? selected[0] : 'The selected departments';

  return (
    <div className="department-utilization-section department-report-section">
      <div className="department-utilization-title">
        📑 Department Room Report
        {report && report.meetings.length > 0 && (
          <>
            <button className="export-pdf-btn" onClick={() => exportDepartmentReportPDF(report)}>
              📄 Download PDF
            </button>
            <button className="export-excel-btn" onClick={() => exportDepartmentReportExcel(report)}>
              📊 Download Excel
            </button>
          </>
        )}
      </div>

      <div className="department-report-picker">
        <span className="department-report-picker-label">Departments in the report:</span>
        {departments.map((d) => (
          <label key={d} className={`department-report-chip${selected.includes(d) ? ' selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(d)} onChange={() => toggle(d)} />
            {d}
          </label>
        ))}
        <button className="mf-btn-sm mf-btn-select-all" onClick={() => setSelected(departments)}>
          Select all
        </button>
        <button className="mf-btn-sm mf-btn-clear" onClick={() => setSelected([])}>
          Clear
        </button>
      </div>

      {!report || !s ? (
        <div className="no-common-time">Select at least one department.</div>
      ) : (
        <>
          <p className="department-report-headline">
            <strong>{who}</strong> {single ? 'teaches' : 'teach'} {s.weeklyClasses} classes ({s.weeklyHours} hours) a
            week in {s.rooms} rooms. These rooms are <strong>{s.totalUtilization}%</strong> used, and{' '}
            {single ? selected[0] : 'the selected departments'} {single ? 'has' : 'have'}{' '}
            <strong>{s.selectedShare}%</strong> of the booked time.
          </p>
          <p className="department-report-note">
            Available time = {report.days.length} days × 8 hours (08:00–16:00) = {report.capacityPerRoom} hours per
            room per week. <strong>1 hour = 12.5% of a room's day</strong> ({hourShareOfWeek(report)}% of its week).
            "Own rooms" are rooms no other department teaches in. The downloads also list key findings, every class,
            other departments' classes in these rooms, a weekly timetable per room and instructor loads.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="department-report-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Classes / wk</th>
                  <th>Hours / wk</th>
                  <th>Rooms</th>
                  <th>Own rooms</th>
                  <th>Own rooms used</th>
                  <th>Shared rooms</th>
                  <th>Its share of shared rooms</th>
                </tr>
              </thead>
              <tbody>
                {report.byDepartment.map((d) => (
                  <tr key={d.department}>
                    <td style={{ fontWeight: 600 }}>{d.department}</td>
                    <td>{d.weeklyClasses}</td>
                    <td>{d.weeklyHours}</td>
                    <td>{d.rooms}</td>
                    <td>{d.ownRooms.rooms.length}</td>
                    <td style={{ color: utilColor(d.ownRooms.totalUtilization), fontWeight: 600 }}>
                      {d.ownRooms.rooms.length ? `${d.ownRooms.totalUtilization}%` : '–'}
                    </td>
                    <td>{d.sharedRooms.rooms.length}</td>
                    <td>{d.sharedRooms.rooms.length ? `${d.sharedRooms.departmentShare}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="department-report-groups">
            {[
              { name: onlyLabel(report), totals: report.selectedOnlyRooms },
              { name: 'Shared with other departments', totals: report.sharedRooms }
            ].map(({ name, totals }) => (
              <div className="department-report-group" key={name}>
                <div className="department-report-group-name">{name}</div>
                <div className="department-report-group-value" style={{ color: utilColor(totals.totalUtilization) }}>
                  {totals.rooms.length ? `${totals.totalUtilization}%` : '–'}
                </div>
                <div className="department-report-group-meta">
                  {totals.rooms.length} rooms · {totals.selectedHours + totals.otherHours}h booked · {totals.freeHours}h
                  free
                </div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="department-report-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>{single ? `${selected[0]} hrs` : 'Selected departments'}</th>
                  <th>Other departments</th>
                  <th>Free hrs</th>
                  <th>Total use</th>
                </tr>
              </thead>
              <tbody>
                {report.rooms.map((r) => (
                  <tr key={r.room}>
                    <td style={{ fontWeight: 600 }}>{r.room}</td>
                    <td>{single ? r.selectedHours : hoursText(r.hoursByDepartment)}</td>
                    <td>{r.sharedWith.length === 0 ? '–' : hoursText(r.otherHours)}</td>
                    <td>{r.freeHours}</td>
                    <td style={{ color: utilColor(r.totalUtilization), fontWeight: 600 }}>{r.totalUtilization}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
