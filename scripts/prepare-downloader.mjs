import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ytVersion = '2026.10.26';
const denoVersion = 'v2.9.8';
const targets = {
  'win32-x64': ['yt-dlp.exe', 'x86_64-pc-windows-msvc'],
  'win32-arm64': ['yt-dlp_arm64.exe', 'aarch64-pc-windows-msvc'],
  'darwin-x64': ['yt-dlp_macos', 'x86_64-apple-darwin'],
  'darwin-arm64': ['yt-dlp_macos', 'aarch64-apple-darwin'],
  'linux-x64': ['yt-dlp_linux', 'x86_64-unknown-linux-gnu'],
  'linux-arm64': ['yt-dlp_linux_aarch64', 'aarch64-unknown-linux-gnu'],
};
// SHA-256 digests published with the pinned official GitHub releases.
const hashes = {
  'yt-dlp.exe': 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d',
  'yt-dlp_arm64.exe': '0066dbac3c124028e2dcae2a197fccee33cd91f456313d24f7af89fd54590e98',
  'yt-dlp_linux': '767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795',
  'yt-dlp_linux_aarch64': 'e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483',
  'yt-dlp_macos': '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa',
  'deno-aarch64-apple-darwin.zip': '9f0bf660393da2eaff044cdc7444cb08c73f235849b61d224d825a194ce7c98e',
  'deno-aarch64-pc-windows-msvc.zip': 'b413b92b735b50c198e8fe3b85af1aa50e29d5f72e229aab701d132286e14cef',
  'deno-aarch64-unknown-linux-gnu.zip': 'd49596c20b9788cf8f5d8ddf644103d4bde56ed239753f0bdb92ba9361d51905',
  'deno-x86_64-apple-darwin.zip': '4b2f5edd2639b7470f034238b321d7002d8dfb4726d8558f52c17afac370eb2c',
  'deno-x86_64-pc-windows-msvc.zip': 'cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf',
  'deno-x86_64-unknown-linux-gnu.zip': 'e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609',
};
const platform = process.argv[2] ?? process.platform;
const target = targets[platform + '-' + (process.argv[3] ?? process.arch)];
if (!target) throw new Error('No downloader tools are available for this build target.');
const [ytAsset, denoTarget] = target;
const suffix = platform === 'win32' ? '.exe' : '';
const root = fileURLToPath(new URL('../vendor/downloader/', import.meta.url));
const base = 'https://github.com/yt-dlp/yt-dlp/releases/download/' + ytVersion;
const curl = (url, ...args) => execFileSync('curl', ['--fail', '--silent', '--show-error', '--location',
  '--proto', '=https', '--proto-redir', '=https', '--max-time', '120', '--retry', '2', '--retry-all-errors', '--http1.1', ...args, url], { encoding: 'utf8' });

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function matches(file, expected) {
  return /^[a-f0-9]{64}$/i.test(expected ?? '') && await digest(file).catch(() => '') === expected.toLowerCase();
}

await mkdir(root, { recursive: true });
const work = await mkdtemp(join(root, '.prepare-'));
try {
  const ytFile = join(root, 'yt-dlp' + suffix);
  const ytHash = hashes[ytAsset];
  if (!await matches(ytFile, ytHash)) {
    const file = join(work, ytAsset);
    curl(base + '/' + ytAsset, '--output', file);
    if (!await matches(file, ytHash)) throw new Error('yt-dlp SHA-256 verification failed.');
    await chmod(file, 0o755);
    await rename(file, ytFile);
  }

  const denoFile = join(root, 'deno' + suffix);
  const archiveName = 'deno-' + denoTarget + '.zip';
  const archiveHash = hashes[archiveName];
  const archive = join(root, archiveName);
  if (!await matches(archive, archiveHash)) {
    const file = join(work, archiveName);
    curl('https://github.com/denoland/deno/releases/download/' + denoVersion + '/' + archiveName, '--output', file);
    if (!await matches(file, archiveHash)) throw new Error('Deno SHA-256 verification failed.');
    await rename(file, archive);
  }
  const member = 'deno' + suffix;
  const runtime = join(work, member);
  if (process.platform === 'win32') execFileSync('tar', ['-xf', archive, '-C', work, member]);
  else execFileSync('unzip', ['-q', archive, member, '-d', work]);
  await chmod(runtime, 0o755);
  await rename(runtime, denoFile);
  console.log('Prepared verified downloader tools in ' + resolve(root));
} finally {
  await rm(work, { recursive: true, force: true });
}
