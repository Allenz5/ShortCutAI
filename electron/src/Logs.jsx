import React, { useEffect, useState, useMemo, useCallback } from 'react';
import './Logs.css';

const LEVEL_ORDER = ['fatal', 'error', 'warn', 'info'];
const LEVEL_LABELS = {
  fatal: 'Fatal',
  error: 'Error',
  warn: 'Warning',
  info: 'Info',
};

function Logs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isClearing, setIsClearing] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const data = await window.api?.getLogs?.();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load logs', err);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    const unsubscribe = window.api?.onLogsUpdated?.((entries) => {
      setLogs(Array.isArray(entries) ? entries : []);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter((log) => log.level === filter);
  }, [logs, filter]);

  const handleClear = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await window.api?.clearLogs?.();
      await loadLogs();
    } catch (err) {
      console.error('Failed to clear logs', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="logs-container">
      <header className="logs-header">
        <div>
          <h1>Diagnostics</h1>
          <p>Recent fatal, error, warning, and info entries from GoBuddy.</p>
        </div>
        <div className="logs-actions">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter level"
          >
            <option value="all">All Levels</option>
            {LEVEL_ORDER.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <button onClick={loadLogs}>
            Refresh
          </button>
          <button
            className="danger"
            onClick={handleClear}
            disabled={isClearing || logs.length === 0}
          >
            {isClearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </header>

      <div className="logs-feed">
        {filteredLogs.length === 0 ? (
          <div className="logs-empty">
            <p>No log entries{filter !== 'all' ? ` for ${LEVEL_LABELS[filter]}` : ''}.</p>
          </div>
        ) : (
          filteredLogs
            .slice()
            .reverse()
            .map((entry) => (
              <article key={entry.id} className={`log-card level-${entry.level || 'info'}`}>
                <div className="log-meta">
                  <span className="log-level">{LEVEL_LABELS[entry.level] || 'Info'}</span>
                  <time>{new Date(entry.timestamp || Date.now()).toLocaleString()}</time>
                </div>
                <pre className="log-message">{entry.message}</pre>
                {entry.meta && (
                  <pre className="log-meta-detail">{entry.meta}</pre>
                )}
              </article>
            ))
        )}
      </div>
    </div>
  );
}

export default Logs;
