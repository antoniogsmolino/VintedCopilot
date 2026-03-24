const admin = require('firebase-admin');

// IN PRODUZIONE (GitHub Actions):
// Il JSON del Service Account verrà iniettato da un secret GitHub.
// Qui lo recuperiamo dalla variabile d'ambiente o lanciamo errore se assente.
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ ERRORE: Manca la variabile FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // databaseURL: "https://vinted-copilot.firebaseio.com" // Da aggiungere se si usa anche RealtimeDB
  });
} catch (e) {
  console.error("❌ ERRORE nel parsing di FIREBASE_SERVICE_ACCOUNT:", e.message);
  process.exit(1);
}

const db = admin.firestore();

async function updateDashboardData() {
  try {
    // Otteniamo la data odierna in formato YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    console.log(`⏳ Avvio aggiornamento dashboard per data: ${today}...`);

    // Riferimento al documento UNICO che l'app scaricherà
    const docRef = db.collection('dashboard_data').doc(today);

    // ESEMPIO DI PAYLOAD AGGREGATO:
    // Mettiamo TUTTO qui dentro. Il client B2C eseguirà 1 SOLA LETTURA per ricevere:
    // - Trends (es da Google Trends/eBay)
    // - Drop recenti (da RSS)
    // - Statistiche di mercato
    const aggregatedData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      trends: [
        { keyword: "occhiali prada y2k", score: 99, direction: "up" },
        { keyword: "y2k bag", score: 85, direction: "up" }
      ],
      recentDrops: [
        { id: "item_101", title: "Levi's 501 Vintage 90s", price: 35.00, url: "..." },
        { id: "item_102", title: "Giacca Pelle Moto", price: 120.00, url: "..." }
      ],
      stats: {
        totalListingsParsed: 3450,
        averagePrice: 42.50
      }
    };

    // Usiamo .set() per creare il doc (o sovrascriverlo se stiamo facendo un aggiornamento)
    await docRef.set(aggregatedData);

    console.log(`✅ [SUCCESSO] Dati aggregati salvati in /dashboard_data/${today}`);

    // Chiudiamo l'SDK per permettere al processo Node di terminare pulito
    await admin.app().delete();
    process.exit(0);

  } catch (error) {
    console.error(`❌ [ERRORE DI SCRITTURA] Impossibile salvare su Firestore:`, error);
    process.exit(1);
  }
}

updateDashboardData();
