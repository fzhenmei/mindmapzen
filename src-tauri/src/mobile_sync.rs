// src-tauri/src/mobile_sync.rs —— 手机点子捕获(2026-09-26 spec):局域网同步服务。
// 本文件分层:配置/去重(本任务)→ API 纯函数(Task 2)→ 静态资源(Task 3)→
// 服务线程与 tauri 命令(Task 4)。纯函数与 IO 解耦,单测不起端口。
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DEFAULT_PORT: u16 = 39871;
pub const MOBILE_IDEAS_EVENT: &str = "mobile-ideas";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MobileSyncConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

pub fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("mobile-sync.json")
}

/// 读配置;文件缺失/损坏 → 生成默认(enabled=false 默认关:绑端口监听须用户知情自选,
/// spec §5.1,同 quickCapture 拆分哲学)并立即落盘固化 token
pub fn load_config(data_dir: &Path) -> MobileSyncConfig {
    let p = config_path(data_dir);
    if let Ok(s) = fs::read_to_string(&p) {
        if let Ok(cfg) = serde_json::from_str::<MobileSyncConfig>(&s) {
            if !cfg.token.is_empty() {
                return cfg;
            }
        }
    }
    let cfg = MobileSyncConfig { enabled: false, port: DEFAULT_PORT, token: Uuid::new_v4().to_string() };
    // 落盘失败无法在此给用户出口(调用方 setup 时无 UI);token 退化到仅本次会话有效,
    // eprintln 留排查线索(零静默原则的最低线)
    if let Err(e) = save_config(data_dir, &cfg) {
        eprintln!("mobile-sync 配置落盘失败: {e}");
    }
    cfg
}

pub fn save_config(data_dir: &Path, cfg: &MobileSyncConfig) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let s = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(config_path(data_dir), s).map_err(|e| format!("写配置失败: {e}"))
}

/// 已受理点子 id 去重(手机整批重推幂等,spec §5.3):容量上限,超限清最旧一半
pub struct DedupSet {
    order: VecDeque<String>,
    set: HashSet<String>,
    cap: usize,
}

impl DedupSet {
    pub fn new(cap: usize) -> Self {
        Self { order: VecDeque::new(), set: HashSet::new(), cap }
    }

    /// true = 新 id(已登记);false = 重复(不再受理)
    pub fn insert(&mut self, id: &str) -> bool {
        if self.set.contains(id) {
            return false;
        }
        if self.order.len() >= self.cap {
            // 清最旧一半(cap ≥ 2 时严格小于当前长度,循环必能腾位)
            let drop_n = self.cap / 2;
            for _ in 0..drop_n {
                if let Some(old) = self.order.pop_front() {
                    self.set.remove(&old);
                }
            }
        }
        self.order.push_back(id.to_string());
        self.set.insert(id.to_string());
        true
    }
}

// ---- API 纯函数(Task 2)----

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IdeaIn {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub captured_at: u64,
}

#[derive(Serialize)]
struct IdeaResult {
    id: String,
    ok: bool,
}

pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

fn json_resp(status: u16, body: String) -> ApiResponse {
    ApiResponse { status, body }
}

#[derive(Deserialize)]
struct IdeasPayload {
    ideas: Vec<IdeaIn>,
}

