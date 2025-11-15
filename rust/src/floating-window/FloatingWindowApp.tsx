import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./floating-window.css";

type SectionKey = "screenshot" | "inputField" | "selection";

interface Preset {
  id?: string | null;
  name?: string | null;
  prompt?: string | null;
}

interface PersistedState {
  presets?: Partial<Record<SectionKey, Preset[]>>;
}

interface NormalizedState {
  presets: Record<SectionKey, Preset[]>;
}

const STORAGE_KEY = "gobuddy_presets_v1";
const PRESETS_STATE_EVENT = "gobuddy://presets-state";
const PRESET_CLICK_EVENT = "gobuddy://preset-selected";

const SECTION_CONFIG: { key: SectionKey; label: string }[] = [
  { key: "screenshot", label: "Screenshot" },
  { key: "inputField", label: "Input Field" },
  { key: "selection", label: "Selection" },
];

const ICONS: Record<SectionKey, string> = {
  screenshot:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'/%3E%3Ccircle cx='12' cy='13' r='4'/%3E%3C/svg%3E",
  inputField:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='9' y1='9' x2='15' y2='9'/%3E%3Cline x1='9' y1='15' x2='15' y2='15'/%3E%3Cline x1='9' y1='12' x2='15' y2='12'/%3E%3C/svg%3E",
  selection:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3C/svg%3E",
};

const createEmptyCollection = (): Record<SectionKey, Preset[]> => ({
  screenshot: [],
  inputField: [],
  selection: [],
});

const normalizeState = (raw: unknown): NormalizedState => {
  const cleaned = createEmptyCollection();
  if (raw && typeof raw === "object") {
    const source = raw as PersistedState;
    SECTION_CONFIG.forEach(({ key }) => {
      const list = source.presets?.[key];
      if (Array.isArray(list)) {
        cleaned[key] = list.map((preset) => preset ?? {}).filter(Boolean) as Preset[];
      }
    });
  }
  return { presets: cleaned };
};

const getFallbackState = (): NormalizedState => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return normalizeState(JSON.parse(cached));
    }
  } catch {
    // ignore
  }
  return { presets: createEmptyCollection() };
};

const fetchLatestState = async (): Promise<NormalizedState> => {
  try {
    const state = await invoke<PersistedState | null>("load_presets_state");
    if (state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // ignore write errors
      }
      return normalizeState(state);
    }
  } catch (error) {
    console.warn("Failed to load presets via Tauri command", error);
  }
  return getFallbackState();
};

export function FloatingWindowApp() {
  const [presets, setPresets] = useState<Record<SectionKey, Preset[]>>(createEmptyCollection);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const applyState = useCallback((next: NormalizedState) => {
    setPresets(next.presets);
  }, []);

  const refreshPresets = useCallback(async () => {
    const latest = await fetchLatestState();
    applyState(latest);
  }, [applyState]);

  const handlePresetClick = useCallback(async (view: SectionKey, presetId: string | null | undefined) => {
    try {
      await emit(PRESET_CLICK_EVENT, { view, presetId: presetId ?? null });
    } catch (error) {
      console.warn("Failed to emit preset click event", error);
    }
  }, []);

  const closeWindow = useCallback(async () => {
    try {
      await invoke("hide_floating_window");
    } catch (error) {
      console.warn("Failed to close floating window", error);
    }
  }, []);

  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  useEffect(() => {
    let disposed = false;
    listen(PRESETS_STATE_EVENT, (event) => {
      applyState(normalizeState(event?.payload));
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlistenRef.current = unlisten;
        }
      })
      .catch((error) => {
        console.warn("Failed to listen for preset updates", error);
      });

    return () => {
      disposed = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [applyState]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshPresets();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshPresets();
      }
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshPresets]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeWindow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWindow]);

  return (
    <div className="floating-panel">
      <div className="panel-scroll">
        {SECTION_CONFIG.map(({ key, label }) => {
          const sectionPresets = presets[key] ?? [];
          return (
            <section className="section" key={key} data-view={key}>
              <div className="preset-list">
                {sectionPresets.length === 0 ? (
                  <div className="preset-empty-message">No presets in {label}</div>
                ) : (
                  sectionPresets.map((preset, index) => (
                    <button
                      type="button"
                      className="preset-button"
                      key={preset?.id ?? `preset-${key}-${index}`}
                      onClick={() => handlePresetClick(key, preset?.id ?? null)}
                    >
                      <img src={ICONS[key]} alt={`${label} preset icon`} />
                      <span>{preset?.name?.trim() ? preset.name : "Untitled Preset"}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default FloatingWindowApp;
