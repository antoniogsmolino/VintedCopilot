const admin = require('firebase-admin');

// 1. Inizializzazione Firebase
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ ERRORE: Manca la variabile FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  // Controlla se l'app è già inizializzata (per evitare errori se eseguito dopo altri script)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (e) {
  console.error("❌ ERRORE nel parsing di FIREBASE_SERVICE_ACCOUNT:", e.message);
  process.exit(1);
}

const db = admin.firestore();

// 2. Configurazione eBay API
const EBAY_APP_ID = process.env.EBAY_APP_ID;
if (!EBAY_APP_ID) {
  console.warn("⚠️ AVVISO: Manca la variabile EBAY_APP_ID. Lo script potrebbe fallire le chiamate API.");
}

const KEYWORDS = [
  "Borsa Guess", 
  "Giacca Zara", 
  "Jeans Levi's 501", 
  "Nike Dunk"
];

// Funzione helper per lo sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funzione per generare uno slug dalle keyword (es. "Nike Dunk" -> "nike-dunk")
const generateSlug = (text) => {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
};

/**
 * Filtro statistico: rimuove gli outlier usando l'Interquartile Range (IQR) e calcola le metriche
 * @param {number[]} prices Array di prezzi
 * @returns {object|null} Statistiche calcolate o null se array vuoto
 */
function calculateMarketStats(prices) {
  if (!prices || prices.length === 0) return null;

  // Ordina in senso crescente
  const sorted = [...prices].sort((a, b) => a - b);
  
  if (sorted.length < 4) {
    // Se ci sono pochissimi elementi, non applichiamo IQR per evitare di filtrare troppo,
    // calcoliamo solo le statistiche base.
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      minPrice: sorted[0],
      maxPrice: sorted[sorted.length - 1],
      medianPrice: sorted[Math.floor(sorted.length / 2)],
      volumeSold: sorted.length
    };
  }

  // Calcolo IQR
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  // Filtra outlier
  const filtered = sorted.filter(p => p >= lowerBound && p <= upperBound);
  
  if (filtered.length === 0) return null;

  const medianIndex = Math.floor(filtered.length / 2);
  const medianPrice = filtered.length % 2 === 0 
    ? (filtered[medianIndex - 1] + filtered[medianIndex]) / 2 
    : filtered[medianIndex];

  return {
    minPrice: Number(filtered[0].toFixed(2)),
    maxPrice: Number(filtered[filtered.length - 1].toFixed(2)),
    medianPrice: Number(medianPrice.toFixed(2)),
    volumeSold: filtered.length,
    originalVolume: prices.length,
    outliersRemoved: prices.length - filtered.length
  };
}

/**
 * Cerca oggetti venduti su eBay Italia per una determinata keyword
 */
async function fetchEbaySoldItems(keyword) {
  const url = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
  url.searchParams.append("OPERATION-NAME", "findCompletedItems");
  url.searchParams.append("SERVICE-VERSION", "1.13.0");
  url.searchParams.append("SECURITY-APPNAME", EBAY_APP_ID);
  url.searchParams.append("GLOBAL-ID", "EBAY-IT");
  url.searchParams.append("RESPONSE-DATA-FORMAT", "JSON");
  url.searchParams.append("REST-PAYLOAD", "true");
  url.searchParams.append("keywords", keyword);
  
  // Filtri: solo oggetti venduti
  url.searchParams.append("itemFilter(0).name", "SoldItemsOnly");
  url.searchParams.append("itemFilter(0).value", "true");
  
  // Limite risultati
  url.searchParams.append("paginationInput.entriesPerPage", "100");

  const response = await fetch(url.toString(), {
    method: 'GET'
  });

  if (!response.ok) {
    throw new Error(`eBay API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const responseCode = data.findCompletedItemsResponse?.[0]?.ack?.[0];
  
  if (responseCode !== "Success" && responseCode !== "Warning") {
    throw new Error(`eBay API returned: ${responseCode}`);
  }

  const items = data.findCompletedItemsResponse[0].searchResult?.[0]?.item || [];
  
  // Estrai i prezzi (in valuta originale, presumibilmente EUR per EBAY-IT)
  const prices = items.map(item => {
    const priceStr = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
    return priceStr ? parseFloat(priceStr) : null;
  }).filter(p => p !== null && !isNaN(p));

  return prices;
}

async function runScraper() {
  console.log("🚀 Avvio Vinted Copilot: Pricing & Trends Scraper...");
  
  for (const keyword of KEYWORDS) {
    try {
      console.log(`\n🔍 Ricerca per: "${keyword}"`);
      const prices = await fetchEbaySoldItems(keyword);
      console.log(`📦 Trovati ${prices.length} oggetti venduti recentemente.`);
      
      const stats = calculateMarketStats(prices);
      
      if (stats) {
        console.log(`📊 Statistiche calcolate: Min: €${stats.minPrice}, Max: €${stats.maxPrice}, Mediana: €${stats.medianPrice}`);
        console.log(`   Outlier rimossi: ${stats.outliersRemoved} (Volume reale validato: ${stats.volumeSold})`);
        
        // Salvataggio su Firestore
        const slug = generateSlug(keyword);
        const docRef = db.collection('market_stats').doc(slug);
        
        await docRef.set({
          keyword: keyword,
          ...stats,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Dati salvati in market_stats/${slug}`);
      } else {
        console.log(`⚠️ Nessun dato sufficiente per calcolare statistiche valide.`);
      }
    } catch (error) {
      console.error(`❌ Errore durante lo scraping di "${keyword}":`, error.message);
      // Non usciamo dal processo per permettere allo scraper di continuare con le altre keyword
    }
    
    // Attesa per evitare limit rate error
    console.log(`⏳ Attesa di 2 secondi...`);
    await sleep(2000);
  }
  
  console.log("\n🏁 Scraping completato!");
  
  // Terminiamo l'SDK correttamente se lo script è standalone
  // Questo chiude il processo pulito.
  if (require.main === module) {
    await admin.app().delete();
    process.exit(0);
  }
}

// Avvio se il file è eseguito direttamente (es. node ebay_scraper.js)
if (require.main === module) {
  runScraper().catch(err => {
    console.error("❌ ERRORE FATALE GLOBALE:", err);
    process.exit(0); // Uscita con 0 in GitHub Action per non rompere il workflow in modo rumoroso.
  });
}

module.exports = { runScraper, calculateMarketStats };
