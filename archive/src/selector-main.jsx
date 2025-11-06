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
      background: '#FFFFFF',
      borderRadius: 8,
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
      padding: 6,
      minWidth: 220,
      maxWidth: 320
    }}>
      {profiles.length === 0 ? (
        <div style={{ 
          padding: '16px', 
          fontSize: 15,
          color: '#8E8E93',
          textAlign: 'center'
        }}>No profiles</div>
      ) : profiles.map((p, i) => (
        <div
          key={p.id}
          onMouseEnter={() => setHighlight(i)}
          onClick={() => choose(i)}
          style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: 10,
            padding: '8px 10px', 
            cursor: 'pointer',
            background: i === highlight ? '#F2F2F7' : 'transparent',
            borderRadius: 6,
            transition: 'background 0.15s ease',
            margin: '1px 0'
          }}
        >
          <div style={{
            width: 20, 
            height: 20, 
            borderRadius: 4,
            background: i === highlight ? '#007AFF' : '#E5E5EA',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: 11, 
            fontWeight: 600,
            color: i === highlight ? '#FFFFFF' : '#8E8E93',
            transition: 'all 0.15s ease'
          }}>{i + 1}</div>
          <div style={{
            fontSize: 15, 
            fontWeight: 400,
            color: '#000000'
          }}>{p.name}</div>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Selector />
  </React.StrictMode>
);


