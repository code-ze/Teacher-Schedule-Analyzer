import * as XLSX from 'xlsx';

// Reads the "Department Facilities Requirements" workbook (one sheet per department)
// and keeps CURRENT figures only: the "Current Number Available" for staff offices and
// workstations, and the office/desk list. Required numbers and gaps are ignored.

export interface OfficeRow {
  office: string;
  desks: number;
  used: number;
  /** Desks kept free for someone away (e.g. maternity leave). */
  held: number;
  /** Desks in the office used by another department's staff. */
  otherDept: number;
  isHod: boolean;
  note: string;
}

export interface DepartmentFacilities {
  department: string;
  sheet: string;
  formOffices: number | null;
  formDesks: number | null;
  offices: OfficeRow[];
  hod: OfficeRow | null;
  staffOffices: number;
  staffDesks: number;
  staffUsed: number;
  held: number;
  free: number;
}

const DEPARTMENT_PATTERNS: [RegExp, string][] = [
  [/business|economics|ceba/i, 'Business Studies'],
  [/mass\s*comm/i, 'Mass Communication'],
  [/design/i, 'Design']
];

export function departmentFromName(name: string): string | null {
  const hit = DEPARTMENT_PATTERNS.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const firstInt = (s: string) => {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
};

// Free-text desk descriptions such as "4 Fully used", "Only 3 desks used currently",
// "3 used and 1 for maternity leave", "4 and 1 used by PSC staff member", "1 HoD Office".
export function parseDeskText(text: string): Pick<OfficeRow, 'desks' | 'used' | 'held' | 'otherDept'> & { understood: boolean } {
  const t = text.toLowerCase();
  let m = t.match(/(\d+)\s*used\s*and\s*(\d+)\s*(?:for|on|held)/);
  if (m) {
    const used = +m[1];
    const held = +m[2];
    return { desks: used + held, used, held, otherDept: 0, understood: true };
  }
  m = t.match(/(\d+)\s*and\s*(\d+)\s*used\s*by/);
  if (m) return { desks: +m[1], used: +m[1], held: 0, otherDept: +m[2], understood: true };
  const desks = firstInt(t);
  if (isNaN(desks)) return { desks: 0, used: 0, held: 0, otherDept: 0, understood: false };
  m = t.match(/only\s*(\d+)/) || t.match(/(\d+)\s*(?:desks?\s*)?used/);
  if (m && +m[1] !== desks) return { desks, used: +m[1], held: 0, otherDept: 0, understood: true };
  if (/fully used|hod/.test(t) || m) return { desks, used: desks, held: 0, otherDept: 0, understood: true };
  return { desks, used: desks, held: 0, otherDept: 0, understood: false };
}

function readSheet(ws: XLSX.WorkSheet, sheet: string): DepartmentFacilities | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }).map((r) => r.map(clean));
  const nameRow = rows.find((r) => /department\s*\/\s*centre/i.test(r[0]));
  const department = nameRow ? departmentFromName(nameRow[1]) : departmentFromName(sheet);
  if (!department) return null;
  const current = (label: RegExp) => {
    const r = rows.find((row) => label.test(row[0]));
    const n = r ? firstInt(r[3]) : NaN;
    return isNaN(n) ? null : n;
  };

  const offices: OfficeRow[] = [];
  const headerIdx = rows.findIndex((r) => /office\s*\/\s*room/i.test(r[0]));
  if (headerIdx >= 0) {
    const header = rows[headerIdx].map((h) => h.toLowerCase());
    const availCol = header.findIndex((h) => /desks?\s*available/.test(h));
    const usedCol = header.findIndex((h) => /desks?\s*used/.test(h));
    const remarksCol = header.findIndex((h) => /remarks/.test(h));
    const namesCol = header.findIndex((h) => /names/.test(h));
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || /^\d+\.\s/.test(r[0])) break; // end of the list (TOTAL row or next section)
      const names = namesCol >= 0 ? r[namesCol] : '';
      const remarks = remarksCol >= 0 ? r[remarksCol] : '';
      const isHod = /hod/i.test(`${names} ${r[availCol] ?? ''} ${remarks}`);
      let row: OfficeRow;
      if (usedCol >= 0 && !isNaN(firstInt(r[usedCol]))) {
        // Structured layout: numbers in "Desks available" / "Desks used".
        row = {
          office: r[0],
          desks: firstInt(r[availCol]),
          used: firstInt(r[usedCol]),
          held: 0,
          otherDept: 0,
          isHod,
          note: isHod ? 'HoD office' : /part.?tim/i.test(names) ? 'Also used by part-time staff' : ''
        };
      } else {
        // Free-text layout: "4 Fully used", "Only 3 used", ...
        const text = `${r[availCol] ?? ''} ${remarks}`.trim();
        const parsed = parseDeskText(text);
        row = {
          office: r[0],
          desks: parsed.desks,
          used: parsed.used,
          held: parsed.held,
          otherDept: parsed.otherDept,
          isHod,
          note: isHod
            ? 'HoD office'
            : parsed.held
              ? `${parsed.held} desk held for staff on leave`
              : parsed.otherDept
                ? `${parsed.otherDept} desk used by another department's staff`
                : parsed.understood
                  ? ''
                  : `As written: "${text}"`
        };
      }
      offices.push(row);
    }
  }

  const hod = offices.find((o) => o.isHod) ?? null;
  const staff = offices.filter((o) => !o.isHod);
  const staffDesks = staff.reduce((s, o) => s + o.desks - o.otherDept, 0);
  const staffUsed = staff.reduce((s, o) => s + o.used - o.otherDept, 0);
  const held = staff.reduce((s, o) => s + o.held, 0);
  return {
    department,
    sheet,
    formOffices: current(/^staff offices/i),
    formDesks: current(/^staff workstations/i),
    offices,
    hod,
    staffOffices: staff.length,
    staffDesks,
    staffUsed,
    held,
    free: Math.max(0, staffDesks - staffUsed - held)
  };
}

export function readFacilitiesWorkbook(data: ArrayBuffer | Uint8Array): DepartmentFacilities[] {
  const wb = XLSX.read(data, { type: 'array' });
  return wb.SheetNames.map((n) => readSheet(wb.Sheets[n], n)).filter((d): d is DepartmentFacilities => d !== null);
}
