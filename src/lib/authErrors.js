

export const getFirebaseAuthHint = (err) => {
  const code = err?.code || 'auth-error';
  if (code === 'auth/popup-blocked') return `Popup blocked. Allow popups for this site and try again. (${code})`;
  if (code === 'auth/popup-closed-by-user') return `The Google sign-in popup was closed before completing login. (${code})`;
  if (code === 'auth/unauthorized-domain') return `This domain is not authorized in Firebase Authentication. Add it under Authentication > Settings > Authorized domains. (${code})`;
  if (code === 'auth/operation-not-allowed') return `Google sign-in is not enabled for this Firebase project. Check Authentication > Sign-in method. (${code})`;
  if (code === 'auth/network-request-failed') return `Network request failed while contacting Firebase. Check internet access, VPN, or firewall rules. (${code})`;
  if (code === 'auth/cancelled-popup-request') return `Another popup sign-in request interrupted this one. Try again once. (${code})`;
  if (code === 'auth/internal-error') return `Firebase returned an internal auth error. Check the browser console and Firebase project settings. (${code})`;
  return `${err?.message || 'Sign-in failed.'} (${code})`;
};
