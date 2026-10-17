// Supabase Auth identifies users by email. The spares app shows usernames instead and
// maps them to <username>@<domain>. Set VITE_USERNAME_DOMAIN in .env to change the domain.
export const USERNAME_DOMAIN = (import.meta.env["VITE_USERNAME_DOMAIN"] as string | undefined) || "bkspares.com";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_DOMAIN}`;
}

export function emailToUsername(email: string | undefined | null): string {
  if (!email) return "";
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -(USERNAME_DOMAIN.length + 1)) : email;
}
