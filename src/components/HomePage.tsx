import { useState } from 'react';
import type { ProcessedData } from '../types';
import { exportAllDataJSON } from '../utils/exporters';
import type { TabId } from '../tabs';

interface Props {
  data: ProcessedData;
  fileNames: string[];
  studentCount: number | null;
  onOpenTab: (tab: TabId) => void;
  onSearch: (query: string) => void;
}

// Start page: one search box, the key numbers, and a card for each section
// in the order they are used most.
export default function HomePage({ data, fileNames, studentCount, onOpenTab, onSearch }: Props) {
  const [query, setQuery] = useState('');
  const teachers = Object.keys(data.teachers).length;
  const rooms = Object.keys(data.classrooms).length;
  const sections = Object.keys(data.courses).length;

  const cards: { tab: TabId; icon: string; title: string; desc: string; stat: string }[] = [
    {
      tab: 'search',
      icon: '🔎',
      title: 'Find a class or room',
      desc: 'Where and when a class meets, a room’s or instructor’s week',
      stat: `${sections.toLocaleString()} sections · ${rooms} rooms`
    },
    {
      tab: 'departments',
      icon: '🏛️',
      title: 'Room use by department',
      desc: 'How each department uses its rooms, with PDF / Excel reports and the space report',
      stat: `${data.departments.length} departments`
    },
    {
      tab: 'campus',
      icon: '🧭',
      title: 'Campus plan',
      desc: 'Classrooms and labs needed, rooms used today, timetable issues, students and staff',
      stat: 'Pick departments'
    },
    {
      tab: 'availability',
      icon: '🕒',
      title: 'Instructor availability',
      desc: 'Who is free at a time, and a meeting time that suits a group',
      stat: `${teachers} instructors`
    },
    {
      tab: 'students',
      icon: '🎓',
      title: 'Students',
      desc: 'Status (OJT, suspended…), student timetables, clashes and class sizes',
      stat: studentCount !== null ? `${studentCount.toLocaleString()} students` : 'Add the student file'
    }
  ];

  return (
    <>
      <section className="panel home-hero">
        <h2>What are you looking for?</h2>
        <form
          className="home-search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(query.trim());
          }}
        >
          <input
            type="search"
            aria-label="Search the timetable"
            placeholder="Course code, room, instructor or student ID… e.g. CIDN1101, HL203"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
        <div className="home-meta">
          <span>
            📄 {fileNames.join(', ') || 'Timetable'} · {data.totalClasses.toLocaleString()} classes a week ·{' '}
            {teachers} instructors · {rooms} rooms
            {studentCount !== null ? ` · ${studentCount.toLocaleString()} students` : ''}
          </span>
          <button className="btn-link" onClick={() => exportAllDataJSON(data)}>
            Download all data (JSON)
          </button>
        </div>
      </section>

      <div className="home-cards">
        {cards.map((c) => (
          <button key={c.tab} className="home-card" onClick={() => onOpenTab(c.tab)}>
            <span className="home-card-icon" aria-hidden>
              {c.icon}
            </span>
            <span className="home-card-title">{c.title}</span>
            <span className="home-card-desc">{c.desc}</span>
            <span className="home-card-stat">{c.stat} →</span>
          </button>
        ))}
      </div>
    </>
  );
}
