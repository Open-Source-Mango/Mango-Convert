const { app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const sharp = require('sharp');

let ffmpegPath = require('ffmpeg-static');
if (ffmpegPath) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  const localBin = path.join(__dirname, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localBin)) {
    ffmpegPath = localBin;
  } else {
    ffmpegPath = 'ffmpeg';
  }
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

async function createWindow() {
  let appIcon = null;
  const icoPath = path.join(__dirname, 'icon.ico');
  const svgPath = path.join(__dirname, 'icon.svg');

  if (fs.existsSync(icoPath)) {
    appIcon = nativeImage.createFromPath(icoPath);
  } else if (fs.existsSync(svgPath)) {
    try {
      const pngBuffer = await sharp(svgPath).resize(256, 256).png().toBuffer();
      appIcon = nativeImage.createFromBuffer(pngBuffer);
    } catch (err) {
      console.error("Błąd generowania ikony:", err);
    }
  }

  mainWindow = new BrowserWindow({
    width: 620,
    height: 740,
    frame: false,
    transparent: false,
    backgroundColor: '#120902',
    resizable: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                 contextIsolation: true,
                                 nodeIntegration: false
    }
  });

  if (appIcon) mainWindow.setIcon(appIcon);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Zamiast zamykać okno — ukrywaj je do zasobnika systemowego
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Tworzenie zasobnika systemowego (System Tray)
  if (!tray && appIcon) {
    tray = new Tray(appIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Otwórz Mango Convert',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        }
      },
      { type: 'separator' },
      {
        label: 'Zamknij aplikację',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Mango Convert');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mango.convert');
  }
  await createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Wybierz plik do konwersji'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.on('start-conversion', async (event, { inputPath, outputPath, sourceCategory, targetFormat, targetCategory, encoder }) => {
  // 1. GRAFIKA (Sharp)
  if (sourceCategory === 'image' && targetCategory === 'image' && targetFormat !== 'gif') {
    try {
      let pipeline = sharp(inputPath, { density: 300 });

      if (targetFormat === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
        pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 95 });
      } else if (targetFormat === 'webp') {
        pipeline = pipeline.webp({ quality: 95, lossless: false });
      } else if (targetFormat === 'tiff') {
        pipeline = pipeline.tiff({ compression: 'lzw' });
      } else if (targetFormat === 'ico') {
        pipeline = pipeline.resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();
      }

      await pipeline.toFile(outputPath);
      event.sender.send('conversion-done', true);
      return;
    } catch (err) {
      event.sender.send('conversion-error', `Błąd przetwarzania grafiki: ${err.message}`);
      return;
    }
  }

  // 2. WIDEO, AUDIO ORAZ GIF (FFmpeg)
  let args = ['-y', '-i', inputPath];
  let totalDurationSec = 0;
  let errorLogs = [];

  const isVideoToVideo = (sourceCategory === 'video' && targetCategory === 'video');

  if (isVideoToVideo) {
    if (encoder === 'nvenc') args.unshift('-hwaccel', 'cuda');
    else if (encoder === 'amf' || encoder === 'qsv') args.unshift('-hwaccel', 'auto');
  }

  if (targetCategory === 'video') {
    if (encoder === 'nvenc') {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '18');
    } else if (encoder === 'amf') {
      args.push('-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '18', '-quality', 'quality');
    } else if (encoder === 'qsv') {
      args.push('-c:v', 'h264_qsv', '-global_quality', '18');
    } else if (encoder === 'mac') {
      args.push('-c:v', 'h264_videotoolbox', '-q:v', '65');
    } else {
      args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'slow');
    }
    args.push('-pix_fmt', 'yuv420p');
    args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
  } else if (targetCategory === 'audio') {
    args.push('-map', '0:a:0');

    if (targetFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', '320k', '-minrate', '320k', '-maxrate', '320k', '-bufsize', '640k', '-ar', '44100');
    } else if (targetFormat === 'wav') {
      args.push('-c:a', 'pcm_s16le', '-ar', '44100');
    } else if (targetFormat === 'flac') {
      args.push('-c:a', 'flac', '-compression_level', '8');
    } else if (targetFormat === 'aac' || targetFormat === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
    } else if (targetFormat === 'ogg') {
      args.push('-c:a', 'libvorbis', '-b:a', '320k', '-minrate', '320k', '-maxrate', '320k');
    }
  } else if (targetFormat === 'gif') {
    args.push('-vf', 'fps=15,scale=540:-1:flags=lanczos');
  }

  args.push(outputPath);

  let proc;
  try {
    proc = spawn(ffmpegPath, args, { windowsHide: true });
  } catch (err) {
    event.sender.send('conversion-error', `Nie można uruchomić FFmpeg: ${err.message}`);
    return;
  }

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    errorLogs.push(text);
    if (errorLogs.length > 5) errorLogs.shift();

    // Odczyt całkowitej długości pliku
    if (!totalDurationSec) {
      const durMatch = text.match(/Duration:\s*(\d{2}:\d{2}:\d{2}\.\d+)/);
      if (durMatch) {
        totalDurationSec = parseTimeToSeconds(durMatch[1]);
      }
    }

    // Odczyt bieżącego postępu
    const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
    if (timeMatch) {
      const currentTimeSec = parseTimeToSeconds(timeMatch[1]);
      let percent = 0;
      if (totalDurationSec > 0) {
        percent = Math.min(Math.round((currentTimeSec / totalDurationSec) * 100), 99);
      }

      // Odczyt rzeczywistego rozmiaru w MB z dysku
      let currentMb = 0;
      let totalEstimatedMb = 0;

      try {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          currentMb = (stats.size / (1024 * 1024)).toFixed(1);

          if (percent > 0) {
            totalEstimatedMb = ((stats.size / (percent / 100)) / (1024 * 1024)).toFixed(1);
          }
        }
      } catch (e) {}

      event.sender.send('conversion-progress', {
        percent,
        currentMb,
        totalEstimatedMb,
        time: timeMatch[1]
      });
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      event.sender.send('conversion-done', true);
    } else {
      const lastError = errorLogs.join(' ').slice(-140);
      event.sender.send('conversion-error', `Błąd silnika (kod ${code}): ${lastError}`);
    }
  });

  proc.on('error', (err) => {
    event.sender.send('conversion-error', `Błąd procesu: ${err.message}`);
  });
});
