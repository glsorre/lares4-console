use std::fs;
use std::path::PathBuf;

use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

mod commands;
mod keychain;
mod license;

fn app_config_dir() -> Result<PathBuf, String> {
    let base =
        dirs::config_dir().ok_or_else(|| String::from("Unable to resolve config directory"))?;
    Ok(base.join("lares4-console"))
}

fn profiles_path() -> Result<PathBuf, String> {
    Ok(app_config_dir()?.join("profiles.json"))
}

#[tauri::command]
fn read_profiles_file() -> Result<Option<String>, String> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| format!("Failed to read profiles file: {error}"))
}

#[tauri::command]
fn write_profiles_file(content: String) -> Result<(), String> {
    let path = profiles_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create profiles directory: {error}"))?;
    }
    fs::write(path, content).map_err(|error| format!("Failed to write profiles file: {error}"))
}

#[tauri::command]
fn quarantine_profiles_file(suffix: String) -> Result<String, String> {
    let path = profiles_path()?;
    if !path.exists() {
        return Ok(String::new());
    }
    let target_name = format!("profiles.corrupt-{suffix}.json");
    let target = path
        .parent()
        .ok_or_else(|| String::from("Profiles file has no parent directory"))?
        .join(&target_name);
    fs::rename(&path, &target)
        .map_err(|error| format!("Failed to quarantine profiles file: {error}"))?;
    Ok(target_name)
}

#[tauri::command]
fn read_utf8_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Failed to read file: {error}"))
}

#[tauri::command]
fn write_utf8_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create target directory: {error}"))?;
    }
    fs::write(target, content).map_err(|error| format!("Failed to write file: {error}"))
}

#[tauri::command]
fn resolve_default_session_path(prefix: String, ext: String) -> Result<String, String> {
    let dir = std::env::current_dir()
        .map_err(|error| format!("Failed to read current directory: {error}"))?
        .join(".sessions");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create sessions directory: {error}"))?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("Failed to resolve timestamp: {error}"))?
        .as_millis();
    Ok(dir
        .join(format!("{prefix}-{millis}{ext}"))
        .to_string_lossy()
        .into_owned())
}

const ABOUT_MENU_ID: &str = "about";
const ABOUT_EVENT: &str = "menu://about";
const NAVIGATE_EVENT: &str = "window://navigate";

fn is_valid_window_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 64
        && label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
fn open_console_window(
    app: AppHandle,
    label: String,
    route: Option<String>,
) -> Result<(), String> {
    if label == "main" {
        return Err("Window label 'main' is reserved".to_string());
    }
    if !is_valid_window_label(&label) {
        return Err(format!("Invalid window label: {label}"));
    }
    if app.get_webview_window(&label).is_some() {
        return Err(format!("Window '{label}' already exists"));
    }
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("lares4 Console")
        .inner_size(960.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|error| format!("Failed to create window: {error}"))?;
    if let Some(route) = route {
        let label_for_emit = label.clone();
        let payload = serde_json::json!({ "label": label_for_emit, "route": route });
        let _ = window.emit(NAVIGATE_EVENT, payload);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_profiles_file,
            write_profiles_file,
            quarantine_profiles_file,
            read_utf8_file,
            write_utf8_file,
            resolve_default_session_path,
            open_console_window,
            commands::verify_license_token,
            commands::save_license_token,
            commands::read_all_licenses,
            commands::clear_license,
            commands::complete_license_migration
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let about_item = MenuItem::with_id(
                app,
                ABOUT_MENU_ID,
                "About Lares4 Console",
                true,
                None::<&str>,
            )?;

            #[cfg(target_os = "macos")]
            let menu = {
                let app_submenu = SubmenuBuilder::new(app, "Lares4 Console")
                    .item(&about_item)
                    .separator()
                    .item(&PredefinedMenuItem::services(app.handle(), None)?)
                    .separator()
                    .item(&PredefinedMenuItem::hide(app.handle(), None)?)
                    .item(&PredefinedMenuItem::hide_others(app.handle(), None)?)
                    .item(&PredefinedMenuItem::show_all(app.handle(), None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app.handle(), None)?)
                    .build()?;
                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app.handle(), None)?)
                    .item(&PredefinedMenuItem::redo(app.handle(), None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app.handle(), None)?)
                    .item(&PredefinedMenuItem::copy(app.handle(), None)?)
                    .item(&PredefinedMenuItem::paste(app.handle(), None)?)
                    .item(&PredefinedMenuItem::select_all(app.handle(), None)?)
                    .build()?;
                MenuBuilder::new(app)
                    .item(&app_submenu)
                    .item(&edit_submenu)
                    .build()?
            };

            #[cfg(not(target_os = "macos"))]
            let menu = {
                let file_submenu = SubmenuBuilder::new(app, "File")
                    .item(&PredefinedMenuItem::quit(app.handle(), None)?)
                    .build()?;
                let help_submenu = SubmenuBuilder::new(app, "Help")
                    .item(&about_item)
                    .build()?;
                MenuBuilder::new(app)
                    .item(&file_submenu)
                    .item(&help_submenu)
                    .build()?
            };

            app.set_menu(menu)?;
            app.on_menu_event(|app_handle, event| {
                if event.id() == ABOUT_MENU_ID {
                    let _ = app_handle.emit(ABOUT_EVENT, ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
