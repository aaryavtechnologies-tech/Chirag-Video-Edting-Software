import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

function executable(file: string | null) {
  if (!file) throw new Error('No media binary for this platform');
  return file.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
}

export function runMediaTool(
  tool: 'ffmpeg' | 'ffprobe', args: string[], progress?: (seconds: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(tool === 'ffmpeg' ? ffmpeg : ffprobe.path), args, {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let stderr = '';
    let lineBuffer = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-16000);
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (!progress) {
        output += chunk;
        if (output.length > 4_000_000) child.kill();
        return;
      }
      const lines = (lineBuffer + chunk).split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('out_time_us=')) {
          const time = Number(line.slice('out_time_us='.length));
          if (Number.isFinite(time)) progress(time / 1_000_000);
        }
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${tool} exited with code ${code}\n${stderr}`));
    });
  });
}
