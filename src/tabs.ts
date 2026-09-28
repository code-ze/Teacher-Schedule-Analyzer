// Top-level sections of the app, shown as tabs once a timetable is loaded.
export type TabId = 'overview' | 'classes' | 'availability' | 'meeting' | 'rooms' | 'report' | 'instructors';

export const TABS: { id: TabId; icon: string; label: string; description: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview', description: 'Key numbers for the loaded timetable' },
  { id: 'classes', icon: '🔎', label: 'Find a Class', description: 'Where and when a class meets, its room and instructor' },
  { id: 'availability', icon: '🕒', label: 'Availability', description: 'Who has class at a time, and who is free in a time range' },
  { id: 'meeting', icon: '🗓️', label: 'Meeting Finder', description: 'Pick instructors and find a time they are all free' },
  { id: 'rooms', icon: '🏫', label: 'Rooms', description: 'Room occupancy by department, room and building' },
  { id: 'report', icon: '📑', label: 'Department Report', description: 'Room utilization report for one or more departments (PDF / Excel)' },
  { id: 'instructors', icon: '👩‍🏫', label: 'Instructors', description: 'Weekly schedule of every instructor' }
];
