import type { ProcessedData } from '../types';
import { exportAllDataJSON } from '../utils/exporters';
import { TABS, type TabId } from '../tabs';

interface Props {
  data: ProcessedData;
  onOpenTab?: (tab: TabId) => void;
}

export default function StatsPanel({ data, onOpenTab }: Props) {
  const teacherCount = Object.keys(data.teachers).length;
  const classroomCount = Object.keys(data.classrooms).length;
  const sectionCount = Object.keys(data.courses).length;

  const items = [
    { label: 'Instructors', value: teacherCount },
    { label: 'Classrooms', value: classroomCount },
    { label: 'Sections', value: sectionCount },
    { label: 'Weekly classes', value: data.totalClasses },
    { label: 'Departments', value: data.departments.length }
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Overview</h2>
          <p className="panel-sub">What was found in the loaded timetable.</p>
        </div>
        <div className="panel-actions">
          <button className="btn-outline" onClick={() => exportAllDataJSON(data)}>
            ⬇️ Download all data (JSON)
          </button>
        </div>
      </div>

      <div className="stats">
        {items.map((item) => (
          <div className="stat-item" key={item.label}>
            <div className="stat-number">{item.value.toLocaleString()}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      {data.departments.length > 0 && (
        <div className="overview-departments">
          <span className="overview-label">Departments</span>
          {data.departments.map((d) => (
            <span className="dept-chip" key={d}>
              {d}
            </span>
          ))}
        </div>
      )}

      {onOpenTab && (
        <>
          <h3 className="overview-heading">What would you like to do?</h3>
          <div className="shortcut-grid">
            {TABS.filter((t) => t.id !== 'overview').map((t) => (
              <button key={t.id} className="shortcut-card" onClick={() => onOpenTab(t.id)}>
                <span className="shortcut-icon" aria-hidden>
                  {t.icon}
                </span>
                <span className="shortcut-title">{t.label}</span>
                <span className="shortcut-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
