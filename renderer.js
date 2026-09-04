const CONVERSION_GRAPH = {
  video: {
    formats: ["mp4", "mkv", "avi", "mov", "webm", "flv", "ts", "m4v"],
      targets: {
        "Formaty Wideo (Visually Lossless)": [
          { ext: "mp4", label: "MP4 — H.264 (Wizualnie bezstratne, CRF 18, Audio AAC 320 kbps)" },
          { ext: "mkv", label: "MKV — Matroska (Wizualnie bezstratne, CRF 18, Audio AAC 320 kbps)" },
          { ext: "mov", label: "MOV — QuickTime (Wizualnie bezstratne, kontener Apple)" },
          { ext: "webm", label: "WEBM — Zoptymalizowane pod przeglądarki internetowe" },
          { ext: "avi", label: "AVI — Tradycyjny kontener wideo" }
        ],
        "Ekstrakcja Audio z Wideo": [
          { ext: "flac", label: "FLAC — 100% Bezstratny strumień audio (Lossless)" },
          { ext: "wav", label: "WAV — Nieskompresowany 16-bit PCM (Bezstratny)" },
          { ext: "mp3", label: "MP3 — Maksymalny bitrate (Stałe 320 kbps CBR)" },
          { ext: "aac", label: "AAC — Wysoka jakość dźwięku (320 kbps)" },
          { ext: "ogg", label: "OGG — Vorbis (Wysoka jakość, q=7)" }
        ],
        "Animacje": [
          { ext: "gif", label: "GIF — Animacja (15 FPS, filtr palety lanczos)" }
        ]
      }
  },
  audio: {
    formats: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "aiff"],
      targets: {
        "Bezstratne (Audiofilskie / Master)": [
          { ext: "flac", label: "FLAC — Bezstratna kompresja (Lossless, czysty dźwięk)" },
          { ext: "wav", label: "WAV — Nieskompresowany PCM 16-bit (Lossless)" }
        ],
        "Stratne (Maksymalna dostępna jakość)": [
          { ext: "mp3", label: "MP3 — Maksymalny bitrate 320 kbps CBR (Najwyższa zgodność)" },
          { ext: "aac", label: "AAC — Wysokiej jakości kompresja Apple (320 kbps)" },
          { ext: "ogg", label: "OGG Vorbis — Otwarty format audio wysokiej jakości" }
        ]
      }
  },
  image: {
    formats: ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "svg", "ico", "gif"],
      targets: {
        "Bezstratne i Wektorowe": [
          { ext: "png", label: "PNG — Bezstratna grafika rastrowa (Maksymalna kompresja)" },
          { ext: "tiff", label: "TIFF — Bezstratny format produkcyjny (Kompresja LZW)" }
        ],
        "Web i Fotografia": [
          { ext: "webp", label: "WEBP — Nowoczesny format webowy (Jakość 95%)" },
          { ext: "jpg", label: "JPG — Fotografia (Jakość 95%, białe tło pod alfę)" }
        ],
        "Ikony Systemowe": [
          { ext: "ico", label: "ICO — Ikona aplikacji Windows (256x256 z przezroczystością)" }
        ],
        "Animacje": [
          { ext: "gif", label: "GIF — Paleta kolorów 256" }
        ]
      }
  }
};

let currentFilePath = null;
let currentSourceCategory = null;

// Przyciski okna
document.getElementById('min-btn').addEventListener('click', () => {
  window.api.minimizeWindow();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.api.closeWindow();
});

const dropZone = document.getElementById('drop-zone');
const fileNameEl = document.getElementById('file-name');
const targetFormatSelect = document.getElementById('target-format');
const gpuGroup = document.getElementById('gpu-group');
const encoderSelect = document.getElementById('encoder-select');
const convertBtn = document.getElementById('convert-btn');
const statusBox = document.getElementById('status');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

dropZone.addEventListener('click', async () => {
  const path = await window.api.selectFile();
  if (path) handleFile(path);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0].path);
  }
});

