// Enums matching backend Prisma schema
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum Category {
  GENERAL = 'GENERAL',
  OBC = 'OBC',
  SC = 'SC',
  ST = 'ST',
}

export enum PartyRole {
  MEMBER = 'MEMBER',
  BOOTH_WORKER = 'BOOTH_WORKER',
  WARD_ADMIN = 'WARD_ADMIN',
  BLOCK_ADMIN = 'BLOCK_ADMIN',
}

export enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  BLOCK_ADMIN = 'BLOCK_ADMIN',
  WARD_ADMIN = 'WARD_ADMIN',
  BOOTH_WORKER = 'BOOTH_WORKER',
}

export enum EventType {
  RALLY = 'RALLY',
  MEETING = 'MEETING',
  FUNCTION = 'FUNCTION',
  GET_TOGETHER = 'GET_TOGETHER',
}

export enum AttendanceMethod {
  QR = 'QR',
  FINGERPRINT = 'FINGERPRINT',
  MANUAL = 'MANUAL',
}

export enum MessageType {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}

export enum TargetLevel {
  ALL = 'ALL',
  BLOCK = 'BLOCK',
  WARD = 'WARD',
  BOOTH = 'BOOTH',
}

// Entity types
export interface Block {
  id: string;
  name: string;
  district: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    wards: number;
    booths?: number;
    people: number;
  };
}

export interface Ward {
  id: string;
  name: string;
  blockId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    booths: number;
    people: number;
  };
}

export interface Booth {
  id: string;
  name: string;
  location: string | null;
  wardId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    people: number;
  };
}

export interface Person {
  id: string;
  uniqueId: string;
  fullName: string;
  fatherName: string | null;
  dob: string | null;
  gender: Gender;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  aadhaarNumber: string | null;
  voterId: string | null;
  address: string | null;
  pincode: string | null;
  occupation: string | null;
  caste: string | null;
  category: Category;
  photoUrl: string | null;
  aadhaarImageUrl: string | null;
  role: PartyRole;
  status: Status;
  boothId: string;
  wardId: string;
  blockId: string;
  createdAt: string;
  updatedAt: string;
  ward?: Ward;
  booth?: Booth;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  blockId: string | null;
  wardId: string | null;
  boothId: string | null;
  isActive: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  blockId: string | null;
  wardId: string | null;
  boothId: string | null;
  mustChangePassword?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message: string;
}

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  totalWards: number;
  totalBooths: number;
  newThisMonth: number;
}
