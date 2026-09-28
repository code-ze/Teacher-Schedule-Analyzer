import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SpaceAnalysis } from './analyze';
import type { DepartmentFacilities } from './facilities';

// PDF for the South Campus space report: at-a-glance comparison, findings, labs vs
// classrooms vs online, the compaction scenario and (if the facilities workbook was
// loaded) current staff offices and desks.

type RGB = [number, number, number];
const BLUE: RGB = [21, 101, 192];
const DARK: RGB = [33, 33, 33];
const MUTED: RGB = [110, 110, 110];
const LIGHT: RGB = [240, 245, 252];
const GREEN: RGB = [46, 125, 50];
const RED: RGB = [198, 40, 40];
const AMBER: RGB = [230, 124, 0];
const DEPT_COLOR: Record<string, RGB> = {
  'Business Studies': [21, 101, 192],
  Design: [142, 36, 170],
  'Mass Communication': [0, 137, 123]
};
const TYPE_COLOR = { lab: [79, 70, 229] as RGB, classroom: [100, 116, 139] as RGB, online: [203, 213, 225] as RGB };
const MARGIN = 14;

export interface SpaceReportMeta {
  timetableName?: string;
  facilitiesName?: string;
}

export function buildSpaceReportPDF(
  A: SpaceAnalysis,
  NB: SpaceAnalysis | null,
  facilities: DepartmentFacilities[] | null,
  meta: SpaceReportMeta = {}
): jsPDF {
const doc = new jsPDF({ orientation: 'landscape' }) as jsPDF & { lastAutoTable?: { finalY: number } };
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const contentW = pageW - MARGIN * 2;
const R = A.result as any[];
const S = {
  open: `${String(Math.floor(A.config.open / 60)).padStart(2, '0')}:00`,
  close: `${String(Math.floor(A.config.close / 60)).padStart(2, '0')}:00`,
  days: A.config.days,
  comfort: A.config.comfort
};
const F = facilities && facilities.length ? facilitiesContent(facilities, A.config.departments) : null;
const h = (n: number) => `${Math.round(n * 10) / 10}h`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const short = (d: string) => (d === 'Mass Communication' ? 'Mass Comm' : d === 'Business Studies' ? 'Business' : d);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const rulesText = (r: any) =>
  Object.entries(r.rules.blocked as Record<string, [number, number]>)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([d, [a, b]]) => (b === 18 * 60 ? `${d} after ${hhmm(a)}` : `${d} ${hhmm(a)}-${hhmm(b)}`))
    .join(' and ');
const unlisted = (r: any) => A.config.unlistedLabs[r.department] ?? 0;
const labsText = (r: any) =>
  unlisted(r) ? `${r.labList.length + unlisted(r)} (${r.labsInFile.length} with classes)` : `${r.labList.length}`;
// Without the rules the same arrangement is still valid, so never report more rooms than with them.
const withoutRules = (r: any, key: 'classrooms' | 'labsDept' | 'labsShared', which: 'tight' | 'comfortable') => {
  const nb = NB?.result.find((x: any) => x.department === r.department)?.scenario[key][which].rooms;
  const withR = r.scenario[key][which].rooms;
  return nb === undefined ? withR : Math.min(nb, withR);
};

const tableStyle = {
  styles: { fontSize: 8.5, cellPadding: 2, textColor: DARK },
  headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: LIGHT },
  margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 16 }
};
const afterTable = (gap = 9) => (doc.lastAutoTable?.finalY ?? 0) + gap;
const ensure = (y: number, need: number) => {
  if (y + need > pageH - 18) {
    doc.addPage();
    return 18;
  }
  return y;
};
function heading(text: string, y: number, sub?: string): number {
  y = ensure(y, 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BLUE);
  doc.text(text, MARGIN, y);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1.8, pageW - MARGIN, y + 1.8);
  doc.setFont('helvetica', 'normal');
  if (sub) {
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(sub, contentW);
    doc.text(lines, MARGIN, y + 6.5);
    return y + 5 + lines.length * 3.8;
  }
  return y + 5;
}
function paragraph(text: string, y: number, size = 9.5, color: RGB = DARK): number {
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, contentW);
  y = ensure(y, lines.length * 4.6);
  doc.text(lines, MARGIN, y);
  return y + lines.length * (size * 0.45) + 1.5;
}
function bullets(items: { tone: RGB; text: string }[], y: number): number {
  doc.setFontSize(9.5);
  items.forEach((it) => {
    const lines = doc.splitTextToSize(it.text, contentW - 8);
    y = ensure(y, lines.length * 4.6 + 2);
    doc.setFillColor(...it.tone);
    doc.circle(MARGIN + 1.8, y - 1.2, 1.2, 'F');
    doc.setTextColor(...DARK);
    doc.text(lines, MARGIN + 6, y);
    y += lines.length * 4.6 + 1.6;
  });
  return y;
}

