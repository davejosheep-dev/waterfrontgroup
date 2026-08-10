export const usernamePattern = /^[a-z][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isUsername(value: string) {
  return usernamePattern.test(normalizeUsername(value));
}

export function usernameFromEmail(email: string, suffix?: string) {
  const localPart = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "staff";
  const safeBase = /^[a-z]/.test(localPart) ? localPart : `staff_${localPart}`;
  const normalizedSuffix = suffix?.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6);
  return `${safeBase.slice(0, normalizedSuffix ? 25 : 32)}${normalizedSuffix ? `_${normalizedSuffix}` : ""}`;
}

export function isEmailLike(value: string) {
  return value.includes("@");
}

