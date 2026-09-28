/// <reference lib="webworker" />
import { analyzeSpace } from './analyze';
import type { SpaceReportConfig } from './config';
import type { CourseSection } from '../../types';

// Runs the (slow) room-packing analysis off the main thread: once with the time
// rules and once without them, for the "without the new rules" comparison.
self.onmessage = (e: MessageEvent<{ courses: Record<string, CourseSection>; config: SpaceReportConfig; iterations: number }>) => {
  const { courses, config, iterations } = e.data;
  try {
    const analysis = analyzeSpace(courses, config, {
      iterations,
      onProgress: (d) => self.postMessage({ type: 'progress', text: `Working out rooms for ${d}…` })
    });
    const noBlock = analyzeSpace(courses, config, {
      iterations,
      noBlock: true,
      onProgress: (d) => self.postMessage({ type: 'progress', text: `Comparing without the time rules: ${d}…` })
    });
    self.postMessage({ type: 'done', analysis, noBlock });
  } catch (err) {
    self.postMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
  }
};
