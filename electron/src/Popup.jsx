import { useState, useEffect } from 'react';

export function usePopup() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [generalConfig, setGeneralConfig] = useState({ hotkey: '' });

  useEffect(() => {
    loadPopupConfig();
  }, []);

  const loadPopupConfig = async () => {
    try {
      const config = await window.api.getSelectionConfig();
      setProfiles(config.profiles || []);
      setGeneralConfig(config.general || { hotkey: '' });
    } catch (error) {
      // Graceful: if not implemented yet, keep defaults
      console.warn('Popup config API not available yet; using defaults');
    }
  };

  const saveConfig = async () => {
    try {
      if (!window.api || !window.api.saveSelectionConfig) return; // optional until implemented
      await window.api.saveSelectionConfig({
        profiles,
        general: generalConfig,
      });
    } catch (error) {
      console.error('Error saving Popup config:', error);
      // No alert to avoid noise while feature not implemented
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

  // Auto-save on changes
  useEffect(() => {
    if (profiles.length > 0 || generalConfig.hotkey) {
      saveConfig();
    }
  }, [profiles, generalConfig]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return {
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    generalConfig,
    handleAddProfile,
    handleProfileClick,
    handleDeleteProfile,
    handleProfileUpdate,
    handleGeneralConfigUpdate,
    selectedProfile,
  };
}
