import type { ProcessedData } from '../types';
import { exportAllDataJSON } from '../utils/exporters';

export default function StatsPanel({ data }: { data: ProcessedData }) {
  const teacherCount = Object.keys(data.teachers).length;
  const classroomCount = Object.keys(data.classrooms).length;
  const sectionCount = Object.keys(data.courses).length;

  const items = [
    { label: 'Instructors', value: teacherCount },
    { label: 'Classrooms', value: classroomCount },
    { label: 'Sections', value: sectionCount },
    { label: 'Weekly Classes', value: data.totalClasses },
    { label: 'Departments', value: data.departments.length }
  ];

  return (
    <>
      <div className="stats">
        {items.map((item) => (
          <div className="stat-item" key={item.label}>
            <div className="stat-number">{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 30 }}>
        <button className="export-json-btn" onClick={() => exportAllDataJSON(data)}>
          ⬇️ Download All Data (JSON)
        </button>
      </div>
    </>
  );
}
