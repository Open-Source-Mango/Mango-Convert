const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
  Tray,
  Menu
} = require('electron');

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const sharp = require('sharp');

let ffmpegPath = require('ffmpeg-static');

if (ffmpegPath) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  const localBin = path.join(
    __dirname,
    'bin',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );

  if (fs.existsSync(localBin)) {
    ffmpegPath = localBin;
  } else {
    ffmpegPath = 'ffmpeg';
  }
}

let mainWindow = null;
let tray = null;
let isQuitting = false;


/*
 * | -*-------------------------------------------------------------------------
 * | CZAS
 * |--------------------------------------------------------------------------
 */

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.trim().split(':');

  if (parts.length !== 3) {
    return 0;
  }

  return (
    parseFloat(parts[0]) * 3600 +
    parseFloat(parts[1]) * 60 +
    parseFloat(parts[2])
  );
}


function formatDuration(seconds) {
  if (!seconds || seconds <= 0) {
    return '--:--:--';
  }

  seconds = Math.round(seconds);

  const hours = Math.floor(seconds / 3600);

  const minutes =
  Math.floor((seconds % 3600) / 60);

  const secs =
  seconds % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(secs).padStart(2, '0')
  ].join(':');
}


function formatSize(bytes) {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }

  const gb =
  bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }

  const mb =
  bytes / 1024 / 1024;

  return `${mb.toFixed(0)} MB`;
}


function formatBitrate(bits) {
  if (bits >= 1000000) {
    return `${(bits / 1000000).toFixed(2)} Mbps`;
  }

  return `${Math.round(bits / 1000)} kbps`;
}


/*
 * | -*-------------------------------------------------------------------------
 * | ANALIZA FFmpeg
 * |--------------------------------------------------------------------------
 */

function probeMedia(inputPath) {
  return new Promise((resolve, reject) => {
    let output = '';

    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-i',
      inputPath
    ], { windowsHide: true });

    proc.stderr.on('data', data => {
      output += data.toString();
    });

    proc.on('error', reject);

    proc.on('close', () => {
      const durationMatch = output.match(
        /Duration:\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/
      );

      if (!durationMatch) {
        reject(new Error('Nie udało się odczytać długości filmu.'));
        return;
      }

      const duration = parseTimeToSeconds(durationMatch[1]);

      if (!duration || duration <= 0) {
        reject(new Error('Nieprawidłowa długość filmu.'));
        return;
      }

      const videoMatch = output.match(
        /Stream #\d+:\d+(?:\([^)]*\))?: Video:\s*([^,\s]+).*?(\d{2,5})x(\d{2,5})/
    );

    let sourceCodec = '';
    let width = 1920;
    let height = 1080;

    if (videoMatch) {
      sourceCodec = videoMatch[1];
      width = parseInt(videoMatch[2], 10);
      height = parseInt(videoMatch[3], 10);
    }

    const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;

    const hasAudio = /Stream #\d+:\d+(?:\([^)]*\))?: Audio:/.test(output);

    resolve({
      duration,
      width,
      height,
      fps,
      hasAudio,
      sourceCodec
    });
    });
  });
}


/*
 * Oblicza bitrate z rzeczywistego rozmiaru i długości źródła.
 * Format kontenera nie zmienia bitrate'u H.264, dlatego MP4/MKV/MOV
 * mogą mieć podobny rozmiar. WEBM używa VP9 i dostaje osobny plan.
 */
