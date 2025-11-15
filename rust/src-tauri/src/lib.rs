use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State};
use rdev::{listen, Event, EventType, Button};

// Track drag state
#[derive(Clone, Debug)]
struct DragState {
    is_pressed: bool,
    start_x: f64,
    start_y: f64,
    has_moved: bool,
    last_x: f64,
    last_y: f64,
}

impl Default for DragState {
    fn default() -> Self {
        Self {
            is_pressed: false,
            start_x: 0.0,
            start_y: 0.0,
            has_moved: false,
            last_x: 0.0,
            last_y: 0.0,
        }
    }
}

#[derive(Clone, Default)]
struct OverlayState {
    overlay_position: Arc<Mutex<Option<(f64, f64)>>>,
    overlay_visible: Arc<Mutex<bool>>,
    floating_bounds: Arc<Mutex<Option<(f64, f64, f64, f64)>>>,
    floating_visible: Arc<Mutex<bool>>,
}

fn ensure_overlay_window(app: &AppHandle) {
    if app.get_webview_window("overlay").is_some() {
        return;
    }

    let _ = tauri::WebviewWindowBuilder::new(
        app,
        "overlay",
        tauri::WebviewUrl::App("overlay.html".into()),
    )
    .title("Overlay")
    .inner_size(32.0, 32.0)
    .min_inner_size(32.0, 32.0)
    .max_inner_size(32.0, 32.0)
    .position(0.0, 0.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .visible(false)
    .build();
}

fn ensure_floating_window(app: &AppHandle) {
    if app.get_webview_window("floating_panel").is_some() {
        return;
    }

    let _ = tauri::WebviewWindowBuilder::new(
        app,
        "floating_panel",
        tauri::WebviewUrl::App("floating-window.html".into()),
    )
    .title("GoBuddy Quick Panel")
    .inner_size(160.0, 220.0)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .transparent(true)
    .decorations(false)
    .position(0.0, 0.0)
    .visible(false)
    .build();
}

fn primary_monitor_dimensions(app: &AppHandle) -> (f64, f64) {
    app.primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let size = monitor.size();
            (size.width as f64, size.height as f64)
        })
        .unwrap_or((1920.0, 1080.0))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

async fn hide_overlay_internal(app: &AppHandle, overlay_state: &OverlayState) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    if let Ok(mut visible) = overlay_state.overlay_visible.lock() {
        *visible = false;
    }
    Ok(())
}

async fn hide_floating_window_internal(app: &AppHandle, overlay_state: &OverlayState) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating_panel") {
        window.hide().map_err(|e| e.to_string())?;
    }
    if let Ok(mut visible) = overlay_state.floating_visible.lock() {
        *visible = false;
    }
    if let Ok(mut bounds) = overlay_state.floating_bounds.lock() {
        *bounds = None;
    }
    Ok(())
}

#[tauri::command]
async fn hide_overlay(app: AppHandle, overlay_state: State<'_, OverlayState>) -> Result<(), String> {
    hide_overlay_internal(&app, &overlay_state).await
}

#[tauri::command]
async fn hide_floating_window(app: AppHandle, overlay_state: State<'_, OverlayState>) -> Result<(), String> {
    hide_floating_window_internal(&app, &overlay_state).await
}

