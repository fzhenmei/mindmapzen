mod ai_stream;
mod sse;
mod export_pdf;

use ai_stream::{ai_chat_abort, ai_chat_start};
use export_pdf::export_pdf_via_edge;

#[tauri::command]
fn trash_delete(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 光标不可见自愈（2026-09-22/23 托盘区鼠标消失排障，画像已经复现机器取证修正）：
/// 捕获小窗（WebView2/Chromium）hide 边界后，实测 GetCursorInfo 完全正常（SHOWING +
/// 系统光标句柄 ARROW/SIZENS），但光标不可见、手动移动不恢复——问题不在 NULL 粘滞，
/// 在图像/渲染层。三层防御：① SPI_SETCURSORS 从注册表重载系统光标图像并全系统广播
/// （治图像被换空）；② 1px 往返移动生成 WM_MOUSEMOVE，强制鼠标下窗口重派
/// WM_SETCURSOR 与光标平面重绘（治形状残留/推动驱动重渲染）；③ SetCursor(箭头)
/// 复位本线程责任光标。前端在捕获小窗 hide 链路延迟约 250ms 后调用——立即调用已被
/// 复现机器（v2.21.0）证明会被 WebView2 异步清理边界"其后确立"的残留覆盖。幂等无
/// 副作用，非必现问题的自愈兜底
#[cfg(windows)]
#[tauri::command]
fn reset_cursor_display() {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, LoadCursorW, SetCursor, SetCursorPos, SystemParametersInfoW, IDC_ARROW,
        SPIF_SENDCHANGE, SPI_SETCURSORS,
    };
    unsafe {
        // 失败仅剩参数错误一种可能（固定常量入参），且无补救动作可走——本调用本身
        // 就是自愈兜底，失败即维持原状（下次 hide 再试），显式丢弃返回值留痕于此
        let _ = SystemParametersInfoW(SPI_SETCURSORS, 0, std::ptr::null_mut(), SPIF_SENDCHANGE);
        // 1px 往返：视觉无感，但生成两次 WM_MOUSEMOVE，把光标状态推过一次完整的
        // 派发/重绘循环（失败同上：UIPI 拦截或无补救，留痕丢弃）
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) != 0 {
            let _ = SetCursorPos(pt.x + 1, pt.y);
            let _ = SetCursorPos(pt.x, pt.y);
        }
        let arrow = LoadCursorW(std::ptr::null_mut(), IDC_ARROW);
        if !arrow.is_null() {
            let _ = SetCursor(arrow); // 同上：失败无补救，返回值为旧光标句柄无用途
        }
    }
}

/// 非 Windows 平台无 Win32 光标粘滞语义，空实现（前端调用点直接返回成功）
#[cfg(not(windows))]
#[tauri::command]
fn reset_cursor_display() {}

/// 抢前台显示窗口（2026-09-23 无焦点时快捷键呼出小窗不获输入焦点修复）：全局快捷键的
/// JS 处理链经"热键→IPC→主窗 JS→IPC→Rust"两次往返，热键赋予的前台化权利已蒸发——
/// 非前台进程的 SetForegroundWindow 被 Windows 前台锁拒绝，窗口可见但拿不到系统焦点，
/// 键盘输入进不去（主窗在前台时进程本身即前台进程，故平时正常）。AttachThreadInput 把
/// 本线程短暂挂进当前前台窗口线程的输入队列，借其身份完成 SetForegroundWindow 再脱离，
/// 是该场景的业界标准解法；attach 窗口仅两次调用，无长驻同步
#[cfg(windows)]
#[tauri::command]
fn force_foreground_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, ShowWindow, SW_SHOW,
    };
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    // tauri 返回 windows crate 的 HWND（isize 包装），windows-sys 的 HWND 是裸指针——
    // 经 usize 一次过桥（同句柄值，仅类型体系不同）
    let hwnd = w.hwnd().map_err(|e| e.to_string())?.0 as usize as HWND;
    unsafe {
        ShowWindow(hwnd, SW_SHOW);
        let fg = GetForegroundWindow();
        let fg_thread = if fg.is_null() {
            0
        } else {
            GetWindowThreadProcessId(fg, std::ptr::null_mut())
        };
        let cur_thread = GetCurrentThreadId();
        let attached =
            fg_thread != 0 && fg_thread != cur_thread && AttachThreadInput(cur_thread, fg_thread, 1) != 0;
        // SetForegroundWindow/SetFocus 失败=前台锁未破，窗口仍显示但焦点维持原状——无补救
        // 分支可走，调用方有常规 show/setFocus 兜底，失败留痕于此
        let _ = SetForegroundWindow(hwnd);
        let _ = SetFocus(hwnd);
        if attached {
            let _ = AttachThreadInput(cur_thread, fg_thread, 0);
        }
    }
    Ok(())
}

