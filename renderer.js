const CONVERSION_GRAPH = {

  video: {

    formats: [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "webm",
      "flv",
      "ts",
      "m4v"
    ],

    targets: {

      "Formaty Wideo": [

        {
          ext: "mp4",
          label:
          "MP4 — H.264 (zoptymalizowany rozmiar)"
        },

        {
          ext: "mkv",
          label:
          "MKV — H.264 (zoptymalizowany rozmiar)"
        },

        {
          ext: "mov",
          label:
          "MOV — H.264 (zoptymalizowany rozmiar)"
        },

        {
          ext: "webm",
          label:
          "WEBM — zoptymalizowane"
        },

        {
          ext: "avi",
          label:
          "AVI — H.264"
        }
      ],


      "Ekstrakcja Audio z Wideo": [

        {
          ext: "flac",
          label:
          "FLAC — 100% bezstratny"
        },

        {
          ext: "wav",
          label:
          "WAV — 16-bit PCM"
        },

        {
          ext: "mp3",
          label:
          "MP3 — 320 kbps"
        },

        {
          ext: "aac",
          label:
          "AAC — 320 kbps"
        },

        {
          ext: "ogg",
          label:
          "OGG — Vorbis"
        }
      ],


      "Animacje": [

        {
          ext: "gif",
          label:
          "GIF — 15 FPS"
        }
      ]
    }
  },


  audio: {

    formats: [
      "mp3",
      "wav",
      "flac",
      "aac",
      "ogg",
      "m4a",
      "wma",
      "aiff"
    ],

    targets: {

      "Bezstratne": [

        {
          ext: "flac",
          label:
          "FLAC — Bezstratna kompresja"
        },

        {
          ext: "wav",
          label:
          "WAV — 16-bit PCM"
        }
      ],


      "Stratne": [

        {
          ext: "mp3",
          label:
          "MP3 — 320 kbps"
        },

        {
          ext: "aac",
          label:
          "AAC — 320 kbps"
        },

        {
          ext: "ogg",
          label:
          "OGG Vorbis"
        }
      ]
    }
  },


  image: {

    formats: [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "bmp",
      "tiff",
      "svg",
      "ico",
      "gif"
    ],

    targets: {

      "Bezstratne": [

        {
          ext: "png",
          label:
          "PNG — Bezstratny"
        },

        {
          ext: "tiff",
          label:
          "TIFF — LZW"
        }
      ],


      "Web i Fotografia": [

        {
          ext: "webp",
          label:
          "WEBP — Jakość 95%"
        },

        {
          ext: "jpg",
          label:
          "JPG — Jakość 95%"
        }
      ],


      "Ikony": [

        {
          ext: "ico",
          label:
          "ICO — 256x256"
        }
      ],


      "Animacje": [

        {
          ext: "gif",
          label:
          "GIF — 256 kolorów"
        }
      ]
    }
  }
};


/*
 * | ---------------------*-----------------------------------------------------
 * | ZMIENNE
 * |--------------------------------------------------------------------------
 */

let currentFilePath = null;

let currentSourceCategory = null;

let analysisTimer = null;


/*
 * | ---------------------*-----------------------------------------------------
 * | ELEMENTY
 * |--------------------------------------------------------------------------
 */

const dropZone =
document.getElementById(
  "drop-zone"
);


const fileNameEl =
document.getElementById(
  "file-name"
);


const targetFormatSelect =
document.getElementById(
  "target-format"
);


const gpuGroup =
document.getElementById(
  "gpu-group"
);


const encoderSelect =
document.getElementById(
  "encoder-select"
);


const convertBtn =
document.getElementById(
  "convert-btn"
);


const statusBox =
document.getElementById(
  "status"
);


const progressContainer =
document.getElementById(
  "progress-container"
);


const progressBar =
document.getElementById(
  "progress-bar"
);


