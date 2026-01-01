
export enum AccountStatus {
  PENDING = 'PENDENTE',
  ACTIVE = 'ATIVO',
  INACTIVE = 'INATIVO',
  BLOCKED = 'BLOQUEADO',
  PENDING_RESET = 'PENDENTE_REDEFINIÇÃO'
}

export enum UserRole {
  ADMIN_PRINCIPAL = 'ADMIN_PRINCIPAL', // Único e Inabalável
  ADMIN_SETORIAL = 'ADMIN_SETORIAL',
  USER = 'USER'
}

export enum Gender {
  MALE = 'Masculino',
  FEMALE = 'Feminino'
}

export enum Privilege {
  ELDER = 'Ancião',
  MINISTERIAL_SERVANT = 'Servo Ministerial',
  PUBLISHER = 'Publicador',
  BROTHER_SISTER = 'Irmão / Irmã'
}

export enum NotificationType {
  NEW = 'NOVA',
  CHANGE = 'ALTERAÇÃO',
  CANCEL = 'CANCELAMENTO',
  CONFIRMATION = 'CONFIRMAÇÃO',
  CHAT = 'CHAT',
  URGENT = 'URGENTE',
  PASSWORD_RESET = 'REDEFINIÇÃO_SENHA'
}

export enum MessageType {
  TEXT = 'TEXTO',
  AUDIO = 'ÁUDIO',
  IMAGE = 'FOTO',
  VIDEO = 'VÍDEO',
  DOCUMENT = 'DOCUMENTO'
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetId?: string;
  timestamp: string;
  details?: string;
}

export interface UserSession {
  userId: string;
  loginTimestamp: number;
  expiresAt: number; // Controle de 24h
  deviceId: string;
}

export interface CongregationMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  type: MessageType;
  content: string; 
  fileName?: string;
  caption?: string; 
  timestamp: string;
  isPinned?: boolean;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  email: string;
  password?: string;
  isEmailVerified: boolean;
  isBiometricEnabled?: boolean;
  loginAttempts: number; 
  lockedUntil?: number; 
  phone: string;
  congregation: string;
  gender: Gender;
  privilege: Privilege;
  status: AccountStatus;
  role: UserRole;
  createdAt: string;
  // Controle de E-mail
  emailResendCount?: number;
  lastEmailResendAt?: string;
}

export interface MonthlyProgram {
  id: string;
  month: string;
  year: string;
  publishDate: string;
  pdfUrl: string;
  fileSize: string;
}

export interface Designation {
  id: string;
  userId: string;
  type: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  helper?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  designationType: string;
  senderName?: string;
  date: string;
  time: string;
  location: string;
  notes?: string;
  timestamp: string;
  isRead: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
