import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// WebView detection for Android
const isWebView = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    userAgent.includes('wv') || 
    (userAgent.includes('android') && userAgent.includes('version/'))
  );
};

// Apply sessionStorage persistence fix for WebViews to ensure session stability
if (isWebView()) {
  setPersistence(auth, browserSessionPersistence)
    .catch((err) => console.error("Firebase persistence error:", err));
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    // Using signInWithPopup as requested for Android WebView compatibility
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const errorCode = error?.code;
    if (errorCode !== 'auth/popup-closed-by-user') {
      console.error('Error signing in with Google', error);
    }
    throw error;
  }
};

export const logout = () => signOut(auth);
