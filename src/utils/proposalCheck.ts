import type { CourseSection } from '../types';
import { allMeetings } from './departmentReport';
import { buildCampusPlan, PROPOSAL_WEEK, weekFor, type DepartmentPlan } from './campusPlan';
import { SPACE_REPORT_CONFIG } from './spaceReport/config';
import type { DepartmentFacilities } from './spaceReport/facilities';
import type { StudentData } from './students/students';

// TEMPORARY: checks the figures of the DAVCAA "Campus Consolidation Proposal"
// (final draft, October 2026) against the loaded timetable, student file and
// facilities workbook. The proposal's figures are typed in below; remove this
// file (and the Proposal Check tab) once the review is done.

const B = 'Business Studies';
const D = 'Design';
const MC = 'Mass Communication';
const SRD = 'Supporting Requirements Department';
const PSC = 'Preparatory Study Center';
const ENG = 'Engineering';
const IT = 'Information Technology';

/** Appendix A: weekly hours per room and department, as written in the proposal. */
export const PROPOSAL_APPENDIX: Record<string, Record<string, number>> = {
  FB101: { [MC]: 2, [PSC]: 28 },
  FB102: { [MC]: 8, [PSC]: 16 },
  FB103: { [MC]: 3, [PSC]: 20, [SRD]: 3 },
  FB104: { [MC]: 5, [PSC]: 20 },
  FB105: { [B]: 6, [MC]: 16, [PSC]: 12 },
  FB106: { [B]: 3, [MC]: 13, [PSC]: 16 },
  FB107: { [B]: 30 },
  FB108: { [B]: 36 },
  FB109: { [B]: 34 },
  FB110: { [B]: 36 },
  FB111: { [B]: 36 },
  FB112: { [B]: 22 },
  FB201: { [B]: 36 },
  FB202: { [B]: 40 },
  FB203: { [B]: 32 },
  FB204: { [B]: 32 },
  FB205: { [B]: 34 },
  FB206: { [B]: 38 },
  FB207: { [B]: 38 },
  FB208: { [B]: 32 },
  FB209: { [B]: 32 },
  FB210: { [B]: 34 },
  FB211: { [B]: 34 },
  FB212: { [B]: 12, [MC]: 4 },
  HL101: { [D]: 4 },
  HL102: { [D]: 34 },
  HL107: { [D]: 37 },
  HL203: { [D]: 39 },
  HL201: { [MC]: 19 },
  HL202: { [MC]: 23, [SRD]: 1 },
  HL204: { [MC]: 21, [SRD]: 6 },
  HL205: { [D]: 4, [MC]: 29 },
  HL206: { [MC]: 32 },
  CL205: { [B]: 32 },
  AB111: { [B]: 16 },
  AC117: { [MC]: 27, [SRD]: 2 },
  AE210: { [B]: 39 },
  AL116: { [B]: 3, [MC]: 22 },
  EH205: { [B]: 30 },
  EH206: { [B]: 34 },
  A111: { [B]: 2, [ENG]: 28 },
  A118: { [B]: 4, [PSC]: 22 },
  A137: { [B]: 32 },
  A138: { [B]: 11, [PSC]: 22 },
  A239: { [B]: 5, [PSC]: 26 },
  LR02: { [B]: 4, [PSC]: 18, [SRD]: 8 },
  LR10: { [B]: 2, [ENG]: 6, [IT]: 2, [PSC]: 12, [SRD]: 12 },
  NC001: { [B]: 9, [SRD]: 8 }
};

export type CheckStatus = 'match' | 'differs' | 'open';

export interface CheckRow {
  section: string;
  item: string;
  doc: string | number;
  ours: string | number | null;
  status: CheckStatus;
  note?: string;
  design?: boolean;
}

export interface RoomCheck {
  room: string;
  doc: Record<string, number>;
  ours: Record<string, number>;
  docTotal: number;
  oursTotal: number;
  status: CheckStatus;
}

