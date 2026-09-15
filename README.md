# mind-map-zen

**English** | [简体中文](README.zh-CN.md)

A free, local-first mind-mapping desktop app: organize ideas on a familiar mind-map canvas where every map is a single Markdown file — zero friction when sharing your thoughts with AI.

- Tauri 2 + React 19 + the [simple-mind-map](https://github.com/wanglin2/mind-map) engine
- Every map = one `.md` file (the single source of truth) + one `.zen.json` layout sidecar
- Inkstone & Paper dual themes: follow the system or switch manually; UI and canvas stay in sync
- Current capabilities (v1.0.0): first-run onboarding tour; a three-pane Desk (icon toolbar / per-file directory tree / outline preview — single click selects, double click opens); clean connections (canvas hides `[[ ]]` markers, normalizes Markdown line endings); connection-bend memory (drag-bent links persist via the sidecar and restore on reopen); Desk directory organization (left-tree navigation / filter by level / move maps / create directories); canvas editing / copy as Markdown (whole map or subtree) / import / multiline paste / layout switching (mind map / logic chart / org chart) / close guard / Paper-Ink & Night-Ink dual themes; node notes (quote blocks); `[[Name]]` bidirectional links; a settings page (copy with notes / keep links / switch workspace / leave workspace); layout & theme preferences remembered automatically; PNG/SVG export and copy-as-image; hover tooltips on icon buttons; a cinnabar-seal app icon. The file library view is called "Desk" (案头); canvas editing is called "Paper" (纸面)

## Current limitations

- When opening an external `.md` file, paragraphs, code blocks, and other content that cannot be mapped to nodes are dropped on save (a banner warns when opening, and confirmation is required before an explicit save)

## Development guide

### Prerequisites

- **Node.js LTS (≥ 22 recommended, from [nodejs.org](https://nodejs.org/))**: runtime for frontend dev/build/test and all npm scripts. The Tauri CLI (`@tauri-apps/cli`) is a devDependency — available right after `npm install`, no global install needed
- **Rust stable toolchain**: only needed to compile the desktop shell (`npm run dev:app`, `npm run build:release`) — install stable via [rustup](https://rustup.rs/) (Windows target `x86_64-pc-windows-msvc`); the `rust-version = "1.77.2"` pinned in `src-tauri/Cargo.toml` is the minimum. Pure-frontend commands (`dev` / `test` / `e2e` / `lint` / `typecheck` / `build`) run without Rust
- **Visual Studio C++ Build Tools (MSVC + Windows 10/11 SDK)**: prerequisite for Rust msvc-target linking and `tauri-winres` resource compilation (`rc.exe`, needed for release packaging, comes from the Windows SDK — see below). Install this before Rust
- **WebView2 Runtime**: the UI host for Tauri, preinstalled on Windows 10/11 — no separate install needed

After cloning, run `npm install` first; before the first e2e run, execute `npx playwright install` to download browsers. If `npm` reports "running scripts is disabled" in Windows PowerShell, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` once to allow npm.ps1.

```bash
npm run dev        # frontend dev server (Vite)
npm run dev:app    # desktop-shell dev mode (Tauri window; single-instance lock separated from release, can run in parallel — see below)
npm run tauri dev  # legacy desktop-shell dev entry (shares the single-instance lock with release; cannot run in parallel)
npm test           # unit/component tests (Vitest)
npm run e2e        # end-to-end tests (Playwright, web mode)
npm run lint       # ESLint
npm run typecheck  # TypeScript type check
npm run build      # frontend build (tsc + vite)
npm run build:release  # release packaging (msi/nsis installers — see below)
```

**Release packaging**: `npm run build:release` delegates to `tauri build` — artifacts land in `src-tauri/target/release/bundle/` (msi + nsis), and the standalone portable exe `mind-map-zen.exe` sits in `src-tauri/target/release/` (the bare exe name comes from the package name in `src-tauri/Cargo.toml`, unrelated to `productName` in `tauri.conf.json` — the latter only governs bundled installers). The script (`scripts/build-release.mjs`) auto-locates the Windows SDK's `rc.exe` and prepends it to PATH: recompiling `tauri-winres` after changes to `src-tauri/tauri.conf.json` or `capabilities/*` requires it, while ordinary terminal PATHs lack it (cached builds don't trigger it; once triggered it fails with an RC.EXE panic). Arguments pass through, e.g. `npm run build:release -- --no-bundle` produces only the exe without installers.

**Single-instance lock & dev/release parallelism**: the app uses `tauri-plugin-single-instance` to prevent multiple instances — a second launch with the same identifier focuses the existing main window instead of starting a new process. The lock key comes from the `identifier` in `tauri.conf.json` (a named mutex on Windows, e.g. `com.mindmapzen.app-sim` for release); dev and release share one lock by default. For parallel debugging use `npm run dev:app`: it passes `--config src-tauri/tauri.dev.conf.json` (a JSON Merge Patch overriding the identifier to `com.mindmapzen.app.dev`; a config file instead of inline JSON avoids npm's cmd script-shell stripping quotes) to separate the lock — dev and release can then run in parallel, while same-type instances (dev↔dev, release↔release) remain mutually exclusive. Note: the WebView2 local data directory (localStorage etc.) follows the identifier, so the first `dev:app` run starts fresh — dev experiments never pollute real data. `npm run tauri dev` remains the legacy shared-lock entry, mutually exclusive with a running release; release builds are unaffected.

## License

[MIT](LICENSE)
