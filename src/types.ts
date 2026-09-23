export interface RawRow {
  [key: string]: string | undefined;
}

export interface TeacherSlot {
  isBusy: boolean;
  course: string | null;
  room: string | null;
  classId?: string;
  section?: string;
  timeRange?: string;
}

export interface Teacher {
  name: string;
  department: string | null;
  schedule: Record<string, Record<string, TeacherSlot>>;
  totalClasses: number;
}

export interface ClassroomSlot {
  isOccupied: boolean;
  course: string | null;
  teacher: string | null;
  classId?: string;
  section?: string;
  department?: string | null;
  timeRange?: string;
}

export interface Classroom {
  name: string;
  schedule: Record<string, Record<string, ClassroomSlot>>;
  totalHours: number;
  totalClasses: number;
  departments: Set<string>;
  occupancyPercentage?: number;
  occupancyCategory?: 'high' | 'medium' | 'low';
}

export interface SectionMeeting {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  teacher: string;
}

export interface CourseSection {
  key: string;
  code: string;
  name: string;
  section: string;
  department: string | null;
  teacher: string;
  schedule: Record<string, SectionMeeting[]>;
}

export interface ProcessedData {
  teachers: Record<string, Teacher>;
  classrooms: Record<string, Classroom>;
  courses: Record<string, CourseSection>;
  totalClasses: number;
  departments: string[];
}

export interface DepartmentUtilization {
  name: string;
  totalClasses: number;
  totalHours: number;
  teacherCount: number;
  roomCount: number;
  rooms: string[];
  maxDailyHours: number;
  utilizationPercentage: number;
}