async function calculateVideoPlan(inputPath, encoder, targetFormat) {
  const sourceBytes = fs.statSync(inputPath).size;
  const media = await probeMedia(inputPath);

  const sourceTotalBitrate = (sourceBytes * 8) / media.duration;
  const sourceAudioBitrate = media.hasAudio ? 128000 : 0;
  const sourceVideoBitrate = Math.max(
    sourceTotalBitrate - sourceAudioBitrate,
    500000
  );

  let factor;

  if (targetFormat === 'webm') {
    factor = 0.50;
  } else {
    factor = 0.68;
  }

  let videoBitrate = sourceVideoBitrate * factor;

  let minimum;

  if (media.width >= 3840 || media.height >= 2160) {
    minimum = targetFormat === 'webm' ? 4500000 : 6000000;
  } else if (media.width >= 2560 || media.height >= 1440) {
    minimum = targetFormat === 'webm' ? 2800000 : 4000000;
  } else if (media.width >= 1920 || media.height >= 1080) {
    minimum = targetFormat === 'webm' ? 2200000 : 3000000;
  } else if (media.width >= 1280 || media.height >= 720) {
    minimum = targetFormat === 'webm' ? 1400000 : 2000000;
  } else {
    minimum = targetFormat === 'webm' ? 800000 : 1000000;
  }

  videoBitrate = Math.max(videoBitrate, minimum);
  videoBitrate = Math.min(videoBitrate, sourceVideoBitrate);
  videoBitrate = Math.round(videoBitrate / 1000) * 1000;

  const audioBitrate = media.hasAudio ? 128000 : 0;
  const totalBitrate = videoBitrate + audioBitrate;
  const estimatedBytes = (totalBitrate * media.duration) / 8;

  let speedFactor;

  if (targetFormat === 'webm') {
    speedFactor = 0.35;
  } else if (encoder === 'nvenc') {
    speedFactor = 3.0;
  } else if (encoder === 'qsv' || encoder === 'amf') {
    speedFactor = 2.4;
  } else if (encoder === 'mac') {
    speedFactor = 2.2;
  } else {
    speedFactor = 0.65;
  }

  if (media.width >= 3840 || media.height >= 2160) {
    speedFactor *= 0.55;
  } else if (media.width >= 2560 || media.height >= 1440) {
    speedFactor *= 0.75;
  } else if (media.width >= 1920 || media.height >= 1080) {
    speedFactor *= 0.90;
  }

  return {
    duration: media.duration,
    width: media.width,
    height: media.height,
    fps: media.fps,
    hasAudio: media.hasAudio,
    sourceCodec: media.sourceCodec,
    sourceBytes,
    sourceVideoBitrate,
    videoBitrate,
    audioBitrate,
    estimatedBytes,
    estimatedSeconds: media.duration / speedFactor,
    targetFormat
  };
}

/*
 * | -*-------------------------------------------------------------------------
 * | OKNO
 * |--------------------------------------------------------------------------
 */

async function createWindow() {

  let appIcon = null;


  const icoPath =
  path.join(
    __dirname,
    'icon.ico'
  );


  const svgPath =
  path.join(
    __dirname,
    'icon.svg'
  );


  if (
    fs.existsSync(
      icoPath
    )
  ) {

    appIcon =
    nativeImage.createFromPath(
      icoPath
    );


  } else if (
    fs.existsSync(
      svgPath
    )
  ) {

    try {

      const pngBuffer =
      await sharp(
        svgPath
      )
      .resize(256, 256)
      .png()
      .toBuffer();


      appIcon =
      nativeImage.createFromBuffer(
        pngBuffer
      );

    } catch (err) {

      console.error(
        'Błąd generowania ikony:',
        err
      );
    }
  }


  mainWindow =
  new BrowserWindow({

    width: 620,

    height: 740,

    frame: false,

    transparent: false,

    backgroundColor:
    '#120902',

    resizable: false,

    icon: appIcon,

    webPreferences: {

      preload:
      path.join(
        __dirname,
        'preload.js'
      ),

      contextIsolation:
      true,

      nodeIntegration:
      false
    }
  });


  if (appIcon) {

    mainWindow.setIcon(
      appIcon
    );
  }


  mainWindow.loadFile(
    path.join(
      __dirname,
      'index.html'
    )
  );


  mainWindow.on(
    'close',
    (event) => {

      if (!isQuitting) {

        event.preventDefault();

        mainWindow.hide();
      }
    }
  );


  if (
    !tray &&
    appIcon
  ) {

    tray =
    new Tray(
      appIcon
    );


    const contextMenu =
    Menu.buildFromTemplate([

      {

        label:
        'Otwórz Mango Convert',

        click: () => {

          mainWindow.show();

          mainWindow.focus();
        }
      },

      {
        type:
        'separator'
      },

      {

        label:
        'Zamknij aplikację',

        click: () => {

          isQuitting =
          true;

          app.quit();
        }
      }
    ]);


    tray.setToolTip(
      'Mango Convert'
    );


    tray.setContextMenu(
      contextMenu
    );


    tray.on(
      'click',
      () => {

        if (
          mainWindow.isVisible()
        ) {

          mainWindow.hide();

        } else {

          mainWindow.show();

          mainWindow.focus();
        }
      }
    );
  }
}


