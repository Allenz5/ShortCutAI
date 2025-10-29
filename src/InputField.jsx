import React, { useState, useEffect } from 'react';
import './InputField.css';
import { useSelection } from './Selection';

function InputField() {
  const [activeSection, setActiveSection] = useState('inputfield'); // 'inputfield' | 'selection'
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
      console.error('Error loading InputField config:', error);
      alert('Failed to load configuration. Please restart the application.');
    }
  };

  const saveConfig = async () => {
    try {
      await window.api.saveInputFieldConfig({
        profiles,
        general: generalConfig,
      });
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration. Your changes may not be saved.');
    }
  };

  const handleAddProfile = () => {
    if (profiles.length >= 9) {
      alert('Maximum 9 profiles allowed (use number keys 1-9 to select).');
      return;
    }
    
    // Ensure unique profile names
    let profileNumber = profiles.length + 1;
    let newName = `Profile ${profileNumber}`;
    while (profiles.some(p => p.name === newName)) {
      profileNumber++;
      newName = `Profile ${profileNumber}`;
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
    // Prevent deleting the last profile
    if (profiles.length <= 1) {
      alert('Cannot delete the last profile. You must have at least one profile.');
      return;
    }
    
    const updatedProfiles = profiles.filter((p) => p.id !== profileId);
    setProfiles(updatedProfiles);
    if (selectedProfileId === profileId) {
      setSelectedProfileId(null);
    }
  };

  const handleProfileUpdate = (field, value) => {
    // Prevent empty profile names
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
    
    handleGeneralConfigUpdate('hotkey', hotkeyString);
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

  // Selection section state and handlers (logic housed in separate file)
  const selection = useSelection();

  // Derived bindings based on active section
  const isInputField = activeSection === 'inputfield';
  const sectionProfiles = isInputField ? profiles : selection.profiles;
  const sectionSelectedProfileId = isInputField ? selectedProfileId : selection.selectedProfileId;
  const sectionSelectedProfile = isInputField ? selectedProfile : selection.selectedProfile;
  const handleAddSectionProfile = isInputField ? handleAddProfile : selection.handleAddProfile;
  const handleSectionProfileClick = isInputField ? handleProfileClick : selection.handleProfileClick;
  const handleSectionDeleteProfile = isInputField ? handleDeleteProfile : selection.handleDeleteProfile;
  const handleSectionProfileUpdate = isInputField ? handleProfileUpdate : selection.handleProfileUpdate;
  const sectionGeneralConfig = isInputField ? generalConfig : selection.generalConfig;
  const handleSectionGeneralConfigUpdate = isInputField ? handleGeneralConfigUpdate : selection.handleGeneralConfigUpdate;

  return (
    <div className="inputfield-container">
      {/* Left Panel */}
      <div className="left-panel">
        <button
          className={`config-btn ${isInputField ? 'active' : ''}`}
          onClick={() => setActiveSection('inputfield')}
        >
          <span className="icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </span>
          <span>InputField</span>
        </button>
        <button
          className={`config-btn ${!isInputField ? 'active' : ''}`}
          onClick={() => setActiveSection('selection')}
        >
          <span className="icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v4H3z" />
              <path d="M3 10h18v11H3z" />
            </svg>
          </span>
          <span>Selection</span>
        </button>
        <div className="menu-title">Profiles</div>
        <button className="add-profile-btn" onClick={handleAddSectionProfile}>+ Add Profile</button>
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
        <button className="settings-btn" onClick={() => window.api?.openSettings?.()}>Settings</button>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        {sectionSelectedProfile ? (
          // Profile Editor
          <div className="profile-editor">
            <h2>Profile Settings</h2>
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
              Delete Profile
            </button>
          </div>
        ) : (
          // General Configuration
          <div className="general-config">
            <h2>{isInputField ? 'InputField Configuration' : 'Selection Configuration'}</h2>
            {isInputField ? (
              <>
                <p className="config-description">Global hotkey to trigger the profile selector.</p>
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
            ) : (
              <>
                <p className="config-description">Enable or disable Selection feature.</p>
                <div className="form-group">
                  <label htmlFor="enable-selection">Enable Selection</label>
                  <div className="hotkey-input-group" style={{ borderBottom: 'none', padding: 0 }}>
                    <input
                      id="enable-selection"
                      type="checkbox"
                      checked={Boolean(sectionGeneralConfig.enabled)}
                      onChange={(e) => handleSectionGeneralConfigUpdate('enabled', e.target.checked)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InputField;