/// API 路由纯函数(与传输层解耦,单测直喂字符串):
/// - GET /api/health:免认证探测(spec §5.3)
/// - POST /api/ideas:Bearer 令牌 → 解析 → 上限防呆 → 去重 → 新受理项追加进 accepted
/// - OPTIONS *:CORS preflight(dev 模式手机直连 vite 5174,跨源POST必预检;
///   令牌即唯一凭证且无 cookie,Allow-Origin:* 无风险——spec §5.6 简化落地)
/// - 其余 404
pub fn handle_api(
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: &str,
    cfg: &MobileSyncConfig,
    dedup: &mut DedupSet,
    accepted: &mut Vec<IdeaIn>,
) -> ApiResponse {
    if method == "OPTIONS" {
        return json_resp(204, String::new());
    }
    if path == "/api/health" && method == "GET" {
        let v = serde_json::json!({ "app": "mind-map-zen", "version": env!("CARGO_PKG_VERSION") });
        return json_resp(200, v.to_string());
    }
    if path == "/api/ideas" && method == "POST" {
        let ok = auth.map(|a| a == format!("Bearer {}", cfg.token)).unwrap_or(false);
        if !ok {
            return json_resp(401, r#"{"error":"unauthorized"}"#.into());
        }
        let payload: IdeasPayload = match serde_json::from_str(body) {
            Ok(p) => p,
            Err(_) => return json_resp(400, r#"{"error":"bad json"}"#.into()),
        };
        if payload.ideas.is_empty() || payload.ideas.len() > 100 {
            return json_resp(400, r#"{"error":"batch size 1..=100"}"#.into());
        }
        for it in &payload.ideas {
            if it.text.is_empty() || it.text.chars().count() > 2000 || it.body.chars().count() > 20000 {
                return json_resp(400, r#"{"error":"idea too long or empty"}"#.into());
            }
        }
        let mut results = Vec::new();
        for it in payload.ideas {
            let fresh = dedup.insert(&it.id);
            // 去重命中也算 ok:手机端据此删本地,幂等不卡同步(spec §5.3)
            results.push(IdeaResult { id: it.id.clone(), ok: true });
            if fresh {
                accepted.push(it);
            }
        }
        let body = serde_json::json!({ "results": results }).to_string();
        return json_resp(200, body);
    }
    json_resp(404, r#"{"error":"not found"}"#.into())
}

// ---- 静态资源(Task 3)----

#[derive(Debug)]
pub enum StaticResolution {
    /// 命中文件:(绝对路径, mime)
    File(PathBuf, &'static str),
    /// 未命中但路径合法 → SPA fallback 到 index.html
    Fallback,
    /// 路径非法(穿越/绝对盘符)
    Forbidden,
}

fn mime_of(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "webmanifest" => "application/manifest+json",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// URL 路径 → mobile-dist 内文件。安全:百分号解码后规范化,结果必须仍在 root 内;
/// `..` 逃逸/盘符/UNC 一律 Forbidden(spec §8)
pub fn resolve_static(root: &Path, url_path: &str) -> StaticResolution {
    let decoded = percent_decode(url_path);
    let decoded = decoded.trim_start_matches('/');
    if decoded.contains("..") || decoded.contains(':') || decoded.contains('\\') {
        return StaticResolution::Forbidden;
    }
    let mut full = root.to_path_buf();
    for seg in decoded.split('/') {
        match seg {
            "" | "." => {}
            s => full.push(s),
        }
    }
    if full.is_dir() {
        full.push("index.html");
    }
    if full.is_file() {
        let mime = mime_of(&full);
        return StaticResolution::File(full, mime);
    }
    // 目录/未命中 → index.html(SPA 路由 + PWA 安装页都是单入口)
    let idx = root.join("index.html");
    if idx.is_file() {
        StaticResolution::Fallback
    } else {
        // dev 模式 resource_dir 无 mobile-dist(dev 走 vite 5174):404 语义
        StaticResolution::Forbidden
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let hex = |b: u8| -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    };
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---- 服务线程与 tauri 命令(Task 4)----

use local_ip_address::list_afinet_netifas;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileSyncInfo {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
    pub ips: Vec<String>,
    pub current: String,
}

struct ServiceState {
    server: Arc<tiny_http::Server>,
    thread: std::thread::JoinHandle<()>,
    /// 停止标志:unblock 后 incoming_requests 迭代结束,线程据此退出
    stopped: Arc<AtomicBool>,
}

/// 服务态容器:tauri 状态管理(lib.rs setup 里 app.manage 注入),不用 static
/// (Rust 1.77 无 LazyLock,static + Lazy 需加 once_cell 依赖,无谓)。
/// 字段私有:外部(lib.rs)只经 Default/stop/restore 交互,不触碰内部态
#[derive(Default)]
pub struct ServiceHolder(Mutex<Option<ServiceState>>);

impl ServiceHolder {
    fn stop(&self) {
        let mut guard = self.0.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(st) = guard.take() {
            st.stopped.store(true, Ordering::SeqCst);
            st.server.unblock();
            let _ = st.thread.join();
        }
    }
}

pub fn data_dir(app: &AppHandle) -> PathBuf {
    // app_data_dir 由 tauri 标识符派生;失败回退当前目录(仅单测环境可能发生)
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn info_snapshot(cfg: &MobileSyncConfig) -> MobileSyncInfo {
    let mut ips: Vec<String> = list_afinet_netifas()
        .map(|v| {
            v.into_iter()
                .filter_map(|(_, ip)| match ip {
                    std::net::IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    let current = local_ip_address::local_ip().map(|p| p.to_string()).unwrap_or_default();
    if !current.is_empty() && !ips.contains(&current) {
        ips.insert(0, current.clone());
    }
    MobileSyncInfo { enabled: cfg.enabled, port: cfg.port, token: cfg.token.clone(), ips, current }
}

/// 服务循环:阻塞收请求逐个处理(API 优先,其余走静态);IO 异常 eprintln 留痕不崩服务
fn serve_loop(app: AppHandle, server: Arc<tiny_http::Server>, cfg: MobileSyncConfig, dedup: Arc<Mutex<DedupSet>>, root: PathBuf) {
    for mut request in server.incoming_requests() {
        let method = request.method().as_str().to_string();
        let url = request.url().to_string();
        // HeaderField::equiv:tiny_http 官方判字段 API(大小写不敏感),比常量构造
        // 比较更直接(计划防御性写法的简化落地)
        let auth = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Authorization"))
            .map(|h| h.value.as_str().to_string());
        let mut body = String::new();
        // dyn Read 的主 trait 方法无需 use 导入即可调用(rustc 实证:导入反而 unused)
        if let Err(e) = request.as_reader().read_to_string(&mut body) {
            eprintln!("请求体读取失败: {e}"); // 空体继续走 400 分支,连接不断
        }
        let path_only = url.split('?').next().unwrap_or("").to_string();

        // 响应体必须走字节通道(Vec<u8>):mobile-dist 含 PNG/woff2 等二进制资产,
        // 经 String::from_utf8_lossy 会把非法 UTF-8 字节替换成 U+FFFD(PNG 魔数
        // 0x89 首当其冲),图标必坏;文本/API 分支 into_bytes/to_vec 殊途同归。
        // from_data 不带默认 Content-Type(from_string 才有 text/plain 默认头),
        // 下方 add_header(Content-Type) 循环是唯一来源,无重复头
        let (status, ctype, resp_body): (u16, String, Vec<u8>) = if path_only.starts_with("/api/") {
            let mut accepted = Vec::new();
            let mut guard = dedup.lock().unwrap_or_else(|p| p.into_inner());
            let r = handle_api(&method, &path_only, auth.as_deref(), &body, &cfg, &mut guard, &mut accepted);
            if !accepted.is_empty() {
                if let Err(e) = app.emit_to("main", MOBILE_IDEAS_EVENT, &accepted) {
                    eprintln!("mobile-ideas 事件派发失败: {e}");
                }
            }
            (r.status, "application/json".to_string(), r.body.into_bytes())
        } else if method == "GET" || method == "HEAD" {
            match resolve_static(&root, &path_only) {
                StaticResolution::File(p, mime) => match fs::read(&p) {
                    Ok(bytes) => (200, mime.to_string(), bytes),
                    Err(e) => {
                        eprintln!("静态文件读取失败 {}: {e}", p.display());
                        (404, "text/plain".into(), b"not found".to_vec())
                    }
                },
                StaticResolution::Fallback => match fs::read(root.join("index.html")) {
                    Ok(bytes) => (200, "text/html; charset=utf-8".into(), bytes),
                    Err(_) => (404, "text/plain".into(), b"mobile-dist missing".to_vec()),
                },
                StaticResolution::Forbidden => (403, "text/plain".into(), b"forbidden".to_vec()),
            }
        } else {
            (405, "text/plain".into(), b"method not allowed".to_vec())
        };

        let mut resp = tiny_http::Response::from_data(resp_body).with_status_code(status);
        for (k, v) in [
            ("Content-Type", ctype.as_str()),
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Authorization, Content-Type"),
        ] {
            match tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()) {
                Ok(h) => resp.add_header(h),
                // from_bytes 的 Err 是 unit(仅 ASCII 校验失败一种可能),无可格式化内容
                Err(_) => eprintln!("响应头构造失败 {k}"),
            }
        }
        let _ = request.respond(resp); // 单连接响应失败只影响该请求,循环继续收下一个
    }
}

/// 启动(或重启)服务。端口被占等失败显式上抛(调用方 UI 出口)
pub fn start_service(app: &AppHandle, holder: &ServiceHolder, cfg: MobileSyncConfig) -> Result<MobileSyncInfo, String> {
    holder.stop();
    let server = tiny_http::Server::http(("0.0.0.0", cfg.port)).map_err(|e| format!("端口 {} 监听失败: {e}", cfg.port))?;
    let server = Arc::new(server);
    let root = app.path().resource_dir().map_err(|e| format!("resource 目录不可得: {e}"))?.join("mobile-dist");
    let dedup = Arc::new(Mutex::new(DedupSet::new(1000)));
    let stopped = Arc::new(AtomicBool::new(false));
    let thread = {
        let app = app.clone();
        let server = Arc::clone(&server);
        let cfg = cfg.clone();
        let dedup = Arc::clone(&dedup);
        let stopped = Arc::clone(&stopped);
        std::thread::spawn(move || {
            serve_loop(app, server, cfg, dedup, root);
            stopped.store(true, Ordering::SeqCst);
        })
    };
    *holder.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(ServiceState { server, thread, stopped });
    Ok(info_snapshot(&cfg))
}

#[tauri::command]
pub fn get_mobile_sync_info(app: AppHandle) -> Result<MobileSyncInfo, String> {
    let cfg = load_config(&data_dir(&app));
    Ok(info_snapshot(&cfg))
}

#[tauri::command]
pub fn set_mobile_sync_config(app: AppHandle, holder: State<'_, ServiceHolder>, enabled: bool, port: u16) -> Result<MobileSyncInfo, String> {
    let dir = data_dir(&app);
    let mut cfg = load_config(&dir);
    cfg.enabled = enabled;
    cfg.port = port;
    if enabled {
        let info = start_service(&app, &holder, cfg.clone())?;
        save_config(&dir, &cfg)?;
        Ok(info)
    } else {
        holder.stop();
        save_config(&dir, &cfg)?;
        Ok(info_snapshot(&cfg))
    }
}

/// App setup 时恢复(enabled 配置持久化后重启自动起服务;lib.rs setup 调用)
pub fn restore_on_startup(app: &AppHandle, holder: &ServiceHolder) {
    let cfg = load_config(&data_dir(app));
    if cfg.enabled {
        if let Err(e) = start_service(app, holder, cfg) {
            eprintln!("手机同步服务自启失败: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("mz-mobile-sync-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn 首次加载生成默认并落盘() {
        let d = tmp_dir();
        let cfg = load_config(&d);
        assert!(!cfg.enabled);
        assert_eq!(cfg.port, DEFAULT_PORT);
        assert!(!cfg.token.is_empty());
        // 落盘可回读,token 稳定
        let cfg2 = load_config(&d);
        assert_eq!(cfg, cfg2);
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn 损坏文件回退默认() {
        let d = tmp_dir();
        fs::write(config_path(&d), "{not json").unwrap();
        let cfg = load_config(&d);
        assert!(!cfg.enabled);
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn 去重器幂等() {
        let mut s = DedupSet::new(4);
        assert!(s.insert("a"));
        assert!(!s.insert("a"));
        assert!(s.insert("b"));
    }

    #[test]
    fn 去重器超限清旧() {
        let mut s = DedupSet::new(4);
        for id in ["a", "b", "c", "d"] {
            s.insert(id);
        }
        assert!(s.insert("e")); // 触发清最旧一半(a、b 出局)
        assert!(s.insert("a")); // a 已被清理,重新受理
        assert!(!s.insert("e"));
    }

    // ---- API 纯函数(Task 2)----

    #[test]
    fn health_免认证() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let r = handle_api("GET", "/api/health", None, "", &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 200);
        assert!(r.body.contains("mind-map-zen"));
    }

    #[test]
    fn ideas_令牌错误401() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let r = handle_api("POST", "/api/ideas", Some("Bearer wrong"), "{}", &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 401);
        assert!(accepted.is_empty());
    }

    #[test]
    fn ideas_正常受理与去重() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut accepted = Vec::new();
        let body = r#"{"ideas":[{"id":"u1","text":"点子甲","body":"补充","capturedAt":1}]}"#;
        let r = handle_api("POST", "/api/ideas", Some("Bearer t"), body, &cfg, &mut dedup, &mut accepted);
        assert_eq!(r.status, 200);
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].text, "点子甲");
        // 同 id 重推:受理列表不再新增,但响应仍 ok(幂等语义,spec §5.3)
        let mut accepted2 = Vec::new();
        let r2 = handle_api("POST", "/api/ideas", Some("Bearer t"), body, &cfg, &mut dedup, &mut accepted2);
        assert_eq!(r2.status, 200);
        assert!(accepted2.is_empty());
    }

    #[test]
    fn ideas_超限与坏json400() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut a = Vec::new();
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), "not json", &cfg, &mut dedup, &mut a).status, 400);
        let long = "x".repeat(2001);
        let body = format!(r#"{{"ideas":[{{"id":"u1","text":"{long}"}}]}}"#);
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), &body, &cfg, &mut dedup, &mut a).status, 400);
        let many: Vec<String> = (0..101).map(|i| format!(r#"{{"id":"u{i}","text":"t"}}"#)).collect();
        let body2 = format!(r#"{{"ideas":[{}]}}"#, many.join(","));
        assert_eq!(handle_api("POST", "/api/ideas", Some("Bearer t"), &body2, &cfg, &mut dedup, &mut a).status, 400);
    }

    #[test]
    fn preflight_204与未知404() {
        let cfg = MobileSyncConfig { enabled: true, port: 1, token: "t".into() };
        let mut dedup = DedupSet::new(10);
        let mut a = Vec::new();
        assert_eq!(handle_api("OPTIONS", "/api/ideas", None, "", &cfg, &mut dedup, &mut a).status, 204);
        assert_eq!(handle_api("GET", "/api/nope", None, "", &cfg, &mut dedup, &mut a).status, 404);
    }

    // ---- 静态资源(Task 3)----

    #[test]
    fn 静态解析与mime() {
        let d = tmp_dir();
        fs::write(d.join("index.html"), "<html></html>").unwrap();
        fs::create_dir_all(d.join("assets")).unwrap();
        fs::write(d.join("assets/app.js"), "console.log(1)").unwrap();
        match resolve_static(&d, "/") {
            StaticResolution::File(p, _) => assert_eq!(p, d.join("index.html")),
            other => panic!("期望 File,得到 {other:?}"),
        }
        match resolve_static(&d, "/assets/app.js") {
            StaticResolution::File(_, mime) => assert_eq!(mime, "text/javascript"),
            other => panic!("期望 File,得到 {other:?}"),
        }
        // SPA fallback:未知路径回 index.html(spec §5.3)
        assert!(matches!(resolve_static(&d, "/some/route"), StaticResolution::Fallback));
    }

    #[test]
    fn 静态路径穿越拒绝() {
        let d = tmp_dir();
        fs::write(d.join("index.html"), "x").unwrap();
        let secret = std::env::temp_dir().join(format!("mz-secret-{}", Uuid::new_v4()));
        fs::create_dir_all(&secret).unwrap();
        fs::write(secret.join("secret.txt"), "s").unwrap();
        // mobile-dist 在 d,试图用 .. 逃到 secret
        let rel = pathdiff_reldesc(&d, &secret.join("secret.txt"));
        assert!(matches!(resolve_static(&d, &rel), StaticResolution::Forbidden));
        assert!(matches!(resolve_static(&d, "/..%2f..%2fetc"), StaticResolution::Forbidden));
        fs::remove_dir_all(&secret).ok();
    }

    /// 计算 root 相对 target 的 "../xxx" 形式(测试辅助:穿越用例需要相对路径)。
    /// 以公共祖先为基准:root 剩余深度 = 上跳层数,target 剩余部分 = 尾段
    fn pathdiff_reldesc(root: &Path, target: &Path) -> String {
        let r: Vec<_> = root.components().collect();
        let t: Vec<_> = target.components().collect();
        let mut common = 0;
        while common < r.len() && common < t.len() && r[common] == t[common] {
            common += 1;
        }
        let mut s = String::new();
        for _ in 0..(r.len() - common) {
            s.push_str("../");
        }
        let tail: Vec<String> =
            t[common..].iter().map(|c| c.as_os_str().to_string_lossy().replace('\\', "/")).collect();
        s.push_str(&tail.join("/"));
        format!("/{s}")
    }

    // ---- 服务冒烟(Task 4)----
    // start/stop 与 HTTP 往返需 AppHandle,不可在单测模拟,真机验收清单覆盖:
    // npm run dev:app → 开关服务 → curl http://127.0.0.1:39871/api/health

    #[test]
    fn info快照含当前ip不含回环() {
        let cfg = MobileSyncConfig { enabled: false, port: DEFAULT_PORT, token: "t".into() };
        let info = info_snapshot(&cfg);
        assert!(!info.ips.iter().any(|ip| ip.starts_with("127.")));
        assert_eq!(info.token, "t");
    }

    #[test]
    fn 根目录无index时未命中路径回forbidden() {
        // Task 3 review 顺手项:dev 模式 resource_dir 无 mobile-dist,空目录必须
        // 走 Forbidden(403)而非 Fallback——serve_loop 据此回 403 而非读不存在的 index
        let d = tmp_dir();
        assert!(matches!(resolve_static(&d, "/x"), StaticResolution::Forbidden));
        fs::remove_dir_all(&d).ok();
    }
}