// ---------------- Page 1: overview ----------------
doc.setFillColor(...BLUE);
doc.rect(0, 0, pageW, 26, 'F');
doc.setTextColor(255);
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text('South Campus Space Report', MARGIN, 12);
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
doc.text('Business Studies  ·  Design  ·  Mass Communication', MARGIN, 20);
doc.setFontSize(9);
doc.text(`Generated ${new Date().toLocaleDateString('en-GB')}`, pageW - MARGIN, 12, { align: 'right' });
if (meta.timetableName) doc.text(`Timetable: ${meta.timetableName}`, pageW - MARGIN, 18, { align: 'right' });

let y = 34;
y = paragraph(
  'Teaching space (labs, classrooms and online) comes from the current timetable. ' +
    `Online placeholder rooms (${A.config.onlineRooms.join(', ')}) are counted as online classes, not as rooms. ` +
    'Current room use is measured on the standard 40-hour week (5 days x 08:00-16:00; 1 hour = 12.5% of a room\'s day). ' +
    (F ? 'Offices and workstations come from the South Campus facilities data (current figures only).' : ''),
  y,
  8.5,
  MUTED
);

// At-a-glance comparison table
const glanceRows: (string | number)[][] = [
  ['Instructors teaching', ...R.map((r) => r.instructors)],
  ['Weekly classes (in person)', ...R.map((r) => r.inPerson.classes)],
  ['Teaching hours / week in person', ...R.map((r) => h(r.inPerson.hours))],
  ['   in labs', ...R.map((r) => `${h(r.labs.hours)}  (${pct(r.labs.hours, r.inPerson.hours)}%)`)],
  ['   in classrooms', ...R.map((r) => `${h(r.classroom.hours)}  (${pct(r.classroom.hours, r.inPerson.hours)}%)`)],
  ['Online classes (not in a room)', ...R.map((r) => (r.online.classes ? `${r.online.classes} class${r.online.classes === 1 ? '' : 'es'}, ${h(r.online.hours)}` : '-'))],
  ['Labs', ...R.map((r) => labsText(r))],
  ['Classrooms used now', ...R.map((r) => r.classroom.rooms)],
  [
    'Scenario: classrooms needed (comfortable)',
    ...R.map((r) => `${r.scenario.classrooms.comfortable.rooms}  (frees ${Math.max(0, r.scenario.classrooms.roomsNow - r.scenario.classrooms.comfortable.rooms)})`)
  ],
  ['Scenario: labs needed for own lab hours', ...R.map((r) => r.scenario.labsDept.comfortable.rooms)]
];
if (F) {
  glanceRows.push(
    ...(F.glance as { label: string; values: Record<string, string | number> }[]).map((g) => [g.label, ...R.map((r) => g.values[r.department] ?? '-')])
  );
}
autoTable(doc, {
  ...tableStyle,
  startY: heading('At a glance', y + 4),
  head: [['', ...R.map((r) => r.department)]],
  body: glanceRows,
  columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
  didParseCell: (d) => {
    if (d.section === 'head' && d.column.index > 0) d.cell.styles.fillColor = DEPT_COLOR[R[d.column.index - 1].department];
    if (d.section === 'body' && String(d.row.raw && (d.row.raw as any)[0]).startsWith('   ')) d.cell.styles.textColor = MUTED;
  }
});