/*
 * | -*-------------------------------------------------------------------------
 * | START
 * |--------------------------------------------------------------------------
 */

app.whenReady().then(
  async () => {

    if (
      process.platform === 'win32'
    ) {

      app.setAppUserModelId(
        'com.mango.convert'
      );
    }


    await createWindow();
  }
);


app.on(
  'before-quit',
  () => {

    isQuitting =
    true;
  }
);


app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !== 'darwin'
    ) {

      app.quit();
    }
  }
);


/*
 * | -*-------------------------------------------------------------------------
 * | WINDOW
 * |--------------------------------------------------------------------------
 */

ipcMain.on(
  'window-minimize',
  () => {

    if (mainWindow) {

      mainWindow.minimize();
    }
  }
);


ipcMain.on(
  'window-close',
  () => {

    if (mainWindow) {

      mainWindow.hide();
    }
  }
);


/*
 * | -*-------------------------------------------------------------------------
 * | WYBÓR PLIKU
 * |--------------------------------------------------------------------------
 */

ipcMain.handle(
  'select-file',
  async () => {

    const result =
    await dialog.showOpenDialog(
      mainWindow,
      {

        properties:
        ['openFile'],

        title:
        'Wybierz plik do konwersji'
      }
    );


    if (
      result.canceled ||
      result.filePaths.length === 0
    ) {

      return null;
    }


    return result.filePaths[0];
  }
);


/*
 * | -*-------------------------------------------------------------------------
 * | KONWERSJA
 * |--------------------------------------------------------------------------
 */

