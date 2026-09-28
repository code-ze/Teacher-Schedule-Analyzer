import { useState } from 'react';
import FileUpload from './components/FileUpload';
import StatsPanel from './components/StatsPanel';
import TimeQuery from './components/TimeQuery';
import CourseSearch from './components/CourseSearch';
import MeetingFinder from './components/MeetingFinder';
import ClassroomsSection from './components/ClassroomsSection';
import DepartmentReportSection from './components/DepartmentReportSection';
import TeacherSchedules from './components/TeacherSchedules';
import VirtualRoomsPanel from './components/VirtualRoomsPanel';
import { loadVirtualRooms, saveVirtualRooms } from './utils/virtualRooms';
import { useScheduleData } from './hooks/useScheduleData';
import { TABS, type TabId } from './tabs';

export default function App() {
  const { data, loading, error, fileNames, loadFiles } = useScheduleData();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [virtualRooms, setVirtualRooms] = useState<string[]>(loadVirtualRooms);
  const updateVirtualRooms = (rooms: string[]) => {
    setVirtualRooms(rooms);
    saveVirtualRooms(rooms);
  };
  const toggleVirtualRoom = (room: string) =>
    updateVirtualRooms(
      virtualRooms.includes(room)
        ? virtualRooms.filter((r) => r !== room)
        : [...virtualRooms, room].sort((a, b) => a.localeCompare(b))
    );
  const hasData = !loading && !!data && data.totalClasses > 0;

  const openTab = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // On narrow screens the tab bar scrolls sideways; keep the chosen tab visible.
    document.getElementById(`tab-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              📚
            </span>
            <div>
              <h1>Teacher Schedule Analyzer</h1>
              <p>Instructor availability, meeting times and room utilization from your timetable</p>
            </div>
          </div>
          {hasData && <FileUpload compact fileNames={fileNames} onFiles={(files) => loadFiles(files)} />}
        </div>
      </header>

      {hasData && (
        <nav className="tabs" aria-label="Sections">
          <div className="tabs-inner">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                className={`tab${tab === t.id ? ' active' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => openTab(t.id)}
              >
                <span aria-hidden>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="container">
        {error && error !== dismissedError && (
          <div className="error" role="alert">
            <span>
              <strong>Error:</strong> {error}
            </span>
            <button className="error-close" aria-label="Dismiss" onClick={() => setDismissedError(error)}>
              ✕
            </button>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Analyzing your schedule data…</p>
          </div>
        )}

        {!loading && !hasData && <FileUpload onFiles={(files) => loadFiles(files)} />}

        {hasData && data && (
          <>
            <div hidden={tab !== 'overview'}>
              <StatsPanel data={data} onOpenTab={openTab} />
            </div>
            <div hidden={tab !== 'classes'}>
              <CourseSearch courses={data.courses} departments={data.departments} />
            </div>
            <div hidden={tab !== 'availability'}>
              <TimeQuery teachers={data.teachers} />
            </div>
            <div hidden={tab !== 'meeting'}>
              <MeetingFinder teachers={data.teachers} />
            </div>
            <div hidden={tab !== 'rooms'}>
              <VirtualRoomsPanel
                courses={data.courses}
                roomNames={Object.keys(data.classrooms).sort((a, b) => a.localeCompare(b))}
                virtualRooms={virtualRooms}
                onChange={updateVirtualRooms}
              />
              <ClassroomsSection
                classrooms={data.classrooms}
                virtualRooms={virtualRooms}
                onToggleVirtual={toggleVirtualRoom}
              />
            </div>
            <div hidden={tab !== 'report'}>
              <DepartmentReportSection
                courses={data.courses}
                departments={data.departments}
                virtualRooms={virtualRooms}
                onManageVirtualRooms={() => openTab('rooms')}
              />
            </div>
            <div hidden={tab !== 'instructors'}>
              <TeacherSchedules teachers={data.teachers} />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">© Amjad Al Kharusi</footer>
    </>
  );
}
