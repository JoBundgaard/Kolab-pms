// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9mWp_CP2tl-3MX8zMqpTcQ8nIDMxoXP4",
  authDomain: "kolab-living-pms.firebaseapp.com",
  projectId: "kolab-living-pms",
  storageBucket: "kolab-living-pms.firebasestorage.app",
  messagingSenderId: "892499834390",
  appId: "1:892499834390:web:778c2f92bc68f061fce737"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;