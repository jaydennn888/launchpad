#![allow(clippy::collapsible_if)]

use std::collections::HashSet;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, Modifiers, Code};
use tauri_plugin_updater::UpdaterExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    DIB_RGB_COLORS,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
    ExtractIconExW,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

// ============ Data Types ============

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub lnk_path: String,
    pub target_path: String,
    pub icon: Option<String>,
    pub sort_key: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,
    pub grayscale_icons: bool,
    pub always_on_top: bool,
    #[serde(default = "default_edge_snap")]
    pub edge_snap: bool,
    #[serde(default)]
    pub edge_auto_hide: bool,
    #[serde(default = "default_compact_on_minimize")]
    pub compact_on_minimize: bool,
    #[serde(default = "default_compact_orientation")]
    pub compact_orientation: String,
    #[serde(default = "default_smart_sort")]
    pub smart_sort: bool,
    #[serde(default)]
    pub start_with_windows: bool,
    #[serde(default)]
    pub user_name: String,
}

fn default_edge_snap() -> bool {
    true
}

fn default_compact_on_minimize() -> bool {
    true
}

fn default_compact_orientation() -> String {
    "horizontal".to_string()
}

fn default_smart_sort() -> bool {
    true
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            grayscale_icons: false,
            always_on_top: false,
            edge_snap: true,
            edge_auto_hide: false,
            compact_on_minimize: true,
            compact_orientation: "horizontal".to_string(),
            smart_sort: true,
            start_with_windows: false,
            user_name: String::new(),
        }
    }
}

/// Sidebar item type: folder or note
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SidebarItem {
    pub id: String,
    pub item_type: String, // "folder" | "note" | "app"
    pub name: String,
    pub parent_id: Option<String>,
    pub content: Option<String>,     // for notes
    pub app_id: Option<String>,       // for app shortcuts
    pub app_name: Option<String>,
    pub app_icon: Option<String>,
    pub created_at: u64,
}

/// Clipboard history entry
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: String,
    pub text: String,
    pub timestamp: u64,
}

/// Color info from pixel picker
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ColorInfo {
    pub hex: String,
    pub rgb: String,
    pub x: i32,
    pub y: i32,
}

/// Network speed stats
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSpeed {
    pub upload_kbps: f64,
    pub download_kbps: f64,
}

pub struct AppState {
    pub cached_apps: Mutex<Option<Vec<AppInfo>>>,
    pub sys: Mutex<sysinfo::System>,
    pub clipboard_history: Mutex<Vec<ClipboardEntry>>,
    pub last_network_stats: Mutex<Option<(u64, u64, u64)>>, // (timestamp_ms, rx_bytes, tx_bytes)
    pub cpu_warmed: Mutex<bool>,
    pub overlay: Mutex<bool>,
}

// ============ Scanning ============

/// Directories to scan for .lnk shortcut files
fn get_scan_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(program_data) = std::env::var("ProgramData") {
        dirs.push(
            PathBuf::from(&program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
        );
    }

    if let Ok(app_data) = std::env::var("AppData") {
        dirs.push(
            PathBuf::from(&app_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
        );
    }

    if let Ok(user_profile) = std::env::var("UserProfile") {
        dirs.push(PathBuf::from(&user_profile).join("Desktop"));
    }

    if let Ok(public) = std::env::var("Public") {
        dirs.push(PathBuf::from(&public).join("Desktop"));
    }

    dirs
}

/// Recursively collect all .lnk files in a directory
fn collect_lnk_files(dir: &Path, result: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lnk_files(&path, result);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            result.push(path);
        }
    }
}

/// Filter out non-application shortcuts (uninstallers, help, etc.)
fn should_filter(name: &str) -> bool {
    let lower = name.to_lowercase();
    const FILTERS: &[&str] = &[
        "uninstall",
        "卸载",
        "help",
        "readme",
        "帮助",
        "说明",
        "remove",
        "修复",
        "setup",
        "安装",
    ];
    FILTERS.iter().any(|f| lower.contains(f))
}

// ============ Icon Extraction ============

/// Resolve the target executable path from a .lnk shortcut file.
/// Uses the Windows Shell COM API via ISHellLinkW.
fn resolve_lnk_target(lnk_path: &Path) -> Option<PathBuf> {
    unsafe {
        use windows::core::*;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
        use windows::Win32::System::Com::IPersistFile;

        let _ = CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED);

        let shell_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;

        let persist_file: IPersistFile = shell_link.cast().ok()?;

        let path_wide: Vec<u16> = lnk_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        persist_file
            .Load(PCWSTR(path_wide.as_ptr()), STGM_READ)
            .ok()?;

        // Get the target path
        let mut target_buf = [0u16; 260];
        let mut find_data = std::mem::zeroed();
        shell_link
            .GetPath(&mut target_buf, &mut find_data, 0)
            .ok()?;

        let target_len = target_buf.iter().position(|&c| c == 0).unwrap_or(0);
        if target_len == 0 {
            CoUninitialize();
            return None;
        }

        let target_str = String::from_utf16_lossy(&target_buf[..target_len]);
        CoUninitialize();
        Some(PathBuf::from(target_str))
    }
}

