/**
 * Charlie Desktop — Official Landing Page JavaScript
 * Clean, lightweight, self-contained interactivity
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initDrawerTabs();
  initDualModeSwitcher();
  initPermissionEngineDemo();
  initTerminalSimulator();
  initFaqAccordion();
  initCopyButtons();
  initSpotlightPreview();
  initScrollEffects();
});

/* ==========================================================================
   1. Mobile Navigation Toggle
   ========================================================================== */
function initMobileNav() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (!menuBtn || !mobileMenu) return;

  menuBtn.addEventListener('click', () => {
    const isHidden = mobileMenu.classList.contains('hidden');
    if (isHidden) {
      mobileMenu.classList.remove('hidden');
      menuBtn.setAttribute('aria-expanded', 'true');
    } else {
      mobileMenu.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close mobile menu on link click
  const links = mobileMenu.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ==========================================================================
   2. Interactive Context Drawer Tabs (Mockup)
   ========================================================================== */
function initDrawerTabs() {
  const tabButtons = document.querySelectorAll('[data-drawer-tab]');
  const tabPanes = document.querySelectorAll('[data-drawer-pane]');

  if (!tabButtons.length || !tabPanes.length) return;

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-drawer-tab');

      // Update button active state
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');

      // Update pane visibility
      tabPanes.forEach(pane => {
        if (pane.getAttribute('data-drawer-pane') === targetTab) {
          pane.classList.remove('hidden');
          pane.classList.add('block');
        } else {
          pane.classList.add('hidden');
          pane.classList.remove('block');
        }
      });
    });
  });
}

/* ==========================================================================
   3. Dual-Mode Switcher (Chat vs Agent Mode in Mockup)
   ========================================================================== */
function initDualModeSwitcher() {
  const chatModeBtn = document.getElementById('mode-btn-chat');
  const agentModeBtn = document.getElementById('mode-btn-agent');
  const chatView = document.getElementById('mockup-chat-view');
  const agentView = document.getElementById('mockup-agent-view');
  const activeModeBadge = document.getElementById('mockup-mode-badge');

  if (!chatModeBtn || !agentModeBtn || !chatView || !agentView) return;

  chatModeBtn.addEventListener('click', () => {
    chatModeBtn.classList.add('bg-white/10', 'text-white');
    chatModeBtn.classList.remove('text-zinc-400');
    agentModeBtn.classList.remove('bg-white/10', 'text-white');
    agentModeBtn.classList.add('text-zinc-400');

    chatView.classList.remove('hidden');
    agentView.classList.add('hidden');

    if (activeModeBadge) {
      activeModeBadge.textContent = 'Chat Conversacional';
      activeModeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20';
    }
  });

  agentModeBtn.addEventListener('click', () => {
    agentModeBtn.classList.add('bg-white/10', 'text-white');
    agentModeBtn.classList.remove('text-zinc-400');
    chatModeBtn.classList.remove('bg-white/10', 'text-white');
    chatModeBtn.classList.add('text-zinc-400');

    agentView.classList.remove('hidden');
    chatView.classList.add('hidden');

    if (activeModeBadge) {
      activeModeBadge.textContent = 'Modo Agente Autônomo';
      activeModeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20';
    }
  });
}

/* ==========================================================================
   4. Permission Engine Interactive Demo
   ========================================================================== */