// Key findings
const findings: { tone: RGB; text: string }[] = [];
R.forEach((r) => {
  const c = r.scenario.classrooms;
  findings.push({
    tone: DEPT_COLOR[r.department],
    text:
      `${r.department}: ${h(r.inPerson.hours)} a week in person, ${pct(r.labs.hours, r.inPerson.hours)}% in labs and ` +
      `${pct(r.classroom.hours, r.inPerson.hours)}% in classrooms` +
      (r.online.classes ? `, plus ${h(r.online.hours)} online` : '') +
      `. Its classroom teaching fits in ${c.comfortable.rooms} classrooms under the scenario (uses ${c.roomsNow} today).`
  });
});
const moving = R.reduce((s, r) => s + r.displaced.length, 0);
if (moving)
  findings.push({
    tone: AMBER,
    text:
      `${moving} in-person classes sit in the new blocked times today and would need to move: ` +
      R.filter((r) => r.displaced.length)
        .map((r) => `${r.displaced.length} ${short(r.department)}`)
        .join(', ') +
      ' (Design and Mass Communication: Tuesday 12:00-14:00 and Thursday after 14:00; Business: Tuesday 12:00-14:00 only).'
  });
if (F?.findings) (F.findings as string[]).forEach((t) => findings.push({ tone: GREEN, text: t }));
y = heading('Key findings', afterTable(10));
y = bullets(findings, y + 2);

// ---------------- Teaching space ----------------
y = heading('Where each department teaches', y + 8, 'Share of in-person teaching hours in labs and classrooms, with online hours alongside.');
// stacked bars
const barX = MARGIN + 52;
const barW = contentW - 52 - 60;
R.forEach((r, i) => {
  const yy = y + 4 + i * 13;
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.text(r.department, MARGIN, yy + 4.5);
  doc.setFont('helvetica', 'normal');
  const total = r.labs.hours + r.classroom.hours + r.online.hours;
  let x = barX;
  (
    [
      ['lab', r.labs.hours],
      ['classroom', r.classroom.hours],
      ['online', r.online.hours]
    ] as ['lab' | 'classroom' | 'online', number][]
  ).forEach(([k, v]) => {
    if (!v) return;
    const w = (barW * v) / total;
    doc.setFillColor(...TYPE_COLOR[k]);
    doc.rect(x, yy, w, 7, 'F');
    if (w > 10) {
      doc.setFontSize(7.5);
      doc.setTextColor(k === 'online' ? 60 : 255);
      doc.text(h(v), x + w / 2, yy + 4.8, { align: 'center' });
    }
    x += w;
  });
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`${h(total)} total`, barX + barW + 4, yy + 4.8);
});
// legend
let lx = barX;
const ly = y + 4 + R.length * 13 + 2;
(['lab', 'classroom', 'online'] as const).forEach((k) => {
  doc.setFillColor(...TYPE_COLOR[k]);
  doc.rect(lx, ly - 3, 4, 4, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  const label = k === 'lab' ? 'Labs' : k === 'classroom' ? 'Classrooms' : `Online (${A.config.onlineRooms.join(', ')})`;
  doc.text(label, lx + 6, ly);
  lx += doc.getTextWidth(label) + 16;
});

autoTable(doc, {
  ...tableStyle,
  startY: ly + 6,
  head: [['Department', 'In-person hours', 'Lab hours', 'Classroom hours', 'Online hours', 'Classes (lab / classroom / online)', 'Rooms used (labs / classrooms)']],
  body: R.map((r) => [
    r.department,
    h(r.inPerson.hours),
    `${h(r.labs.hours)} (${pct(r.labs.hours, r.inPerson.hours)}%)`,
    `${h(r.classroom.hours)} (${pct(r.classroom.hours, r.inPerson.hours)}%)`,
    r.online.hours ? h(r.online.hours) : '-',
    `${r.labs.classes} / ${r.classroom.classes} / ${r.online.classes}`,
    `${r.labsInFile.length} / ${r.classroom.rooms}`
  ]),
  columnStyles: { 0: { fontStyle: 'bold' } }
});

// Labs per department
R.forEach((r) => {
  const others = Object.entries(r.labs.otherLabHours as Record<string, number>);
  const sub =
    `Labs: ${r.labList.join(', ')}.` +
    (r.labList.length > r.labsInFile.length ? ` ${r.labList.filter((x: string) => !r.labsInFile.includes(x)).join(', ')} has no classes this semester.` : '') +
    (unlisted(r) ? ` ${unlisted(r)} more ${short(r.department)} lab${unlisted(r) > 1 ? 's' : ''} exist${unlisted(r) > 1 ? '' : 's'} but ha${unlisted(r) > 1 ? 've' : 's'} no classes this semester, so ${unlisted(r) > 1 ? 'they are' : 'it is'} not in the timetable.` : '') +
    (others.length ? ` ${r.department} also teaches ${h(others.reduce((s, [, v]) => s + v, 0))} in other departments' labs (${r.labs.otherLabRooms.join(', ')}).` : '') +
    ' Use = booked hours / 40-hour standard week.';
  autoTable(doc, {
    ...tableStyle,
    startY: heading(`${r.department} labs`, afterTable(11), sub),
    head: [['Lab', 'Lab of', `${short(r.department)} hours`, 'Other departments', 'Total hours', 'Use']],
    body: r.labRooms.map((l: any) => [
      l.room,
      l.labOf.map(short).join(', '),
      h(l.byDept[r.department] || 0),
      Object.entries(l.byDept)
        .filter(([d]) => d !== r.department)
        .map(([d, v]) => `${d} ${h(v as number)}`)
        .join(', ') || '-',
      h(l.total),
      l.total ? `${l.usePct}%` : 'no classes'
    ]),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 }, 3: { cellWidth: 95 } }
  });
});