/// Extract the icon for a file and return it as a PNG base64 data URL.
/// If the path is a .lnk shortcut, resolves the target exe first to get
/// a clean icon without the shortcut overlay arrow.
/// Tries to get the highest resolution icon available (256x256 Jumbo → 48x48 → 32x32).
fn extract_icon_data_url(path: &Path) -> Option<String> {
    // If it's a .lnk, try resolving the target exe path for a cleaner icon
    let is_lnk = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("lnk"))
        .unwrap_or(false);

    let icon_source = if is_lnk {
        resolve_lnk_target(path).unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    };

    unsafe {
        let path_wide: Vec<u16> = icon_source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // Strategy 0: Extract icon directly from the .exe/.dll using ExtractIconExW
        // This bypasses the system image list and may yield crisper original icons
        let mut hicon_large: HICON = HICON(std::ptr::null_mut());
        let count = ExtractIconExW(
            PCWSTR(path_wide.as_ptr()),
            0, // first icon index
            Some(&mut hicon_large as *mut HICON),
            None,
            1,
        );
        if count > 0 && !hicon_large.is_invalid() {
            let data_url = hicon_to_png_data_url(hicon_large);
            let _ = DestroyIcon(hicon_large);
            if data_url.is_some() {
                return data_url;
            }
        }

        // Strategy 1: Fallback to SHGFI_ICON | SHGFI_LARGEICON (32x32)
        let mut shfi = SHFILEINFOW::default();
        let result = SHGetFileInfoW(
            PCWSTR(path_wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0x80),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result != 0 && !shfi.hIcon.is_invalid() {
            let data_url = hicon_to_png_data_url(shfi.hIcon);
            let _ = DestroyIcon(shfi.hIcon);
            if data_url.is_some() {
                return data_url;
            }
        }

        // Strategy 2: Last resort — try the original .lnk path
        if icon_source != *path {
            return extract_icon_data_url_fallback(path);
        }
        None
    }
}

/// Fallback: extract icon directly from the .lnk file (may have shortcut overlay)
fn extract_icon_data_url_fallback(path: &Path) -> Option<String> {
    unsafe {
        let path_wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut shfi = SHFILEINFOW::default();
        let flags = SHGFI_ICON | SHGFI_LARGEICON;

        let result = SHGetFileInfoW(
            PCWSTR(path_wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0x80),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );

        if result == 0 || shfi.hIcon.is_invalid() {
            return None;
        }

        let data_url = hicon_to_png_data_url(shfi.hIcon);
        let _ = DestroyIcon(shfi.hIcon);
        data_url
    }
}

/// Convert an HICON to a PNG base64 data URL
fn hicon_to_png_data_url(hicon: HICON) -> Option<String> {
    unsafe {
        // 1. Get icon info (color bitmap + mask bitmap)
        let mut ii = ICONINFO::default();
        let hr = GetIconInfo(hicon, &mut ii);
        if hr.is_err() {
            return None;
        }

        let hbm_color = ii.hbmColor;
        let hbm_mask = ii.hbmMask;

        // Need a color bitmap for 32-bit icons
        if hbm_color.is_invalid() {
            if !hbm_mask.is_invalid() {
                let _ = DeleteObject(hbm_mask);
            }
            return None;
        }

        // 2. Get bitmap dimensions from the color bitmap
        let mut bmp: BITMAP = std::mem::zeroed();
        let got = GetObjectW(
            hbm_color,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut BITMAP as *mut _),
        );
        if got == 0 {
            let _ = DeleteObject(hbm_color);
            let _ = DeleteObject(hbm_mask);
            return None;
        }

        let width = bmp.bmWidth as u32;
        let height = bmp.bmHeight as u32;
        if width == 0 || height == 0 || width > 1024 || height > 1024 {
            let _ = DeleteObject(hbm_color);
            let _ = DeleteObject(hbm_mask);
            return None;
        }

        // 3. Set up BITMAPINFO for 32-bit BGRA top-down DIB
        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = width as i32;
        bi.bmiHeader.biHeight = -(height as i32); // negative = top-down
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = 0; // BI_RGB

        // 4. Get the screen DC for GetDIBits
        let hdc = GetDC(HWND::default());
        if hdc.is_invalid() {
            let _ = DeleteObject(hbm_color);
            let _ = DeleteObject(hbm_mask);
            return None;
        }

        // 5. Retrieve pixel data
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(
            hdc,
            hbm_color,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        );

        let _ = ReleaseDC(HWND::default(), hdc);
        let _ = DeleteObject(hbm_color);
        let _ = DeleteObject(hbm_mask);

        if lines == 0 {
            return None;
        }

        // 6. Convert BGRA → RGBA
        for chunk in pixels.chunks_mut(4) {
            chunk.swap(0, 2); // B <-> R
        }

        // 7. Encode as PNG
        let mut png_data: Vec<u8> = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png_data, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            match encoder.write_header() {
                Ok(mut writer) => {
                    if writer.write_image_data(&pixels).is_err() {
                        return None;
                    }
                }
                Err(_) => return None,
            }
        }

        // 8. Base64-encode and format as data URL
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);
        Some(format!("data:image/png;base64,{}", b64))
    }
}

// ============ Persistence ============

/// Get the config directory for this app, creating it if needed
fn config_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| {
            dirs::config_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("Launchpad")
        });
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn load_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let data = std::fs::read(path).ok()?;
    serde_json::from_slice(&data).ok()
}

