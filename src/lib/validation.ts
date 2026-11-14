export type Enrollment = { fullName: string; email: string; phone: string; organization: string; embedding: number[] };
export function validVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 64 && v.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(Math.hypot(...v) - 1) < 0.01;
}
export function validateEnrollment(value: unknown): Enrollment | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.fullName !== 'string' || typeof input.email !== 'string' || typeof input.phone !== 'string' || typeof input.organization !== 'string' || !validVector(input.embedding)) return null;
  const fullName = input.fullName.trim(), email = input.email.trim().toLowerCase();
  const phone = input.phone.trim(), organization = input.organization.trim();
  if (!fullName || fullName.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length > 40 || organization.length > 120) return null;
  return { fullName, email, phone, organization, embedding: input.embedding };
}
