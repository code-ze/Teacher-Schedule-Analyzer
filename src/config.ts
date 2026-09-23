export const WORK_HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
] as const;

export const WORK_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'] as const;
export type WorkDay = typeof WORK_DAYS[number];

// Wider hour range used for classroom occupancy grids (captures early/late classes)
export const DISPLAY_HOURS: string[] = [];
for (let h = 6; h <= 21; h++) {
  DISPLAY_HOURS.push(h.toString().padStart(2, '0') + ':00');
}

// Full occupancy baseline: 8am-4pm (8 hours) = 100%
export const FULL_OCCUPANCY_HOURS = 8;

export function extractClassId(courseName: string | undefined | null): string {
  if (!courseName) return '';
  const m = String(courseName).match(/^[A-Z]{3,5}\d{3,4}/i);
  return m ? m[0].toUpperCase() : String(courseName).split(' ')[0];
}
