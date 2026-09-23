import type { RawRow } from '../types';

// Parses the Oracle BI Publisher "CollegeTimeTable" HTML export: one <table> per
// department (preceded by an <h2>Department Name : X</h2> heading), with the
// first table row as headers (Course Name, Section No, <day columns...>) and the
// Course Name cell merged (rowspan) across all sections of that course.
export function looksLikeOracleTimetableHtml(text: string): boolean {
  const head = text.slice(0, 4000);
  return /<html/i.test(head) && /Department Name\s*:/i.test(text) && /<table/i.test(text);
}

interface RowSpanEntry {
  text: string;
  remaining: number;
}

function cellText(cell: Element): string {
  return (cell.textContent || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTableGrid(table: HTMLTableElement): string[][] {
  const rows = Array.from(table.querySelectorAll('tr'));
  const grid: string[][] = [];
  const rowSpanTracker: Record<number, RowSpanEntry> = {};

  rows.forEach((tr) => {
    const cells = Array.from(tr.children).filter(
      (c) => c.tagName === 'TD' || c.tagName === 'TH'
    );
    const rowValues: string[] = [];
    let colIndex = 0;
    let cellPointer = 0;

    while (cellPointer < cells.length || rowSpanTracker[colIndex]) {
      const pending = rowSpanTracker[colIndex];
      if (pending && pending.remaining > 0) {
        rowValues[colIndex] = pending.text;
        pending.remaining--;
        if (pending.remaining === 0) delete rowSpanTracker[colIndex];
        colIndex++;
        continue;
      }

      const cell = cells[cellPointer];
      if (!cell) break;
      const text = cellText(cell);
      const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
      rowValues[colIndex] = text;
      if (rowspan > 1) {
        rowSpanTracker[colIndex] = { text, remaining: rowspan - 1 };
      }
      cellPointer++;
      colIndex++;
    }

    grid.push(rowValues);
  });

  return grid;
}

export function parseOracleTimetableHtml(html: string): RawRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows: RawRow[] = [];

  let currentDepartment: string | null = null;

  const body = doc.body;
  if (!body) return rows;

  Array.from(body.children).forEach((el) => {
    if (el.tagName === 'H2') {
      const text = cellText(el);
      const match = text.match(/Department Name\s*:\s*(.+)/i);
      if (match) {
        currentDepartment = match[1].trim();
      }
      return;
    }

    if (el.tagName === 'TABLE') {
      const grid = parseTableGrid(el as HTMLTableElement);
      if (grid.length < 2) return;
      const headers = grid[0];
      for (let r = 1; r < grid.length; r++) {
        const values = grid[r];
        const row: RawRow = {};
        headers.forEach((h, i) => {
          if (!h) return;
          row[h] = values[i] ?? '';
        });
        row['Department Name'] = currentDepartment || '';
        rows.push(row);
      }
    }
  });

  return rows;
}
