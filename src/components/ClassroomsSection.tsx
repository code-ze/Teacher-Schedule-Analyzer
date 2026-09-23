import { useMemo, useState } from 'react';
import { WORK_DAYS, DISPLAY_HOURS, extractClassId } from '../config';
import type { Classroom } from '../types';
import { computeDepartmentUtilization } from '../utils/departmentUtilization';
import {
  exportBuildingExcel,
  exportBuildingPDF,
  exportClassroomsExcel,
  exportClassroomsPDF,
  exportDepartmentUtilizationExcel,
  exportDepartmentUtilizationPDF,
  type BuildingCourseRow
} from '../utils/exporters';

function occupancyCategory(pct: number): 'high' | 'medium' | 'low' {
  if (pct >= 75) return 'high';
  if (pct >= 40) return 'medium';
  return 'low';
}

function occupancyColor(pct: number): string {
  if (pct >= 75) return '#d32f2f';
  if (pct >= 40) return '#f57c00';
  return '#388e3c';
}

function withOccupancy(classrooms: Record<string, Classroom>): Classroom[] {
  return Object.values(classrooms).map((classroom) => {
    let maxDailyHours = 0;
    WORK_DAYS.forEach((day) => {
      let dailyHours = 0;
      DISPLAY_HOURS.forEach((h) => {
        if (classroom.schedule[day]?.[h]?.isOccupied) dailyHours++;
      });
      maxDailyHours = Math.max(maxDailyHours, dailyHours);
    });
    const occupancyPercentage = parseFloat((maxDailyHours * 12.5).toFixed(1));
    return { ...classroom, occupancyPercentage, occupancyCategory: occupancyCategory(occupancyPercentage) };
  });
}