function handleFile(filePath) {
  currentFilePath = filePath;
  const fileName = filePath.split(/[/\\]/).pop();
  fileNameEl.innerText = fileName;

  const ext = fileName.split('.').pop().toLowerCase();
  currentSourceCategory = null;

  for (const [category, data] of Object.entries(CONVERSION_GRAPH)) {
    if (data.formats.includes(ext)) {
      currentSourceCategory = category;
      break;
    }
  }

  targetFormatSelect.innerHTML = "";

  if (currentSourceCategory) {
    const targets = CONVERSION_GRAPH[currentSourceCategory].targets;

    for (const [groupName, formatList] of Object.entries(targets)) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = groupName;

      formatList.forEach(item => {
        if (item.ext !== ext) {
          const opt = document.createElement('option');
          opt.value = item.ext;
          opt.innerText = item.label;
          optGroup.appendChild(opt);
        }
      });

      if (optGroup.children.length > 0) {
        targetFormatSelect.appendChild(optGroup);
      }
    }

    targetFormatSelect.disabled = false;
    convertBtn.disabled = false;
    statusBox.innerText = `Wykryto format .${ext.toUpperCase()} (${currentSourceCategory.toUpperCase()})`;
    statusBox.style.color = '#ffb703';

    updateGpuVisibility();
  } else {
    targetFormatSelect.disabled = true;
    convertBtn.disabled = true;
    gpuGroup.style.display = 'none';
    statusBox.innerText = "Format pliku nie jest jeszcze obsługiwany.";
    statusBox.style.color = '#e63900';
  }
}

targetFormatSelect.addEventListener('change', updateGpuVisibility);

function updateGpuVisibility() {
  const target = targetFormatSelect.value;
  const isTargetVideo = CONVERSION_GRAPH.video.formats.includes(target);

  if (currentSourceCategory === 'video' && isTargetVideo) {
    gpuGroup.style.display = 'block';
  } else {
    gpuGroup.style.display = 'none';
  }
}

convertBtn.addEventListener('click', () => {
  if (!currentFilePath) return;

  const targetFormat = targetFormatSelect.value;
  const encoder = encoderSelect.value;

  let targetCategory = 'video';
  if (CONVERSION_GRAPH.audio.formats.includes(targetFormat)) targetCategory = 'audio';
  if (["png", "jpg", "jpeg", "webp", "bmp", "tiff", "ico", "gif"].includes(targetFormat)) targetCategory = 'image';

  const lastDot = currentFilePath.lastIndexOf('.');
  const basePath = lastDot !== -1 ? currentFilePath.substring(0, lastDot) : currentFilePath;
  const outputPath = `${basePath}_mango.${targetFormat}`;

  toggleControls(false);
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  statusBox.innerText = "Trwa przetwarzanie...";
  statusBox.style.color = '#ffb703';

  window.api.startConversion({
    inputPath: currentFilePath,
    outputPath,
    sourceCategory: currentSourceCategory,
    targetFormat,
    targetCategory,
    encoder
  });
});

window.api.onProgress((data) => {
  const { percent, currentMb, totalEstimatedMb, time } = data;
  progressBar.style.width = `${percent}%`;

  if (totalEstimatedMb > 0) {
    statusBox.innerText = `Konwertowanie: ${currentMb} MB / ~${totalEstimatedMb} MB (${percent}%) [${time}]`;
  } else {
    statusBox.innerText = `Konwertowanie: ${currentMb} MB [${time}]`;
  }
});

window.api.onDone((success) => {
  toggleControls(true);
  progressBar.style.width = '100%';
  setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);

  if (success) {
    statusBox.innerText = "Konwersja ukończona pomyślnie! ✨";
    statusBox.style.color = '#57d638';
  } else {
    statusBox.innerText = "Wystąpił błąd podczas konwersji.";
    statusBox.style.color = '#e63900';
  }
});

window.api.onError((err) => {
  toggleControls(true);
  progressContainer.style.display = 'none';
  statusBox.innerText = err;
  statusBox.style.color = '#e63900';
});

function toggleControls(enable) {
  convertBtn.disabled = !enable;
  targetFormatSelect.disabled = !enable;
  dropZone.style.pointerEvents = enable ? 'auto' : 'none';
}
