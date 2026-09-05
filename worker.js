const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const { exec } = require('child_process');

sharp.cache(false);
sharp.simd(false);

process.on('message', async (task) => {
  try {
    const { type, input, output, options } = task;

    if (type === 'image') {
      let pipeline = sharp(input);
      if (options?.width || options?.height) {
        pipeline = pipeline.resize(options.width, options.height);
      }
      if (options?.format) {
        pipeline = pipeline.toFormat(options.format);
      }
      await pipeline.toFile(output);
      process.send({ success: true, output });
    } else if (type === 'ffmpeg') {
      const command = `"${ffmpeg}" -y -i "${input}" ${options?.args || ''} "${output}"`;
      exec(command, (error) => {
        if (error) {
          process.send({ success: false, error: error.message });
        } else {
          process.send({ success: true, output });
        }
      });
    }
  } catch (err) {
    process.send({ success: false, error: err.message });
  }
});
