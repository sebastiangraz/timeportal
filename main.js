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

function setSystemTime(formatted) {
  return new Promise((resolve, reject) => {
    const cmd = `powershell.exe -NoProfile -Command "Set-Date -Date '${formatted}'"`;
    exec(cmd, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve();
    });
  });
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
