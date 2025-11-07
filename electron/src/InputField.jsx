import React, { useState, useEffect } from 'react';
import './InputField.css';
import { usePopup } from './Popup';

function InputField() {
  const [activeSection, setActiveSection] = useState('inline'); // 'inline' | 'popup'
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [generalConfig, setGeneralConfig] = useState({ hotkey: '' });
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    loadInputFieldConfig();
  }, []);

  const loadInputFieldConfig = async () => {
    try {
      const config = await window.api.getInputFieldConfig();
      setProfiles(config.profiles || []);
      setGeneralConfig(config.general || { hotkey: '' });
    } catch (error) {
      console.error('Error loading Inline config:', error);
      alert('Failed to load Inline configuration. Please restart TextBuddy.');
    }
  };

  const saveConfig = async () => {
    try {
      await window.api.saveInputFieldConfig({
        profiles,
        general: generalConfig,
      });
    } catch (error) {
      console.error('Error saving Inline config:', error);
      alert('Failed to save Inline configuration. Your changes may not be saved.');
    }
  };

  const handleAddProfile = () => {
    if (profiles.length >= 9) {
      alert('Maximum 9 presets allowed (use number keys 1-9 to select).');
      return;
    }
    
    // Ensure unique preset names
    let profileNumber = profiles.length + 1;
    let newName = `Preset ${profileNumber}`;
    while (profiles.some(p => p.name === newName)) {
      profileNumber++;
      newName = `Preset ${profileNumber}`;
    }
    const newProfile = {
      id: Date.now().toString(),
      name: newName,
      prompt: '',
    };
    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    setSelectedProfileId(newProfile.id);
  };

  const handleProfileClick = (profileId) => {
    setSelectedProfileId(profileId);
  };

  const handleDeleteProfile = (profileId) => {
    // Prevent deleting the last preset
    if (profiles.length <= 1) {
      alert('Cannot delete the last preset. You must have at least one preset.');
      return;
    }
    
    const updatedProfiles = profiles.filter((p) => p.id !== profileId);
    setProfiles(updatedProfiles);
    if (selectedProfileId === profileId) {
      setSelectedProfileId(null);
    }
  };

  const handleProfileUpdate = (field, value) => {
    // Prevent empty preset names
    if (field === 'name' && !value.trim()) {
      return;
    }
    
    const updatedProfiles = profiles.map((p) =>
      p.id === selectedProfileId ? { ...p, [field]: value } : p
    );
    setProfiles(updatedProfiles);
  };

  const handleGeneralConfigUpdate = (field, value) => {
    setGeneralConfig({ ...generalConfig, [field]: value });
  };

  const handleStartRecording = () => {
    setIsRecording(true);
  };

  const handleKeyDown = (e) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Allow Escape to cancel recording
    if (e.key === 'Escape') {
      setIsRecording(false);
      return;
    }

    // Build the key combination
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    // Get the actual key (excluding modifier keys)
    let key = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      // Don't record if only modifier keys are pressed
      return;
    }

    // Convert key to more readable format
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();

    const hotkeyString = [...modifiers, key].join('+');
    
    // Update currently active section's general config
    handleSectionGeneralConfigUpdate('hotkey', hotkeyString);
    setIsRecording(false);
  };

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [isRecording, handleKeyDown]);

  // Add this new useEffect:
  useEffect(() => {
    // Cleanup recording state on unmount
    return () => {
      if (isRecording) {
        setIsRecording(false);
      }
    };
  }, [isRecording]);

  // Auto-save on changes
  useEffect(() => {
    if (profiles.length > 0 || generalConfig.hotkey) {
      saveConfig();
    }
  }, [profiles, generalConfig, saveConfig]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // Popup section state and handlers (logic housed in separate file)
  const popup = usePopup();

  // Derived bindings based on active section
  const isInline = activeSection === 'inline';
  const sectionProfiles = isInline ? profiles : popup.profiles;
  const sectionSelectedProfileId = isInline ? selectedProfileId : popup.selectedProfileId;
  const sectionSelectedProfile = isInline ? selectedProfile : popup.selectedProfile;
  const handleAddSectionProfile = isInline ? handleAddProfile : popup.handleAddProfile;
  const handleSectionProfileClick = isInline ? handleProfileClick : popup.handleProfileClick;
  const handleSectionDeleteProfile = isInline ? handleDeleteProfile : popup.handleDeleteProfile;
  const handleSectionProfileUpdate = isInline ? handleProfileUpdate : popup.handleProfileUpdate;
  const sectionGeneralConfig = isInline ? generalConfig : popup.generalConfig;
  const handleSectionGeneralConfigUpdate = isInline ? handleGeneralConfigUpdate : popup.handleGeneralConfigUpdate;

  return (
    <div className="inline-container">
      {/* Left Panel */}
      <div className="left-panel">
        <button
          className={`config-btn ${isInline ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('inline');
            setSelectedProfileId(null); // Always show Inline general config when switching
          }}
        >
          <span className="icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </span>
          <span>Inline</span>
        </button>
        <button
          className={`config-btn ${!isInline ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('popup');
            popup.setSelectedProfileId(null); // Always show Popup general config when switching
          }}
        >
          <span className="icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v4H3z" />
              <path d="M3 10h18v11H3z" />
            </svg>
          </span>
          <span>Popup</span>
        </button>
        <div className="menu-title">Presets</div>
        <button className="add-profile-btn" onClick={handleAddSectionProfile}>+ Add Preset</button>
        <div className="profile-list">
          {sectionProfiles.map((profile) => (
            <button
              key={profile.id}
              className={`profile-item ${sectionSelectedProfileId === profile.id ? 'active' : ''}`}
              onClick={() => handleSectionProfileClick(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>
        <div className="left-spacer" />
        <div className="secondary-buttons">
          <button className="settings-btn" onClick={() => window.api?.openSettings?.()}>Settings</button>
          <button className="logs-btn" onClick={() => window.api?.openLogs?.()}>Logs</button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        {sectionSelectedProfile ? (
          // Preset Editor
          <div className="profile-editor">
            <h2>Preset Settings</h2>
            <div className="form-group">
              <label htmlFor="profile-name">Name</label>
              <input
                type="text"
                id="profile-name"
                value={sectionSelectedProfile.name}
                onChange={(e) => handleSectionProfileUpdate('name', e.target.value)}
                placeholder="Untitled"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-prompt">Prompt</label>
              <textarea
                id="profile-prompt"
                value={sectionSelectedProfile.prompt}
                onChange={(e) => handleSectionProfileUpdate('prompt', e.target.value)}
                placeholder="Enter your prompt here..."
                rows={10}
              />
            </div>
            <button
              className="delete-btn"
              onClick={() => handleSectionDeleteProfile(sectionSelectedProfile.id)}
            >
              Delete Preset
            </button>
          </div>
        ) : (
          // General Configuration
          <div className="general-config">
            <h2>{isInline ? 'Inline Configuration' : 'Popup Configuration'}</h2>
            <>
              <p className="config-description">
                {isInline
                  ? 'Select some text, then press this shortcut to choose a preset and replace the highlighted text with the AI answer.'
                  : 'Select some text, then press this shortcut to choose a preset and read the AI answer in a small popup window.'}
              </p>
              <div className="form-group">
                <label htmlFor="hotkey">HotKey Binding</label>
                <div className="hotkey-input-group">
                  <div className="hotkey-display">
                    {sectionGeneralConfig.hotkey || 'Not set'}
                  </div>
                  <button
                    className={`record-hotkey-btn ${isRecording ? 'recording' : ''}`}
                    onClick={handleStartRecording}
                  >
                    {isRecording ? '⏺ Press a key combination...' : '🎯 Record Hotkey'}
                  </button>
                </div>
                <small className="help-text">
                  Click "Record Hotkey" and press your desired key combination
                </small>
              </div>
            </>
          </div>
        )}
      </div>
    </div>
  );
}

export default InputField;