// ---------------- Scenario ----------------
doc.addPage();
y = heading(
  'Compaction scenario: how few rooms are needed',
  18,
  `Rooms open ${S.open}-${S.close}, Sunday-Thursday. No classes: ` +
    R.map((r) => `${short(r.department)} - ${rulesText(r)} (${r.rules.roomHours} hours per room per week)`).join('; ') +
    '. Every section keeps its days, its length and the same start time on each of its days; it may move earlier or later in the day. ' +
    'No instructor is double-booked (all other classes keep their times). ' +
    `"Comfortable" = no room above ${Math.round(S.comfort * 100)}% of its weekly hours. Labs stay labs, classrooms stay classrooms, online stays online. ` +
    'Found by trying many arrangements, so a planner may find one room better; the busiest-day figure is a hard minimum.'
);
const scRows: (string | number)[][] = [];
R.forEach((r) => {
  const list = [r.scenario.classrooms, r.scenario.labsDept, r.scenario.labsShared];
  list.forEach((s: any, i: number) =>
    scRows.push([
      i === 0 ? r.department : '',
      i === 0 ? 'Classrooms' : i === 1 ? 'Labs (own lab hours only)' : 'Labs (keep everyone now using them)',
      h(s.daytimeHours),
      s.roomsNow,
      s.busiestDayRooms,
      s.tight.rooms,
      s.comfortable.rooms,
      `${s.comfortable.avgUse}%`,
      Math.max(0, s.roomsNow - s.comfortable.rooms) || '-',
      withoutRules(r, (['classrooms', 'labsDept', 'labsShared'] as const)[i], 'comfortable')
    ])
  );
});
autoTable(doc, {
  ...tableStyle,
  startY: y + 2,
  head: [['Department', 'Room type', 'Hours (08:00-18:00)', 'Rooms now', 'Busiest-day minimum', 'Tightest (100%)', 'Comfortable (max 80%)', 'Avg use (comfortable)', 'Rooms freed', 'Comfortable without the new rules']],
  body: scRows,
  columnStyles: { 0: { fontStyle: 'bold' }, 6: { fontStyle: 'bold', textColor: BLUE }, 8: { fontStyle: 'bold', textColor: GREEN } },
  didParseCell: (d) => {
    if (d.section === 'body' && d.row.index % 3 === 0 && d.row.index > 0) d.cell.styles.lineWidth = { top: 0.3 } as any;
  }
});

// Busiest-day tables (classrooms)
autoTable(doc, {
  ...tableStyle,
  startY: heading(
    'Classroom hours by day',
    afterTable(11),
    'Hours of classroom teaching on each day and the rooms that day needs on its own. A room offers 10 hours a day, except Tuesday (8h, all three) ' +
      'and Thursday (6h for Design and Mass Communication; Business keeps 10h). The day in red sets the minimum.'
  ),
  head: [['Department', ...S.days.map((d: string) => d)]],
  body: R.map((r) => [r.department, ...r.scenario.classrooms.perDay.map((p: any) => `${h(p.hours)}: ${p.minRooms} rooms`)]),
  columnStyles: { 0: { fontStyle: 'bold' } },
  didParseCell: (d) => {
    if (d.section !== 'body' || d.column.index === 0) return;
    const r = R[d.row.index].scenario.classrooms;
    const p = r.perDay[d.column.index - 1];
    if (p.minRooms === r.busiestDayRooms && p.minRooms > 0) {
      d.cell.styles.textColor = RED;
      d.cell.styles.fontStyle = 'bold';
    }
  }
});

