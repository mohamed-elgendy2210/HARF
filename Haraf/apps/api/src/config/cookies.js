export function getSessionCookieOptions(isProduction, maxAge) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    ...(maxAge ? { maxAge } : {})
  };
}

export function getSessionCookieName(isProduction) {
  return isProduction ? '__Host-harf.sid' : 'harf.sid';
}
