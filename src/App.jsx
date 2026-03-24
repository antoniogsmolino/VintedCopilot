import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Sparkles, ShoppingBag, TrendingUp, Clock } from 'lucide-react';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        // PERFETTO B2C COST-SAVER: Eseguiamo SOLO UNO scaricamento documenti!
        const today = new Date().toISOString().split('T')[0];
        const docRef = doc(db, 'dashboard_data', today);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setData(docSnap.data());
        } else {
          setError("I nuovi dati di oggi non sono ancora stati generati, oppure il file firebaseConfig in src/firebase.js non è completo!");
        }
      } catch (err) {
        console.error("Errore fetch Firebase:", err);
        setError("Impossibile connettersi al database. Ricordati di impostare il firebaseConfig!");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []); // Esegue solo 1 volta al montaggio!

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Caricamento Vinted Copilot...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <h2>Oops!</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      
      <header className="header">
        <h1><Sparkles className="inline-icon" size={28} /> Vinted Copilot</h1>
        <p>Il radar superveloce per le occasioni vintage</p>
      </header>

      {/* TRENDS BLOCK */}
      <section className="glass-card">
        <h2><TrendingUp size={22} style={{ marginRight: '8px', verticalAlign: '-3px', color: '#ff7eb3' }}/> I Trend di Oggi</h2>
        <div className="trends-container">
          {data?.trends?.length > 0 ? (
            data.trends.map((trend, index) => (
              <div key={index} className="trend-pill">
                <span style={{ fontSize: '1.2rem' }}>🔥</span> {trend.keyword}
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-light)' }}>Nessun trend rilevato oggi.</p>
          )}
        </div>
      </section>

      {/* DROPS BLOCK */}
      <section className="glass-card">
        <h2><ShoppingBag size={22} style={{ marginRight: '8px', verticalAlign: '-3px', color: '#ff7eb3' }}/> Drop Recenti eBay</h2>
        <div className="drops-container">
          {data?.recentDrops?.length > 0 ? (
            data.recentDrops.map((drop, index) => {
              // Estraiamo l'orario se disponibile, o una piccola label
              const timeString = drop.pubDate ? new Date(drop.pubDate).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'}) : 'Oggi';

              return (
                <a key={index} href={drop.link} target="_blank" rel="noreferrer" className="drop-item">
                  <div className="drop-title">{drop.title || drop.keyword}</div>
                  <div className="drop-meta">
                    <span style={{color: '#ff7eb3'}}>Scovato su eBay</span>
                    <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                      <Clock size={14} /> {timeString}
                    </span>
                  </div>
                </a>
              );
            })
          ) : (
            <p style={{ color: 'var(--text-light)' }}>Nessun drop rilevato per oggi. Torna domani!</p>
          )}
        </div>
      </section>

    </div>
  );
}

export default App;
