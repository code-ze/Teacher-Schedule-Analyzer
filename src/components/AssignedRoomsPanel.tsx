import { useState } from 'react';
import type { AssignedRoom } from '../utils/departmentReport';

interface Props {
  departments: string[];
  /** Rooms that appear in the loaded timetable. */
  roomNames: string[];
  assignedRooms: AssignedRoom[];
  onChange: (rooms: AssignedRoom[]) => void;
}

// Rooms that belong to a department but have no classes this semester (e.g.
// HL103 for Design). Adding them keeps them in utilization as free capacity.
export default function AssignedRoomsPanel({ departments, roomNames, assignedRooms, onChange }: Props) {
  const [room, setRoom] = useState('');
  const [depts, setDepts] = useState<string[]>([]);
  const inFile = new Set(roomNames.map((r) => r.toLowerCase()));
  const name = room.trim().toUpperCase();
  const alreadyScheduled = name !== '' && inFile.has(name.toLowerCase());
  const alreadyAdded = assignedRooms.some((a) => a.room.toLowerCase() === name.toLowerCase());
  const canAdd = name !== '' && depts.length > 0 && !alreadyScheduled && !alreadyAdded;

  const toggleDept = (d: string) => setDepts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const add = () => {
    if (!canAdd) return;
    onChange([...assignedRooms, { room: name, departments: [...depts].sort((a, b) => a.localeCompare(b)) }].sort((a, b) => a.room.localeCompare(b.room)));
    setRoom('');
    setDepts([]);
  };

  return (
    <section className="panel assigned-rooms-panel">
      <div className="panel-header">
        <div>
          <h2>Rooms with no classes this semester</h2>
          <p className="panel-sub">
            Rooms that belong to a department but have nothing scheduled don’t appear in the timetable. Add them here
            so they count as free capacity in utilization and reports. Saved in this browser.
          </p>
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-label">Added rooms</div>
        <div className="virtual-list">
          {assignedRooms.length === 0 && <span className="muted">None yet.</span>}
          {assignedRooms.map((a) => (
            <span className="virtual-chip" key={a.room}>
              🏫 {a.room} · {a.departments.join(', ')}
              {inFile.has(a.room.toLowerCase()) && <span className="muted"> (has classes in this file)</span>}
              <button aria-label={`Remove ${a.room}`} onClick={() => onChange(assignedRooms.filter((x) => x.room !== a.room))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-label">Add a room</div>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <input
            type="text"
            aria-label="Room name"
            placeholder="Room, e.g. HL103"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn" onClick={add} disabled={!canAdd}>
            Add room
          </button>
          {alreadyScheduled && <span className="muted">{name} already has classes in this file, so it is already counted.</span>}
          {alreadyAdded && <span className="muted">{name} is already added.</span>}
        </div>
        <div className="department-report-picker">
          <span className="muted">Belongs to:</span>
          {departments.map((d) => (
            <label key={d} className={`department-report-chip${depts.includes(d) ? ' selected' : ''}`}>
              <input type="checkbox" checked={depts.includes(d)} onChange={() => toggleDept(d)} />
              {d}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