/// 非 Windows 无前台锁语义，常规显示+聚焦即可
#[cfg(not(windows))]
#[tauri::command]
fn force_foreground_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    w.show().and_then(|_| w.set_focus()).map_err(|e| e.to_string())
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

/// git 子进程执行底座（git_exec / git_clone 共用）。v2.4 性能修复沉淀：
///  ① async + tokio::process——不阻塞线程（同步 output() 冻结消息泵，UI 全卡，验收实案）；
///  ② Windows CREATE_NO_WINDOW——git.exe 是控制台程序，默认会闪黑色 cmd 窗口（验收实案）；
///  ③ 超时入参——防异常命令把会话挂死（常规命令 30s；clone 拉网络远端放宽）。
/// 单用户桌面应用，信任本地图；输出与退出码整体回传（服务层按 ok/out 解析状态）
async fn run_git(cwd: &str, args: &[String], timeout_secs: u64) -> Result<GitResult, String> {
    use std::time::Duration;
    use tokio::process::Command as TokioCommand;

    let mut cmd = TokioCommand::new("git");
    cmd.args(args).current_dir(cwd);
    #[cfg(windows)]
    {
        // tokio Command 自带 creation_flags（Windows）：控制台子进程不创建新窗口
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = tokio::time::timeout(Duration::from_secs(timeout_secs), cmd.output())
        .await
        .map_err(|_| "GIT_TIMEOUT".to_string())?
        .map_err(|e| e.to_string())?;
    Ok(GitResult {
        ok: out.status.success(),
        out: String::from_utf8_lossy(&out.stdout).into_owned(),
        err: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// git 命令执行（M20 版本管理）：cwd 限定调用方传入的工作区目录，args 为 git 子命令。
/// 超时 30s——防异常仓库（如巨型 status）把会话挂死
#[tauri::command]
async fn git_exec(cwd: String, args: Vec<String>) -> Result<GitResult, String> {
    run_git(&cwd, &args, 30).await
}

/// git 克隆（「从 Git 库打开」）：cwd 为目标父目录，在父目录下克隆出 <repo_name>/。
/// 仓库名由前端从 URL 解析（目标目录 = 父目录/仓库名，前端据此设工作区与失败回收）。
/// 超时 600s——clone 拉网络远端（大库/慢网），远超常规命令 30s 预算；
/// 认证由前端把凭证内嵌进 URL（basic auth 惯例），对任意 Git Server 通用
#[tauri::command]
async fn git_clone(parent_dir: String, url: String, repo_name: String) -> Result<GitResult, String> {
    run_git(&parent_dir, &[String::from("clone"), url, repo_name], 600).await
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
                let _ = win.show(); // M2：主窗可能已隐藏到托盘（关窗隐藏），复启必须重新显示
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        // 窗口状态记忆：自动保存/恢复位置、尺寸、最大化状态（见 Cargo.toml 注释）。
        // state_flags 去掉 VISIBLE：窗口以 visible:false 创建，插件不抢跑 show，
        // 由 setup 在状态恢复 / 首次最大化后统一显示（防 800×600→最大化闪变）
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // 全局快捷键（2026-09 点子篮子 M2，spec §5.3）：插件级注册即可——键位与开关由
        // 前端按配置动态 register/unregister（JS API），Rust 侧不预置任何键
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 运行时窗口图标（v2.4 验收：任务栏先 logo 后变 Windows 默认）——Windows 任务栏
        // 图标查询窗口类/进程资源，显式 set_icon 钉住（icons/128x128.png 与应用图标同源）
        .setup(|app| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let img = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
                let _ = win.set_icon(img); // 失败不阻断启动（图标缺失仅视觉）
                // 任务栏预览小窗的图标+标题依赖窗口属性（无边框自定义标题栏后系统标题栏
                // 不存在，logo/品名由前端 TitleBar 呈现，此处的窗口图标/标题专供任务栏）

                // 首次启动（插件无状态文件）：默认最大化。此后每次启动由插件恢复上次
                // 关闭时的位置/尺寸/最大化态。路径与插件内部读写的 app_config_dir 一致，
                // 判断失败（目录不可得）宁可放弃最大化也不阻断启动
                let first_run = app
                    .path()
                    .app_config_dir()
                    .map(|d| {
                        !d.join(tauri_plugin_window_state::DEFAULT_FILENAME)
                            .exists()
                    })
                    .unwrap_or(false);
                if first_run {
                    let _ = win.maximize();
                }
                // 此刻插件已恢复完状态（on_window_ready 早于 setup），统一显示+聚焦
                let _ = win.show();
                let _ = win.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trash_delete,
            git_exec,
            git_clone,
            set_titlebar_colors,
            reset_cursor_display,
            force_foreground_window,
            ai_chat_start,
            ai_chat_abort,
            export_pdf_via_edge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
