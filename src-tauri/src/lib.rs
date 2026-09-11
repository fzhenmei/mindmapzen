mod sse;

#[tauri::command]
fn trash_delete(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 标题栏主题染色（v2.5 视觉一体化）：DWM 属性把系统标题栏/边框染成前端主题色，
/// 去掉 Windows 强调色（深蓝）与应用主题的割裂。前端在主题落位时调用，传参：
///  caption/border 为 #RRGGBB（来自 theme.css 的 --background/--border），
///  dark 控制标题文字明暗（immersive dark mode，黑字/白字随主题翻转）。
/// 兼容性：CAPTION/BORDER_COLOR 需 Win11 22000+；Win10 上返回 E_INVALIDARG，
/// 仅文字明暗生效——失败回传 Err，前端 console.warn 静默（仅视觉退化不阻断）
#[cfg(windows)]
#[tauri::command]
fn set_titlebar_colors(
    window: tauri::WebviewWindow,
    caption: String,
    border: String,
    dark: bool,
) -> Result<(), String> {
    use std::{ffi::c_void, mem::size_of};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR,
        DWMWA_USE_IMMERSIVE_DARK_MODE,
    };

    /// "#RRGGBB" → COLORREF（0x00BBGGRR，DWM 字节序与 CSS 相反）
    fn to_colorref(hex: &str) -> Result<u32, String> {
        let h = hex.trim_start_matches('#');
        if h.len() != 6 {
            return Err(format!("INVALID_COLOR: {hex}"));
        }
        let v = u32::from_str_radix(h, 16).map_err(|e| format!("INVALID_COLOR: {hex}: {e}"))?;
        let (r, g, b) = ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
        Ok((b << 16) | (g << 8) | r)
    }

    unsafe {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as HWND;
        let apply = |attr: i32, val: *const c_void, size: u32| -> Result<(), String> {
            let hr = DwmSetWindowAttribute(hwnd, attr as u32, val, size);
            if hr != 0 {
                Err(format!(
                    "DWM_SET_ATTR_FAILED: attr={attr} hr=0x{hr:08X}"
                ))
            } else {
                Ok(())
            }
        };
        let dark_flag: i32 = dark as i32;
        apply(
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark_flag as *const i32 as *const c_void,
            size_of::<i32>() as u32,
        )?;
        let caption_ref = to_colorref(&caption)?;
        apply(
            DWMWA_CAPTION_COLOR,
            &caption_ref as *const u32 as *const c_void,
            size_of::<u32>() as u32,
        )?;
        let border_ref = to_colorref(&border)?;
        apply(
            DWMWA_BORDER_COLOR,
            &border_ref as *const u32 as *const c_void,
            size_of::<u32>() as u32,
        )?;
    }
    Ok(())
}

/// 非 Windows：无 DWM 染色机制（macOS/Linux 标题栏本就交由系统原生融合），no-op
#[cfg(not(windows))]
#[tauri::command]
fn set_titlebar_colors(
    _window: tauri::WebviewWindow,
    _caption: String,
    _border: String,
    _dark: bool,
) -> Result<(), String> {
    Ok(())
}

/// git 命令执行（M20 版本管理）：cwd 限定调用方传入的工作区目录，args 为 git 子命令。
/// v2.4 性能修复：
///  ① async + tokio::process——不阻塞线程（同步 output() 冻结消息泵，UI 全卡，验收实案）；
///  ② Windows CREATE_NO_WINDOW——git.exe 是控制台程序，默认会闪黑色 cmd 窗口（验收实案）；
///  ③ 30s 超时——防异常仓库（如巨型 status）把会话挂死。
/// 单用户桌面应用，信任本地图；输出与退出码整体回传（服务层按 ok/out 解析状态）
#[tauri::command]
async fn git_exec(cwd: String, args: Vec<String>) -> Result<GitResult, String> {
    use std::time::Duration;
    use tokio::process::Command as TokioCommand;

    let mut cmd = TokioCommand::new("git");
    cmd.args(&args).current_dir(&cwd);
    #[cfg(windows)]
    {
        // tokio Command 自带 creation_flags（Windows）：控制台子进程不创建新窗口
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = tokio::time::timeout(Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| "GIT_TIMEOUT".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(GitResult {
        ok: out.status.success(),
        out: String::from_utf8_lossy(&out.stdout).into_owned(),
        err: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

#[derive(serde::Serialize)]
struct GitResult {
    ok: bool,
    out: String,
    err: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例锁（多实例互覆防护）：同 identifier 二次启动不再开新进程，聚焦已有主窗口。
        // 两个实例各持内存态编辑同一文件时，自动保存后写者胜——先保存的变更被静默覆盖，
        // 根治靠锁死多开（保存前冲突检测另防外部编辑器改盘，见前端 useSavePipeline）。
        // 官方要求：必须最先注册（先于其余插件），后注册的实例启动即退出并触发此回调
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // 运行时窗口图标（v2.4 验收：任务栏先 logo 后变 Windows 默认）——Windows 任务栏
        // 图标查询窗口类/进程资源，显式 set_icon 钉住（icons/128x128.png 与应用图标同源）
        .setup(|app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let img = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
                let _ = win.set_icon(img); // 失败不阻断启动（图标缺失仅视觉）
                // 任务栏预览小窗的图标+标题依赖窗口属性（无边框自定义标题栏后系统标题栏
                // 不存在，logo/品名由前端 TitleBar 呈现，此处的窗口图标/标题专供任务栏）
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trash_delete,
            git_exec,
            set_titlebar_colors
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
