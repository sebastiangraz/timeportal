const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

/** Window / taskbar icon. Prefer `assets/icon.ico` on Windows; `icon.png` is used as fallback / on Linux. */
function resolveWindowIcon() {
  const ico = path.join(__dirname, "assets", "icon.ico");
  const png = path.join(__dirname, "assets", "icon.png");
  if (process.platform === "win32") {
    if (fs.existsSync(ico)) return ico;
    if (fs.existsSync(png)) return png;
    return undefined;
  }
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(ico)) return ico;
  return undefined;
}

function execPowerShell(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    exec(
      `powershell.exe -NoProfile -EncodedCommand ${encoded}`,
      { maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(String(stdout).trim());
      },
    );
  });
}

function setSystemTime(formatted) {
  return execPowerShell(`Set-Date -Date '${formatted.replace(/'/g, "''")}'`);
}

/** Parsed W32Time snapshot; persisted in-memory until restore clears it */
let savedW32TimeSnapshot = null;

async function snapshotW32TimeFromRegistry() {
  if (process.platform !== "win32") return;
  const script = `$p = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\Parameters' -EA SilentlyContinue
$n = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\TimeProviders\\NtpClient' -EA SilentlyContinue
$o = [ordered]@{ Type = $null; NtpClientEnabled = $null }
if ($p -and $p.PSObject.Properties.Name -contains 'Type') { $o.Type = [string]$p.Type }
if ($null -ne $n -and $n.PSObject.Properties.Name -contains 'Enabled') { $o.NtpClientEnabled = [int]$n.Enabled }
$o | ConvertTo-Json -Compress`;
  const out = await execPowerShell(script);
  try {
    const data = JSON.parse(out);
    const type = data.Type ?? data.type ?? null;
    const ena = data.NtpClientEnabled ?? data.ntpClientEnabled ?? null;
    const hasAnything =
      (type != null && String(type).trim().length > 0) || ena != null;
    savedW32TimeSnapshot = hasAnything
      ? { type, ntpClientEnabled: ena }
      : null;
  } catch {
    savedW32TimeSnapshot = null;
  }
}

async function restoreAutomaticTimeAfterLoop() {
  if (process.platform !== "win32") return;
  const snap = savedW32TimeSnapshot;
  const type =
    snap && snap.type != null && String(snap.type).length > 0
      ? String(snap.type).replace(/'/g, "''")
      : "NTP";
  const shouldSetEnabled =
    snap == null || snap.ntpClientEnabled != null;
  const enabled =
    snap != null && snap.ntpClientEnabled != null
      ? Number(snap.ntpClientEnabled)
      : 1;
  let script = `$ErrorActionPreference = 'Stop'
Set-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\Parameters' -Name 'Type' -Value '${type}' -Type String`;
  if (shouldSetEnabled) {
    script += `
Set-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\W32Time\\TimeProviders\\NtpClient' -Name 'Enabled' -Value ${enabled} -Type DWord`;
  }
  script += `
Restart-Service -Name 'w32time' -Force
$ErrorActionPreference = 'Continue'
try { & $env:SystemRoot\\System32\\w32tm.exe /resync /force 2>&1 | Out-Null } catch {}
exit 0`;
  await execPowerShell(script);
  savedW32TimeSnapshot = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 572,
    resizable: false,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile("index.html");

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (!app.isPackaged) {
    const debounce = (fn, ms = 50) => {
      let t = null;
      return () => {
        clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    };
    const watch = (file, handler) =>
      fs.watch(
        path.join(__dirname, file),
        { persistent: false },
        debounce(handler),
      );

    watch("styles.css", () => {
      if (!win.isDestroyed()) win.webContents.send("css-changed");
    });
    for (const file of ["index.html", "renderer.js", "preload.js"]) {
      watch(file, () => {
        if (!win.isDestroyed()) win.webContents.reloadIgnoringCache();
      });
    }
  }
}

ipcMain.handle("set-system-time", async (_e, formatted) => {
  await setSystemTime(formatted);
});

ipcMain.handle("w32time-snapshot", async () => {
  await snapshotW32TimeFromRegistry();
});

ipcMain.handle("w32time-restore", async () => {
  await restoreAutomaticTimeAfterLoop();
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