fn show_or_focus_floating_window(app: &AppHandle, overlay_state: &OverlayState) -> Result<(), String> {
    ensure_floating_window(app);
    let (overlay_x, overlay_y) = match overlay_state.overlay_position.lock() {
        Ok(stored) => stored.clone().unwrap_or((200.0, 200.0)),
        Err(_) => (200.0, 200.0),
    };

    let panel_width = 160;
    let panel_height = 220;
    let panel_width_f = panel_width as f64;
    let panel_height_f = panel_height as f64;
    let panel_center_x = overlay_x + 16.0;
    let (screen_w, screen_h) = primary_monitor_dimensions(app);
    let max_x = (screen_w - panel_width_f).max(0.0);
    let max_y = (screen_h - panel_height_f).max(0.0);
    let panel_x = (panel_center_x - (panel_width as f64) / 2.0).clamp(0.0, max_x);
    let panel_y = overlay_y.clamp(0.0, max_y);

    if let Some(window) = app.get_webview_window("floating_panel") {
        let _ = window.set_position(PhysicalPosition::new(panel_x.round() as i32, panel_y.round() as i32));
        let _ = window.set_size(PhysicalSize::new(panel_width, panel_height));
        let _ = window.set_always_on_top(true);
        window.show().map_err(|e| e.to_string())?;
        if let Ok(mut bounds) = overlay_state.floating_bounds.lock() {
            *bounds = Some((panel_x, panel_y, panel_width_f, panel_height_f));
        }
        if let Ok(mut visible) = overlay_state.floating_visible.lock() {
            *visible = true;
        }
        return Ok(());
    }

    Ok(())
}

#[tauri::command]
async fn show_floating_window(app: AppHandle, overlay_state: State<'_, OverlayState>) -> Result<(), String> {
    show_or_focus_floating_window(&app, &overlay_state)
}

fn show_overlay_at_position(app: &AppHandle, overlay_state: &OverlayState, x: f64, y: f64, start_x: f64) {
    let app_handle = app.clone();
    let overlay_state = overlay_state.clone();

    tauri::async_runtime::spawn(async move {
        ensure_overlay_window(&app_handle);
        // Determine offset direction based on drag direction
        // If dragged to the left (end_x < start_x), show button to the left
        let x_offset = if x < start_x { -50.0 } else { 10.0 };
        let raw_overlay_x = x + x_offset;
        let raw_overlay_y = y + 10.0;
        let (screen_w, screen_h) = primary_monitor_dimensions(&app_handle);
        let max_x = (screen_w - 32.0).max(0.0);
        let max_y = (screen_h - 32.0).max(0.0);
        let overlay_x = raw_overlay_x.clamp(0.0, max_x);
        let overlay_y = raw_overlay_y.clamp(0.0, max_y);
        
        match app_handle.get_webview_window("overlay") {
            Some(window) => {
                // Position the window near the mouse cursor
                // Offset slightly so button appears next to cursor, not under it
                let _ = window.set_size(PhysicalSize::new(32, 32));
                let _ = window.set_position(PhysicalPosition::new(overlay_x.round() as i32, overlay_y.round() as i32));
                let _ = window.show();
            }
            None => {}
        }

        if let Ok(mut stored) = overlay_state.overlay_position.lock() {
            *stored = Some((overlay_x, overlay_y));
        }
        if let Ok(mut visible) = overlay_state.overlay_visible.lock() {
            *visible = true;
        }
    });
}