function ClassroomCard({ classroom }: { classroom: Classroom }) {
  const [open, setOpen] = useState(false);
  const departments = Array.from(classroom.departments).sort((a, b) => a.localeCompare(b));
  const pct = classroom.occupancyPercentage ?? 0;

  return (
    <div className="classroom-card">
      <div className="classroom-header" onClick={() => setOpen((o) => !o)}>
        <div className="classroom-name">{classroom.name}</div>
        <div className={`occupancy-badge occupancy-${classroom.occupancyCategory}`}>{pct}%</div>
      </div>
      {open && (
        <div className="classroom-details expanded">
          {departments.length > 0 && (
            <div className="classroom-departments">
              <span className="departments-label">🏛️ Departments using this room:</span>
              {departments.map((d) => (
                <span className="dept-chip" key={d}>
                  {d}
                </span>
              ))}
            </div>
          )}

          <div className="occupancy-bar">
            <div
              className="occupancy-fill"
              style={{ width: `${Math.min(pct, 100)}%`, background: occupancyColor(pct) }}
            />
          </div>

          <div className="occupancy-stats">
            <div className="stat-box">
              <div className="stat-value">
                {Math.max(
                  0,
                  ...WORK_DAYS.map((day) =>
                    DISPLAY_HOURS.filter((h) => classroom.schedule[day]?.[h]?.isOccupied).length
                  )
                )}
                h
              </div>
              <div className="stat-label-small">Max Daily Hours</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{classroom.totalClasses}</div>
              <div className="stat-label-small">Total Classes</div>
            </div>
          </div>

          <div className="daily-schedule">
            {WORK_DAYS.map((day) => {
              const daySchedule = classroom.schedule[day];
              const dailyHours = DISPLAY_HOURS.filter((h) => daySchedule?.[h]?.isOccupied).length;
              const dailyPct = (dailyHours * 12.5).toFixed(1);
              return (
                <div className="day-schedule" key={day}>
                  <div className="day-name">
                    {day} ({dailyPct}%)
                  </div>
                  <div className="time-blocks">
                    {DISPLAY_HOURS.map((hour) => {
                      const slot = daySchedule?.[hour];
                      const occupied = !!slot?.isOccupied;
                      const tooltip = occupied
                        ? `${slot?.timeRange || hour}\n${slot?.classId || ''} • ${classroom.name}\n${slot?.course || ''}\nLecturer: ${slot?.teacher || ''}`
                        : `${hour}: Free`;
                      return (
                        <div
                          key={hour}
                          className={`time-block ${occupied ? 'occupied' : 'free'} has-tooltip`}
                          data-tooltip={tooltip}
                        />
                      );
                    })}
                  </div>
                  <div className="time-labels">
                    {DISPLAY_HOURS.map((hour) => (
                      <div className="time-label" key={hour}>
                        {hour.substring(0, 2)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClassroomsSection({ classrooms }: { classrooms: Record<string, Classroom> }) {
  const allClassrooms = useMemo(() => withOccupancy(classrooms), [classrooms]);
  const departmentStats = useMemo(() => computeDepartmentUtilization(classrooms), [classrooms]);

  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [roomSearch, setRoomSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');

  const filteredClassrooms = useMemo(() => {
    let list = allClassrooms;
    if (selectedDept !== 'ALL') {
      list = list.filter((c) => c.departments.has(selectedDept));
    }
    const terms = roomSearch
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length > 0) {
      list = list.filter((c) => terms.some((t) => c.name.toLowerCase().includes(t)));
    }
    return [...list].sort((a, b) => (b.occupancyPercentage ?? 0) - (a.occupancyPercentage ?? 0));
  }, [allClassrooms, selectedDept, roomSearch]);

  const buildingResults: BuildingCourseRow[] = useMemo(() => {
    const prefix = buildingSearch.trim().toLowerCase();
    if (!prefix) return [];
    const courseMap: Record<string, BuildingCourseRow> = {};
    Object.values(classrooms).forEach((classroom) => {
      if (!classroom.name.toLowerCase().startsWith(prefix)) return;
      WORK_DAYS.forEach((day) => {
        DISPLAY_HOURS.forEach((hour) => {
          const slot = classroom.schedule[day]?.[hour];
          if (!slot || !slot.isOccupied) return;
          const courseId = slot.classId || (slot.course ? extractClassId(slot.course) : '') || slot.course || '';
          const key = `${courseId}||${classroom.name}`;
          if (!courseMap[key]) {
            courseMap[key] = {
              courseId,
              courseName: slot.course || '',
              room: classroom.name,
              teacher: slot.teacher || '',
              timeRange: slot.timeRange || hour,
              days: []
            };
          }
          if (!courseMap[key].days.includes(day)) courseMap[key].days.push(day);
        });
      });
    });
    return Object.values(courseMap).sort(
      (a, b) => a.room.localeCompare(b.room) || a.courseId.localeCompare(b.courseId)
    );
  }, [classrooms, buildingSearch]);

  const buildingPrefix = buildingSearch.trim();

  return (
    <>
      <div className="department-utilization-section">
        <div className="department-utilization-title">
          🏛️ Department Room Utilization
          {departmentStats.length > 0 && (
            <>
              <button className="export-pdf-btn" onClick={() => exportDepartmentUtilizationPDF(departmentStats)}>
                📄 Export PDF
              </button>
              <button className="export-excel-btn" onClick={() => exportDepartmentUtilizationExcel(departmentStats)}>
                📊 Export Excel
              </button>
            </>
          )}
        </div>
        {departmentStats.length === 0 ? (
          <div className="no-common-time">No department data found in this file.</div>
        ) : (
          <div className="department-utilization-grid">
            {departmentStats.map((dept) => (
              <div
                key={dept.name}
                className={`department-card${selectedDept === dept.name ? ' active' : ''}`}
                onClick={() => setSelectedDept((prev) => (prev === dept.name ? 'ALL' : dept.name))}
                title="Click to filter classrooms below by this department"
              >
                <div className="department-card-name">{dept.name}</div>
                <div className="occupancy-bar">
                  <div
                    className="occupancy-fill"
                    style={{
                      width: `${Math.min(dept.utilizationPercentage, 100)}%`,
                      background: occupancyColor(dept.utilizationPercentage)
                    }}
                  />
                </div>
                <div className="department-card-meta">
                  <span>{dept.utilizationPercentage}% avg room use</span>
                  <span>{dept.maxDailyHours} room-hrs on busiest day</span>
                  <span>{dept.totalClasses} sections/wk</span>
                  <span>{dept.teacherCount} instructors</span>
                  <span>{dept.roomCount} rooms</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="classroom-occupancy-section" id="classroomSection">
        <div className="classroom-title">
          📚 Classroom Occupancy Analysis
          <button className="export-pdf-btn" onClick={() => exportClassroomsPDF(filteredClassrooms)}>
            📄 Export PDF
          </button>
          <button className="export-excel-btn" onClick={() => exportClassroomsExcel(filteredClassrooms)}>
            📊 Export Excel
          </button>
        </div>

        <div className="search-filter-container" style={{ border: '1px solid #7e57c2' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#4527a0', marginBottom: 8 }}>
            🏛️ Filter by Department
          </label>
          <div className="department-filter-bar">
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departmentStats.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            {selectedDept !== 'ALL' && (
              <button className="btn" onClick={() => setSelectedDept('ALL')} style={{ padding: '8px 18px' }}>
                Clear filter
              </button>
            )}
          </div>
        </div>

        <div className="search-filter-container" style={{ border: '1px solid #ff9800' }}>
          <label htmlFor="classroomSearch" style={{ display: 'block', fontWeight: 600, color: '#e65100', marginBottom: 8 }}>
            🔍 Search Classrooms (e.g., hl102, hl205)
          </label>
          <input
            id="classroomSearch"
            type="text"
            placeholder="Enter classroom names separated by commas (e.g., hl102, hl205, hl301)"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #ff9800', borderRadius: 8, fontSize: 14 }}
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
          />
          <div style={{ marginTop: 8, fontSize: '0.85em', color: '#666' }}>
            💡 Tip: You can search for multiple classrooms by separating them with commas
          </div>
        </div>

        <div className="search-filter-container" style={{ border: '1px solid #4caf50' }}>
          <label htmlFor="buildingSearch" style={{ display: 'block', fontWeight: 600, color: '#2e7d32', marginBottom: 8 }}>
            🏢 Search Courses by Building (enter first 2 letters, e.g., hl)
          </label>
          <input
            id="buildingSearch"
            type="text"
            placeholder="Enter building code (e.g., hl, ms, ab)..."
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #4caf50', borderRadius: 8, fontSize: 14 }}
            value={buildingSearch}
            onChange={(e) => setBuildingSearch(e.target.value)}
          />
          <div style={{ marginTop: 8, fontSize: '0.85em', color: '#666' }}>
            💡 Shows all courses held in rooms of that building
          </div>
        </div>

        {buildingPrefix && (
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #4caf50', padding: 16, marginBottom: 20 }}>
            <div
              style={{
                fontWeight: 700,
                color: '#2e7d32',
                fontSize: '1.1em',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8
              }}
            >
              <span>
                🏢 Building <span style={{ textTransform: 'uppercase' }}>{buildingPrefix}</span> — {buildingResults.length}{' '}
                course(s) found
              </span>
              {buildingResults.length > 0 && (
                <span>
                  <button className="export-pdf-btn" onClick={() => exportBuildingPDF(buildingPrefix, buildingResults)}>
                    📄 Download PDF
                  </button>{' '}
                  <button className="export-excel-btn" onClick={() => exportBuildingExcel(buildingPrefix, buildingResults)}>
                    📊 Download Excel
                  </button>
                </span>
              )}
            </div>
            {buildingResults.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#555' }}>
                No courses found in building "<strong>{buildingPrefix.toUpperCase()}</strong>".
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#e8f5e9' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Course ID</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Course Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Room</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Days</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Time</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#2e7d32' }}>Instructor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildingResults.map((c, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>{c.courseId}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{c.courseName}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{c.room}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{c.days.join(', ')}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{c.timeRange}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{c.teacher}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {filteredClassrooms.length === 0 ? (
          <div className="no-common-time" style={{ textAlign: 'center', padding: 20 }}>
            No classrooms found matching your search criteria.
          </div>
        ) : (
          <div className="classroom-grid">
            {filteredClassrooms.map((classroom) => (
              <ClassroomCard classroom={classroom} key={classroom.name} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
