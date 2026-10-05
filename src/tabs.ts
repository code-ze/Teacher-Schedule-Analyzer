// Top-level sections of the app, shown as tabs once a timetable is loaded.
export type TabId = 'home' | 'search' | 'availability' | 'departments' | 'campus' | 'students';

export const TABS: { id: TabId; icon: string; label: string; description: string }[] = [
  { id: 'home', icon: '🏠', label: 'Home', description: 'Key numbers and shortcuts' },
  { id: 'search', icon: '🔎', label: 'Search', description: 'Find a class, room, instructor or student and see their week' },
  { id: 'availability', icon: '🕒', label: 'Availability', description: 'Who is free at a time, and a meeting time for chosen instructors' },
  { id: 'departments', icon: '🏛️', label: 'Departments', description: 'Room use per department, room reports and the space report (PDF / Excel)' },
  { id: 'campus', icon: '🧭', label: 'Campus Plan', description: 'Consolidation figures: classrooms and labs needed, rooms, students and staff' },
  { id: 'students', icon: '🎓', label: 'Students', description: 'Student status, timetables, clashes, class sizes and time on campus' }
];

/** Sub-views inside a section. */
export type SearchScope = 'classes' | 'instructors' | 'rooms' | 'students';
