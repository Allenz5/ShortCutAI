import React, { useState, useEffect } from 'react';
import './InputField.css';

function InputField() {
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

  return (
    <div className="inputfield-container">
      {/* Left Panel */}
      <div className="left-panel">
        <button 
          className={`config-btn ${selectedProfileId === null ? 'active' : ''}`}
          onClick={() => setSelectedProfileId(null)}
        >
          ⚙️ Configuration
        </button>
        <button className="add-profile-btn" onClick={handleAddProfile}>
          + Add Profile
        </button>
        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className={`profile-item ${
                selectedProfileId === profile.id ? 'active' : ''
              }`}
              onClick={() => handleProfileClick(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        {selectedProfile ? (
          // Profile Editor
          <div className="profile-editor">
            <h2>Profile Settings</h2>
            <div className="form-group">
              <label htmlFor="profile-name">Name</label>
              <input
                type="text"
                id="profile-name"
                value={selectedProfile.name}
                onChange={(e) => handleProfileUpdate('name', e.target.value)}
                placeholder="Untitled"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-prompt">Prompt</label>
              <textarea
                id="profile-prompt"
                value={selectedProfile.prompt}
                onChange={(e) => handleProfileUpdate('prompt', e.target.value)}
                placeholder="Enter your prompt here..."
                rows={10}
              />
            </div>
            <button
              className="delete-btn"
              onClick={() => handleDeleteProfile(selectedProfile.id)}
            >
              Delete Profile
            </button>
          </div>
        ) : (
          // General Configuration
          <div className="general-config">
            <h2>InputField Configuration</h2>
            <p className="config-description">
              Global hotkey to trigger the profile selector.
            </p>
            <div className="form-group">
              <label htmlFor="hotkey">HotKey Binding</label>
              <div className="hotkey-input-group">
                <div className="hotkey-display">
                  {generalConfig.hotkey || 'Not set'}
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
          </div>
        )}
      </div>
    </div>
  );
}

export default InputField;

