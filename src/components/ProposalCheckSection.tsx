import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { CourseSection } from '../types';
import type { DepartmentFacilities } from '../utils/spaceReport/facilities';
import type { StudentData } from '../utils/students/students';
import { checkProposal, type CheckRow, type CheckStatus } from '../utils/proposalCheck';

// TEMPORARY tab: the DAVCAA consolidation proposal's figures next to the loaded data.

interface Props {
  courses: Record<string, CourseSection>;
  virtualRooms: string[];
  students: StudentData | null;
  facilities: DepartmentFacilities[] | null;
  onOpenStudents: () => void;
  onOpenSpace: () => void;
}

const BADGE: Record<CheckStatus, { text: string; cls: string }> = {
  match: { text: '✓ Matches', cls: 'pc-match' },
  differs: { text: '✗ Differs', cls: 'pc-differs' },
  open: { text: '? To check', cls: 'pc-open' }
};

const show = (v: string | number | null) => (v === null ? '—' : typeof v === 'number' ? v.toLocaleString() : v);
const hoursText = (o: Record<string, number>) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([d, h]) => `${d} ${h}`)
    .join(', ') || '—';

type Filter = 'all' | 'differs' | 'design';

export default function ProposalCheckSection({ courses, virtualRooms, students, facilities, onOpenStudents, onOpenSpace }: Props) {
  const check = useMemo(() => checkProposal({ courses, virtualRooms, students, facilities }), [courses, virtualRooms, students, facilities]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [roomsDiffOnly, setRoomsDiffOnly] = useState(false);

  const count = (s: CheckStatus) => check.rows.filter((r) => r.status === s).length;
  const terms = q.trim().toLowerCase();
  const rows = check.rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'differs' ? r.status !== 'match' : r.design)) &&
      (!terms || `${r.section} ${r.item} ${r.doc} ${r.ours ?? ''} ${r.note ?? ''}`.toLowerCase().includes(terms))
  );
  const sections = Array.from(new Set(rows.map((r) => r.section)));
  const roomDiffs = check.rooms.filter((r) => r.status !== 'match').length;
  const rooms = roomsDiffOnly ? check.rooms.filter((r) => r.status !== 'match') : check.rooms;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const figs = XLSX.utils.json_to_sheet(
      check.rows.map((r: CheckRow) => ({
        Section: r.section,
        Item: r.item,
        'Proposal (Word)': r.doc,
        'Our data': r.ours ?? '',
        Result: BADGE[r.status].text.slice(2),
        Design: r.design ? 'Yes' : '',
        Note: r.note ?? ''
      }))
    );
    figs['!cols'] = [{ wch: 22 }, { wch: 60 }, { wch: 22 }, { wch: 40 }, { wch: 10 }, { wch: 7 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, figs, 'Figures');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        check.rooms.map((r) => ({
          Room: r.room,
          'Proposal hours': hoursText(r.doc),
          'Proposal total': r.docTotal,
          'Timetable hours': hoursText(r.ours),
          'Timetable total': r.oursTotal,
          Result: BADGE[r.status].text.slice(2)
        }))
      ),
      'Appendix rooms'
    );
    XLSX.writeFile(wb, 'Proposal-Check.xlsx');
  };

  return (
    <section className="panel">
      <div className="pc-banner">
        🧪 <strong>Temporary check</strong> of the DAVCAA <em>Campus Consolidation Proposal</em> (final draft, October
        2026). Each figure in the Word file is set next to what the loaded files give. This tab will be removed after the
        review.
      </div>
      <div className="panel-header">
        <div>
          <h2>Proposal check</h2>
          <p className="panel-sub">
            “Our data” comes from the timetable
            {students ? ', the student file' : ''}
            {facilities ? ' and the facilities workbook' : ''}. Business keeps Thursday afternoon; HL101 counts as a
            Design lab.
          </p>
        </div>
        <div className="panel-actions">
          <button className="export-excel-btn" onClick={exportExcel}>
            📊 Download Excel
          </button>
        </div>
      </div>

      {(!students || !facilities) && (
        <div className="cp-callout">
          Some figures need more files:{' '}
          {!students && (
            <button className="btn-link" onClick={onOpenStudents}>
              add the student file
            </button>
          )}
          {!students && !facilities && ' and '}
          {!facilities && (
            <button className="btn-link" onClick={onOpenSpace}>
              add the facilities workbook
            </button>
          )}
          . Until then those rows show “? To check”.
        </div>
      )}

      <div className="pc-summary">
        <button className="pc-pill pc-match" onClick={() => setFilter('all')}>
          ✓ {count('match')} match
        </button>
        <button className="pc-pill pc-differs" onClick={() => setFilter('differs')}>
          ✗ {count('differs')} differ
        </button>
        <button className="pc-pill pc-open" onClick={() => setFilter('differs')}>
          ? {count('open')} to check
        </button>
        <span className="muted">· Appendix rooms: {check.rooms.length - roomDiffs} of {check.rooms.length} match</span>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="grow"
          aria-label="Search the checks"
          placeholder="🔍 Search, e.g. Design, HL203, desks…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="seg">
          {(
            [
              ['all', 'All'],
              ['differs', 'Differences only'],
              ['design', 'Design only']
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`seg-btn${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && <div className="empty-state">Nothing matches.</div>}
      {sections.map((sec) => (
        <div className="pc-group" key={sec}>
          <h3 className="pc-group-title">{sec}</h3>
          <div className="table-scroll">
            <table className="data-table pc-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Proposal (Word)</th>
                  <th>Our data</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.section === sec)
                  .map((r) => (
                    <tr key={r.item} className={r.status === 'differs' ? 'pc-row-differs' : undefined}>
                      <td>
                        {r.item} {r.design && <span className="tag">Design</span>}
                        {r.note && <div className="pc-note">{r.note}</div>}
                      </td>
                      <td className="strong">{show(r.doc)}</td>
                      <td className="strong">{show(r.ours)}</td>
                      <td>
                        <span className={`pc-badge ${BADGE[r.status].cls}`}>{BADGE[r.status].text}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {(filter === 'all' || filter === 'differs' || filter === 'design') && !terms && (
        <div className="pc-group">
          <div className="subpanel-header">
            <h3 className="pc-group-title">Appendix: rooms used by Business, Design and Mass Communication</h3>
            <label className="muted">
              <input type="checkbox" checked={roomsDiffOnly} onChange={(e) => setRoomsDiffOnly(e.target.checked)} />{' '}
              Differences only
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table pc-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Proposal (hours a week)</th>
                  <th>Timetable (hours a week)</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rooms
                  .filter((r) => filter !== 'design' || 'Design' in r.doc || 'Design' in r.ours)
                  .map((r) => (
                    <tr key={r.room} className={r.status === 'differs' ? 'pc-row-differs' : undefined}>
                      <td className="strong">{r.room}</td>
                      <td>
                        {hoursText(r.doc)} <span className="muted">= {r.docTotal}</span>
                      </td>
                      <td>
                        {hoursText(r.ours)} <span className="muted">= {r.oursTotal}</span>
                      </td>
                      <td>
                        <span className={`pc-badge ${BADGE[r.status].cls}`}>{BADGE[r.status].text}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {check.missingFromAppendix.length > 0 && (
            <p className="department-report-note" style={{ marginTop: 6 }}>
              Rooms in the timetable but not in the appendix:{' '}
              {check.missingFromAppendix.map((m) => `${m.room} (${m.hours}h)`).join(', ')}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
