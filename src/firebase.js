import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ATTENZIONE: Incolla qui l'oggetto `firebaseConfig` fornito dalla tua Console Firebase!
// Lo trovi in "Project Settings" -> "General" -> "Your Apps" (Web app)
const firebaseConfig = {
  apiKey: "AIzaSyDT8_poZhj__NmnWJ8kLFPt2YELp3IuoMM",
  authDomain: "vintedcopilot-a6bd3.firebaseapp.com",
  projectId: "vintedcopilot-a6bd3",
  storageBucket: "vintedcopilot-a6bd3.firebasestorage.app",
  messagingSenderId: "241717121516",
  appId: "1:241717121516:web:41d2e6453292f44425b0c9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
