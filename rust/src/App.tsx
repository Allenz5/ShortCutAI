import { useEffect, useRef, useState } from "react";
import {
  register as registerGlobalShortcut,
  unregister as unregisterGlobalShortcut,
} from "@tauri-apps/plugin-global-shortcut";
import "./App.css";

const cameraIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'/%3E%3Ccircle cx='12' cy='13' r='4'/%3E%3C/svg%3E";
const inputIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='9' y1='9' x2='15' y2='9'/%3E%3Cline x1='9' y1='15' x2='15' y2='15'/%3E%3Cline x1='9' y1='12' x2='15' y2='12'/%3E%3C/svg%3E";
const cursorIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3C/svg%3E";
const plusIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'/%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3C/svg%3E";

const STORAGE_KEY = "gobuddy_profiles_v1";

type View = "screenshot" | "inputField" | "selection";
const allViews: View[] = ["screenshot", "inputField", "selection"];

type Panel =
  | { type: "section-config"; view: View }
  | { type: "profile-editor"; view: View; profileId: string }
  | { type: "settings" };

interface Profile {
  id: string;
  name: string;
  prompt: string;
}

interface SettingsState {
  autoOpenOnStart: boolean;
  openaiApiKey: string;
}

interface HotkeysState {
  screenshot: string;
}

interface PersistedState {
  profiles: Record<View, Profile[]>;
  nextProfileId: number;
  activeProfileIds: Record<View, string | null>;
  settings?: SettingsState;
  hotkeys?: HotkeysState;
}

const viewLabels: Record<View, string> = {
  screenshot: "ScreenShot",
  inputField: "InputField",
  selection: "Selection",
};

const defaultSettings: SettingsState = {
  autoOpenOnStart: false,
  openaiApiKey: "",
};

const defaultHotkeys: HotkeysState = {
  screenshot: "",
};

const createEmptyProfiles = (): Record<View, Profile[]> => ({
  screenshot: [],
  inputField: [],
  selection: [],
});

const createEmptyActiveProfiles = (): Record<View, string | null> => ({
  screenshot: null,
  inputField: null,
  selection: null,
});

const sanitizeProfile = (profile: Partial<Profile> & { id: string }): Profile => ({
  id: profile.id,
  name: profile.name ?? "Untitled Profile",
  prompt: profile.prompt ?? "",
});

const normalizeProfiles = (
  profiles: Partial<Record<View, Profile[]>> | undefined,
): Record<View, Profile[]> => ({
  screenshot: (profiles?.screenshot ?? []).map((profile) => sanitizeProfile(profile)),
  inputField: (profiles?.inputField ?? []).map((profile) => sanitizeProfile(profile)),
  selection: (profiles?.selection ?? []).map((profile) => sanitizeProfile(profile)),
});

const normalizeActiveProfileIds = (
  activeIds: Partial<Record<View, string | null>> | undefined,
): Record<View, string | null> => ({
  screenshot: activeIds?.screenshot ?? null,
  inputField: activeIds?.inputField ?? null,
  selection: activeIds?.selection ?? null,
});

