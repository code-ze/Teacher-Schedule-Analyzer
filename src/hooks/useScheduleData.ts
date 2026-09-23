import { useCallback, useState } from 'react';
import { loadRowsFromFiles } from '../parsers/fileLoader';
import { processScheduleData } from '../parsers/scheduleProcessor';
import type { ProcessedData } from '../types';

interface UseScheduleDataResult {
  data: ProcessedData | null;
  loading: boolean;
  error: string | null;
  loadFiles: (files: FileList | File[]) => Promise<void>;
}

export function useScheduleData(): UseScheduleDataResult {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) {
      setError('Please select at least one CSV or Excel file.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await loadRowsFromFiles(files);
      const processed = processScheduleData(rows);
      if (processed.totalClasses === 0) {
        setError(
          'No classes could be read from this file. Check that it has Course Name, Section No and day columns.'
        );
      }
      setData(processed);
    } catch (err) {
      setError('Error processing the data: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadFiles };
}
