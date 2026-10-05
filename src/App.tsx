import { useEffect, useMemo, useState } from 'react';
import FileUpload from './components/FileUpload';
import HomePage from './components/HomePage';
import SearchPage from './components/SearchPage';
import SubNav from './components/SubNav';
import TimeQuery from './components/TimeQuery';
import MeetingFinder from './components/MeetingFinder';
import ClassroomsSection from './components/ClassroomsSection';
import DepartmentReportSection from './components/DepartmentReportSection';
import SpaceReportSection from './components/SpaceReportSection';
import CampusPlanSection from './components/CampusPlanSection';
import StudentsSection from './components/StudentsSection';
import VirtualRoomsPanel from './components/VirtualRoomsPanel';
import AssignedRoomsPanel from './components/AssignedRoomsPanel';
import { buildStudentIndex } from './utils/students/students';
import type { DepartmentFacilities } from './utils/spaceReport/facilities';
import { loadVirtualRooms, saveVirtualRooms } from './utils/virtualRooms';
import { loadAssignedRooms, saveAssignedRooms } from './utils/assignedRooms';
import type { AssignedRoom } from './utils/departmentReport';
import { useScheduleData } from './hooks/useScheduleData';
import { TABS, type SearchScope, type TabId } from './tabs';

type DeptView = 'report' | 'use' | 'space';
type AvailView = 'free' | 'meeting';

const tabFromHash = (): TabId => {
  const id = window.location.hash.replace('#', '') as TabId;
  return TABS.some((t) => t.id === id) ? id : 'home';
};

