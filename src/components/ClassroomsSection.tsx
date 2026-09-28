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

const ROOM_PAGE_SIZE = 30;

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

interface CardProps {
  classroom: Classroom;
  isVirtual: boolean;
  onToggleVirtual?: (room: string) => void;
}

function ClassroomCard({ classroom, isVirtual, onToggleVirtual }: CardProps) {
  const [open, setOpen] = useState(false);
  const departments = Array.from(classroom.departments).sort((a, b) => a.localeCompare(b));
  const pct = classroom.occupancyPercentage ?? 0;

  return (
    <div className={`classroom-card${open ? ' open' : ''}${isVirtual ? ' virtual' : ''}`}>
      <button className="classroom-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="classroom-name">{classroom.name}</span>
        {isVirtual ? (
          <span className="occupancy-badge virtual-badge" title="Marked as a virtual / online room: not counted in utilization">
            💻 Virtual
          </span>
        ) : (
          <span className={`occupancy-badge occupancy-${classroom.occupancyCategory}`}>{pct}%</span>
        )}
        <span className="classroom-summary">
          {classroom.totalClasses} classes · {departments.join(', ') || 'No department'}
        </span>
        <span className="occupancy-bar">
          <span
            className="occupancy-fill"
            style={{ width: `${Math.min(pct, 100)}%`, background: occupancyColor(pct) }}
          />
        </span>
      </button>
      {open && (
        <div className="classroom-details">
          {onToggleVirtual && (
            <div className="virtual-toggle">
              <button className="btn-outline" onClick={() => onToggleVirtual(classroom.name)}>
                {isVirtual ? '🏫 Mark as a real room' : '💻 Mark as virtual / online room'}
              </button>
              {isVirtual && <span className="muted">Not counted in utilization or reports.</span>}
            </div>
          )}
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

interface Props {
  classrooms: Record<string, Classroom>;
  /** Placeholder rooms for online classes: shown, but left out of utilization. */
  virtualRooms?: string[];
  onToggleVirtual?: (room: string) => void;
}

export default function ClassroomsSection({ classrooms, virtualRooms = [], onToggleVirtual }: Props) {
  const virtualSet = useMemo(() => new Set(virtualRooms), [virtualRooms]);
  const allClassrooms = useMemo(() => withOccupancy(classrooms), [classrooms]);
  const departmentStats = useMemo(
    () =>
      computeDepartmentUtilization(
        Object.fromEntries(Object.entries(classrooms).filter(([name]) => !virtualSet.has(name)))
      ),
    [classrooms, virtualSet]
  );

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const toggleDept = (dept: string) =>
    setSelectedDepts((prev) => (prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]));
  const exportedStats = selectedDepts.length
    ? departmentStats.filter((d) => selectedDepts.includes(d.name))
    : departmentStats;
  const [roomSearch, setRoomSearch] = useState('');
  const [buildingSearch, setBuildingSearch] = useState('');

  const filteredClassrooms = useMemo(() => {
    let list = allClassrooms;
    if (selectedDepts.length > 0) {
      list = list.filter((c) => selectedDepts.some((d) => c.departments.has(d)));
    }
    const terms = roomSearch
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length > 0) {
      list = list.filter((c) => terms.some((t) => c.name.toLowerCase().includes(t)));
    }
    // Virtual rooms go last: their percentage isn't a real occupancy.
    return [...list].sort(
      (a, b) =>
        Number(virtualSet.has(a.name)) - Number(virtualSet.has(b.name)) ||
        (b.occupancyPercentage ?? 0) - (a.occupancyPercentage ?? 0)
    );
  }, [allClassrooms, selectedDepts, roomSearch, virtualSet]);

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
  const [limit, setLimit] = useState(ROOM_PAGE_SIZE);
  const visibleRooms = filteredClassrooms.slice(0, limit);

  return (
    <>
      <section className="panel department-utilization-section">
        <div className="panel-header">
          <div>
            <h2>Department room utilization</h2>
            <p className="panel-sub">
              Average use of each department's rooms (8 hours a day = 100%). Click cards to filter the rooms below —
              you can pick several.
            </p>
          </div>
          {departmentStats.length > 0 && (
            <div className="panel-actions">
              <button className="export-pdf-btn" onClick={() => exportDepartmentUtilizationPDF(exportedStats)}>
                📄 PDF
              </button>
              <button className="export-excel-btn" onClick={() => exportDepartmentUtilizationExcel(exportedStats)}>
                📊 Excel
              </button>
            </div>
          )}
        </div>
        {departmentStats.length === 0 ? (
          <div className="empty-state">No department data found in this file.</div>
        ) : (
          <div className="department-utilization-grid">
            {departmentStats.map((dept) => (
              <button
                key={dept.name}
                className={`department-card${selectedDepts.includes(dept.name) ? ' active' : ''}`}
                aria-pressed={selectedDepts.includes(dept.name)}
                onClick={() => {
                  toggleDept(dept.name);
                  setLimit(ROOM_PAGE_SIZE);
                }}
                title="Click to select or unselect this department (you can pick several)"
              >
                <span className="department-card-top">
                  <span className="department-card-name">{dept.name}</span>
                  <span className="department-card-pct" style={{ color: occupancyColor(dept.utilizationPercentage) }}>
                    {dept.utilizationPercentage}%
                  </span>
                </span>
                <span className="occupancy-bar">
                  <span
                    className="occupancy-fill"
                    style={{
                      width: `${Math.min(dept.utilizationPercentage, 100)}%`,
                      background: occupancyColor(dept.utilizationPercentage)
                    }}
                  />
                </span>
                <span className="department-card-meta">
                  <span>{dept.roomCount} rooms</span>
                  <span>{dept.totalClasses} classes/wk</span>
                  <span>{dept.teacherCount} instructors</span>
                  <span>{dept.maxDailyHours} room-hrs busiest day</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel classroom-occupancy-section" id="classroomSection">
        <div className="panel-header">
          <div>
            <h2>Rooms</h2>
            <p className="panel-sub">
              Busiest day per room (1 hour = 12.5%). Click a room to see its week.
            </p>
          </div>
          <div className="panel-actions">
            <button className="export-pdf-btn" onClick={() => exportClassroomsPDF(filteredClassrooms, virtualSet)}>
              📄 PDF
            </button>
            <button className="export-excel-btn" onClick={() => exportClassroomsExcel(filteredClassrooms, virtualSet)}>
              📊 Excel
            </button>
          </div>
        </div>

        <div className="filter-block">
          <div className="filter-label">Departments</div>
          <div className="department-report-picker">
            {departmentStats.map((d) => (
              <label key={d.name} className={`department-report-chip${selectedDepts.includes(d.name) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedDepts.includes(d.name)}
                  onChange={() => {
                    toggleDept(d.name);
                    setLimit(ROOM_PAGE_SIZE);
                  }}
                />
                {d.name}
              </label>
            ))}
            {selectedDepts.length > 0 && (
              <button className="btn-link" onClick={() => setSelectedDepts([])}>
                Clear filter
              </button>
            )}
          </div>
        </div>

        <div className="toolbar">
          <input
            id="classroomSearch"
            type="search"
            className="grow"
            aria-label="Search rooms"
            placeholder="🔍 Rooms, e.g. hl102, hl205 (comma-separated)"
            value={roomSearch}
            onChange={(e) => {
              setRoomSearch(e.target.value);
              setLimit(ROOM_PAGE_SIZE);
            }}
          />
          <input
            id="buildingSearch"
            type="search"
            className="building-input"
            aria-label="Building code"
            placeholder="🏢 Building code, e.g. hl"
            value={buildingSearch}
            onChange={(e) => setBuildingSearch(e.target.value)}
          />
          <span className="muted">
            {filteredClassrooms.length} {filteredClassrooms.length === 1 ? 'room' : 'rooms'} found
          </span>
        </div>

        {buildingPrefix && (
          <div className="subpanel">
            <div className="subpanel-header">
              <strong>
                🏢 Building <span className="upper">{buildingPrefix}</span> · {buildingResults.length} course(s)
              </strong>
              {buildingResults.length > 0 && (
                <span className="panel-actions">
                  <button className="export-pdf-btn" onClick={() => exportBuildingPDF(buildingPrefix, buildingResults)}>
                    📄 PDF
                  </button>
                  <button className="export-excel-btn" onClick={() => exportBuildingExcel(buildingPrefix, buildingResults)}>
                    📊 Excel
                  </button>
                </span>
              )}
            </div>
            {buildingResults.length === 0 ? (
              <div className="empty-state">
                No courses found in building “<strong className="upper">{buildingPrefix}</strong>”.
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Course name</th>
                      <th>Room</th>
                      <th>Days</th>
                      <th>Time</th>
                      <th>Instructor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildingResults.map((c, i) => (
                      <tr key={i}>
                        <td className="strong">{c.courseId}</td>
                        <td>{c.courseName}</td>
                        <td>{c.room}</td>
                        <td>{c.days.join(', ')}</td>
                        <td>{c.timeRange}</td>
                        <td>{c.teacher}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {filteredClassrooms.length === 0 ? (
          <div className="empty-state">No rooms match your search.</div>
        ) : (
          <div className="classroom-grid">
            {visibleRooms.map((classroom) => (
              <ClassroomCard
                classroom={classroom}
                key={classroom.name}
                isVirtual={virtualSet.has(classroom.name)}
                onToggleVirtual={onToggleVirtual}
              />
            ))}
          </div>
        )}
        {filteredClassrooms.length > limit && (
          <div className="show-more">
            <button className="btn-outline" onClick={() => setLimit((l) => l + ROOM_PAGE_SIZE * 2)}>
              Show more ({filteredClassrooms.length - limit} more)
            </button>
          </div>
        )}
      </section>
    </>
  );
}
