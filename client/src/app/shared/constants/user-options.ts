export type UserRole = 'owner' | 'secretary' | 'audit_teller' | 'conductor' | 'driver';

export const USER_ROLES: { value: Exclude<UserRole, 'owner'>; label: string }[] = [
  { value: 'secretary', label: 'Secretary' },
  { value: 'audit_teller', label: 'Audit Teller' },
  { value: 'conductor', label: 'Conductor' },
  { value: 'driver', label: 'Driver' },
];

export const NAME_SUFFIXES: string[] = ['Jr.', 'Sr.', 'I', 'II', 'III', 'IV', 'V'];