export interface ProposalCheck {
  rows: CheckRow[];
  rooms: RoomCheck[];
  /** Rooms the three departments teach in that the appendix does not list. */
  missingFromAppendix: { room: string; hours: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const norm = (v: string | number) => String(v).toLowerCase().replace(/\s+/g, ' ').trim();

function row(section: string, item: string, doc: string | number, ours: string | number | null, extra: Partial<CheckRow> = {}): CheckRow {
  const status: CheckStatus =
    ours === null || extra.status === 'open' ? 'open' : typeof doc === 'number' && typeof ours === 'number' ? (Math.abs(doc - ours) < 0.05 ? 'match' : 'differs') : norm(doc) === norm(ours) ? 'match' : 'differs';
  return { section, item, doc, ours, ...extra, status };
}

export interface CheckInput {
  courses: Record<string, CourseSection>;
  virtualRooms?: string[];
  students?: StudentData | null;
  facilities?: DepartmentFacilities[] | null;
}

export function checkProposal({ courses, virtualRooms = [], students, facilities }: CheckInput): ProposalCheck {
  const plan = buildCampusPlan(courses, [B, D, MC], { onlineRooms: virtualRooms, students });
  const [bus, des, mc] = plan.plans as [DepartmentPlan, DepartmentPlan, DepartmentPlan];
  const online = new Set([...SPACE_REPORT_CONFIG.onlineRooms, ...virtualRooms].map((r) => r.toUpperCase()));
  const all = allMeetings(courses).map((m) => ({ ...m, room: m.room.toUpperCase() }));
  const hoursIn = (dept: string | string[], rooms: string[]) => {
    const ds = Array.isArray(dept) ? dept : [dept];
    return r1(all.filter((m) => ds.includes(m.department) && rooms.includes(m.room)).reduce((s, m) => s + m.hours, 0));
  };
  const roomHours = (room: string, dept?: string) =>
    r1(all.filter((m) => m.room === room && (!dept || m.department === dept)).reduce((s, m) => s + m.hours, 0));
  const pctWeek = (h: number) => `${h}h (${r1((h / SPACE_REPORT_CONFIG.standardWeek) * 100)}%)`;
  const full = (p: DepartmentPlan) => Math.max(p.classrooms.full, p.classrooms.busiestDayRooms);
  const week = weekFor(PROPOSAL_WEEK);
  const rows: CheckRow[] = [];
  const add = (...a: Parameters<typeof row>) => rows.push(row(...a));

  // 3. The plan: student numbers.
  const studying = (dept: string) =>
    students ? students.students.filter((s) => s.department === dept && s.status === 'Studying').length : null;
  add('3. Students', 'Economics and Business Administration students', 951, studying(B), { note: 'Students “Studying” in the student file' });
  add('3. Students', 'Design students', 190, studying(D), { design: true, note: 'Students “Studying” in the student file' });
  add('3. Students', 'Mass Communication students', 387, studying(MC), { note: 'Students “Studying” in the student file' });
  add('3. Students', 'GFP students (PSC)', 1900, studying(PSC), {
    note: 'Preparatory Study Center students “Studying” in the student file'
  });

  // 4.2 Teaching week.
  add('4.2 Teaching week', 'Teaching hours per room per week', 44, week.total);
  add('4.2 Teaching week', 'Hours per room at 80%', 35.2, r1(week.planning));

  // 5.1 Classrooms.
  add('5.1 Classrooms', 'Business: weekly classroom hours', 820, bus.hours.classroom);
  add('5.1 Classrooms', 'Business: hours between 08:00 and 18:00', 808, bus.daytimeClassroomHours);
  add('5.1 Classrooms', 'Business: Thursday hours', 125, bus.byDay.Thursday);
  add('5.1 Classrooms', 'Business: rooms at 80%', 23, bus.classrooms.planning, {
    note: `Business keeps Thursday afternoon (week ${bus.week.total}h). With Thursday to 14:00 it would be ${bus.classrooms.planningProposalWeek}.`
  });
  add('5.1 Classrooms', 'Design: weekly classroom hours', 118, des.hours.classroom, {
    design: true,
    note: des.hours.classroom !== 118 ? 'HL101 (4h) is counted as a Design lab, not a classroom' : undefined
  });
  add('5.1 Classrooms', 'Design: rooms at full occupancy', 4, full(des), {
    design: true,
    note: `Larger of the week and the busiest day (${des.classrooms.busiestDay} ${des.byDay[des.classrooms.busiestDay]}h). Lower if HL101 is a lab.`
  });
  add('5.1 Classrooms', 'Design: rooms at 80%', 4, des.classrooms.planning, { design: true });
  add('5.1 Classrooms', 'Mass Communication: weekly classroom hours', 224, mc.hours.classroom);
  add('5.1 Classrooms', 'Mass Communication: rooms at full occupancy', 7, full(mc), { note: 'Larger of the week and the busiest day' });
  add('5.1 Classrooms', 'Mass Communication: rooms at 80%', 7, mc.classrooms.planning);
  add('5.1 Classrooms', 'SRD hours on the South Campus (HL202, HL204, FB103, AC117)', 12, hoursIn(SRD, ['HL202', 'HL204', 'FB103', 'AC117']));
  add('5.1 Classrooms', 'SRD hours under NC001', 8, hoursIn(SRD, ['NC001']));
  add('5.1 Classrooms', 'English General Requirements hours in FB101 to FB106 (PSC)', 112, hoursIn(PSC, ['FB101', 'FB102', 'FB103', 'FB104', 'FB105', 'FB106']));
  add('5.1 Classrooms', 'Engineering and IT hours in A111', 34, hoursIn([ENG, IT], ['A111']), {
    note: 'The appendix gives A111 as Engineering 28'
  });
  add('5.1 Classrooms', 'Engineering and IT hours in LR10', 2, hoursIn([ENG, IT], ['LR10']), {
    note: 'The appendix gives LR10 as Engineering 6 and IT 2'
  });

  // 5.2 Labs.
  const group = plan.labGroups[0];
  add('5.2 Computer labs', 'Business lab hours (CR203, CR204, CR206)', 60, bus.hours.lab);
  add('5.2 Computer labs', 'SRD hours in AP114', 16, hoursIn(SRD, ['AP114']));
  add('5.2 Computer labs', 'Design lab hours', 107, des.hours.lab, {
    design: true,
    note: des.hours.lab !== 107 ? 'Includes HL101 (4h), counted as a Design lab' : undefined
  });
  add('5.2 Computer labs', 'Mass Communication lab hours', 112, mc.hours.lab);
  add('5.2 Computer labs', 'Design + Mass Communication lab hours', 219, group?.need.hours ?? null, { design: true });
  add('5.2 Computer labs', 'Design + Mass Communication labs at full occupancy', 5, group?.need.full ?? null, { design: true });
  add('5.2 Computer labs', 'Design + Mass Communication labs at 80%', 7, group?.need.planning ?? null, { design: true });
  const designLabs = des.rooms
    .filter((r) => r.kind === 'lab')
    .map((r) => `${r.room} ${r.hours}h`)
    .join(', ');
  add('5.2 Computer labs', 'Labs Design and Mass Communication share', 'AB213, AB214, CT207', designLabs, {
    design: true,
    note: 'Our column: every lab Design teaches in, with Design’s hours. The proposal names only three shared labs.'
  });

  // 6. North Campus: rooms used today and needed.
  const physical = plan.rooms.filter((r) => r.kind === 'classroom' && r.room !== 'NC001');
  const hl101Lab = plan.rooms.some((r) => r.room === 'HL101' && r.kind === 'lab');
  const hlNote = hl101Lab ? 'HL101 is counted as a Design lab, so it is not in this count' : undefined;
  add('6. North Campus', 'Rooms the three departments teach in today', 47, physical.length, {
    note: ['Classroom codes, not counting NC001 or online rooms', hlNote].filter(Boolean).join('. ')
  });
  add('6. North Campus', 'Rooms needed (Business + Design + Mass Comm)', 34, bus.classrooms.planning + des.classrooms.planning + mc.classrooms.planning);
  add('6. North Campus', 'Business rooms needed', 23, bus.classrooms.planning);
  add('6. North Campus', 'Design rooms needed', 4, des.classrooms.planning, { design: true });
  add('6. North Campus', 'Mass Communication rooms needed', 7, mc.classrooms.planning);

  // 7. Mac labs.
  add('7. Computer labs', 'Hours in the Mac labs CT207 and CT208 (Design + Mass Comm)', 67, hoursIn([D, MC], ['CT207', 'CT208']));

  // 8. Design specialist spaces.
  add('8. Design spaces', 'HL203 studio', '39h (97.5%)', pctWeek(roomHours('HL203')), { design: true });
  add('8. Design spaces', 'HL107 studio', '37h (92.5%)', pctWeek(roomHours('HL107')), { design: true });
  add('8. Design spaces', 'HL102 studio', '34h (85%)', pctWeek(roomHours('HL102')), { design: true });
  add('8. Design spaces', 'HL101 photography studio', '4h (10%)', pctWeek(roomHours('HL101')), { design: true });
  add('8. Design spaces', 'HL103 painting room', 'Not timetabled', roomHours('HL103') ? pctWeek(roomHours('HL103')) : 'Not timetabled', { design: true });
  add('8. Design spaces', 'Studio hours (HL203 + HL107 + HL102)', 110, r1(roomHours('HL203', D) + roomHours('HL107', D) + roomHours('HL102', D)), { design: true });
  const ciid = Object.values(courses).filter((c) => c.code === 'CIID3214');
  const ciidRooms = Array.from(new Set(ciid.flatMap((c) => Object.values(c.schedule).flat().map((m) => m.room.toUpperCase()))));
  add('8. Design spaces', 'Interior Design Workshop (CIID3214)', 'Online', ciid.length === 0 ? 'Not in timetable' : ciidRooms.every((r) => online.has(r)) ? 'Online' : ciidRooms.join(', '), {
    design: true
  });
  add('8. Design spaces', 'Studio-Based TV Production room', 'HL201', Array.from(new Set(all.filter((m) => m.courseName.toLowerCase().includes('studio-based tv')).map((m) => m.room))).join(', ') || null);

  // 9.1 Rooms released.
  const byPrefix = (re: RegExp) => physical.filter((r) => re.test(r.room)).length;
  add('9.1 South Campus rooms', 'FB Building rooms', 24, byPrefix(/^FB/));
  add('9.1 South Campus rooms', 'HL Building rooms', 9, byPrefix(/^HL/), { note: hlNote });
  add('9.1 South Campus rooms', 'North Campus rooms (A Building and LR Block)', 7, byPrefix(/^(A\d|LR)/));
  add('9.1 South Campus rooms', 'Other South Campus rooms (CL205, AB111, AC117, AE210, AL116, EH205, EH206)', 7, physical.length - byPrefix(/^FB/) - byPrefix(/^HL/) - byPrefix(/^(A\d|LR)/));

  // 10. Staff.
  add('10.1 Staff', 'Business instructors in the timetable', 67, bus.instructors);
  add('10.1 Staff', 'Design instructors in the timetable', 20, des.instructors, { design: true });
  add('10.1 Staff', 'Mass Communication instructors in the timetable', 25, mc.instructors, { note: 'The proposal adds 1 staff member on leave (26)' });
  const fac = (dept: string) => facilities?.find((f) => f.department === dept) ?? null;
  const deskNow = (dept: string) => {
    const f = fac(dept);
    return f ? f.staffUsed + f.held + (f.hod?.desks ?? 0) : null;
  };
  const deskNote = (dept: string) => {
    const f = fac(dept);
    return f ? `${f.staffUsed} staff desks in use + ${f.held} held + ${f.hod?.desks ?? 0} HoD (facilities workbook)` : 'Needs the facilities workbook';
  };
  add('10.1 Staff', 'Business desks held today', 61, deskNow(B), { note: deskNote(B) });
  add('10.1 Staff', 'Design desks held today', 19, deskNow(D), { design: true, note: deskNote(D) });
  add('10.1 Staff', 'Mass Communication desks held today', 22, deskNow(MC), { note: deskNote(MC) });
  const allDesks = (dept: string) => {
    const f = fac(dept);
    return f ? f.offices.reduce((s, o) => s + o.desks, 0) : null;
  };
  add('10.6 South offices', 'Business office block desks (18 offices)', 65, allDesks(B), { note: 'All desks in the form, HoD included' });
  add('10.6 South offices', 'Design office desks (BO201–BO205, BO229)', 21, allDesks(D), { design: true, note: 'All desks in the form, HoD included' });
  add('10.6 South offices', 'Mass Communication office desks (incl. the PSC desk in BO121)', 24, allDesks(MC), { note: 'All desks in the form, HoD included' });

  // 11. Timetabling.
  const tue = [...bus.tuesdayBreak, ...des.tuesdayBreak, ...mc.tuesdayBreak];
  add('11. Timetabling', 'In-person classes in the Tuesday 12:00–14:00 break', 4, tue.length, {
    note: tue.map((c) => `${c.name} (${c.department === B ? 'Business' : c.department})`).join(', ')
  });
  add('11. Timetabling', 'Business classes on Thursday after 14:00', 'Not listed', bus.thursdayAfter2.length, {
    note: 'The proposal says to take this from the timetable',
    status: 'open'
  });
  add('11. Timetabling', 'Business evening classes (18:00–20:00)', 6, bus.evening.length);
  add('11. Timetabling', 'Online classes', 15, bus.onlineClasses + des.onlineClasses + mc.onlineClasses);
  add('11. Timetabling', 'Online hours a week', 27, bus.hours.online + des.hours.online + mc.hours.online);
  add('11. Timetabling', 'Hours under NC001 (Business + SRD)', 17, hoursIn([B, SRD], ['NC001']));
  add('11. Timetabling', 'Business hours under NC001', 9, hoursIn(B, ['NC001']));
  add('11. Timetabling', 'Design classes on Thursday after 14:00', 0, des.thursdayAfter2.length, { design: true });

  // Appendix: every room, hours by department.
  const rooms: RoomCheck[] = Object.entries(PROPOSAL_APPENDIX).map(([room, doc]) => {
    const ours: Record<string, number> = {};
    all.filter((m) => m.room === room).forEach((m) => (ours[m.department] = r1((ours[m.department] || 0) + m.hours)));
    const depts = new Set([...Object.keys(doc), ...Object.keys(ours)]);
    const same = Array.from(depts).every((d) => Math.abs((doc[d] || 0) - (ours[d] || 0)) < 0.05);
    const sum = (o: Record<string, number>) => r1(Object.values(o).reduce((s, v) => s + v, 0));
    return { room, doc, ours, docTotal: sum(doc), oursTotal: sum(ours), status: same ? 'match' : 'differs' };
  });
  const listed = new Set(Object.keys(PROPOSAL_APPENDIX));
  const missingFromAppendix = physical
    .filter((r) => !listed.has(r.room))
    .map((r) => ({ room: r.room, hours: r.selectedHours }));

  return { rows, rooms, missingFromAppendix };
}
