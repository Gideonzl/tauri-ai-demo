const fs = require('fs');
let content = fs.readFileSync('src/utils/ai-chat.ts', 'utf-8');

// Step 1: Insert effectiveSessionId and update the sessionId check
const oldComment = '  // Tool calling instructions — critical for enabling direct server execution';
const newComment = '  // Determine effective sessionId based on mode\n  // In \'qa\' mode, NEVER allow command execution — force sessionId to null\n  const effectiveSessionId = (mode === \'qa\') ? null : sessionId\n\n  // Tool calling instructions — only injected in \'agent\' mode';
content = content.replace(oldComment, newComment);

// Replace sessionId check with effectiveSessionId
content = content.replace('  if (sessionId && serverContext && serverContext.status === \'connected\') {',
                           '  if (effectiveSessionId && serverContext && serverContext.status === \'connected\') {');

// Step 2: Add else-if for qa mode after the tool calling block
const oldClose = '- 对于危险操作（rm -rf、drop database、iptables -F 等），先警告用户并确认`\n  }';
if (content.includes(oldClose)) {
  const newClose = '- 对于危险操作（rm -rf、drop database、iptables -F 等），先警告用户并确认`\n  } else if (serverContext && serverContext.status === \'connected\' && mode === \'qa\') {\n    // Q&A mode with server connected — explicitly tell AI to NOT execute commands\n    systemContent += `\n\n=== 工作模式：智能问答（仅提供建议） ===\n你当前处于**智能问答模式**，**不能**直接在服务器上执行命令。你的职责是：\n- 分析用户的问题和需求\n- 提供专业的建议、方案和命令示例\n- 解释相关概念和最佳实践\n- 帮助用户理解服务器运维知识\n\n**重要：不要使用 <execute_command> 标签。** 如果你认为某些命令有用，请用 markdown 代码块展示给用户，让用户自己决定是否执行。`\n  }';
  content = content.replace(oldClose, newClose);
  console.log('OK: Added qa mode else-if');
} else {
  console.log('WARN: Could not find oldClose, searching...');
  if (content.includes('对于危险操作')) {
    console.log('  Found 对于危险操作 in content');
  }
}

// Step 3: Also pass effectiveSessionId to runConversationLoop
content = content.replace('sessionId,\n        onToolStart,',
                          'effectiveSessionId,\n        onToolStart,');

fs.writeFileSync('src/utils/ai-chat.ts', content);
console.log('Done patching ai-chat.ts');
