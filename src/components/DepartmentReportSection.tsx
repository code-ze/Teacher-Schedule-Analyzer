import { useMemo, useState } from 'react';
import type { CourseSection } from '../types';
import { buildDepartmentReport } from '../utils/departmentReport';
import { exportDepartmentReportExcel, exportDepartmentReportPDF, hourShareOfWeek } from '../utils/departmentReportExport';

function utilColor(pct: number): string {
  if (pct >= 75) return '#d32f2f';
  if (pct >= 40) return '#f57c00';
  return '#388e3c';
}

interface Props {
  courses: Record<string, CourseSection>;
  departments: string[];
}

export default function DepartmentReportSection({ courses, departments }: Props) {
  const [department, setDepartment] = useState<string>(
    departments.includes('Design') ? 'Design' : departments[0] ?? ''
  );
  const report = useMemo(
    () => (department ? buildDepartmentReport(courses, department) : null),
    [courses, department]
  );

  if (departments.length === 0) return null;

  const s = report?.summary;

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

      <div className="department-filter-bar">
        <label htmlFor="deptReportSelect" style={{ fontWeight: 600, color: '#1565c0' }}>
          Department:
        </label>
        <select id="deptReportSelect" value={department} onChange={(e) => setDepartment(e.target.value)}>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {report && s && (
        <>
          <p className="department-report-headline">
            <strong>{department}</strong> teaches {s.weeklyClasses} classes ({s.weeklyHours} hours) a week in{' '}
            {s.rooms} rooms. It uses <strong>{s.departmentUtilization}%</strong> of those rooms' available time;
            counting other departments they are <strong>{s.totalUtilization}%</strong> used.{' '}
            {s.sharedRooms} of the {s.rooms} rooms are shared with other departments.
          </p>
          <p className="department-report-note">
            Available time = {report.days.length} days × 8 hours (08:00–16:00) = {report.capacityPerRoom} hours per
            room per week. <strong>1 hour = 12.5% of a room's day</strong> ({hourShareOfWeek(report)}% of its week), so
            the total hours matter more than the exact class times. The downloads also list every class, the other departments' classes in these rooms, a
            weekly timetable per room and instructor loads.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="department-report-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>{department} hrs</th>
                  <th>Other depts hrs</th>
                  <th>Free hrs</th>
                  <th>Total use</th>
                  <th>{department} share</th>
                  <th>Shared with</th>
                </tr>
              </thead>
              <tbody>
                {report.rooms.map((r) => (
                  <tr key={r.room}>
                    <td style={{ fontWeight: 600 }}>{r.room}</td>
                    <td>{r.departmentHours}</td>
                    <td>{r.otherHoursTotal}</td>
                    <td>{r.freeHours}</td>
                    <td style={{ color: utilColor(r.totalUtilization), fontWeight: 600 }}>{r.totalUtilization}%</td>
                    <td>{r.departmentShare}%</td>
                    <td>
                      {r.sharedWith.length === 0
                        ? `Only ${department}`
                        : r.sharedWith.map((d) => `${d} (${r.otherHours[d]}h)`).join(', ')}
                    </td>
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
