/**
 * Dangerous command detection.
 *
 * Patterns are intentionally conservative — better to flag more than to miss.
 * Each pattern has a category for clear UX messaging.
 */

interface DangerPattern {
  pattern: RegExp;
  category: string;
  reason: string;
}

const DANGER_PATTERNS: DangerPattern[] = [
  // Filesystem destruction
  {
    pattern: /\brm\s+(-[a-z]*f[a-z]*|-[a-z]*r[a-z]*f[a-z]*|--force|--recursive)\s*\//i,
    category: 'filesystem',
    reason: 'Recursive force-delete from root path',
  },
  {
    pattern: /\brm\s+-rf?\s+~\b/i,
    category: 'filesystem',
    reason: 'Recursive force-delete of home directory',
  },
  {
    pattern: /\brm\s+-rf?\s+\*\s*$/,
    category: 'filesystem',
    reason: 'Recursive force-delete of all files in current directory',
  },
  {
    pattern: /\brm\s+-rf\b/i,
    category: 'filesystem',
    reason: 'Recursive force-delete (high risk)',
  },
  // Device/disk writes
  {
    pattern: /\bdd\b.+\bof\s*=\s*\/dev\//,
    category: 'disk',
    reason: 'Writing directly to a block device',
  },
  {
    pattern: /\bmkfs\b/,
    category: 'disk',
    reason: 'Formatting a filesystem',
  },
  {
    pattern: /\bfdisk\b/,
    category: 'disk',
    reason: 'Partition table manipulation',
  },
  {
    pattern: /\bshred\b/,
    category: 'disk',
    reason: 'Secure file deletion / overwriting device',
  },
  // Fork bombs / resource exhaustion
  {
    pattern: /:\(\)\{.*\|.*&.*\};/,
    category: 'resource',
    reason: 'Fork bomb pattern',
  },
  {
    pattern: /\byes\b\s*\|/,
    category: 'resource',
    reason: 'Infinite input generation',
  },
  // Privilege escalation / system modification
  {
    pattern: /\bchmod\s+(-R\s+)?[0-7]*7\s+\/\s*$/,
    category: 'permissions',
    reason: 'Making root filesystem world-writable',
  },
  {
    pattern: /\bsudo\s+rm\s+-rf?\b/i,
    category: 'filesystem',
    reason: 'Privileged recursive force-delete',
  },
  // System shutdown / reboot
  {
    pattern: /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/,
    category: 'system',
    reason: 'System shutdown or reboot',
  },
  // Clobber important files
  {
    pattern: />\s*\/etc\/(passwd|shadow|sudoers|hosts|fstab|crontab)\b/,
    category: 'system',
    reason: 'Overwriting critical system file',
  },
  // Network danger
  {
    pattern: /\b(iptables|nftables)\s+(-F|--flush)\b/,
    category: 'network',
    reason: 'Flushing firewall rules',
  },
  // Data wipe utilities
  {
    pattern: /\b(wipefs|blkdiscard)\b/,
    category: 'disk',
    reason: 'Filesystem/disk wipe utility',
  },
];

export interface DangerAssessment {
  isDangerous: boolean;
  category?: string;
  reason?: string;
}

/**
 * Assess whether a shell command matches known dangerous patterns.
 * Returns the first matched danger, or { isDangerous: false } if clean.
 */
export function assessCommand(command: string): DangerAssessment {
  const trimmed = command.trim();
  for (const { pattern, category, reason } of DANGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isDangerous: true, category, reason };
    }
  }
  return { isDangerous: false };
}