fn save_json<T: serde::Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ============ Tauri Commands ============

/// Scan installed applications. Returns cached list unless force=true.
/// Excludes any app whose lnk_path or target_path is in the excluded list.
#[tauri::command]
fn scan_apps(force: bool, state: State<'_, AppState>, app: tauri::AppHandle) -> Vec<AppInfo> {
    if !force {
        if let Ok(cache) = state.cached_apps.lock() {
            if let Some(ref apps) = *cache {
                return apps.clone();
            }
        }
    }

    // Load excluded list (lnk paths + target paths that user permanently removed)
    let excluded_path = config_dir(&app).join("excluded.json");
    let excluded: Vec<String> = load_json::<Vec<String>>(&excluded_path).unwrap_or_default();
    let excluded_set: HashSet<String> = excluded
        .iter()
        .map(|s| s.to_lowercase())
        .collect();

    let mut lnk_files = Vec::new();
    for dir in get_scan_dirs() {
        if dir.exists() {
            collect_lnk_files(&dir, &mut lnk_files);
        }
    }

    let mut seen_names = HashSet::new();
    let mut seen_targets = HashSet::new();
    let mut apps = Vec::new();

    for lnk_path in &lnk_files {
        let name = lnk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        if should_filter(&name) {
            continue;
        }

        // Deduplicate by lowercase name
        let name_key = name.to_lowercase();
        if !seen_names.insert(name_key) {
            continue;
        }

        let path_str = lnk_path.to_string_lossy().to_string();
        let path_lower = path_str.to_lowercase();

        // Skip excluded apps (match by lnk path) — checked early to avoid wasted work
        if excluded_set.contains(&path_lower) {
            continue;
        }

        // Resolve target path for dedup by actual exe
        let target = resolve_lnk_target(lnk_path).unwrap_or_default();
        let target_str = target.to_string_lossy().to_lowercase();

        // Skip excluded apps (match by target path)
        if !target_str.is_empty() && excluded_set.contains(&target_str) {
            continue;
        }

        // Deduplicate by actual exe target
        if !target_str.is_empty() && !seen_targets.insert(target_str.clone()) {
            continue;
        }

        let icon = extract_icon_data_url(lnk_path);

        apps.push(AppInfo {
            id: path_str.clone(),
            name: name.clone(),
            lnk_path: path_str,
            target_path: target.to_string_lossy().to_string(),
            icon,
            sort_key: name.to_lowercase(),
        });
    }

    // Sort alphabetically by sort key
    apps.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));

    // Cache the result
    if let Ok(mut cache) = state.cached_apps.lock() {
        *cache = Some(apps.clone());
    }

    apps
}

/// Launch the application behind the given .lnk path
#[tauri::command]
fn launch_app(app: tauri::AppHandle, lnk_path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &lnk_path])
        .creation_flags(0x0000_0008) // DETACHED_PROCESS — no console flash
        .spawn()
        .map_err(|e| e.to_string())?;

    // Track recent usage (max 8 entries, dedup by path)
    let path = config_dir(&app).join("recent.json");
    let mut recent: Vec<String> = load_json::<Vec<String>>(&path).unwrap_or_default();
    recent.retain(|p| p != &lnk_path);
    recent.insert(0, lnk_path);
    if recent.len() > 8 {
        recent.truncate(8);
    }
    let _ = save_json(&path, &recent);

    Ok(())
}

/// Open a URL in Google Chrome browser
#[tauri::command]
fn open_in_chrome(url: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "chrome", &url])
        .creation_flags(0x0000_0008) // DETACHED_PROCESS
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============ System Stats ============

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub disk_percent: f32,
}

/// Get CPU, memory, and disk usage stats.
#[tauri::command]
fn get_system_stats(state: State<'_, AppState>) -> Result<SystemStats, String> {
    use sysinfo::{Disks, CpuRefreshKind, MemoryRefreshKind};

    // sysinfo's global_cpu_usage() needs two refreshes with a gap to produce a
    // non-zero value. On the very first call there is no baseline, so it would
    // report 0%. Warm up once with a short sleep, then subsequent polls are cheap.
    let warmed = *state.cpu_warmed.lock().map_err(|e| e.to_string())?;
    if !warmed {
        {
            let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
            sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
        {
            let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
            sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        }
        *state.cpu_warmed.lock().map_err(|e| e.to_string())? = true;
    }

    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    // Refresh CPU and memory — CPU usage needs two refreshes with a delay,
    // but since we poll every 10s from the frontend, the persistent System
    // already has the previous snapshot, so a single refresh is enough.
    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
    sys.refresh_memory_specifics(MemoryRefreshKind::everything());

    let cpu_usage = sys.global_cpu_usage();

    let memory_used = sys.used_memory();
    let memory_total = sys.total_memory();

    let disks = Disks::new_with_refreshed_list();
    // Only count the system disk (C:) to avoid summing all drives
    let system_disks: Vec<_> = disks
        .iter()
        .filter(|d| {
            d.mount_point()
                .to_string_lossy()
                .to_uppercase()
                .starts_with("C:")
        })
        .collect();
    let disk_total: u64 = system_disks
        .iter()
        .map(|d| d.total_space())
        .sum();
    let disk_used: u64 = system_disks
        .iter()
        .map(|d| d.total_space() - d.available_space())
        .sum();
    let disk_percent = if disk_total > 0 {
        (disk_used as f32 / disk_total as f32) * 100.0
    } else {
        0.0
    };

    Ok(SystemStats {
        cpu_usage,
        memory_used,
        memory_total,
        disk_used,
        disk_total,
        disk_percent,
    })
}

// ============ Recent Files ============

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileInfo {
    pub name: String,
    pub path: String,
    pub modified: String,
    pub icon: Option<String>,
}

/// Get recent files from the Windows Recent items folder.
#[tauri::command]
fn get_recent_files(count: Option<usize>) -> Vec<RecentFileInfo> {
    let max = count.unwrap_or(20);
    let mut result = Vec::new();

    // Try AppData\Microsoft\Windows\Recent first
    if let Ok(app_data) = std::env::var("AppData") {
        let recent_dir = PathBuf::from(&app_data).join("Microsoft\\Windows\\Recent");
        if recent_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&recent_dir) {
                let mut files: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().extension().map(|x| x == "lnk").unwrap_or(false))
                    .collect();
                // Sort by modified time (newest first)
                files.sort_by(|a, b| {
                    b.metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                        .cmp(
                            &a.metadata()
                                .and_then(|m| m.modified())
                                .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                        )
                });
                for entry in files.iter().take(max) {
                    let name = entry
                        .file_name()
                        .to_string_lossy()
                        .to_string()
                        .trim_end_matches(".lnk")
                        .to_string();
                    let modified = entry
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            let secs = std::time::SystemTime::now()
                                .duration_since(t)
                                .unwrap_or_default()
                                .as_secs();
                            let days = secs / 86400;
                            let hours = (secs % 86400) / 3600;
                            let mins = (secs % 3600) / 60;
                            if days > 0 {
                                format!("{}天前", days)
                            } else if hours > 0 {
                                format!("{}小时前", hours)
                            } else if mins > 0 {
                                format!("{}分钟前", mins)
                            } else {
                                "刚刚".to_string()
                            }
                        })
                        .unwrap_or_default();
                    let path = entry.path().to_string_lossy().to_string();
                    let icon = extract_icon_data_url(&entry.path());
                    result.push(RecentFileInfo {
                        name,
                        path,
                        modified,
                        icon,
                    });
                }
            }
        }
    }

    result
}

// ============ Global File Search ============

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

fn is_excluded_search_dir(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "node_modules"
            | "target"
            | ".git"
            | "appdata"
            | "application data"
            | "local settings"
            | "program files"
            | "program files (x86)"
            | "programdata"
            | "windows"
            | "system volume information"
            | ".cache"
            | ".cargo"
            | ".rustup"
            | "venv"
            | ".venv"
            | "library"
            | "$recycle.bin"
    )
}

/// Recursive filename search across common user directories (Desktop, Documents,
/// Downloads, Pictures, Videos, Music and the user home). Bounded by result
/// count, recursion depth and a wall-clock timeout so it stays responsive even
/// on a cold filesystem. Matching is a case-insensitive name substring scan.
#[tauri::command]
fn search_files(query: String, max: Option<usize>) -> Vec<FileSearchResult> {
    let q = query.trim().to_lowercase();
    if q.len() < 2 {
        return Vec::new();
    }
    let max = max.unwrap_or(20).min(50);
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(1500);

    let home = dirs::home_dir().unwrap_or_default();
    let mut roots: Vec<(PathBuf, usize)> = Vec::new();
    for dir in [
        dirs::desktop_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
        dirs::audio_dir(),
        Some(home.clone()),
    ]
    .into_iter()
    .flatten()
    {
        // the home profile is huge, keep its scan shallow
        let depth = if dir == home { 2 } else { 4 };
        roots.push((dir, depth));
    }

    let mut results: Vec<FileSearchResult> = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = roots;

    while let Some((dir, max_depth)) = stack.pop() {
        if results.len() >= max || start.elapsed() > timeout {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if results.len() >= max || start.elapsed() > timeout {
                break;
            }
            let path = entry.path();
            let fname = match entry.file_name().to_string_lossy().to_string() {
                s if s.is_empty() => continue,
                s => s,
            };
            let lower = fname.to_lowercase();
            if lower.starts_with('.') {
                continue;
            }
            let is_dir = path.is_dir();
            if is_dir && is_excluded_search_dir(&lower) {
                continue;
            }
            if lower.contains(&q) {
                results.push(FileSearchResult {
                    name: fname.clone(),
                    path: path.to_string_lossy().to_string(),
                    is_dir,
                });
            }
            if is_dir && max_depth > 0 {
                stack.push((path, max_depth - 1));
            }
        }
    }

    // de-duplicate by path (home root can overlap the named folders)
    let mut seen = std::collections::HashSet::new();
    results.retain(|r| seen.insert(r.path.clone()));
    results
}

// ============ Browser Bookmarks ============

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub name: String,
    pub url: String,
}

fn collect_bookmarks(node: &serde_json::Value, out: &mut Vec<Bookmark>) {
    let typ = match node.get("type").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return,
    };
    match typ {
        "url" => {
            if let (Some(name), Some(url)) = (
                node.get("name").and_then(|v| v.as_str()),
                node.get("url").and_then(|v| v.as_str()),
            ) {
                if url.starts_with("http") {
                    out.push(Bookmark {
                        name: name.to_string(),
                        url: url.to_string(),
                    });
                }
            }
        }
        "folder" => {
            if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
                for child in children {
                    collect_bookmarks(child, out);
                }
            }
        }
        _ => {}
    }
}

/// Read Chrome / Edge bookmarks from their standard on-disk JSON and return all
/// http(s) bookmarks. Duplicate URLs are de-duplicated and results sorted by name.
#[tauri::command]
fn get_bookmarks() -> Vec<Bookmark> {
    let mut out: Vec<Bookmark> = Vec::new();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let candidates = [
        PathBuf::from(&local).join("Google\\Chrome\\User Data\\Default\\Bookmarks"),
        PathBuf::from(&local).join("Microsoft\\Edge\\User Data\\Default\\Bookmarks"),
    ];
    for path in candidates {
        if let Ok(s) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                if let Some(roots) = v.get("roots") {
                    collect_bookmarks(roots, &mut out);
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.url == b.url);
    out
}

/// Open a file or folder with the OS default handler (Windows: `cmd /c start`).
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("open_path is only supported on Windows".into())
    }
}

/// Check if a TCP port is already accepting connections (server already running).
/// (Kept as a diagnostic helper; start_trending_server now always re-syncs + restarts.)
#[allow(dead_code)]
fn is_port_responsive(port: u16) -> bool {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    if let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap_or_else(|_| "127.0.0.1:0".parse().unwrap()),
        Duration::from_secs(2),
    ) {
        // Send a minimal HTTP request to verify it's actually our server
        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        if stream.write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_ok() {
            let mut buf = [0u8; 256];
            if stream.read(&mut buf).is_ok() {
                let resp = String::from_utf8_lossy(&buf);
                // Check for HTTP 200 response
                if resp.contains("200") || resp.contains("ok") {
                    return true;
                }
            }
        }
    }
    false
}

/// Start the Python trending server automatically.
/// On first run, server.py + data.json are copied into the stable app config dir
/// (%APPDATA%/Launchpad/trending) so the feature no longer depends on the volatile
/// temp folder where the server originally lived. If the server is already running
/// and responsive, returns Ok immediately.
#[tauri::command]
fn start_trending_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    // CREATE_NO_WINDOW (0x08000000): launch the child WITHOUT a visible console
    // window. Prevents the black CMD flash on every start / restart.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    const TRENDING_PORT: u16 = 18765;

    // Resolve the stable config dir where the live server copy lives.
    let cfg = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Launchpad")
        .join("trending");
    let server_path = cfg.join("server.py");

    // Step 1: ALWAYS re-sync server.py from the bundled resources dir.
    // The server is now packaged inside the app (resources/trending/server.py)
    // so it no longer depends on volatile dev-source paths. We still copy it to
    // the stable config dir so runtime state (data.json) lives outside the
    // read-only resource bundle.
    let bundled = app_handle
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("trending")
        .join("server.py");
    let _ = std::fs::create_dir_all(&cfg);
    if bundled.exists() {
        // Drop stale bytecode so the freshly copied source is recompiled.
        let _ = std::fs::remove_dir_all(cfg.join("__pycache__"));
        let _ = std::fs::copy(&bundled, &server_path);
    }

    if !server_path.exists() {
        return Err(
            "未找到热搜服务 server.py（应已随安装包附带）。请重新安装 Launchpad 后重试".to_string(),
        );
    }

    // Step 2: kill any lingering process still bound to the port. The previous
    // server is launched DETACHED and survives app restarts, so without this the
    // old code keeps serving and a freshly-synced copy could never bind.
    kill_process_on_port(TRENDING_PORT);
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Step 3: launch. Build a candidate list of Python interpreters.
    // Bare names (`py`/`python`/...) only resolve if Python is on the system PATH.
    // On this machine the only Python is the one bundled with WorkBuddy, which is
    // NOT on the PATH that a double-clicked .exe inherits — so we also probe
    // explicit install locations so the server can self-heal after a reboot.
    let mut python_cmds: Vec<String> = vec![
        "py".to_string(),
        "python".to_string(),
        "python3".to_string(),
        "pythonw".to_string(),
    ];

    // WorkBuddy-managed Python: C:\Users\<user>\.workbuddy\binaries\python\versions\<ver>\python.exe
    if let Some(home) = dirs::home_dir() {
        let wb_versions = home
            .join(".workbuddy")
            .join("binaries")
            .join("python")
            .join("versions");
        if let Ok(entries) = std::fs::read_dir(&wb_versions) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("python.exe");
                if candidate.exists() {
                    python_cmds.push(candidate.to_string_lossy().into_owned());
                }
            }
        }
    }

    // Common system Python install locations (C:\Python3xx).
    for base in [
        "C:\\Python39",
        "C:\\Python310",
        "C:\\Python311",
        "C:\\Python312",
        "C:\\Python313",
    ] {
        let candidate = PathBuf::from(base).join("python.exe");
        if candidate.exists() {
            python_cmds.push(candidate.to_string_lossy().into_owned());
        }
    }

    // Microsoft Store / user-installed Python under %LOCALAPPDATA%\Programs\Python\Python3xx
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let py_dir = PathBuf::from(&local).join("Programs").join("Python");
        if let Ok(entries) = std::fs::read_dir(&py_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("python.exe");
                if candidate.exists() {
                    python_cmds.push(candidate.to_string_lossy().into_owned());
                }
            }
        }
    }

    let mut last_err = String::new();
    for py in &python_cmds {
        match Command::new(py)
            .arg("server.py")
            .current_dir(&cfg)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(CREATE_NO_WINDOW) // 不再弹黑窗
            .spawn()
        {
            Ok(_child) => {
                return Ok(());
            }
            Err(e) => {
                last_err = format!("{}: {}", py, e);
                continue;
            }
        }
    }

    Err(format!(
        "无法启动热搜服务：未检测到 Python。请安装 Python 并勾选 \"Add to PATH\" 后重试。({})",
        last_err
    ))
}

/// Force-kill whatever process is bound to `port` on 127.0.0.1 so a freshly
/// synced trending server can take over. Uses PowerShell's Get-NetTCPConnection
/// (built into Windows 10+) and ignores errors when the port is already free.
/// Only the LISTENING socket is targeted; TIME_WAIT leftovers are ignored.
fn kill_process_on_port(port: u16) {
    use std::os::windows::process::CommandExt;
    let ps = format!(
        "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Where-Object {{ $_.State -eq 'Listen' }} | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"
    );
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &ps])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status();
}

/// Get the list of recently launched app .lnk paths (most recent first)
#[tauri::command]
fn get_recent(app: tauri::AppHandle) -> Vec<String> {
    let path = config_dir(&app).join("recent.json");
    load_json::<Vec<String>>(&path).unwrap_or_default()
}

/// Reveal the .lnk file in Windows Explorer
#[tauri::command]
fn reveal_app(lnk_path: String) -> Result<(), String> {
    let path = lnk_path.replace('/', "\\");
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete the .lnk file AND add it to the excluded list so it won't reappear on rescan.
/// `target_path` is optional — when provided, it's also excluded (guards against
/// the same exe reappearing via a different shortcut).
#[tauri::command]
fn delete_app(app: tauri::AppHandle, lnk_path: String, target_path: Option<String>) -> Result<(), String> {
    let path = PathBuf::from(&lnk_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    // Add to excluded list (lnk path + target path if provided)
    let excluded_path = config_dir(&app).join("excluded.json");
    let mut excluded: Vec<String> = load_json::<Vec<String>>(&excluded_path).unwrap_or_default();
    let lower = lnk_path.to_lowercase();
    if !excluded.iter().any(|s| s.to_lowercase() == lower) {
        excluded.push(lnk_path.clone());
    }
    if let Some(ref t) = target_path {
        let t_lower = t.to_lowercase();
        if !t_lower.is_empty() && !excluded.iter().any(|s| s.to_lowercase() == t_lower) {
            excluded.push(t.clone());
        }
    }
    save_json(&excluded_path, &excluded)?;

    // Invalidate the apps cache so the next scan_apps reflects the removal
    if let Ok(mut cache) = app.state::<AppState>().cached_apps.lock() {
        *cache = None;
    }

    Ok(())
}

/// Get the list of excluded app identifiers (lnk paths + target paths)
#[tauri::command]
fn get_excluded(app: tauri::AppHandle) -> Vec<String> {
    let path = config_dir(&app).join("excluded.json");
    load_json::<Vec<String>>(&path).unwrap_or_default()
}

/// Remove an entry from the excluded list (allow a previously-deleted app to reappear)
#[tauri::command]
fn remove_excluded(app: tauri::AppHandle, entry: String) -> Result<(), String> {
    let path = config_dir(&app).join("excluded.json");
    let mut excluded: Vec<String> = load_json::<Vec<String>>(&path).unwrap_or_default();
    let lower = entry.to_lowercase();
    excluded.retain(|s| s.to_lowercase() != lower);
    save_json(&path, &excluded)?;
    // Invalidate cache so next scan re-includes the app
    if let Ok(mut cache) = app.state::<AppState>().cached_apps.lock() {
        *cache = None;
    }
    Ok(())
}

/// Get the list of pinned app IDs
#[tauri::command]
fn get_pinned(app: tauri::AppHandle) -> Vec<String> {
    let path = config_dir(&app).join("pinned.json");
    load_json::<Vec<String>>(&path).unwrap_or_default()
}

/// Save the list of pinned app IDs
#[tauri::command]
fn set_pinned(app: tauri::AppHandle, ids: Vec<String>) -> Result<(), String> {
    let path = config_dir(&app).join("pinned.json");
    save_json(&path, &ids)
}

fn set_startup_enabled(enabled: bool) -> Result<(), String> {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let name = "Launchpad";
    if enabled {
        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        let value = format!("\"{}\"", exe);
        let status = Command::new("reg")
            .args(["add", key, "/v", name, "/t", "REG_SZ", "/d", &value, "/f"])
            .creation_flags(0x08000000)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("开机启动设置失败".to_string());
        }
    } else {
        let _ = Command::new("reg")
            .args(["delete", key, "/v", name, "/f"])
            .creation_flags(0x08000000)
            .status();
    }
    Ok(())
}

/// Get the current settings
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Settings {
    let path = config_dir(&app).join("settings.json");
    load_json::<Settings>(&path).unwrap_or_default()
}

/// Save settings
#[tauri::command]
fn set_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    set_startup_enabled(settings.start_with_windows)?;
    let path = config_dir(&app).join("settings.json");
    save_json(&path, &settings)
}

