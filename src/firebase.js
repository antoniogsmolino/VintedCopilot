import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ATTENZIONE: Incolla qui l'oggetto `firebaseConfig` fornito dalla tua Console Firebase!
// Lo trovi in "Project Settings" -> "General" -> "Your Apps" (Web app)
const firebaseConfig = {
  // apiKey: "API_KEY",
  // authDomain: "PROJECT_ID.firebaseapp.com",
  // projectId: "PROJECT_ID",
  // storageBucket: "PROJECT_ID.appspot.com",
  // messagingSenderId: "SENDER_ID",
  // appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
