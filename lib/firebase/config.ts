import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDOnTaicN-MudCt6IRNd8dkvenGSWxkL0o",
  authDomain: "pu-fop.firebaseapp.com",
  projectId: "pu-fop",
  storageBucket: "pu-fop.firebasestorage.app",
  messagingSenderId: "1073182352519",
  appId: "1:1073182352519:web:f1a3cf54ae7727b81c4422",
  measurementId: "G-2VBM546Z5Q"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };
