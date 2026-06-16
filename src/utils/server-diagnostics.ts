/**
 * 服务器诊断命令集
 * 每个快速分析类型对应一组可在远端服务器上执行的命令
 * 命令设计原则：安全（只读）、快速（超时控制）、输出精简
 */
import { sshExec } from '@/api/tauri'
import type { ServerContext } from './ai-chat'

/** 单项诊断命令 */
export interface DiagnosticCommand {
  label: string
  command: string
}

/** 诊断分组 */
export interface DiagnosticGroup {
  id: string
  commands: DiagnosticCommand[]
}

/** 所有快速分析的诊断命令集 */
export const DIAGNOSTIC_GROUPS: Record<string, DiagnosticGroup> = {
  health: {
    id: 'health',
    commands: [
      { label: 'CPU & Load', command: 'echo "--- CPU & Load ---" && top -bn1 2>/dev/null | head -5 && echo && cat /proc/loadavg 2>/dev/null' },
      { label: 'Memory', command: 'echo "--- Memory ---" && free -h 2>/dev/null' },
      { label: 'Uptime', command: 'echo "--- Uptime ---" && uptime 2>/dev/null' },
      { label: 'Disk Overview', command: 'echo "--- Disk ---" && df -h 2>/dev/null' },
    ],
  },
  disk: {
    id: 'disk',
    commands: [
      { label: 'Disk Usage', command: 'echo "--- Disk Usage ---" && df -h 2>/dev/null' },
      { label: 'Inode Usage', command: 'echo "--- Inodes ---" && df -i 2>/dev/null' },
      { label: 'Top Directories (/)', command: 'echo "--- Top Dirs / ---" && du -sh /* 2>/dev/null | sort -rh | head -15' },
      { label: 'Large Files (>100M)', command: 'echo "--- Large Files ---" && find /var /home /opt /tmp -xdev -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | head -20' },
    ],
  },
  network: {
    id: 'network',
    commands: [
      { label: 'Listening Ports', command: 'echo "--- Listening Ports ---" && ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null' },
      { label: 'All Connections', command: 'echo "--- Active Connections ---" && ss -tan 2>/dev/null | head -30' },
      { label: 'Network Interfaces', command: 'echo "--- Interfaces ---" && ip addr 2>/dev/null || ifconfig 2>/dev/null' },
      { label: 'Firewall Rules', command: 'echo "--- Firewall ---" && (iptables -L -n 2>/dev/null || ufw status 2>/dev/null || echo "No firewall info available")' },
    ],
  },
  processes: {
    id: 'processes',
    commands: [
      { label: 'Top CPU Processes', command: 'echo "--- Top by CPU ---" && ps aux --sort=-%cpu 2>/dev/null | head -15' },
      { label: 'Top Memory Processes', command: 'echo "--- Top by Memory ---" && ps aux --sort=-%mem 2>/dev/null | head -15' },
      { label: 'Process Count', command: 'echo "--- Process Summary ---" && echo "Total processes: $(ps aux 2>/dev/null | wc -l)" && echo "Zombie: $(ps aux 2>/dev/null | awk \'$8~/Z/{print}\' | wc -l)"' },
      { label: 'Services', command: 'echo "--- Key Services ---" && (systemctl list-units --type=service --state=running 2>/dev/null | head -20 || service --status-all 2>/dev/null | head -20)' },
    ],
  },
  security: {
    id: 'security',
    commands: [
      { label: 'Recent Auth Log', command: 'echo "--- Auth Log ---" && (tail -30 /var/log/auth.log 2>/dev/null || tail -30 /var/log/secure 2>/dev/null || echo "No auth log accessible")' },
      { label: 'Failed Logins', command: 'echo "--- Failed Logins ---" && (lastb 2>/dev/null | head -15 || echo "No failed login data")' },
      { label: 'Sudo Usage', command: 'echo "--- Sudo Log ---" && (grep sudo /var/log/auth.log 2>/dev/null | tail -15 || grep sudo /var/log/secure 2>/dev/null | tail -15 || echo "No sudo log")' },
      { label: 'Open Ports', command: 'echo "--- Open Ports ---" && ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null' },
      { label: 'World-Writable Files', command: 'echo "--- World-Writable in /etc ---" && find /etc -xdev -type f -perm -o+w 2>/dev/null | head -20' },
    ],
  },
}

/** 执行单个命令并返回带标签的结果 */
export async function runCommand(
  sessionId: string,
  cmd: DiagnosticCommand,
  timeoutMs: number = 15000
): Promise<string> {
  try {
    const output = await sshExec(sessionId, cmd.command)
    const trimmed = output.trim()
    return trimmed || '(no output)'
  } catch (e: any) {
    return `Error: ${e?.message || e?.toString() || 'unknown'}`
  }
}

/** 执行一组诊断命令并返回汇总输出 */
export async function runDiagnostics(
  sessionId: string,
  groupId: string,
  onProgress?: (label: string) => void
): Promise<string> {
  const group = DIAGNOSTIC_GROUPS[groupId]
  if (!group) return ''

  const results: string[] = []
  for (const cmd of group.commands) {
    onProgress?.(cmd.label)
    const output = await runCommand(sessionId, cmd)
    results.push(output)
  }

  return results.join('\n\n')
}

/** 格式化诊断结果为用户消息内容 */
export function formatDiagnosticOutput(
  output: string,
  serverName: string,
  analysisPrompt: string
): string {
  return `[${serverName}] Command output:\n\`\`\`shell\n${output.slice(0, 6000)}\n\`\`\`\n\n${analysisPrompt}`
}
