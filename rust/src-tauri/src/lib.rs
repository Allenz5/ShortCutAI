use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};
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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn show_overlay_at_position(app: &AppHandle, x: f64, y: f64) {
    let app_handle = app.clone();
    
    tauri::async_runtime::spawn(async move {
        match app_handle.get_webview_window("overlay") {
            Some(window) => {
                // Position the window near the mouse cursor
                // Offset slightly so button appears next to cursor, not under it
                let _ = window.set_size(PhysicalSize::new(32, 32));
                let _ = window.set_position(PhysicalPosition::new(x as i32 + 10, y as i32 + 10));
                let _ = window.show();
                let _ = window.set_focus();
            }
            None => {
                // Create the overlay window if it doesn't exist
                let window = tauri::WebviewWindowBuilder::new(
                    &app_handle,
                    "overlay",
                    tauri::WebviewUrl::App("overlay.html".into()),
                )
                .title("Overlay")
                .inner_size(32.0, 32.0)
                .min_inner_size(32.0, 32.0)
                .max_inner_size(32.0, 32.0)
                .position(x + 10.0, y + 10.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .resizable(false)
                .skip_taskbar(true)
                .visible(false)
                .build();

                if let Ok(win) = window {
                    // Set size explicitly before showing
                    let _ = win.set_size(PhysicalSize::new(32, 32));
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        }
    });
}

fn start_mouse_listener(app: AppHandle) {
    let drag_state = Arc::new(Mutex::new(DragState::default()));
    let overlay_visible = Arc::new(Mutex::new(false));
    
    std::thread::spawn(move || {
        let callback = move |event: Event| {
            let mut state = drag_state.lock().unwrap();
            let mut is_overlay_visible = overlay_visible.lock().unwrap();
            
            match event.event_type {
                EventType::ButtonPress(Button::Left) => {
                    // If overlay is visible, close it on any left click
                    if *is_overlay_visible {
                        *is_overlay_visible = false;
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = hide_overlay(app_clone).await;
                        });
                    } else {
                        // Start tracking drag - use current tracked position
                        state.is_pressed = true;
                        state.start_x = state.last_x;
                        state.start_y = state.last_y;
                        state.has_moved = false;
                    }
                }
                EventType::ButtonRelease(Button::Left) => {
                    // Check if this was a drag (moved while pressed)
                    if state.is_pressed && state.has_moved && !*is_overlay_visible {
                        // Show overlay at the release position
                        let x = state.last_x;
                        let y = state.last_y;
                        show_overlay_at_position(&app, x, y);
                        *is_overlay_visible = true;
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
        .invoke_handler(tauri::generate_handler![greet, hide_overlay])
        .setup(|app| {
            // Start the global mouse listener
            start_mouse_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
