const LOCAL_AUTH_EMAIL_KEY = 'mangamate_local_auth_email';

export function setLocalAuth(email: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_AUTH_EMAIL_KEY, email);
}

export function clearLocalAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LOCAL_AUTH_EMAIL_KEY);
}

export function hasLocalAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(LOCAL_AUTH_EMAIL_KEY));
}
