// WebAuthn helper for Face ID / fingerprint login
// Uses the browser's built-in biometric API — no third party needed

const RP_ID   = 'lrbudreau.github.io';
const RP_NAME = 'JB Brush Control';

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isBiometricAvailable() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

export function hasBiometricRegistered(userID) {
  return !!localStorage.getItem(`jb_biometric_${userID}`);
}

// Register biometric for a user after PIN login
export async function registerBiometric(userID, userName) {
  if (!isBiometricAvailable()) throw new Error('Biometrics not supported');

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: new TextEncoder().encode(userID),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7,   type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // device biometric only
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });

  // Store credential ID for this user
  const credID = bufferToBase64(credential.rawId);
  localStorage.setItem(`jb_biometric_${userID}`, credID);
  return true;
}

// Authenticate with biometric
export async function authenticateWithBiometric(userID) {
  if (!isBiometricAvailable()) throw new Error('Biometrics not supported');

  const credID = localStorage.getItem(`jb_biometric_${userID}`);
  if (!credID) throw new Error('No biometric registered for this user');

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: RP_ID,
      allowCredentials: [{
        id: base64ToBuffer(credID),
        type: 'public-key',
      }],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  return !!assertion;
}

export function clearBiometric(userID) {
  localStorage.removeItem(`jb_biometric_${userID}`);
}