const deriveNextProfileId = (profiles: Record<View, Profile[]>): number => {
  const maxFromIds = Object.values(profiles)
    .flat()
    .map((profile) => {
      const match = profile.id.match(/profile-(\d+)/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .reduce((acc, value) => Math.max(acc, value), 0);
  return maxFromIds + 1;
};

const normalizeSettings = (settings: SettingsState | undefined): SettingsState => ({
  autoOpenOnStart:
    typeof settings?.autoOpenOnStart === "boolean"
      ? settings.autoOpenOnStart
      : defaultSettings.autoOpenOnStart,
  openaiApiKey:
    typeof settings?.openaiApiKey === "string"
      ? settings.openaiApiKey
      : defaultSettings.openaiApiKey,
});

const normalizeHotkeys = (hotkeys: HotkeysState | undefined): HotkeysState => ({
  screenshot:
    typeof hotkeys?.screenshot === "string" ? hotkeys.screenshot : defaultHotkeys.screenshot,
});

const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta"] as const;

const MODIFIER_DISPLAY_MAP: Record<(typeof MODIFIER_KEYS)[number], string> = {
  Control: "Ctrl",
  Shift: "Shift",
  Alt: "Alt",
  Meta: "Meta",
};

const isModifierKey = (key: string): key is (typeof MODIFIER_KEYS)[number] =>
  MODIFIER_KEYS.includes(key as (typeof MODIFIER_KEYS)[number]);

const formatKeyName = (key: string): string => {
  if (key === " ") {
    return "Space";
  }
  if (key === "Escape") {
    return "Esc";
  }
  if (key.startsWith("Arrow")) {
    return key;
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (key === key.toLowerCase()) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  return key;
};

const buildHotkeyString = (event: KeyboardEvent): string => {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push(MODIFIER_DISPLAY_MAP.Control);
  }
  if (event.metaKey) {
    parts.push(MODIFIER_DISPLAY_MAP.Meta);
  }
  if (event.altKey) {
    parts.push(MODIFIER_DISPLAY_MAP.Alt);
  }
  if (event.shiftKey) {
    parts.push(MODIFIER_DISPLAY_MAP.Shift);
  }

  if (!isModifierKey(event.key)) {
    parts.push(formatKeyName(event.key));
  } else if (parts.length === 0) {
    parts.push(MODIFIER_DISPLAY_MAP[event.key]);
  }

  return parts.join(" + ");
};

const toAccelerator = (display: string): string =>
  display
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("+");

const isTauriEnvironment = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function App() {
  const [activeView, setActiveView] = useState<View>("screenshot");
  const [activePanel, setActivePanel] = useState<Panel>({ type: "section-config", view: "screenshot" });
  const [profiles, setProfiles] = useState<Record<View, Profile[]>>(() => createEmptyProfiles());
  const [nextProfileId, setNextProfileId] = useState<number>(1);
  const [activeProfileIds, setActiveProfileIds] = useState<Record<View, string | null>>(
    () => createEmptyActiveProfiles(),
  );
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [hotkeys, setHotkeys] = useState<HotkeysState>(defaultHotkeys);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [recordingDisplay, setRecordingDisplay] = useState("");

  const hasHydratedRef = useRef(false);
  const registeredScreenshotHotkeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        const normalizedProfiles = normalizeProfiles(parsed.profiles);
        setProfiles(normalizedProfiles);

        const storedNextProfileId = parsed.nextProfileId;
        if (typeof storedNextProfileId === "number" && storedNextProfileId > 0) {
          setNextProfileId(storedNextProfileId);
        } else {
          setNextProfileId(deriveNextProfileId(normalizedProfiles));
        }

        const normalizedActiveIds = normalizeActiveProfileIds(parsed.activeProfileIds);
        setActiveProfileIds(normalizedActiveIds);

        setSettings(normalizeSettings(parsed.settings));
        setHotkeys(normalizeHotkeys(parsed.hotkeys));
      } else {
        setProfiles(createEmptyProfiles());
        setNextProfileId(1);
        setActiveProfileIds(createEmptyActiveProfiles());
        setSettings(defaultSettings);
        setHotkeys(defaultHotkeys);
      }
    } catch (error) {
      console.warn("Failed to load profiles from storage", error);
      setProfiles(createEmptyProfiles());
      setNextProfileId(1);
      setActiveProfileIds(createEmptyActiveProfiles());
      setSettings(defaultSettings);
      setHotkeys(defaultHotkeys);
    } finally {
      hasHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current || typeof window === "undefined") {
      return;
    }

    const payload: PersistedState = {
      profiles,
      nextProfileId,
      activeProfileIds,
      settings,
      hotkeys,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist profiles", error);
    }
  }, [profiles, nextProfileId, activeProfileIds, settings, hotkeys]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return;
    }

    setActiveProfileIds((prev) => {
      let updated = false;
      const nextState: Record<View, string | null> = { ...prev };

      allViews.forEach((view) => {
        const currentList = profiles[view];

        if (currentList.length === 0) {
          if (nextState[view] !== null) {
            nextState[view] = null;
            updated = true;
          }
          return;
        }

        if (!currentList.some((profile) => profile.id === nextState[view])) {
          nextState[view] = currentList[0].id;
          updated = true;
        }
      });

      return updated ? nextState : prev;
    });

    setActivePanel((prev) => {
      if (prev.type === "profile-editor") {
        const list = profiles[prev.view];
        if (!list.some((profile) => profile.id === prev.profileId)) {
          return { type: "section-config", view: prev.view };
        }
      }
      return prev;
    });
  }, [profiles]);

  useEffect(() => {
    if (!isRecordingHotkey) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsRecordingHotkey(false);
        setRecordingDisplay("");
        return;
      }

      const hotkeyValue = buildHotkeyString(event);
      const hasNonModifierKey = !isModifierKey(event.key);

      if (hasNonModifierKey) {
        setHotkeys((prev) => ({
          ...prev,
          screenshot: hotkeyValue,
        }));
        setIsRecordingHotkey(false);
        setRecordingDisplay("");
      } else {
        setRecordingDisplay(hotkeyValue);
      }
    };

    const handleWindowBlur = () => {
      setIsRecordingHotkey(false);
      setRecordingDisplay("");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isRecordingHotkey]);

  useEffect(() => {
    if (!isRecordingHotkey) {
      setRecordingDisplay("");
    }
  }, [isRecordingHotkey]);

  useEffect(() => {
    if (!hasHydratedRef.current || !isTauriEnvironment()) {
      return;
    }

    const nextDisplay = hotkeys.screenshot.trim();
    const currentDisplay = registeredScreenshotHotkeyRef.current;
    const nextAccelerator = nextDisplay ? toAccelerator(nextDisplay) : null;
    const currentAccelerator = currentDisplay ? toAccelerator(currentDisplay) : null;

    if (currentAccelerator === nextAccelerator) {
      return;
    }

    let isDisposed = false;

    const updateShortcut = async () => {
      if (currentAccelerator) {
        try {
          await unregisterGlobalShortcut(currentAccelerator);
        } catch (error) {
          console.warn(
            `Failed to unregister previous screenshot shortcut "${currentAccelerator}"`,
            error,
          );
        } finally {
          if (!isDisposed) {
            registeredScreenshotHotkeyRef.current = null;
          }
        }
      }

      if (!nextAccelerator) {
        return;
      }

      try {
        await registerGlobalShortcut(nextAccelerator, (event) => {
          if (event.state !== "Pressed") {
            return;
          }

          window.dispatchEvent(
            new CustomEvent("gobuddy:screenshot-triggered", {
              detail: event,
            }),
          );
        });

        if (!isDisposed) {
          registeredScreenshotHotkeyRef.current = nextDisplay;
        } else {
          await unregisterGlobalShortcut(nextAccelerator);
        }
      } catch (error) {
        console.warn(`Failed to register screenshot shortcut "${nextAccelerator}"`, error);
      }
    };

    void updateShortcut();

    return () => {
      isDisposed = true;
    };
  }, [hotkeys.screenshot]);

  useEffect(() => {
    return () => {
      if (!isTauriEnvironment()) {
        return;
      }

      const currentDisplay = registeredScreenshotHotkeyRef.current;
      if (!currentDisplay) {
        return;
      }

      registeredScreenshotHotkeyRef.current = null;
      void unregisterGlobalShortcut(toAccelerator(currentDisplay)).catch((error) => {
        console.warn(
          `Failed to clean up screenshot shortcut "${toAccelerator(currentDisplay)}"`,
          error,
        );
      });
    };
  }, []);

  const handleSectionNavClick = (view: View) => {
    setActiveView(view);
    setActivePanel({ type: "section-config", view });
  };

  const addProfile = (view: View) => {
    const newProfile: Profile = {
      id: `profile-${nextProfileId}`,
      name: `Profile ${nextProfileId}`,
      prompt: "",
    };

    setProfiles((prev) => ({
      ...prev,
      [view]: [...prev[view], newProfile],
    }));

    setActiveProfileIds((prev) => ({
      ...prev,
      [view]: newProfile.id,
    }));

    setActivePanel({ type: "profile-editor", view, profileId: newProfile.id });
    setNextProfileId((prev) => prev + 1);
  };

  const updateProfile = (
    view: View,
    profileId: string,
    updates: Partial<Omit<Profile, "id">>,
  ) => {
    setProfiles((prev) => ({
      ...prev,
      [view]: prev[view].map((profile) =>
        profile.id === profileId ? { ...profile, ...updates } : profile,
      ),
    }));
  };

  const handleProfileClick = (view: View, profileId: string) => {
    setActiveView(view);
    setActiveProfileIds((prev) => ({
      ...prev,
      [view]: profileId,
    }));
    setActivePanel({ type: "profile-editor", view, profileId });
  };

  const deleteProfile = (view: View, profileId: string) => {
    let updatedList: Profile[] | null = null;

    setProfiles((prev) => {
      if (!prev[view].some((profile) => profile.id === profileId)) {
        return prev;
      }

      updatedList = prev[view].filter((profile) => profile.id !== profileId);
      return {
        ...prev,
        [view]: updatedList,
      };
    });

    if (!updatedList) {
      return;
    }

    setActiveProfileIds((prev) => {
      if (prev[view] !== profileId) {
        return prev;
      }

      return {
        ...prev,
        [view]: updatedList && updatedList.length > 0 ? updatedList[0].id : null,
      };
    });

    setActivePanel((prev) => {
      if (prev.type === "profile-editor" && prev.view === view && prev.profileId === profileId) {
        if (updatedList && updatedList.length > 0) {
          return { type: "profile-editor", view, profileId: updatedList[0].id };
        }
        return { type: "section-config", view };
      }
      return prev;
    });
  };

  const activeProfile =
    activePanel.type === "profile-editor"
      ? profiles[activePanel.view].find((profile) => profile.id === activePanel.profileId) ?? null
      : null;

  const renderScreenshotConfig = () => (
    <div className="section-config">
      <h1>{viewLabels.screenshot} Configuration</h1>
      <p className="section-description">
        Set up how screenshots behave when triggered from the shortcut.
      </p>

      <div className="hotkey-card">
        <div className="hotkey-text">
          <span className="hotkey-label">Capture Hotkey</span>
          <p className="hotkey-description">
            Choose the key combination that captures a screenshot. Press escape to cancel recording.
          </p>
          <div className="hotkey-display">
            {isRecordingHotkey
              ? recordingDisplay || "Press keys..."
              : hotkeys.screenshot || "No hotkey recorded yet"}
          </div>
        </div>
        <button
          type="button"
          className={`record-hotkey-button ${isRecordingHotkey ? "recording" : ""}`}
          onClick={() => {
            if (isRecordingHotkey) {
              setIsRecordingHotkey(false);
              setRecordingDisplay("");
            } else {
              setRecordingDisplay("");
              setIsRecordingHotkey(true);
            }
          }}
        >
          {isRecordingHotkey ? "Recording..." : "Record Hotkey"}
        </button>
      </div>
    </div>
  );

  const renderInputFieldConfig = () => (
    <div className="section-config">
      <h1>{viewLabels.inputField} Configuration</h1>
      <p className="section-description">No additional configuration available yet.</p>
    </div>
  );

  const renderSelectionConfig = () => (
    <div className="section-config">
      <h1>{viewLabels.selection} Configuration</h1>
      <p className="section-description">No additional configuration available yet.</p>
    </div>
  );

  const renderSettingsPanel = () => (
    <div className="settings-panel">
      <h1>Settings</h1>
      <p className="settings-description">
        Customize how GoBuddy behaves when the application launches.
      </p>

      <div className="settings-group">
        <div className="toggle-row">
          <div className="toggle-text">
            <span className="toggle-title">Auto Open on Start</span>
            <span className="toggle-description">
              Launch the application automatically when your device starts up.
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.autoOpenOnStart}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  autoOpenOnStart: event.target.checked,
                }))
              }
            />
            <span className="switch-slider" aria-hidden="true" />
          </label>
        </div>
      </div>

      <div className="settings-group">
        <div className="field-group">
          <label className="field-label" htmlFor="openai-api-key">
            OpenAI API Key
          </label>
          <input
            id="openai-api-key"
            className="text-input"
            type="password"
            value={settings.openaiApiKey}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                openaiApiKey: event.target.value,
              }))
            }
            placeholder="Enter your OpenAI API key"
          />
        </div>
      </div>
    </div>
  );

  const renderProfileEditor = () => {
    if (!activeProfile || activePanel.type !== "profile-editor") {
      return (
        <div className="content-page empty-state">
          <h2>{viewLabels[activeView]} Profiles</h2>
          <p>Create or select a profile on the left to start editing.</p>
        </div>
      );
    }

    const nameInputId = `profile-name-${activeProfile.id}`;
    const promptInputId = `profile-prompt-${activeProfile.id}`;

    return (
      <div className="profile-editor">
        <div className="profile-editor-header">
          <div className="profile-editor-heading">
            <span className="profile-editor-subtitle">
              {viewLabels[activePanel.view]} profile
            </span>
            <h1 className="profile-editor-title">
              {activeProfile.name.trim() === "" ? "Untitled Profile" : activeProfile.name}
            </h1>
          </div>
          <button
            type="button"
            className="delete-profile-button"
            onClick={() => deleteProfile(activePanel.view, activeProfile.id)}
          >
            Delete Profile
          </button>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={nameInputId}>
            Name
          </label>
          <input
            id={nameInputId}
            className="text-input"
            value={activeProfile.name}
            onChange={(event) =>
              updateProfile(activePanel.view, activeProfile.id, { name: event.target.value })
            }
            placeholder="Enter profile name"
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={promptInputId}>
            Prompt
          </label>
          <textarea
            id={promptInputId}
            className="text-area"
            value={activeProfile.prompt}
            onChange={(event) =>
              updateProfile(activePanel.view, activeProfile.id, { prompt: event.target.value })
            }
            placeholder="Describe what this profile should do..."
            rows={8}
          />
        </div>
      </div>
    );
  };

  const renderSectionConfig = (view: View) => {
    switch (view) {
      case "screenshot":
        return renderScreenshotConfig();
      case "inputField":
        return renderInputFieldConfig();
      case "selection":
        return renderSelectionConfig();
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (activePanel.type === "settings") {
      return renderSettingsPanel();
    }

    if (activePanel.type === "section-config") {
      return renderSectionConfig(activePanel.view);
    }

    if (activePanel.type === "profile-editor") {
      return renderProfileEditor();
    }

    return null;
  };

  const sidebarProfiles = profiles[activeView] ?? [];
  const selectedProfileId = activeProfileIds[activeView];
  const profileSidebarEnabled = activePanel.type !== "settings";

  return (
    <div className="app-container">
      <aside className="left-bar">
        <div className="top-buttons">
          <button
            type="button"
            className={`nav-button ${
              activePanel.type !== "settings" && activeView === "screenshot" ? "active" : ""
            }`}
            onClick={() => handleSectionNavClick("screenshot")}
          >
            <img src={cameraIcon} alt="ScreenShot" className="button-icon" />
            <span>ScreenShot</span>
          </button>
          <button
            type="button"
            className={`nav-button ${
              activePanel.type !== "settings" && activeView === "inputField" ? "active" : ""
            }`}
            onClick={() => handleSectionNavClick("inputField")}
          >
            <img src={inputIcon} alt="InputField" className="button-icon" />
            <span>InputField</span>
          </button>
          <button
            type="button"
            className={`nav-button ${
              activePanel.type !== "settings" && activeView === "selection" ? "active" : ""
            }`}
            onClick={() => handleSectionNavClick("selection")}
          >
            <img src={cursorIcon} alt="Selection" className="button-icon" />
            <span>Selection</span>
          </button>
        </div>

        {profileSidebarEnabled && (
          <div className="profiles-section">
            <div className="profiles-label">Profiles</div>
            <button
              type="button"
              className="profile-button add-profile-button"
              onClick={() => addProfile(activeView)}
            >
              <img src={plusIcon} alt="Add" className="button-icon" />
              <span>Add Profile</span>
            </button>
            <div className="profile-list">
              {sidebarProfiles.length === 0 ? (
                <div className="profiles-empty">No profiles yet. Add one to get started.</div>
              ) : (
                sidebarProfiles.map((profile) => (
                  <button
                    type="button"
                    key={profile.id}
                    className={`profile-button ${selectedProfileId === profile.id ? "active" : ""}`}
                    onClick={() => handleProfileClick(activeView, profile.id)}
                  >
                    <span>{profile.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div className="bottom-buttons">
          <button
            type="button"
            className={`nav-button settings-button ${activePanel.type === "settings" ? "active" : ""}`}
            onClick={() => setActivePanel({ type: "settings" })}
          >
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main className="right-page">{renderContent()}</main>
    </div>
  );
}

export default App;