function initPermissionEngineDemo() {
  const allowOnceBtn = document.getElementById('perm-btn-allow-once');
  const allowTaskBtn = document.getElementById('perm-btn-allow-task');
  const denyBtn = document.getElementById('perm-btn-deny');
  const statusBanner = document.getElementById('perm-demo-status');
  const auditLogOutput = document.getElementById('perm-demo-audit-log');

  if (!allowOnceBtn || !statusBanner || !auditLogOutput) return;

  function setDecision(decision, label, badgeClass, message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    statusBanner.className = `p-3 rounded-lg border text-xs flex items-center justify-between transition-all ${badgeClass}`;
    statusBanner.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full animate-ping ${badgeClass.includes('emerald') ? 'bg-emerald-400' : badgeClass.includes('rose') ? 'bg-rose-400' : 'bg-amber-400'}"></span>
        <span class="font-medium">${message}</span>
      </div>
      <span class="font-mono text-[10px] opacity-75">${timestamp}</span>
    `;

    const logEntry = document.createElement('div');
    logEntry.className = 'py-1 border-b border-white/[0.04] text-[11px] font-mono flex items-start gap-2';
    logEntry.innerHTML = `
      <span class="text-zinc-500">[${timestamp}]</span>
      <span class="${decision === 'deny' ? 'text-rose-400' : 'text-emerald-400'} font-semibold">${decision.toUpperCase()}:</span>
      <span class="text-zinc-300">Tool: 'execute_command' (PowerShell) — Alvo: 'git push origin main' — Decisão: '${label}'</span>
    `;

    auditLogOutput.prepend(logEntry);
  }

  allowOnceBtn.addEventListener('click', () => {
    setDecision(
      'allow_once',
      'Permitir Uma Vez',
      'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      'Ação autorizada única: Comando executado em sandbox isolado com telemetria local gravada.'
    );
  });

  allowTaskBtn.addEventListener('click', () => {
    setDecision(
      'allow_task',
      'Permitir para Tarefa',
      'bg-blue-500/10 border-blue-500/30 text-blue-300',
      'Aprovação de escopo concedida para a sessão: Ações idempotentes autorizadas até conclusão da meta.'
    );
  });

  denyBtn.addEventListener('click', () => {
    setDecision(
      'deny',
      'Bloqueado pelo Usuário',
      'bg-rose-500/10 border-rose-500/30 text-rose-300',
      'Ação vetada pelo usuário: Execução interrompida sem modificação no sistema de arquivos.'
    );
  });
}

/* ==========================================================================
   5. Interactive Terminal Simulator
   ========================================================================== */
function initTerminalSimulator() {
  const terminalInput = document.getElementById('terminal-interactive-input');
  const terminalOutput = document.getElementById('terminal-interactive-output');
  const presetChips = document.querySelectorAll('[data-term-cmd]');

  if (!terminalInput || !terminalOutput) return;

  const commandResponses = {
    'charlie doctor': `[CHARLIE DOCTOR v2.0 - WINDOWS NATIVE DIAGNOSTIC]
[OK] Windows OS Version: Windows 11 Build 22631 (x64)
[OK] Local Agent Runtime 2.0: Active & Listening (named pipe ready)
[OK] PowerShell Host: Core 7.4.5 & Win32 Security Layer Verified
[OK] Zero-Trust Engine: Enforced (Atomic approval enabled)
[OK] SQLite Encrypted Store: 100% Local (0 Cloud Telemetry Leaks)
[OK] Active LLM Pipeline: Google Gemini 2.0 Flash / Pro Reasoning
-> All systems operational. Zero critical vulnerabilities detected.`,

    'charlie agent run': `[CHARLIE AGENT RUNTIME - DISPATCHING GOAL]
[PLAN] Step 1/3: Analyzing project tree and git working directory...
[EXEC] PowerShell -> Get-ChildItem -Recurse | Test-Integrity
[DIFF] 3 files analyzed, 0 syntax regressions found.
[SUCCESS] Evidence bundle compiled: 14 passing checks. Completed in 320ms.`,

    'charlie status': `[CHARLIE STATUS]
Runtime: Online (Local Device Engine v1.0.0)
Active Workspace: C:\\Users\\Projects\\Charlie
RAM Footprint: 74 MB | CPU Idle: 0.1%
Offline Fallback: Ready (Faster-Whisper & Ollama)
Permission Gatekeeper: STRICT_CONFIRMATION`,

    'clear': '__CLEAR__'
  };

  function executeCommand(rawCmd) {
    const cmd = rawCmd.trim();
    if (!cmd) return;

    if (cmd.toLowerCase() === 'clear') {
      terminalOutput.innerHTML = '';
      return;
    }

    // Append user input line
    const userLine = document.createElement('div');
    userLine.className = 'text-zinc-400 mt-2 flex items-center gap-1.5 font-mono text-xs';
    userLine.innerHTML = `<span class="text-purple-400 font-bold">PS C:\\Users\\Charlie&gt;</span> <span class="text-zinc-100">${escapeHtml(cmd)}</span>`;
    terminalOutput.appendChild(userLine);

    // Find response or default
    let responseText = '';
    const lowerCmd = cmd.toLowerCase();

    if (lowerCmd.includes('doctor')) {
      responseText = commandResponses['charlie doctor'];
    } else if (lowerCmd.includes('run') || lowerCmd.includes('exec')) {
      responseText = commandResponses['charlie agent run'];
    } else if (lowerCmd.includes('status')) {
      responseText = commandResponses['charlie status'];
    } else {
      responseText = `Charlie Local Runtime executou: '${cmd}' com código de saída 0.\n[Auditoria gravada em audit.db com hash seguro].`;
    }

    const respLine = document.createElement('pre');
    respLine.className = 'text-xs text-zinc-300 font-mono my-1.5 whitespace-pre-wrap leading-relaxed border-l-2 border-purple-500/40 pl-2.5 py-1 bg-white/[0.02] rounded-r';
    respLine.textContent = responseText;
    terminalOutput.appendChild(respLine);

    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = terminalInput.value;
      executeCommand(cmd);
      terminalInput.value = '';
    }
  });

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cmd = chip.getAttribute('data-term-cmd');
      terminalInput.value = cmd;
      executeCommand(cmd);
      terminalInput.value = '';
    });
  });
}

/* ==========================================================================
   6. FAQ Accordion
   ========================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items
      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          const otherTrigger = other.querySelector('.faq-trigger');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current
      if (isOpen) {
        item.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ==========================================================================
   7. Copy to Clipboard Utility
   ========================================================================== */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('[data-copy-target]');

  copyButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-copy-target');
      const targetElement = document.getElementById(targetId);
      const textToCopy = targetElement ? targetElement.textContent.trim() : button.getAttribute('data-copy-text');

      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalContent = button.innerHTML;
        button.innerHTML = `
          <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span class="text-emerald-400 font-semibold">Copiado!</span>
        `;
        setTimeout(() => {
          button.innerHTML = originalContent;
        }, 2000);
      }).catch(err => {
        console.error('Falha ao copiar:', err);
      });
    });
  });
}

/* ==========================================================================
   8. Spotlight Interactive Preview Modal
   ========================================================================== */
function initSpotlightPreview() {
  const toggleBtn = document.getElementById('spotlight-demo-trigger');
  const modal = document.getElementById('spotlight-demo-modal');
  const closeBtn = document.getElementById('spotlight-demo-close');
  const searchInput = document.getElementById('spotlight-search-input');
  const items = document.querySelectorAll('.spotlight-search-item');

  if (!toggleBtn || !modal) return;

  function openSpotlight() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 50);
    }
  }

  function closeSpotlight() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  toggleBtn.addEventListener('click', openSpotlight);
  if (closeBtn) closeBtn.addEventListener('click', closeSpotlight);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSpotlight();
  });

  // Global shortcut preview: Ctrl + Space opens spotlight demo
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
      e.preventDefault();
      if (modal.classList.contains('hidden')) {
        openSpotlight();
      } else {
        closeSpotlight();
      }
    }
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeSpotlight();
    }
  });

  // Search filter inside spotlight
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(query)) {
          item.classList.remove('hidden');
        } else {
          item.classList.add('hidden');
        }
      });
    });
  }
}

/* ==========================================================================
   9. Scroll Effects & Active Navigation Spy
   ========================================================================== */
function initScrollEffects() {
  const navbar = document.querySelector('.navbar-blur');
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      navbar?.classList.add('shadow-lg', 'border-white/[0.08]');
    } else {
      navbar?.classList.remove('shadow-lg', 'border-white/[0.08]');
    }
  });
}

/* Helper */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