/*
 * | ---------------------*-----------------------------------------------------
 * | MIN
 * |--------------------------------------------------------------------------
 */

document
.getElementById(
  "min-btn"
)
.addEventListener(
  "click",
  () => {

    window.api.minimizeWindow();
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | CLOSE
 * |--------------------------------------------------------------------------
 */

document
.getElementById(
  "close-btn"
)
.addEventListener(
  "click",
  () => {

    window.api.closeWindow();
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | WYBÓR PLIKU
 * |--------------------------------------------------------------------------
 */

dropZone.addEventListener(
  "click",
  async () => {

    const filePath =
    await window.api.selectFile();


    if (filePath) {

      handleFile(
        filePath
      );
    }
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | DRAG OVER
 * |--------------------------------------------------------------------------
 */

dropZone.addEventListener(
  "dragover",
  (e) => {

    e.preventDefault();

    dropZone.classList.add(
      "active"
    );
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | DRAG LEAVE
 * |--------------------------------------------------------------------------
 */

dropZone.addEventListener(
  "dragleave",
  () => {

    dropZone.classList.remove(
      "active"
    );
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | DROP
 * |--------------------------------------------------------------------------
 */

dropZone.addEventListener(
  "drop",
  (e) => {

    e.preventDefault();

    dropZone.classList.remove(
      "active"
    );


    if (
      e.dataTransfer.files.length > 0
    ) {

      handleFile(
        e.dataTransfer.files[0].path
      );
    }
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | OBSŁUGA PLIKU
 * |--------------------------------------------------------------------------
 */

function handleFile(
  filePath
) {

  currentFilePath =
  filePath;


  const fileName =
  filePath
  .split(/[/\\]/)
  .pop();


  fileNameEl.innerText =
  fileName;


  const ext =
  fileName
  .split(".")
  .pop()
  .toLowerCase();


  currentSourceCategory =
  null;


  /*
   *   | -------------------*-------------------------------------------------------
   *   | KATEGORIA
   *   |--------------------------------------------------------------------------
   */

  for (
    const [
      category,
       data
    ]
    of Object.entries(
      CONVERSION_GRAPH
    )
  ) {

    if (
      data.formats.includes(
        ext
      )
    ) {

      currentSourceCategory =
      category;

      break;
    }
  }


  targetFormatSelect.innerHTML =
  "";


  /*
   *   | -------------------*-------------------------------------------------------
   *   | OBSŁUGIWANY
   *   |--------------------------------------------------------------------------
   */

  if (
    currentSourceCategory
  ) {

    const targets =
    CONVERSION_GRAPH[
      currentSourceCategory
    ].targets;


    for (
      const [
        groupName,
         formatList
      ]
      of Object.entries(
        targets
      )
    ) {

      const optGroup =
      document.createElement(
        "optgroup"
      );


      optGroup.label =
      groupName;


      formatList.forEach(
        (item) => {

          if (
            item.ext !== ext
          ) {

            const option =
            document.createElement(
              "option"
            );


            option.value =
            item.ext;


            option.innerText =
            item.label;


            optGroup.appendChild(
              option
            );
          }
        }
      );


      if (
        optGroup.children.length
      ) {

        targetFormatSelect.appendChild(
          optGroup
        );
      }
    }


    targetFormatSelect.disabled =
    false;


    convertBtn.disabled =
    true;


    statusBox.innerText =
    `Wykryto format .${ext.toUpperCase()} — analizowanie...`;


    statusBox.style.color =
    "#ffb703";


  updateGpuVisibility();
  startAnalysis();

  } else {

    targetFormatSelect.disabled =
    true;


    convertBtn.disabled =
    true;


    gpuGroup.style.display =
    "none";


  statusBox.innerText =
  "Format pliku nie jest obsługiwany.";


    statusBox.style.color =
    "#e63900";
  }
}


/*
 * | ---------------------*-----------------------------------------------------
 * | ZMIANA FORMATU
 * |--------------------------------------------------------------------------
 */

targetFormatSelect.addEventListener(
  "change",
  () => {

    updateGpuVisibility();

    resetAnalysis();

    startAnalysis();
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | ZMIANA GPU
 * |--------------------------------------------------------------------------
 */

encoderSelect.addEventListener(
  "change",
  () => {

    resetAnalysis();

    startAnalysis();
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | GPU VISIBILITY
 * |--------------------------------------------------------------------------
 */

function updateGpuVisibility() {

  const target =
  targetFormatSelect.value;


  const isVideo =
  CONVERSION_GRAPH.video.formats
  .includes(
    target
  );


  if (
    currentSourceCategory === "video" &&
    isVideo
  ) {

    gpuGroup.style.display =
    "block";

  } else {

    gpuGroup.style.display =
    "none";
  }
}


/*
 * | ---------------------*-----------------------------------------------------
 * | RESET ANALIZY
 * |--------------------------------------------------------------------------
 */

function resetAnalysis() {

  if (analysisTimer) {

    clearTimeout(
      analysisTimer
    );

    analysisTimer =
    null;
  }


  if (
    progressContainer
  ) {

    progressContainer.style.display =
    "none";
  }


  progressBar.style.width =
  "0%";
}


/*
 * | ---------------------*-----------------------------------------------------
 * | START ANALIZY
 * |--------------------------------------------------------------------------
 */

function startAnalysis() {

  if (
    !currentFilePath
  ) {

    return;
  }


  const targetFormat =
  targetFormatSelect.value;


  const isVideo =
  CONVERSION_GRAPH.video.formats
  .includes(
    targetFormat
  );


  if (
    currentSourceCategory !== "video" ||
    !isVideo
  ) {

    return;
  }


  const encoder =
  encoderSelect.value;


  /*
   *   | -------------------*-------------------------------------------------------
   *   | OPÓŹNIENIE
   *   |--------------------------------------------------------------------------
   *   |
   *   | Dzięki temu przy zmianie opcji nie
   *   | uruchamiamy kilku analiz jednocześnie.
   *   |
   */

  analysisTimer =
  setTimeout(
    () => {

      statusBox.innerText =
      "Analizowanie filmu...";


  statusBox.style.color =
  "#ffb703";


  convertBtn.disabled =
  true;


  window.api.startConversion({

    inputPath:
    currentFilePath,

    outputPath:
    "",

    sourceCategory:
    "video",

    targetFormat:
    targetFormat,

    targetCategory:
    "video",

    encoder:
    encoder,

    analyzeOnly:
    true
  });

    },
    150
  );
}


/*
 * | ---------------------*-----------------------------------------------------
 * | ANALIZA / POSTĘP
 * |--------------------------------------------------------------------------
 */

window.api.onProgress(
  (data) => {

    /*
     *     | -----------------*---------------------------------------------------------
     *     | ANALIZA PRZED KONWERSJĄ
     *     |--------------------------------------------------------------------------
     */

    if (
      data.type === "analysis"
    ) {

      convertBtn.disabled =
      false;


      progressContainer.style.display =
      "none";


    statusBox.innerText =
    `${data.width}×${data.height} ${Math.round(data.fps || 30)} FPS | Rozmiar: ~${data.estimatedSize} | Czas: ~${data.estimatedTime} | H.264: ${data.bitrate}`;


    statusBox.style.color =
    "#57d638";


      /*
       *       | ---------------*-----------------------------------------------------------
       *       | DODATKOWA INFORMACJA
       *       |--------------------------------------------------------------------------
       */

      console.log(
        "Mango Convert — analiza:",
        data
      );


      return;
    }


    /*
     *     | -----------------*---------------------------------------------------------
     *     | NORMALNA KONWERSJA
     *     |--------------------------------------------------------------------------
     */

    const percent =
    data.percent || 0;


    const currentMb =
    data.currentMb || 0;


    const time =
    data.time || "00:00:00";


    const eta =
    data.eta || "--:--:--";


    progressContainer.style.display =
    "block";


    progressBar.style.width =
    `${percent}%`;


    statusBox.innerText =
    `Konwertowanie: ${currentMb} MB | ${percent}% | Pozostało ~${eta}`;


    statusBox.style.color =
    "#ffb703";
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | START KONWERSJI
 * |--------------------------------------------------------------------------
 */

convertBtn.addEventListener(
  "click",
  () => {

    if (
      !currentFilePath
    ) {

      return;
    }


    const targetFormat =
    targetFormatSelect.value;


    const encoder =
    encoderSelect.value;


    /*
     *     | -----------------*---------------------------------------------------------
     *     | KATEGORIA
     *     |--------------------------------------------------------------------------
     */

    let targetCategory =
    "video";


  if (
    CONVERSION_GRAPH.audio.formats
    .includes(
      targetFormat
    )
  ) {

    targetCategory =
    "audio";
  }


  if (
    [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "bmp",
      "tiff",
      "ico",
      "gif"
    ].includes(
      targetFormat
    )
  ) {

    targetCategory =
    "image";
  }


  /*
   *   | -----------------*---------------------------------------------------------
   *   | OUTPUT
   *   |--------------------------------------------------------------------------
   */

  const lastDot =
  currentFilePath.lastIndexOf(
    "."
  );


  const basePath =
  lastDot !== -1

  ? currentFilePath.substring(
    0,
    lastDot
  )

  : currentFilePath;


  const outputPath =
  `${basePath}_mango.${targetFormat}`;


  /*
   *   | -----------------*---------------------------------------------------------
   *   | GUI
   *   |--------------------------------------------------------------------------
   */

  toggleControls(
    false
  );


  progressContainer.style.display =
  "block";


    progressBar.style.width =
    "0%";


    statusBox.innerText =
    "Rozpoczynanie konwersji...";


    statusBox.style.color =
    "#ffb703";


    /*
     *     | -----------------*---------------------------------------------------------
     *     | START
     *     |--------------------------------------------------------------------------
     */

    window.api.startConversion({

      inputPath:
      currentFilePath,

      outputPath,

      sourceCategory:
      currentSourceCategory,

      targetFormat,

      targetCategory,

      encoder,

      analyzeOnly:
      false
    });
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | DONE
 * |--------------------------------------------------------------------------
 */

window.api.onDone(
  (success) => {

    toggleControls(
      true
    );


    progressBar.style.width =
    "100%";


    setTimeout(
      () => {

        progressContainer.style.display =
        "none";

      },
      1200
    );


    if (
      success
    ) {

      statusBox.innerText =
      "Konwersja ukończona pomyślnie! ✨";


        statusBox.style.color =
        "#57d638";


    } else {

      statusBox.innerText =
      "Wystąpił błąd podczas konwersji.";


        statusBox.style.color =
        "#e63900";
    }
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | ERROR
 * |--------------------------------------------------------------------------
 */

window.api.onError(
  (err) => {

    toggleControls(
      true
    );


    progressContainer.style.display =
    "none";


    statusBox.innerText =
    err;


    statusBox.style.color =
    "#e63900";
  }
);


/*
 * | ---------------------*-----------------------------------------------------
 * | CONTROLS
 * |--------------------------------------------------------------------------
 */

function toggleControls(
  enable
) {

  convertBtn.disabled =
  !enable;


  targetFormatSelect.disabled =
  !enable;


  encoderSelect.disabled =
  !enable;


  dropZone.style.pointerEvents =
  enable
  ? "auto"
  : "none";
}


/*
 * | ---------------------*-----------------------------------------------------
 * | PIERWSZA ANALIZA
 * |--------------------------------------------------------------------------
 */

updateGpuVisibility();
