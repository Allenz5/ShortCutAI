import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

function Selector() {
  const [profiles, setProfiles] = useState([]);
  const [token, setToken] = useState('');
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    window.api.onSelectorData(({ profiles, token }) => {
      setProfiles(profiles || []);
      setToken(token);
      setHighlight(0);
    });
  }, []);

  const choose = useCallback((index) => {
    if (!token) return;
    window.api.chooseSelectorIndex(token, index);
  }, [token]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < profiles.length) {
          choose(idx);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, profiles.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(highlight);
      } else if (e.key === 'Escape') {
        choose(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [profiles, choose, highlight]);

  return (
    <div style={{
      background: 'rgba(30,30,30,0.92)',
      color: '#fff',
      borderRadius: 8,
      boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      padding: 10,
      border: '1px solid rgba(255,255,255,0.08)'
    }}>
      {profiles.length === 0 ? (
        <div style={{ padding: 8, fontSize: 14 }}>No profiles</div>
      ) : profiles.map((p, i) => (
        <div
          key={p.id}
          onMouseEnter={() => setHighlight(i)}
          onClick={() => choose(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', cursor: 'pointer',
            background: i === highlight ? 'rgba(255,255,255,0.08)' : 'transparent',
            borderRadius: 6
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 4,
            background: '#4a90e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700
          }}>{i + 1}</div>
          <div style={{fontSize: 14, fontWeight: 600}}>{p.name}</div>
        </div>
      ))}
      <div style={{height: 2}} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Selector />
  </React.StrictMode>
);