// Classes that would have to move
const displaced = R.flatMap((r) => r.displaced);
if (displaced.length) {
  autoTable(doc, {
    ...tableStyle,
    startY: heading(
      'Classes in the new blocked times',
      afterTable(11),
      'These in-person classes meet in the blocked times today (Tuesday 12:00-14:00 for all three; Thursday after 14:00 for Design and Mass Communication) and would have to move to another time. The scenario moves them within the same day.'
    ),
    head: [['Department', 'Course', 'Course name', 'Sec', 'Day', 'Time', 'Room', 'Instructor']],
    body: displaced.map((m: any) => [m.department, m.code, m.name, m.section, m.day, m.time, m.room, m.teacher])
  });
}
const evening = R.flatMap((r) => [...r.scenario.classrooms.evening, ...r.scenario.labsDept.evening]);
if (evening.length) {
  autoTable(doc, {
    ...tableStyle,
    startY: heading('Classes outside 08:00-18:00 (kept as they are)', afterTable(11), 'Evening or early classes stay at their current times and were not packed; they can use any of the rooms above after 18:00.'),
    head: [['Department', 'Course', 'Course name', 'Sec', 'Day', 'Time', 'Room', 'Instructor']],
    body: evening.map((m: any) => [m.department, m.code, m.name, m.section, m.day, m.time, m.room, m.teacher])
  });
}

// ---------------- Offices & workstations ----------------
if (F) {
  doc.addPage();
  y = heading(F.title || 'Offices and workstations', 18, F.subtitle);
  const [summaryTable, ...officeTables] = F.tables as { title?: string; sub?: string; head: string[]; body: (string | number)[][] }[];
  autoTable(doc, {
    ...tableStyle,
    startY: y + 4,
    head: [summaryTable.head],
    body: summaryTable.body,
    columnStyles: { 0: { fontStyle: 'bold' } }
  });
  // Office-by-office lists, side by side.
  let listY = heading('Offices and desks', afterTable(10), 'Desks in each office as listed on the forms (Business office numbers as written on its form).');
  // Keep the three lists together on one page.
  const longest = Math.max(...officeTables.map((t) => t.body.length)) + 1;
  if (listY + 5 + longest * 4.7 > pageH - 16) {
    doc.addPage();
    listY = heading('Offices and desks (continued)', 18);
  }
  const listPage = doc.getNumberOfPages();
  const gap = 6;
  const colW = (contentW - gap * (officeTables.length - 1)) / officeTables.length;
  let lowest = listY;
  officeTables.forEach((t, i) => {
    doc.setPage(listPage);
    const x = MARGIN + i * (colW + gap);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DEPT_COLOR[R[i]?.department] ?? BLUE);
    doc.text((t.title || '').replace(' offices', ''), x, listY + 3);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      ...tableStyle,
      startY: listY + 5,
      tableWidth: colW,
      margin: { left: x, right: pageW - x - colW, top: 16, bottom: 16 },
      styles: { fontSize: 7.5, cellPadding: 1.0, textColor: DARK },
      headStyles: { fillColor: DEPT_COLOR[R[i]?.department] ?? BLUE, textColor: 255, fontStyle: 'bold' as const },
      head: [t.head],
      body: t.body,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 16 }, 1: { cellWidth: 12 }, 2: { cellWidth: 13 } }
    });
    lowest = Math.max(lowest, doc.lastAutoTable?.finalY ?? lowest);
  });
  doc.lastAutoTable = { finalY: lowest };
}