// ============ Sidebar Commands ============

/// Get all sidebar items
#[tauri::command]
fn get_sidebar_items(app: tauri::AppHandle) -> Vec<SidebarItem> {
    let path = config_dir(&app).join("sidebar.json");
    load_json::<Vec<SidebarItem>>(&path).unwrap_or_default()
}

/// Save all sidebar items
#[tauri::command]
fn set_sidebar_items(app: tauri::AppHandle, items: Vec<SidebarItem>) -> Result<(), String> {
    let path = config_dir(&app).join("sidebar.json");
    save_json(&path, &items)
}

/// Create a new sidebar item
#[tauri::command]
fn create_sidebar_item(
    app: tauri::AppHandle,
    item_type: String,
    name: String,
    parent_id: Option<String>,
    app_id: Option<String>,
    app_name: Option<String>,
    app_icon: Option<String>,
) -> Result<SidebarItem, String> {
    let item = SidebarItem {
        id: format!("item_{}_{}", now_ts(), rand::random::<u32>()),
        item_type,
        name,
        parent_id,
        content: None,
        app_id,
        app_name,
        app_icon,
        created_at: now_ts(),
    };
    let path = config_dir(&app).join("sidebar.json");
    let mut items = load_json::<Vec<SidebarItem>>(&path).unwrap_or_default();
    items.push(item.clone());
    save_json(&path, &items)?;
    Ok(item)
}

/// Delete a sidebar item by id (and its children if folder)
#[tauri::command]
fn delete_sidebar_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = config_dir(&app).join("sidebar.json");
    let mut items = load_json::<Vec<SidebarItem>>(&path).unwrap_or_default();
    // Collect ids to delete (the item + descendants)
    let mut to_delete: HashSet<String> = HashSet::new();
    to_delete.insert(id.clone());
    let mut changed = true;
    while changed {
        changed = false;
        for item in &items {
            if let Some(ref pid) = item.parent_id {
                if to_delete.contains(pid) && !to_delete.contains(&item.id) {
                    to_delete.insert(item.id.clone());
                    changed = true;
                }
            }
        }
    }
    items.retain(|i| !to_delete.contains(&i.id));
    save_json(&path, &items)
}

/// Update a sidebar item (rename or content)
#[tauri::command]
fn update_sidebar_item(
    app: tauri::AppHandle,
    id: String,
    name: Option<String>,
    content: Option<String>,
) -> Result<(), String> {
    let path = config_dir(&app).join("sidebar.json");
    let mut items = load_json::<Vec<SidebarItem>>(&path).unwrap_or_default();
    for item in items.iter_mut() {
        if item.id == id {
            if let Some(ref n) = name {
                item.name = n.clone();
            }
            if let Some(ref c) = content {
                item.content = Some(c.clone());
            }
        }
    }
    save_json(&path, &items)
}

// ============ Clipboard Commands ============

const MAX_CLIPBOARD_HISTORY: usize = 50;

/// Read current clipboard text and add to history.
#[tauri::command]
fn read_clipboard(state: State<'_, AppState>) -> Result<String, String> {
    use clipboard_win::{formats, get_clipboard};

    let text: String = get_clipboard(formats::Unicode)
        .map_err(|e| format!("Clipboard read failed: {}", e))?;

    if !text.trim().is_empty() {
        let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
        // Deduplicate: remove existing same text
        history.retain(|e| e.text != text);
        // Add to front
        history.insert(0, ClipboardEntry {
            id: format!("cb_{}_{}", now_ts(), rand::random::<u32>()),
            text: text.clone(),
            timestamp: now_ts(),
        });
        // Trim to max
        if history.len() > MAX_CLIPBOARD_HISTORY {
            history.truncate(MAX_CLIPBOARD_HISTORY);
        }
    }

    Ok(text)
}

/// Write text to clipboard.
#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    use clipboard_win::{formats, set_clipboard};
    set_clipboard(formats::Unicode, text)
        .map_err(|e| format!("Clipboard write failed: {}", e))?;
    Ok(())
}

/// Get clipboard history (most recent first).
#[tauri::command]
fn get_clipboard_history(state: State<'_, AppState>) -> Vec<ClipboardEntry> {
    state
        .clipboard_history
        .lock()
        .map(|h| h.clone())
        .unwrap_or_default()
}

/// Clear clipboard history.
#[tauri::command]
fn clear_clipboard_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
    history.clear();
    Ok(())
}

/// Delete a single clipboard history entry.
#[tauri::command]
fn delete_clipboard_entry(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut history = state.clipboard_history.lock().map_err(|e| e.to_string())?;
    history.retain(|e| e.id != id);
    Ok(())
}

// ============ Color Picker Commands ============

