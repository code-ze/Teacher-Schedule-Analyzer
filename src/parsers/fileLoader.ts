import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { RawRow } from '../types';
import { normalizeRows } from './scheduleProcessor';
import { looksLikeOracleTimetableHtml, parseOracleTimetableHtml } from './oracleHtmlParser';

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function parseCsvFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => resolve((results.data as RawRow[]) || []),
      error: (error) => reject(error)
    });
  });
}

async function parseSpreadsheetOrHtmlFile(file: File): Promise<RawRow[]> {
  const buffer = await readAsArrayBuffer(file);
  const bytes = new Uint8Array(buffer);

  // Sniff the first bytes to see if this ".xls" is really an HTML export
  // (common for Oracle BI Publisher / many college ERP timetable exports).
  const prefix = new TextDecoder('utf-8').decode(bytes.slice(0, 4000));
  if (looksLikeOracleTimetableHtml(prefix) || /^\s*<html/i.test(prefix)) {
    const fullText = new TextDecoder('utf-8').decode(bytes);
    if (looksLikeOracleTimetableHtml(fullText)) {
      return parseOracleTimetableHtml(fullText);
    }
  }

  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false }) as RawRow[];
}

export async function loadRowsFromFiles(files: FileList | File[]): Promise<RawRow[]> {
  const allRows: RawRow[] = [];
  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith('.csv');
    const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls');

    let rows: RawRow[] = [];
    if (isCsv) {
      rows = await parseCsvFile(file);
    } else if (isXlsx) {
      rows = await parseSpreadsheetOrHtmlFile(file);
    }
    allRows.push(...rows);
  }
  return normalizeRows(allRows);
}
