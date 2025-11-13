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

const STORAGE_KEY = "gobuddy_presets_v1";

type View = "screenshot" | "inputField" | "selection";
const allViews: View[] = ["screenshot", "inputField", "selection"];

type Panel =
  | { type: "section-config"; view: View }
  | { type: "preset-editor"; view: View; presetId: string }
  | { type: "settings" };

interface Preset {
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
  presets: Record<View, Preset[]>;
  nextPresetId: number;
  activePresetIds: Record<View, string | null>;
  settings?: SettingsState;
  hotkeys?: HotkeysState;
}

const viewLabels: Record<View, string> = {
  screenshot: "ScreenShot",
  inputField: "Inline",
  selection: "Popup",
};

const defaultSettings: SettingsState = {
  autoOpenOnStart: false,
  openaiApiKey: "",
};

const defaultHotkeys: HotkeysState = {
  screenshot: "",
};

const createEmptyPresets = (): Record<View, Preset[]> => ({
  screenshot: [],
  inputField: [],
  selection: [],
});

const createEmptyActivePresets = (): Record<View, string | null> => ({
  screenshot: null,
  inputField: null,
  selection: null,
});

const sanitizePreset = (preset: Partial<Preset> & { id: string }): Preset => ({
  id: preset.id,
  name: preset.name ?? "Untitled Preset",
  prompt: preset.prompt ?? "",
});

const normalizePresets = (
  presets: Partial<Record<View, Preset[]>> | undefined,
): Record<View, Preset[]> => ({
  screenshot: (presets?.screenshot ?? []).map((preset) => sanitizePreset(preset)),
  inputField: (presets?.inputField ?? []).map((preset) => sanitizePreset(preset)),
  selection: (presets?.selection ?? []).map((preset) => sanitizePreset(preset)),
});

const normalizeActivePresetIds = (
  activeIds: Partial<Record<View, string | null>> | undefined,
): Record<View, string | null> => ({
  screenshot: activeIds?.screenshot ?? null,
  inputField: activeIds?.inputField ?? null,
  selection: activeIds?.selection ?? null,
});