ipcMain.on(
  'start-conversion',
  async (
    event,
    data
  ) => {

    const {
      inputPath,
      outputPath,
      sourceCategory,
      targetFormat,
      targetCategory,
      encoder,
      analyzeOnly
    } = data;


    /*
     *  |--------------------------------------------------------------------------
     *  | TRYB ANALIZY
     *  |--------------------------------------------------------------------------
     *  |
     *  | Nie rozpoczynamy konwersji.
     *  |
     */

    if (
      analyzeOnly &&
      sourceCategory === 'video' &&
      targetCategory === 'video'
    ) {

      try {

        const plan =
        await calculateVideoPlan(
          inputPath,
          encoder,
          targetFormat
        );


        event.sender.send(
          'conversion-progress',
          {

            type:
            'analysis',

            duration:
            formatDuration(
              plan.duration
            ),

            durationSeconds:
            plan.duration,

            sourceSize:
            formatSize(
              plan.sourceBytes
            ),

            estimatedSize:
            formatSize(
              plan.targetBytes
            ),

            estimatedSeconds:
            plan.estimatedSeconds,

            estimatedTime:
            formatDuration(
              plan.estimatedSeconds
            ),

            bitrate:
            formatBitrate(
              plan.videoBitrate
            ),

            width:
            plan.width,

            height:
            plan.height,

            fps:
            plan.fps
          }
        );


      } catch (err) {

        event.sender.send(
          'conversion-error',
          `Błąd analizy pliku: ${err.message}`
        );
      }


      return;
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | GRAFIKA
     *  |--------------------------------------------------------------------------
     */

    if (
      sourceCategory === 'image' &&
      targetCategory === 'image' &&
      targetFormat !== 'gif'
    ) {

      try {

        let pipeline =
        sharp(
          inputPath,
          {
            density: 300
          }
        );


        if (
          targetFormat === 'png'
        ) {

          pipeline =
          pipeline.png({
            compressionLevel: 9
          });


        } else if (
          targetFormat === 'jpg' ||
          targetFormat === 'jpeg'
        ) {

          pipeline =
          pipeline
          .flatten({
            background:
            '#ffffff'
          })
          .jpeg({
            quality: 95
          });


        } else if (
          targetFormat === 'webp'
        ) {

          pipeline =
          pipeline.webp({
            quality: 95,

            lossless:
            false
          });


        } else if (
          targetFormat === 'tiff'
        ) {

          pipeline =
          pipeline.tiff({
            compression:
            'lzw'
          });


        } else if (
          targetFormat === 'ico'
        ) {

          pipeline =
          pipeline
          .resize(
            256,
            256,
            {
              fit:
              'contain',

              background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
              }
            }
          )
          .png();
        }


        await pipeline.toFile(
          outputPath
        );


        event.sender.send(
          'conversion-done',
          true
        );


        return;


      } catch (err) {

        event.sender.send(
          'conversion-error',
          `Błąd przetwarzania grafiki: ${err.message}`
        );


        return;
      }
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | FFmpeg
     *  |--------------------------------------------------------------------------
     */

    let args = [
      '-y',
      '-hide_banner',
      '-i',
      inputPath
    ];


    let totalDurationSec = 0;

    let errorLogs = [];


    const isVideoToVideo =
    sourceCategory === 'video' &&
    targetCategory === 'video';


    /*
     *  |--------------------------------------------------------------------------
     *  | PLAN KONWERSJI
     *  |--------------------------------------------------------------------------
     */

    let videoPlan = null;


    if (isVideoToVideo) {

      try {

        videoPlan =
        await calculateVideoPlan(
          inputPath,
          encoder,
          targetFormat
        );


        totalDurationSec =
        videoPlan.duration;


      } catch (err) {

        event.sender.send(
          'conversion-error',
          `Błąd przygotowania konwersji: ${err.message}`
        );


        return;
      }
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | GPU
     *  |--------------------------------------------------------------------------
     */

    if (
      isVideoToVideo
    ) {

      if (
        encoder === 'nvenc'
      ) {

        args.unshift(
          '-hwaccel',
          'cuda'
        );


      } else if (
        encoder === 'amf' ||
        encoder === 'qsv'
      ) {

        args.unshift(
          '-hwaccel',
          'auto'
        );
      }
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | VIDEO
     *  |--------------------------------------------------------------------------
     */

    if (
      targetCategory === 'video'
    ) {

      const videoBitrate =
      videoPlan
      ? videoPlan.videoBitrate
      : 5000000;


      const audioBitrate =
      videoPlan
      ? videoPlan.audioBitrate
      : 128000;


      /*
       *    |--------------------------------------------------------------------------
       *      /*
       * Jawnie wybieramy pierwszy strumień wideo oraz audio.
       */
       args.push(
         '-map',
         '0:v:0'
       );

       if (videoPlan && videoPlan.hasAudio) {
         args.push(
           '-map',
           '0:a:0?'
         );
       }

       /*
        * WEBM = VP9. NVENC nie jest tutaj używany do H.264,
        * ponieważ WEBM wymaga kompatybilnego kodeka VP9/AV1.
        */
       if (targetFormat === 'webm') {

         args.push(
           '-c:v',
           'libvpx-vp9',

           '-b:v',
           `${videoBitrate}`,

           '-deadline',
           'good',

           '-cpu-used',
           '2',

           '-row-mt',
           '1'
         );

       } else if (encoder === 'nvenc') {

         args.push(
           '-c:v',
           'h264_nvenc',

           '-preset',
           'p5',

           '-rc',
           'vbr',

           '-b:v',
           `${videoBitrate}`,

           '-maxrate',
           `${Math.round(videoBitrate * 1.05)}`,

                   '-bufsize',
                   `${Math.round(videoBitrate * 2)}`,

                   '-profile:v',
                   'high'
         );

       } else if (encoder === 'amf') {

         args.push(
           '-c:v',
           'h264_amf',

           '-quality',
           'balanced',

           '-rc',
           'vbr_peak',

           '-b:v',
           `${videoBitrate}`,

           '-maxrate',
           `${Math.round(videoBitrate * 1.05)}`,

                   '-bufsize',
                   `${Math.round(videoBitrate * 2)}`
         );

       } else if (encoder === 'qsv') {

         args.push(
           '-c:v',
           'h264_qsv',

           '-b:v',
           `${videoBitrate}`,

           '-maxrate',
           `${Math.round(videoBitrate * 1.05)}`,

                   '-bufsize',
                   `${Math.round(videoBitrate * 2)}`
         );

       } else if (encoder === 'mac') {

         args.push(
           '-c:v',
           'h264_videotoolbox',

           '-b:v',
           `${videoBitrate}`
         );

       } else {

         args.push(
           '-c:v',
           'libx264',

           '-preset',
           'medium',

           '-b:v',
           `${videoBitrate}`,

           '-maxrate',
           `${Math.round(videoBitrate * 1.05)}`,

                   '-bufsize',
                   `${Math.round(videoBitrate * 2)}`,

                   '-profile:v',
                   'high'
         );
       }      /*
       *    |--------------------------------------------------------------------------
       *    | PIXEL FORMAT
       *    |--------------------------------------------------------------------------
       */

       args.push(
         '-pix_fmt',
         'yuv420p'
       );


       /*
        *    |--------------------------------------------------------------------------
        *    | AUDIO
        *    |--------------------------------------------------------------------------
        */

       if (videoPlan && videoPlan.hasAudio) {
         if (targetFormat === 'webm') {
           args.push(
             '-c:a',
             'libopus',
             '-b:a',
             '128k'
           );
         } else {
           args.push(
             '-c:a',
             'aac',
             '-b:a',
             `${audioBitrate}`,
             '-ar',
             '48000'
           );
         }
       }


       /*
        *  |--------------------------------------------------------------------------
        *  | AUDIO
        *  |--------------------------------------------------------------------------
        */

    } else if (
      targetCategory === 'audio'
    ) {

      args.push(
        '-map',
        '0:a:0'
      );


      if (
        targetFormat === 'mp3'
      ) {

        args.push(

          '-c:a',
          'libmp3lame',

          '-b:a',
          '320k',

          '-minrate',
          '320k',

          '-maxrate',
          '320k',

          '-bufsize',
          '640k',

          '-ar',
          '44100'
        );


      } else if (
        targetFormat === 'wav'
      ) {

        args.push(
          '-c:a',
          'pcm_s16le',

          '-ar',
          '44100'
        );


      } else if (
        targetFormat === 'flac'
      ) {

        args.push(
          '-c:a',
          'flac',

          '-compression_level',
          '8'
        );


      } else if (
        targetFormat === 'aac' ||
        targetFormat === 'm4a'
      ) {

        args.push(
          '-c:a',
          'aac',

          '-b:a',
          '320k',

          '-ar',
          '48000'
        );


      } else if (
        targetFormat === 'ogg'
      ) {

        args.push(
          '-c:a',
          'libvorbis',

          '-b:a',
          '320k'
        );
      }


      /*
       *  |--------------------------------------------------------------------------
       *  | GIF
       *  |--------------------------------------------------------------------------
       */

    } else if (
      targetFormat === 'gif'
    ) {

      args.push(
        '-vf',
        'fps=15,scale=540:-1:flags=lanczos'
      );
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | OUTPUT
     *  |--------------------------------------------------------------------------
     */

    if (targetCategory === 'video') {
      args.push(
        '-map_metadata',
        '0'
      );

      if (targetFormat === 'mp4') {
        args.push(
          '-movflags',
          '+faststart'
        );
      }
    }

    args.push(
      outputPath
    );


    /*
     *  |--------------------------------------------------------------------------
     *  | START FFmpeg
     *  |--------------------------------------------------------------------------
     */

    let proc;


    try {

      proc =
      spawn(
        ffmpegPath,
        args,
        {
          windowsHide:
          true
        }
      );


    } catch (err) {

      event.sender.send(
        'conversion-error',
        `Nie można uruchomić FFmpeg: ${err.message}`
      );


      return;
    }


    /*
     *  |--------------------------------------------------------------------------
     *  | CZAS STARTU
     *  |--------------------------------------------------------------------------
     */

    const conversionStart =
    Date.now();


    let lastProgressTime =
    0;


    /*
     *  |--------------------------------------------------------------------------
     *  | FFmpeg STDERR
     *  |--------------------------------------------------------------------------
     */

    proc.stderr.on(
      'data',
      (data) => {

        const text =
        data.toString();


        errorLogs.push(
          text
        );


        if (
          errorLogs.length > 20
        ) {

          errorLogs.shift();
        }


        /*
         *      |--------------------------------------------------------------------------
         *      | DURATION
         *      |--------------------------------------------------------------------------
         */

        if (
          !totalDurationSec
        ) {

          const durMatch =
          text.match(
            /Duration:\s*(\d{2}:\d{2}:\d{2}\.\d+)/
          );


          if (durMatch) {

            totalDurationSec =
            parseTimeToSeconds(
              durMatch[1]
            );
          }
        }


        /*
         *      |--------------------------------------------------------------------------
         *      | CURRENT TIME
         *      |--------------------------------------------------------------------------
         */

        const timeMatch =
        text.match(
          /time=(\d{2}:\d{2}:\d{2}\.\d+)/
        );


        if (
          timeMatch
        ) {

          const currentTimeSec =
          parseTimeToSeconds(
            timeMatch[1]
          );


          let percent =
          0;


          if (
            totalDurationSec > 0
          ) {

            percent =
            Math.min(
              Math.round(
                (
                  currentTimeSec /
                  totalDurationSec
                ) * 100
              ),
              99
            );
          }


          /*
           *        |--------------------------------------------------------------------------
           *        | AKTUALNY ROZMIAR
           *        |--------------------------------------------------------------------------
           */

          let currentMb =
          0;


          try {

            if (
              fs.existsSync(
                outputPath
              )
            ) {

              const stats =
              fs.statSync(
                outputPath
              );


              currentMb =
              (
                stats.size /
                1024 /
                1024
              ).toFixed(1);
            }

          } catch (e) {}


          /*
           *        |--------------------------------------------------------------------------
           *        | RZECZYWISTA PRĘDKOŚĆ
           *        |--------------------------------------------------------------------------
           */

          const elapsedSeconds =
          (
            Date.now() -
            conversionStart
          ) / 1000;


          let etaSeconds =
          0;


          if (
            currentTimeSec > 5 &&
            elapsedSeconds > 5
          ) {

            const realSpeed =
            currentTimeSec /
            elapsedSeconds;


            const remainingMedia =
            Math.max(
              totalDurationSec -
              currentTimeSec,
              0
            );


            etaSeconds =
            remainingMedia /
            realSpeed;
          }


          /*
           *        |--------------------------------------------------------------------------
           *        | OGRANICZENIE CZĘSTOTLIWOŚCI
           *        |--------------------------------------------------------------------------
           */

          const now =
          Date.now();


          if (
            now -
            lastProgressTime >
            250
          ) {

            lastProgressTime =
            now;


            event.sender.send(
              'conversion-progress',
              {

                type:
                'conversion',

                percent,

                currentMb,

                time:
                timeMatch[1],

                etaSeconds,

                eta:
                formatDuration(
                  etaSeconds
                )
              }
            );
          }
        }
      }
    );


    /*
     *  |--------------------------------------------------------------------------
     *  | KONIEC
     *  |--------------------------------------------------------------------------
     */

    proc.on(
      'close',
      (code) => {

        if (
          code === 0
        ) {

          event.sender.send(
            'conversion-done',
            true
          );


        } else {

          const lastError =
          errorLogs
          .join(' ')
          .replace(
            /\s+/g,
            ' '
          )
          .slice(-1200);


          event.sender.send(
            'conversion-error',
            `Błąd FFmpeg (kod ${code}): ${lastError}`
          );
        }
      }
    );


    proc.on(
      'error',
      (err) => {

        event.sender.send(
          'conversion-error',
          `Błąd procesu: ${err.message}`
        );
      }
    );
  }
);
