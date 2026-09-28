import { useMemo, useState } from 'react';
import type { CourseSection } from '../types';
import { suggestVirtualRooms } from '../utils/virtualRooms';

interface Props {
  courses: Record<string, CourseSection>;
  roomNames: string[];
  virtualRooms: string[];
  onChange: (rooms: string[]) => void;
}

// Lets the user mark placeholder rooms used for online classes (e.g. BO004) so
// they are left out of utilization figures and listed separately in reports.
export default function VirtualRoomsPanel({ courses, roomNames, virtualRooms, onChange }: Props) {
  const suggestions = useMemo(() => suggestVirtualRooms(courses), [courses]);
  const [newRoom, setNewRoom] = useState('');
  const marked = new Set(virtualRooms);
  const pending = suggestions.filter((s) => !marked.has(s.room));
  const known = new Map(roomNames.map((r) => [r.toLowerCase(), r]));

  const add = (room: string) => {
    if (!marked.has(room)) onChange([...virtualRooms, room].sort((a, b) => a.localeCompare(b)));
  };
  const remove = (room: string) => onChange(virtualRooms.filter((r) => r !== room));
  const addTyped = () => {
    const room = known.get(newRoom.trim().toLowerCase());
    if (room) {
      add(room);
      setNewRoom('');
    }
  };
  const typedIsValid = known.has(newRoom.trim().toLowerCase());

  return (
    <section className="panel virtual-rooms-panel">
      <div className="panel-header">
        <div>
          <h2>Virtual / online rooms</h2>
          <p className="panel-sub">
            Placeholder rooms used for online classes. Marked rooms are left out of every utilization figure and
            report, and their classes are listed separately as online classes. Saved in this browser.
          </p>
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-label">Marked as virtual</div>
        <div className="virtual-list">
          {virtualRooms.length === 0 && <span className="muted">None yet.</span>}
          {virtualRooms.map((room) => (
            <span className="virtual-chip" key={room}>
              💻 {room}
              {!known.has(room.toLowerCase()) && <span className="muted"> (not in this file)</span>}
              <button aria-label={`Unmark ${room}`} onClick={() => remove(room)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="filter-block">
          <div className="filter-label">Suggested — more than one class at the same time</div>
          <div className="suggestion-list">
            {pending.map((s) => (
              <div className="suggestion" key={s.room}>
                <div>
                  <strong>{s.room}</strong>
                  <span className="muted">
                    {' '}
                    · up to {s.maxConcurrent} classes at once · {s.classes} classes/wk · {s.departments.join(', ')}
                  </span>
                </div>
                <button className="btn-outline" onClick={() => add(s.room)}>
                  Mark as virtual
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <input
          type="search"
          list="all-room-names"
          aria-label="Room to mark as virtual"
          placeholder="Add another room, e.g. BO004"
          value={newRoom}
          onChange={(e) => setNewRoom(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && addTyped()}
        />
        <datalist id="all-room-names">
          {roomNames.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <button className="btn" onClick={addTyped} disabled={!typedIsValid}>
          Mark as virtual
        </button>
        {virtualRooms.length > 0 && (
          <button className="btn-link" onClick={() => onChange([])}>
            Clear all
          </button>
        )}
      </div>
    </section>
  );
}