const deriveNextPresetId = (presets: Record<View, Preset[]>): number => {
  const maxFromIds = Object.values(presets)
    .flat()
    .map((preset) => {
      const match = preset.id.match(/preset-(\d+)/);
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
  const [presets, setPresets] = useState<Record<View, Preset[]>>(() => createEmptyPresets());
  const [nextPresetId, setNextPresetId] = useState<number>(1);
  const [activePresetIds, setActivePresetIds] = useState<Record<View, string | null>>(
    () => createEmptyActivePresets(),
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
        const normalizedPresets = normalizePresets(parsed.presets);
        setPresets(normalizedPresets);

        const storedNextPresetId = parsed.nextPresetId;
        if (typeof storedNextPresetId === "number" && storedNextPresetId > 0) {
          setNextPresetId(storedNextPresetId);
        } else {
          setNextPresetId(deriveNextPresetId(normalizedPresets));
        }

        const normalizedActiveIds = normalizeActivePresetIds(parsed.activePresetIds);
        setActivePresetIds(normalizedActiveIds);

        setSettings(normalizeSettings(parsed.settings));
        setHotkeys(normalizeHotkeys(parsed.hotkeys));
      } else {
        setPresets(createEmptyPresets());
        setNextPresetId(1);
        setActivePresetIds(createEmptyActivePresets());
        setSettings(defaultSettings);
        setHotkeys(defaultHotkeys);
      }
    } catch (error) {
      console.warn("Failed to load presets from storage", error);
      setPresets(createEmptyPresets());
      setNextPresetId(1);
      setActivePresetIds(createEmptyActivePresets());
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
      presets,
      nextPresetId,
      activePresetIds,
      settings,
      hotkeys,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist presets", error);
    }
  }, [presets, nextPresetId, activePresetIds, settings, hotkeys]);

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return;
    }

    setActivePresetIds((prev) => {
      let updated = false;
      const nextState: Record<View, string | null> = { ...prev };

      allViews.forEach((view) => {
        const currentList = presets[view];

        if (currentList.length === 0) {
          if (nextState[view] !== null) {
            nextState[view] = null;
            updated = true;
          }
          return;
        }

        if (!currentList.some((preset) => preset.id === nextState[view])) {
          nextState[view] = currentList[0].id;
          updated = true;
        }
      });

      return updated ? nextState : prev;
    });

    setActivePanel((prev) => {
      if (prev.type === "preset-editor") {
        const list = presets[prev.view];
        if (!list.some((preset) => preset.id === prev.presetId)) {
          return { type: "section-config", view: prev.view };
        }
      }
      return prev;
    });
  }, [presets]);

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

  const addPreset = (view: View) => {
    const newPreset: Preset = {
      id: `preset-${nextPresetId}`,
      name: `Preset ${nextPresetId}`,
      prompt: "",
    };

    setPresets((prev) => ({
      ...prev,
      [view]: [...prev[view], newPreset],
    }));

    setActivePresetIds((prev) => ({
      ...prev,
      [view]: newPreset.id,
    }));

    setActivePanel({ type: "preset-editor", view, presetId: newPreset.id });
    setNextPresetId((prev) => prev + 1);
  };

  const updatePreset = (
    view: View,
    presetId: string,
    updates: Partial<Omit<Preset, "id">>,
  ) => {
    setPresets((prev) => ({
      ...prev,
      [view]: prev[view].map((preset) =>
        preset.id === presetId ? { ...preset, ...updates } : preset,
      ),
    }));
  };

  const handlePresetClick = (view: View, presetId: string) => {
    setActiveView(view);
    setActivePresetIds((prev) => ({
      ...prev,
      [view]: presetId,
    }));
    setActivePanel({ type: "preset-editor", view, presetId });
  };

  const deletePreset = (view: View, presetId: string) => {
    let updatedList: Preset[] | null = null;

    setPresets((prev) => {
      if (!prev[view].some((preset) => preset.id === presetId)) {
        return prev;
      }

      updatedList = prev[view].filter((preset) => preset.id !== presetId);
      return {
        ...prev,
        [view]: updatedList,
      };
    });

    if (!updatedList) {
      return;
    }

    setActivePresetIds((prev) => {
      if (prev[view] !== presetId) {
        return prev;
      }

      return {
        ...prev,
        [view]: updatedList && updatedList.length > 0 ? updatedList[0].id : null,
      };
    });

    setActivePanel((prev) => {
      if (prev.type === "preset-editor" && prev.view === view && prev.presetId === presetId) {
        if (updatedList && updatedList.length > 0) {
          return { type: "preset-editor", view, presetId: updatedList[0].id };
        }
        return { type: "section-config", view };
      }
      return prev;
    });
  };

  const activePreset =
    activePanel.type === "preset-editor"
      ? presets[activePanel.view].find((preset) => preset.id === activePanel.presetId) ?? null
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

  const renderPresetEditor = () => {
    if (!activePreset || activePanel.type !== "preset-editor") {
      return (
        <div className="content-page empty-state">
          <h2>{viewLabels[activeView]} Presets</h2>
          <p>Create or select a preset on the left to start editing.</p>
        </div>
      );
    }

    const nameInputId = `preset-name-${activePreset.id}`;
    const promptInputId = `preset-prompt-${activePreset.id}`;

    return (
      <div className="preset-editor">
        <div className="preset-editor-header">
          <div className="preset-editor-heading">
            <span className="preset-editor-subtitle">
              {viewLabels[activePanel.view]} preset
            </span>
            <h1 className="preset-editor-title">
              {activePreset.name.trim() === "" ? "Untitled Preset" : activePreset.name}
            </h1>
          </div>
          <button
            type="button"
            className="delete-preset-button"
            onClick={() => deletePreset(activePanel.view, activePreset.id)}
          >
            Delete Preset
          </button>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={nameInputId}>
            Name
          </label>
          <input
            id={nameInputId}
            className="text-input"
            value={activePreset.name}
            onChange={(event) =>
              updatePreset(activePanel.view, activePreset.id, { name: event.target.value })
            }
            placeholder="Enter preset name"
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor={promptInputId}>
            Prompt
          </label>
          <textarea
            id={promptInputId}
            className="text-area"
            value={activePreset.prompt}
            onChange={(event) =>
              updatePreset(activePanel.view, activePreset.id, { prompt: event.target.value })
            }
            placeholder="Describe what this preset should do..."
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

    if (activePanel.type === "preset-editor") {
      return renderPresetEditor();
    }

    return null;
  };

  const sidebarPresets = presets[activeView] ?? [];
  const selectedPresetId = activePresetIds[activeView];
  const presetSidebarEnabled = activePanel.type !== "settings";

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
            <img src={inputIcon} alt="Inline" className="button-icon" />
            <span>Inline</span>
          </button>
          <button
            type="button"
            className={`nav-button ${
              activePanel.type !== "settings" && activeView === "selection" ? "active" : ""
            }`}
            onClick={() => handleSectionNavClick("selection")}
          >
            <img src={cursorIcon} alt="Popup" className="button-icon" />
            <span>Popup</span>
          </button>
        </div>

        {presetSidebarEnabled && (
          <div className="presets-section">
            <div className="presets-label">Presets</div>
            <button
              type="button"
              className="preset-button add-preset-button"
              onClick={() => addPreset(activeView)}
            >
              <img src={plusIcon} alt="Add" className="button-icon" />
              <span>Add Preset</span>
            </button>
            <div className="preset-list">
              {sidebarPresets.length === 0 ? (
                <div className="presets-empty">No presets yet. Add one to get started.</div>
              ) : (
                sidebarPresets.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    className={`preset-button ${selectedPresetId === preset.id ? "active" : ""}`}
                    onClick={() => handlePresetClick(activeView, preset.id)}
                  >
                    <span>{preset.name}</span>
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
