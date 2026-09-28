// Facts used by the South Campus space report, as confirmed by the user (Fall 2026).
// Change them here if rooms or rules change.

export type Windows = Record<string, [number, number]>; // day -> [start, end) in minutes

export interface SpaceReportConfig {
  departments: string[];
  /** Lab rooms per department (a lab may belong to several departments). */
  labs: Record<string, string[]>;
  /** Labs that exist but have no classes this semester, per department (count only). */
  unlistedLabs: Record<string, number>;
  /** Placeholder rooms used for online classes. */
  onlineRooms: string[];
  /** Times with no classes, per department. */
  blocked: Record<string, Windows>;
  open: number;
  close: number;
  days: string[];
  /** A room is "comfortable" at or below this share of its weekly hours. */
  comfort: number;
  /** Standard week used for current use percentages (5 days x 08:00-16:00). */
  standardWeek: number;
}

const TUESDAY_BREAK: [number, number] = [12 * 60, 14 * 60];
const THURSDAY_AFTER_2PM: [number, number] = [14 * 60, 18 * 60];

export const SPACE_REPORT_CONFIG: SpaceReportConfig = {
  departments: ['Business Studies', 'Design', 'Mass Communication'],
  labs: {
    'Business Studies': ['CR203', 'CR204', 'CR206'],
    Design: ['AB213', 'AB214', 'AY212', 'CT207', 'CT208'],
    'Mass Communication': ['AB213', 'AB214', 'AP114', 'AP115', 'CT207']
  },
  unlistedLabs: { 'Business Studies': 1 },
  onlineRooms: ['BO004', 'CN106'],
  blocked: {
    'Business Studies': { Tuesday: TUESDAY_BREAK },
    Design: { Tuesday: TUESDAY_BREAK, Thursday: THURSDAY_AFTER_2PM },
    'Mass Communication': { Tuesday: TUESDAY_BREAK, Thursday: THURSDAY_AFTER_2PM }
  },
  open: 8 * 60,
  close: 18 * 60,
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  comfort: 0.8,
  standardWeek: 40
};