fn start_mouse_listener(app: AppHandle, overlay_state: OverlayState) {
    let drag_state = Arc::new(Mutex::new(DragState::default()));
    let overlay_visible = overlay_state.overlay_visible.clone();
    let overlay_position = overlay_state.overlay_position.clone();
    let floating_visible = overlay_state.floating_visible.clone();
    let floating_bounds = overlay_state.floating_bounds.clone();
    let overlay_click_in_progress = Arc::new(Mutex::new(false));
    
    std::thread::spawn(move || {
        let callback = move |event: Event| {
            let mut state = drag_state.lock().unwrap();
            
            match event.event_type {
                EventType::ButtonPress(Button::Left) => {
                    let cursor_x = state.last_x;
                    let cursor_y = state.last_y;

                    let floating_is_visible = floating_visible.lock().map(|v| *v).unwrap_or(false);
                    let inside_floating_window = if floating_is_visible {
                        if let Ok(bounds_guard) = floating_bounds.lock() {
                            if let Some((fx, fy, fw, fh)) = *bounds_guard {
                                cursor_x >= fx && cursor_x <= fx + fw && cursor_y >= fy && cursor_y <= fy + fh
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if floating_is_visible && !inside_floating_window {
                        let app_clone = app.clone();
                        let overlay_state_clone = overlay_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = hide_floating_window_internal(&app_clone, &overlay_state_clone).await;
                        });
                    }

                    if floating_is_visible {
                        state.is_pressed = false;
                        state.has_moved = false;
                        return;
                    }

                    let overlay_is_visible = overlay_visible.lock().map(|v| *v).unwrap_or(false);
                    let inside_overlay = if overlay_is_visible {
                        if let Ok(overlay_xy) = overlay_position.lock() {
                            if let Some((ox, oy)) = *overlay_xy {
                                cursor_x >= ox
                                    && cursor_x <= ox + 32.0
                                    && cursor_y >= oy
                                    && cursor_y <= oy + 32.0
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if inside_overlay {
                        if let Ok(mut clicking_overlay) = overlay_click_in_progress.lock() {
                            *clicking_overlay = true;
                        }
                    } else if overlay_is_visible {
                        if let Ok(mut is_overlay_visible) = overlay_visible.lock() {
                            *is_overlay_visible = false;
                        }
                        let app_clone = app.clone();
                        let overlay_state_clone = overlay_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = hide_overlay_internal(&app_clone, &overlay_state_clone).await;
                        });
                    }
                    
                    // Start tracking drag or click - use current tracked position
                    state.is_pressed = true;
                    state.start_x = state.last_x;
                    state.start_y = state.last_y;
                    state.has_moved = false;
                }
                EventType::ButtonRelease(Button::Left) => {
                    let mut clicking_overlay = overlay_click_in_progress.lock().unwrap();
                    if *clicking_overlay {
                        *clicking_overlay = false;
                        let app_clone = app.clone();
                        let overlay_state_clone = overlay_state.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = show_or_focus_floating_window(&app_clone, &overlay_state_clone) {
                                eprintln!("Failed to open floating window: {}", error);
                            }
                            let _ = hide_overlay_internal(&app_clone, &overlay_state_clone).await;
                        });
                    } else if let Ok(mut is_overlay_visible) = overlay_visible.lock() {
                        let floating_is_visible = floating_visible.lock().map(|v| *v).unwrap_or(false);
                        if !*is_overlay_visible && !floating_is_visible {
                            if state.is_pressed && state.has_moved {
                                let x = state.last_x;
                                let y = state.last_y;
                                let start_x = state.start_x;
                                show_overlay_at_position(&app, &overlay_state, x, y, start_x);
                                *is_overlay_visible = true;
                            }
                        }
                    }
                    
                    // Reset drag state
                    state.is_pressed = false;
                    state.has_moved = false;
                }
                EventType::MouseMove { x, y } => {
                    // Always update the last known mouse position
                    state.last_x = x;
                    state.last_y = y;
                    
                    if state.is_pressed {
                        // Check if mouse moved significantly (more than 5 pixels)
                        let dx = x - state.start_x;
                        let dy = y - state.start_y;
                        let distance = (dx * dx + dy * dy).sqrt();
                        
                        if distance > 5.0 {
                            state.has_moved = true;
                        }
                    }
                }
                EventType::KeyPress(_) => {
                    {
                        if let Ok(mut clicking) = overlay_click_in_progress.lock() {
                            *clicking = false;
                        }
                    }
                    let app_clone = app.clone();
                    let overlay_state_clone = overlay_state.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = hide_overlay_internal(&app_clone, &overlay_state_clone).await;
                        let _ = hide_floating_window_internal(&app_clone, &overlay_state_clone).await;
                    });
                }
                _ => {}
            }
        };

        if let Err(error) = listen(callback) {
            eprintln!("Error listening to mouse events: {:?}", error);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            hide_overlay,
            hide_floating_window,
            show_floating_window
        ])
        .setup(|app| {
            let overlay_state = OverlayState::default();
            app.manage(overlay_state.clone());
            let app_handle = app.handle();
            ensure_overlay_window(&app_handle);
            ensure_floating_window(&app_handle);
            // Start the global mouse listener
            start_mouse_listener(app_handle.clone(), overlay_state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
