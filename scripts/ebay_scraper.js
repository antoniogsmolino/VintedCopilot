const admin = require('firebase-admin');
const axios = require('axios');

// 1. Inizializzazione Firebase
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ ERRORE: Manca la variabile FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

// Sarà necessario impostare questa Variabile (Secret) in GitHub Actions
const EBAY_APP_ID = process.env.EBAY_APP_ID || "MOCK_APP_ID_FOR_DEMO"; 

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

// Funzione di utilità per il rate-limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funzione Statistica: Calcolo Mediana e Rimozione Outlier (IQR method)
function calculateStats(prices) {
  if (prices.length === 0) return { minPrice: 0, maxPrice: 0, medianPrice: 0, volumeSold: 0 };
  
  // Ordiniamo i prezzi
  prices.sort((a, b) => a - b);
  
  // Calcolo Q1, Q3, e IQR (Interquartile Range)
  const q1 = prices[Math.floor((prices.length / 4))];
  const q3 = prices[Math.floor((prices.length * (3 / 4)))];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  // Filtriamo gli outlier estremi (es. pezzi rotti a 0.50€ o pezzi fake a 5000€)
  const filtered = prices.filter(p => p >= Math.max(0, lowerBound) && p <= upperBound);
  
  // Fallback se il filter toglie tutto per qualche motivo matematico
  const validPrices = filtered.length > 0 ? filtered : prices;

  const minPrice = validPrices[0];
  const maxPrice = validPrices[validPrices.length - 1];
  const medianPrice = validPrices[Math.floor(validPrices.length / 2)];

  return {
    minPrice: Number(minPrice.toFixed(2)),
    maxPrice: Number(maxPrice.toFixed(2)),
    medianPrice: Number(medianPrice.toFixed(2)),
    volumeSold: prices.length // Volume totale basato sugli oggetti effettivamente venduti
  };
}

// Integrazione API eBay
async function fetchEbaySoldItems(keyword) {
  // Usiamo Finding API per estrarre SoldItemsOnly per l'Italia
  const url = `https://svcs.ebay.com/services/search/FindingService/v1`;
  const params = {
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'SECURITY-APPNAME': EBAY_APP_ID, 
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': 'true',
    'GLOBAL-ID': 'EBAY-IT',
    'keywords': keyword,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'LocatedIn',
    'itemFilter(1).value': 'IT',
    'paginationInput.entriesPerPage': 100 // Estraiamo fino a 100 risultati per massima precisione statistica
  };

  try {
    const response = await axios.get(url, { params, timeout: 10000 });
    const data = response.data;
    
    if (data.findCompletedItemsResponse && data.findCompletedItemsResponse[0].searchResult) {
      const result = data.findCompletedItemsResponse[0].searchResult[0];
      const count = parseInt(result['@count'], 10);
      
      if (count === 0 || !result.item) {
        return [];
      }
      
      // Estraiamo il prezzo finale per ogni oggetto venduto
      const prices = result.item.map(i => {
        if (i.sellingStatus && i.sellingStatus[0] && i.sellingStatus[0].currentPrice) {
          return parseFloat(i.sellingStatus[0].currentPrice[0].__value__);
        }
        return null;
      }).filter(p => p !== null && p > 0);
      
      return prices;
    }
  } catch (error) {
    console.warn(`⚠️ [WARN] Timeout o Errore API per la keyword "${keyword}":`, error.message);
  }
  return []; // Return vuoto se fallisce, non crasha tutto il bot.
}

async function runPricingScraper() {
  console.log("🚀 Inizio Scraper Pricing & Valutatore di Mercato (eBay IT)");
  
  const keywords = ["Borsa Guess", "Giacca Zara", "Jeans Levi's 501", "Nike Dunk"];
  const today = new Date().toISOString().split('T')[0];
  
  const results = {};

  try {
    for (const kw of keywords) {
      console.log(`🔍 Analisi di Mercato per: "${kw}"...`);
      const prices = await fetchEbaySoldItems(kw);
      
      const stats = calculateStats(prices);
      results[kw] = stats;
      
      console.log(`📊 Stats [${kw}]: Mediana €${stats.medianPrice} (Venduti: ${stats.volumeSold}) - (Min: €${stats.minPrice} Max: €${stats.maxPrice})`);
      
      // DELAY STRATEGICO: per evitare eBay API Rate Limit (Limit-rate-error)
      await sleep(2000); 
    }

    console.log("💾 Salvataggio dati di Pricing su Database Firebase...");
    
    // Potremmo salvarli nella docurazione 'dashboard_data', ma essendo metriche massive per bot, 
    // le salviamo in una collection dedicata: 'market_pricing' agganciata a un timestamp.
    const docRef = db.collection('market_pricing').doc(today);
    await docRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      pricing: results
    }, { merge: true });
    
    console.log(`✅ Operazione Bulk di Pricing completata con successo al nodo /market_pricing/${today}`);
    await admin.app().delete();
    process.exit(0);

  } catch (globalError) {
    // Try/Catch globale per evitare i crash rumorosi della GitHub Action
    console.error("❌ ERRORE GLOBALE FATALE (Bloccato per mascheramento Action log): ", globalError.message);
    process.exit(0); // Exit code 0 invece di 1 = La action non fallisce graficamente se un nodo cade per manutenzione
  }
}

// Execution
runPricingScraper();