export default function App() {
  const { data, loading, error, fileNames, students, studentFileName, loadFiles, clearStudents } = useScheduleData();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('classes');
  const [deptView, setDeptView] = useState<DeptView>('report');
  const [availView, setAvailView] = useState<AvailView>('free');
  const [studentFocus, setStudentFocus] = useState<{ id: string; at: number } | null>(null);
  const [virtualRooms, setVirtualRooms] = useState<string[]>(loadVirtualRooms);
  const [facilities, setFacilities] = useState<{ data: DepartmentFacilities[] | null; name: string }>({ data: null, name: '' });
  const [assignedRooms, setAssignedRooms] = useState<AssignedRoom[]>(loadAssignedRooms);
  const updateAssignedRooms = (rooms: AssignedRoom[]) => {
    setAssignedRooms(rooms);
    saveAssignedRooms(rooms);
  };
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
  const studentIndex = useMemo(
    () => (students && data ? buildStudentIndex(students, data.courses) : null),
    [students, data]
  );

  // Keep the open section in the address bar so the browser's Back button works.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const openTab = (id: TabId) => {
    setTab(id);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // On narrow screens the tab bar scrolls sideways; keep the chosen tab visible.
    document.getElementById(`tab-${id}`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (id === 'search') setTimeout(() => document.querySelector<HTMLInputElement>('.search-input')?.focus(), 50);
  };
  const openSearch = (query: string, scope?: SearchScope) => {
    setSearchQuery(query);
    if (scope) setSearchScope(scope);
    openTab('search');
  };
  const openDepartments = (view: DeptView) => {
    setDeptView(view);
    openTab('departments');
  };

  const roomSettings = data && (
    <>
      <VirtualRoomsPanel
        courses={data.courses}
        roomNames={Object.keys(data.classrooms).sort((a, b) => a.localeCompare(b))}
        virtualRooms={virtualRooms}
        onChange={updateVirtualRooms}
      />
      <AssignedRoomsPanel
        departments={data.departments}
        roomNames={Object.keys(data.classrooms)}
        assignedRooms={assignedRooms}
        onChange={updateAssignedRooms}
      />
    </>
  );

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <button className="brand" onClick={() => hasData && openTab('home')} aria-label="Home">
            <span className="brand-mark" aria-hidden>
              📚
            </span>
            <span className="brand-text">
              <span className="brand-title">Teacher Schedule Analyzer</span>
              <span className="brand-sub">Classes, rooms, instructors and students from your timetable</span>
            </span>
          </button>
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
                title={t.description}
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

        {!loading && !hasData && students && (
          <div className="empty-state" style={{ marginTop: 16 }}>
            🎓 Student data loaded ({students.students.length.toLocaleString()} students from {studentFileName}). Now drop
            the timetable to see it in the Students section.
          </div>
        )}
        {!loading && !hasData && <FileUpload onFiles={(files) => loadFiles(files)} />}

        {hasData && data && (
          <>
            <div hidden={tab !== 'home'}>
              <HomePage
                data={data}
                fileNames={fileNames}
                studentCount={students ? students.students.length : null}
                onOpenTab={openTab}
                onSearch={(q) => openSearch(q)}
              />
            </div>

            <div hidden={tab !== 'search'}>
              <SearchPage
                data={data}
                query={searchQuery}
                onQuery={setSearchQuery}
                scope={searchScope}
                onScope={setSearchScope}
                sectionSizes={studentIndex?.sectionSizes}
                studentIndex={studentIndex}
                onOpenStudent={(id) => {
                  setStudentFocus({ id, at: Date.now() });
                  openTab('students');
                }}
                onOpenStudentsTab={() => openTab('students')}
                roomProps={{ virtualRooms, onToggleVirtual: toggleVirtualRoom, assignedRooms }}
                roomSettings={roomSettings}
              />
            </div>

            <div hidden={tab !== 'availability'}>
              <SubNav
                label="Availability views"
                value={availView}
                onChange={setAvailView}
                items={[
                  { id: 'free', label: 'Who is free?', icon: '🕒' },
                  { id: 'meeting', label: 'Find a meeting time', icon: '🗓️' }
                ]}
              />
              <div hidden={availView !== 'free'}>
                <TimeQuery teachers={data.teachers} />
              </div>
              <div hidden={availView !== 'meeting'}>
                <MeetingFinder teachers={data.teachers} />
              </div>
            </div>

            <div hidden={tab !== 'departments'}>
              <SubNav
                label="Department views"
                value={deptView}
                onChange={setDeptView}
                items={[
                  { id: 'report', label: 'Room report', icon: '📑' },
                  { id: 'use', label: 'Room use at a glance', icon: '📊' },
                  { id: 'space', label: 'Space report (PDF)', icon: '🏢' }
                ]}
              />
              <div hidden={deptView !== 'report'}>
                <DepartmentReportSection
                  courses={data.courses}
                  departments={data.departments}
                  virtualRooms={virtualRooms}
                  assignedRooms={assignedRooms}
                  onManageVirtualRooms={() => openSearch('', 'rooms')}
                />
              </div>
              <div hidden={deptView !== 'use'}>
                <ClassroomsSection
                  classrooms={data.classrooms}
                  part="departments"
                  virtualRooms={virtualRooms}
                  assignedRooms={assignedRooms}
                />
              </div>
              <div hidden={deptView !== 'space'}>
                <SpaceReportSection
                  courses={data.courses}
                  departments={data.departments}
                  timetableName={fileNames.join(', ')}
                  facilities={facilities.data}
                  facilitiesName={facilities.name}
                  onFacilities={(f, name) => setFacilities({ data: f, name })}
                />
              </div>
            </div>

            <div hidden={tab !== 'campus'}>
              <CampusPlanSection
                courses={data.courses}
                departments={data.departments}
                virtualRooms={virtualRooms}
                students={students}
                facilities={facilities.data}
                onOpenTab={(t) =>
                  t === 'space' ? openDepartments('space') : t === 'rooms' ? openSearch('', 'rooms') : openTab(t)
                }
              />
            </div>

            <div hidden={tab !== 'students'}>
              <StudentsSection
                students={students}
                fileName={studentFileName}
                courses={data.courses}
                onFiles={(files) => loadFiles(files)}
                onClear={clearStudents}
                focus={studentFocus}
              />
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">© Amjad Al Kharusi</footer>
    </>
  );
}
