import { useCallback, useState } from 'react';
import { loadRowsFromFiles } from '../parsers/fileLoader';
import { processScheduleData } from '../parsers/scheduleProcessor';
import type { ProcessedData } from '../types';
import { isStudentWorkbook, readStudentWorkbook, type StudentData } from '../utils/students/students';

interface UseScheduleDataResult {
  data: ProcessedData | null;
  loading: boolean;
  error: string | null;
  fileNames: string[];
  students: StudentData | null;
  studentFileName: string;
  loadFiles: (files: FileList | File[]) => Promise<void>;
  clearStudents: () => void;
}

export function useScheduleData(): UseScheduleDataResult {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentData | null>(null);
  const [studentFileName, setStudentFileName] = useState('');

  const loadFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) {
      setError('Please select at least one CSV or Excel file.');
      return;
    }
    const list = Array.from(files);
    setLoading(true);
    setError(null);
    try {
      // A student registration workbook can be dropped anywhere; keep it apart from the timetable.
      const timetableFiles: File[] = [];
      for (const file of list) {
        if (/\.xlsx?$/i.test(file.name)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (isStudentWorkbook(bytes)) {
            setStudents(readStudentWorkbook(bytes));
            setStudentFileName(file.name);
            continue;
          }
        }
        timetableFiles.push(file);
      }
      if (timetableFiles.length === 0) return;

      const rows = await loadRowsFromFiles(timetableFiles);
      const processed = processScheduleData(rows);
      if (processed.totalClasses === 0) {
        setError(
          'No classes could be read from this file. Check that it has Course Name, Section No and day columns.'
        );
      }
      setData(processed);
      setFileNames(timetableFiles.map((f) => f.name));
    } catch (err) {
      setError('Error processing the data: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearStudents = useCallback(() => {
    setStudents(null);
    setStudentFileName('');
  }, []);

  return { data, loading, error, fileNames, students, studentFileName, loadFiles, clearStudents };
}