// ---------------- Appendix: classrooms and online classes ----------------
doc.addPage();
y = 18;
R.forEach((r, i) => {
  autoTable(doc, {
    ...tableStyle,
    startY: heading(`${r.department} classrooms`, i === 0 ? y : afterTable(11), 'Hours per week in each classroom the department uses (use = all departments, on the 40-hour standard week).'),
    styles: { fontSize: 8, cellPadding: 1.4, textColor: DARK },
    head: [['Room', `${short(r.department)} hours`, 'Other departments', 'Total hours', 'Use']],
    body: r.classrooms.map((c: any) => [
      c.room,
      h(c.deptHours),
      Object.entries(c.byDept)
        .filter(([d]) => d !== r.department)
        .map(([d, v]) => `${d} ${h(v as number)}`)
        .join(', ') || '-',
      h(c.total),
      `${c.usePct}%`
    ]),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 22 }, 2: { cellWidth: 120 } }
  });
});
const online = R.flatMap((r) => r.online.meetings);
if (online.length) {
  autoTable(doc, {
    ...tableStyle,
    startY: heading(`Online classes (${A.config.onlineRooms.join(', ')})`, afterTable(11)),
    head: [['Department', 'Course', 'Course name', 'Sec', 'Day', 'Time', 'Room', 'Instructor']],
    body: online.map((m: any) => [m.department, m.code, m.name, m.section, m.day, m.time, m.room, m.teacher])
  });
}

const pages = doc.getNumberOfPages();
for (let p = 1; p <= pages; p++) {
  doc.setPage(p);
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('South Campus Space Report - Business Studies, Design, Mass Communication', MARGIN, pageH - 8);
  doc.text(`Page ${p} of ${pages}`, pageW - MARGIN, pageH - 8, { align: 'right' });
}
return doc;
}

interface FacilitiesContent {
  title: string;
  subtitle: string;
  glance: { label: string; values: Record<string, string | number> }[];
  tables: { title?: string; sub?: string; head: string[]; body: (string | number)[][] }[];
  findings: string[];
}

// Offices and desks section, from the current figures of the facilities workbook.
export function facilitiesContent(facilities: DepartmentFacilities[], departments: string[]): FacilitiesContent {
  const list = departments
    .map((d) => facilities.find((f) => f.department === d))
    .filter((f): f is DepartmentFacilities => !!f);
  const byDept = (fn: (f: DepartmentFacilities) => string | number) =>
    Object.fromEntries(list.map((f) => [f.department, fn(f)]));
  return {
    title: 'Staff offices and workstations',
    subtitle:
      "Current figures from each department's facilities form (Current Number Available and the office/desk list). " +
      'Required numbers and gaps in the forms are not used. The HoD office is shown separately so the departments compare like for like.',
    glance: [
      { label: 'Staff offices (current, + HoD office)', values: byDept((f) => `${f.staffOffices}${f.hod ? ' + HoD' : ''}`) },
      {
        label: 'Staff desks / workstations (current)',
        values: byDept((f) => `${f.staffDesks}${f.hod ? ` (+${f.hod.desks} HoD)` : ''}`)
      },
      {
        label: 'Desks in use / free',
        values: byDept((f) => `${f.staffUsed} in use, ${f.free} free${f.held ? `, ${f.held} held` : ''}`)
      }
    ],
    tables: [
      {
        title: 'Offices and desks by department',
        head: ['Department', 'Staff offices', 'HoD office', 'Staff desks', 'In use', 'Held', 'Free', 'As reported on the form'],
        body: list.map((f) => [
          f.department,
          f.staffOffices,
          f.hod ? `${f.hod.office} (${f.hod.desks} desk${f.hod.desks === 1 ? '' : 's'})` : '-',
          f.staffDesks,
          f.staffUsed,
          f.held || '-',
          f.free,
          f.formOffices !== null || f.formDesks !== null
            ? `${f.formOffices ?? '?'} offices, ${f.formDesks ?? '?'} desks`
            : '-'
        ])
      },
      ...list.map((f) => ({
        title: `${f.department} offices`,
        head: ['Office', 'Desks', 'In use', 'Note'],
        body: f.offices.map((o) => [o.office, o.desks, o.used, o.note || '-'])
      }))
    ],
    findings: list.map((f) => {
      const freeOffices = f.offices.filter((o) => !o.isHod && o.desks - o.otherDept > o.used + o.held).map((o) => o.office);
      return (
        `${f.department}: ${f.staffOffices} staff offices and ${f.staffDesks} desks${f.hod ? ' (plus the HoD office)' : ''}; ` +
        `${f.staffUsed} desks in use` +
        (f.held ? `, ${f.held} held for staff on leave` : '') +
        (f.free ? `, ${f.free} free (${freeOffices.join(', ')}).` : ', none free.')
      );
    })
  };
}
