import {
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
  type NextOrObserver,
} from 'firebase/auth';
import { auth } from './config';

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // Enforce Parul University Google Domain restriction at Google Sign In level
  provider.setCustomParameters({ hd: 'paruluniversity.ac.in', prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export function onAuthStateChanged(callback: NextOrObserver<User>) {
  return firebaseOnAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
