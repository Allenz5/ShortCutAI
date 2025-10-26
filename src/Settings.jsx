import React, { useState, useEffect } from 'react';
import './Settings.css';

function Settings() {
  const [autoStart, setAutoStart] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    loadSettings();
  }, []);

  // Save with Enter key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoStart, apiKey]);

  const loadSettings = async () => {
    try {
      const config = await window.api.getConfig();
      setAutoStart(config.autoStart);
      setApiKey(config.apiKey || '');
    } catch (error) {
      showMessage('Error loading settings', 'error');
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000);
  };

  const handleSave = async () => {
    // Validate API key format
    if (apiKey && apiKey.trim() && !apiKey.startsWith('sk-')) {
      showMessage('Invalid API key format. OpenAI keys start with "sk-"', 'error');
      return;
    }

    try {
      const config = {
        autoStart,
        apiKey: apiKey.trim(),
      };

      await window.api.saveConfig(config);
      showMessage('Settings saved successfully!', 'success');

      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (error) {
      showMessage('Error saving settings', 'error');
    }
  };

  const handleCancel = () => {
    window.close();
  };

  return (
    <div className="settings-container">
      <h1>Settings</h1>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="setting-item">
        <label>Auto Open on Start</label>
        <div className="toggle-container">
          <label className="switch">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
          <span className="toggle-label">
            {autoStart ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="apiKey">OpenAI API Key</label>
        <input
          type="password"
          id="apiKey"
          placeholder="Enter your OpenAI API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="button-container">
        <button className="save-btn" onClick={handleSave}>
          Save
        </button>
        <button className="cancel-btn" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default Settings;

