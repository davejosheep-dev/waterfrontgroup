export function appOrigin(fallbackOrigin?: string) {
  return process.env.APP_URL?.replace(/\/$/, "") || fallbackOrigin?.replace(/\/$/, "") || null;
}

export function passwordResetRedirectUrl(fallbackOrigin?: string) {
  const origin = appOrigin(fallbackOrigin);
  return origin ? `${origin}/auth/callback?next=/update-password` : null;
}

export function passwordResetPageUrl(fallbackOrigin?: string) {
  const origin = appOrigin(fallbackOrigin);
  return origin ? `${origin}/update-password` : null;
}
