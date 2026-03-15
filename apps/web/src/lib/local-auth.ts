const LOCAL_AUTH_EMAIL_KEY = 'mangamate_local_auth_email';

export function setLocalAuth(email: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_AUTH_EMAIL_KEY, email);
  // Also set a cookie so the Next.js middleware can detect auth state server-side
  document.cookie = 'mangamate_authed=1; path=/; max-age=604800; SameSite=Lax';
}

export function clearLocalAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LOCAL_AUTH_EMAIL_KEY);
  document.cookie = 'mangamate_authed=; path=/; max-age=0';
}

export function hasLocalAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(LOCAL_AUTH_EMAIL_KEY));
}

export function getLocalAuthEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LOCAL_AUTH_EMAIL_KEY);
}
