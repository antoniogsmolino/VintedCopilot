const admin = require('firebase-admin');
const Parser = require('rss-parser');
const parser = new Parser();

// IN PRODUZIONE (GitHub Actions):
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ ERRORE: Manca la variabile FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("❌ ERRORE nel parsing di FIREBASE_SERVICE_ACCOUNT:", e.message);
  process.exit(1);
}

const db = admin.firestore();

// 1. Funzione per leggere i Trend Giornalieri da Google
async function fetchGoogleTrends() {
  try {
    console.log("-> Recupero Google Trends IT...");
    const feed = await parser.parseURL('https://trends.google.it/trends/trendingsearches/daily/rss?geo=IT');
    // Consideriamo solo i primi 5 trend più caldi di oggi in Italia
    return feed.items.slice(0, 5).map(item => ({
      keyword: item.title,
      traffic: item.contentSnippet || "N/A", 
      pubDate: item.pubDate,
      link: item.link
    }));
  } catch (err) {
    console.error("Errore fetch Google Trends:", err.message);
    return [];
  }
}

// 2. Funzione per estrarre le Nuove Inserzioni da eBay (rss)
async function fetchEbayListings(keyword) {
  try {
    console.log(`-> Recupero nuove inserzioni eBay per: ${keyword}...`);
    const query = encodeURIComponent(keyword);
    // _sop=10 significa "Newly Listed" (Appena messi in vendita), vitale per i "Drop"
    const feed = await parser.parseURL(`https://www.ebay.it/sch/i.html?_nkw=${query}&_sop=10&_rss=1`); 

    // Prendiamo i 10 più recenti
    return feed.items.slice(0, 10).map(item => ({
      id: item.guid || item.link,
      title: item.title,
      link: item.link,
      pubDate: item.pubDate
    }));
  } catch (err) {
    console.error(`Errore fetch eBay per ${keyword}:`, err.message);
    return [];
  }
}


async function updateDashboardData() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`⏳ Avvio scraping per la data: ${today}...`);
    
    // ESEGUE LE CHIAMATE SCRAPER IN PARALLELO PER MASSIMA VELOCITA' (gratuitamente)
    // Puoi espandere/cambiare le keyword liberamente!
    const [trends, dropsGiacche, dropsY2k] = await Promise.all([
      fetchGoogleTrends(),
      fetchEbayListings("giacca pelle vintage"),
      fetchEbayListings("borsa y2k")
    ]);
    
    const docRef = db.collection('dashboard_data').doc(today);

    // MEGA-PAYLOAD DENSO
    // L'app utente scarica esattamente SOLO QUANTO VEDI QUI SOTTO, con 1 sola lettura.
    const aggregatedData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stats: {
        totalTrends: trends.length,
        totalVintageDrops: dropsGiacche.length + dropsY2k.length
      },
      trends: trends,
      recentDrops: [
        ...dropsGiacche,
        ...dropsY2k
      ]
    };

    // Scrive su Database
    await docRef.set(aggregatedData);
    
    console.log(`✅ [SUCCESSO] Dati REALI salvati su DB in /dashboard_data/${today}`);
    
    await admin.app().delete(); 
    process.exit(0);

  } catch (error) {
    console.error(`❌ [ERRORE DI SCRITTURA]`, error);
    process.exit(1);
  }
}

// Avvia lo script
updateDashboardData();