/// Get the pixel color at current cursor position.
#[tauri::command]
fn get_pixel_color() -> Result<ColorInfo, String> {
    use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);

        let hdc = GetDC(HWND(std::ptr::null_mut()));
        if hdc.is_invalid() {
            return Err("Failed to get screen DC".to_string());
        }

        let color_ref = GetPixel(hdc, pt.x, pt.y);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc);

        let cr = color_ref.0;
        if cr == 0xFFFFFFFF {
            return Err("Failed to get pixel color".to_string());
        }

        let r = (cr & 0xFF) as u8;
        let g = ((cr >> 8) & 0xFF) as u8;
        let b = ((cr >> 16) & 0xFF) as u8;

        Ok(ColorInfo {
            hex: format!("#{:02X}{:02X}{:02X}", r, g, b),
            rgb: format!("{}, {}, {}", r, g, b),
            x: pt.x,
            y: pt.y,
        })
    }
}

// ============ Network Speed Commands ============

/// Get current network upload/download speed in KB/s.
#[tauri::command]
fn get_network_speed(state: State<'_, AppState>) -> Result<NetworkSpeed, String> {
    use sysinfo::Networks;

    let networks = Networks::new_with_refreshed_list();
    let mut total_rx: u64 = 0;
    let mut total_tx: u64 = 0;

    for (_name, network) in &networks {
        total_rx += network.total_received();
        total_tx += network.total_transmitted();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut last = state.last_network_stats.lock().map_err(|e| e.to_string())?;

    let speed = if let Some((last_time, last_rx, last_tx)) = *last {
        let dt_secs = ((now - last_time) as f64) / 1000.0;
        if dt_secs > 0.1 {
            let download_kbps = ((total_rx - last_rx) as f64) / dt_secs / 1024.0;
            let upload_kbps = ((total_tx - last_tx) as f64) / dt_secs / 1024.0;
            NetworkSpeed {
                upload_kbps: upload_kbps.max(0.0),
                download_kbps: download_kbps.max(0.0),
            }
        } else {
            NetworkSpeed { upload_kbps: 0.0, download_kbps: 0.0 }
        }
    } else {
        NetworkSpeed { upload_kbps: 0.0, download_kbps: 0.0 }
    };

    *last = Some((now, total_rx, total_tx));
    Ok(speed)
}

// ============ Overlay (global hotkey) ============

#[tauri::command]
fn set_overlay(state: State<AppState>, value: bool) {
    *state.overlay.lock().unwrap() = value;
}

// ============ Updater (auto-update) ============
// Commands are intentionally PRIVATE (`fn`, not `pub`). In Tauri v2 a command
// defined directly in lib.rs (crate root) must NOT be `pub` — otherwise
// `#[tauri::command]` double-defines the generated `__cmd__` macro (error[E0255]).

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

/// Check whether a newer version is available. Returns None when up to date.
#[tauri::command]
fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    tauri::async_runtime::block_on(async move {
        let updater = app.updater().map_err(|e| e.to_string())?;
        let current = app.package_info().version.to_string();
        match updater.check().await {
            Ok(Some(update)) => Ok(Some(UpdateInfo {
                current_version: current,
                latest_version: update.version.to_string(),
                date: update.date.map(|d| d.to_string()),
                body: update.body.clone(),
            })),
            Ok(None) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })
}

/// Download and install the update, then restart the app.
#[tauri::command]
fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::block_on(async move {
        let updater = app.updater().map_err(|e| e.to_string())?;
        if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
            update
                .download_and_install(|_downloaded, _total| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            let _ = app.restart();
        }
        Ok(())
    })
}

// ============ App Entry Point ============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            cached_apps: Mutex::new(None),
            sys: Mutex::new(sysinfo::System::new_all()),
            clipboard_history: Mutex::new(Vec::new()),
            last_network_stats: Mutex::new(None),
            cpu_warmed: Mutex::new(false),
            overlay: Mutex::new(false),
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 注意：不再启动时预热热搜服务。
            // 热搜依赖本地 Python，机器若无 Python 会反复重试、弹黑窗、白耗资源。
            // 改为「进入热搜视图时按需启动」（前端 TrendingView 触发），避免拖慢启动。

            // 全局快捷键 Alt+Space：随时唤出 / 收起 Launchpad（Raycast 式浮层）
            let sc = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let _ = app.global_shortcut().on_shortcut(sc, move |app, _shortcut, _event| {
                let state = app.state::<AppState>();
                let mut overlay = state.overlay.lock().unwrap();
                if *overlay {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.set_always_on_top(false);
                        let _ = w.hide();
                    }
                    *overlay = false;
                    let _ = app.emit("toggle-overlay", false);
                } else {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                        let _ = w.set_always_on_top(true);
                    }
                    *overlay = true;
                    let _ = app.emit("toggle-overlay", true);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_apps,
            launch_app,
            get_recent,
            reveal_app,
            delete_app,
            get_excluded,
            remove_excluded,
            get_pinned,
            set_pinned,
            get_settings,
            set_settings,
            get_sidebar_items,
            set_sidebar_items,
            create_sidebar_item,
            delete_sidebar_item,
            update_sidebar_item,
            open_in_chrome,
            start_trending_server,
            get_system_stats,
            get_recent_files,
            read_clipboard,
            write_clipboard,
            get_clipboard_history,
            clear_clipboard_history,
            delete_clipboard_entry,
            get_pixel_color,
            get_network_speed,
            set_overlay,
            search_files,
            get_bookmarks,
            open_path,
            check_for_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
