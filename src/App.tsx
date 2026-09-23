import { useState } from 'react';
import FileUpload from './components/FileUpload';
import StatsPanel from './components/StatsPanel';
import TimeQuery from './components/TimeQuery';
import MeetingFinder from './components/MeetingFinder';
import ClassroomsSection from './components/ClassroomsSection';
import TeacherSchedules from './components/TeacherSchedules';
import { useScheduleData } from './hooks/useScheduleData';

export default function App() {
  const { data, loading, error, loadFiles } = useScheduleData();
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  return (
    <div className="container">
      <div className="header">
        <h1>📚 Teacher Schedule Analyzer</h1>
        <p>Upload your course schedule (CSV, Excel, or Oracle timetable export) to find when teachers are available and analyze classroom occupancy</p>
      </div>

      <FileUpload onFiles={(files) => loadFiles(files)} />

      {error && error !== dismissedError && (
        <div className="error" style={{ margin: '0 40px' }}>
          <strong>Error:</strong> {error}
          <button
            onClick={() => setDismissedError(error)}
            style={{ float: 'right', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Analyzing your schedule data...</p>
        </div>
      )}

      {!loading && data && data.totalClasses > 0 && (
        <div className="results-section">
          <StatsPanel data={data} />
          <TimeQuery teachers={data.teachers} />
          <MeetingFinder teachers={data.teachers} />
          <ClassroomsSection classrooms={data.classrooms} />
          <TeacherSchedules teachers={data.teachers} />
        </div>
      )}

      <footer className="app-footer">© Amjad Al Kharusi</footer>
    </div>
  );
}
