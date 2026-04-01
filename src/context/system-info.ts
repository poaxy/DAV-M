import { platform, release, arch, hostname } from 'os';
import { execSync } from 'child_process';

export interface SystemInfo {
  os: string;
  distro?: string;
  kernel: string;
  arch: string;
  shell: string;
  hostname: string;
}

let cached: SystemInfo | null = null;

/** Gather OS/shell info once and cache for the process lifetime. */
export function getSystemInfo(): SystemInfo {
  if (cached) return cached;

  const p = platform();
  const shell = process.env.SHELL?.split('/').pop() ?? process.env.ComSpec ?? 'unknown';

  let distro: string | undefined;
  if (p === 'linux') {
    distro = readLinuxDistro();
  } else if (p === 'darwin') {
    distro = readMacOSVersion();
  }

  cached = {
    os: p === 'darwin' ? 'macOS' : p === 'linux' ? 'Linux' : p,
    distro,
    kernel: release(),
    arch: arch(),
    shell,
    hostname: hostname(),
  };

  return cached;
}

function readLinuxDistro(): string | undefined {
  try {
    const raw = execSync('cat /etc/os-release 2>/dev/null', { encoding: 'utf8', timeout: 1000 });
    const name = raw.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    return name ?? undefined;
  } catch {
    return undefined;
  }
}

function readMacOSVersion(): string | undefined {
  try {
    const raw = execSync('sw_vers -productVersion 2>/dev/null', { encoding: 'utf8', timeout: 1000 });
    return `macOS ${raw.trim()}`;
  } catch {
    return undefined;
  }
}

export function formatSystemInfo(info: SystemInfo): string {
  const parts = [info.distro ?? info.os, `${info.arch}`, `shell: ${info.shell}`];
  return parts.join(' · ');
}
