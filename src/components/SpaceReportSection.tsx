import { useEffect, useRef, useState } from 'react';
import type { CourseSection } from '../types';
import { SPACE_REPORT_CONFIG } from '../utils/spaceReport/config';
import type { SpaceAnalysis } from '../utils/spaceReport/analyze';
import { readFacilitiesWorkbook, type DepartmentFacilities } from '../utils/spaceReport/facilities';
import { buildSpaceReportPDF } from '../utils/spaceReport/pdf';

const ITERATIONS = 50;
const config = SPACE_REPORT_CONFIG;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const h = (n: number) => `${Math.round(n * 10) / 10}h`;

function rulesText(dept: string): string {
  const rules = Object.entries(config.blocked[dept] ?? {});
  if (rules.length === 0) return 'no blocked times';
  return rules
    .map(([day, [a, b]]) => (b === config.close ? `${day} after ${hhmm(a)}` : `${day} ${hhmm(a)}–${hhmm(b)}`))
    .join(', ');
}

interface Props {
  courses: Record<string, CourseSection>;
  departments: string[];
  timetableName?: string;
}

// South Campus space report: teaching space (labs / classrooms / online), the
// compaction scenario and, from the facilities workbook, current offices and desks.
export default function SpaceReportSection({ courses, departments, timetableName }: Props) {
  const [facilities, setFacilities] = useState<DepartmentFacilities[] | null>(null);
  const [facilitiesName, setFacilitiesName] = useState('');
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ analysis: SpaceAnalysis; noBlock: SpaceAnalysis } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const missing = config.departments.filter((d) => !departments.includes(d));

  // A new timetable invalidates the previous analysis.
  useEffect(() => {
    setResult(null);
    setStatus('idle');
    workerRef.current?.terminate();
  }, [courses]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const loadFacilities = async (file: File) => {
    try {
      const parsed = readFacilitiesWorkbook(new Uint8Array(await file.arrayBuffer()));
      if (parsed.length === 0) throw new Error('No department sheets were found in this workbook.');
      setFacilities(parsed);
      setFacilitiesName(file.name);
      setFacilitiesError(null);
    } catch (err) {
      setFacilities(null);
      setFacilitiesError(err instanceof Error ? err.message : String(err));
    }
  };

  const generate = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../utils/spaceReport/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setStatus('running');
    setProgress('Starting…');
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') setProgress(e.data.text);
      if (e.data.type === 'done') {
        setResult({ analysis: e.data.analysis, noBlock: e.data.noBlock });
        setStatus('done');
        worker.terminate();
      }
      if (e.data.type === 'error') {
        setProgress(e.data.text);
        setStatus('error');
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      setProgress(e.message || 'The analysis failed.');
      setStatus('error');
    };
    worker.postMessage({ courses, config, iterations: ITERATIONS });
  };

  const download = () => {
    if (!result) return;
    const pdf = buildSpaceReportPDF(result.analysis, result.noBlock, facilities, { timetableName, facilitiesName });
    pdf.save(`south-campus-space-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <section className="panel space-report-section">
      <div className="panel-header">
        <div>
          <h2>South Campus space report</h2>
          <p className="panel-sub">
            {config.departments.join(', ')}: where each department teaches (labs, classrooms, online), how few rooms the
            same classes need, and current staff offices and desks.
          </p>
        </div>
        {status === 'done' && (
          <div className="panel-actions">
            <button className="export-pdf-btn" onClick={download}>
              📄 Download PDF
            </button>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <div className="error">This timetable has no classes for: {missing.join(', ')}. Their figures will be empty.</div>
      )}

      <div className="space-steps">
        <details className="space-step space-optional" open={!!facilities || undefined}>
          <summary>
            <span className="filter-label">Optional · Add offices &amp; desks from the facilities workbook</span>
            {facilities && <span className="muted"> — {facilitiesName} loaded</span>}
          </summary>
          <div
            className={`mini-drop${dragOver ? ' dragover' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) loadFacilities(file);
            }}
          >
            {facilities ? (
              <span>
                ✅ <strong>{facilitiesName}</strong> — {facilities.map((f) => f.department).join(', ')}
              </span>
            ) : (
              <span>📥 Drop the “Department Facilities” Excel here, or click to choose it</span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFacilities(file);
                e.target.value = '';
              }}
            />
          </div>
          {facilitiesError && <div className="error">{facilitiesError}</div>}
          {facilities && (
            <div className="table-scroll" style={{ marginTop: 10 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Staff offices</th>
                    <th>Staff desks</th>
                    <th>In use</th>
                    <th>Free</th>
                    <th>HoD office</th>
                  </tr>
                </thead>
                <tbody>
                  {facilities.map((f) => (
                    <tr key={f.department}>
                      <td className="strong">{f.department}</td>
                      <td>{f.staffOffices}</td>
                      <td>{f.staffDesks}</td>
                      <td>
                        {f.staffUsed}
                        {f.held ? ` (+${f.held} held)` : ''}
                      </td>
                      <td>{f.free}</td>
                      <td>{f.hod?.office ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="department-report-note" style={{ marginTop: 6 }}>
                Current figures only; required numbers and gaps in the forms are ignored.
              </p>
              <button
                className="btn-link"
                onClick={() => {
                  setFacilities(null);
                  setFacilitiesName('');
                }}
              >
                Remove workbook
              </button>
            </div>
          )}
        </details>

        <div className="space-step">
          <div className="filter-label">Facts used</div>
          <ul className="facts-list">
            {config.departments.map((d) => (
              <li key={d}>
                <strong>{d}</strong> — labs: {(config.labs[d] ?? []).join(', ') || 'none'}
                {config.unlistedLabs[d] ? ` (+${config.unlistedLabs[d]} with no classes this semester)` : ''}; no
                classes: {rulesText(d)}
              </li>
            ))}
            <li>
              <strong>Online rooms</strong> (counted as online classes, not rooms): {config.onlineRooms.join(', ')}
            </li>
            <li>
              <strong>Scenario</strong>: rooms open {hhmm(config.open)}–{hhmm(config.close)}, {config.days[0]}–
              {config.days[config.days.length - 1]}; comfortable = at most {Math.round(config.comfort * 100)}% of a room's
              week; sections keep their days, length and start-time pattern.
            </li>
          </ul>
        </div>

        <div className="space-step">
          <div className="filter-label">Generate</div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button className="btn" onClick={generate} disabled={status === 'running'}>
              {status === 'running' ? 'Working…' : status === 'done' ? 'Generate again' : 'Generate report'}
            </button>
            {status === 'running' && (
              <span className="muted">
                <span className="spinner-inline" /> {progress} This takes about half a minute.
              </span>
            )}
            {status === 'error' && <span className="error">{progress}</span>}
            {status === 'done' && !facilities && (
              <span className="muted">The PDF covers teaching space only; open “Optional” above to add offices and desks.</span>
            )}
          </div>
        </div>
      </div>

      {status === 'done' && result && (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th />
                {result.analysis.result.map((r) => (
                  <th key={r.department}>{r.department}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Teaching hours / week in person', (r) => h(r.inPerson.hours)],
                  ['In labs / in classrooms', (r) => `${h(r.labs.hours)} / ${h(r.classroom.hours)}`],
                  ['Online (not in a room)', (r) => (r.online.hours ? h(r.online.hours) : '–')],
                  [
                    'Classrooms now → needed (comfortable)',
                    (r) => `${r.scenario.classrooms.roomsNow} → ${r.scenario.classrooms.comfortable.rooms}`
                  ],
                  [
                    'Labs now → needed for own lab hours',
                    (r) => `${r.scenario.labsDept.roomsNow} → ${r.scenario.labsDept.comfortable.rooms}`
                  ],
                  ['Classes in the blocked times', (r) => r.displaced.length]
                ] as [string, (r: SpaceAnalysis['result'][number]) => string | number][]
              ).map(([label, fn]) => (
                <tr key={label}>
                  <td className="strong">{label}</td>
                  {result.analysis.result.map((r) => (
                    <td key={r.department}>{fn(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
