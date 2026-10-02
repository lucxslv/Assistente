import React, { useState, useMemo } from "react";
import {
  AgentSession,
  PermissionRequest,
  AgentArtifact,
  AgentTerminal,
  AgentChange,
  AgentFile,
  AgentSubagent,
  AgentTask,
} from "../../types";
import {
  FolderTree,
  GitPullRequest,
  Terminal,
  BookOpen,
  Maximize2,
  Minimize2,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  RotateCcw,
  Download,
  Search,
  ShieldAlert,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  UploadCloud,
  FileText,
  Play,
  PanelRightClose,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { executeSystemCommand } from "../../services/deviceExecutor";
import { agentRuntimeStore } from "../../services/agentRuntimeStore";

export type DrawerTab = "hub" | "review" | "terminal" | "artifact";

interface AgentSidePanelProps {
  session: AgentSession | null;
  pendingPermissions: PermissionRequest[];
  onResolvePermission: (
    reqId: string,
    decision: "allow_once" | "allow_for_task" | "deny"
  ) => void;
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  onRetryTask?: (taskId: string) => void;
  onClose?: () => void;
  onToggleWidth?: () => void;
  isWide?: boolean;
}

// Code Block interno com botão de cópia
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2.5 rounded-lg overflow-hidden border border-white/[0.08] bg-[#0A0B0E] text-left">
      <div className="flex items-center justify-between px-3 py-1 bg-[#12151C] border-b border-white/[0.06] text-[10px] font-mono select-none">
        <span className="font-semibold uppercase tracking-wider text-zinc-400">
          {language || "código"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-[#EDEDED]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export const AgentSidePanel: React.FC<AgentSidePanelProps> = ({
  session,
  pendingPermissions,
  onResolvePermission,
  onReviewChange,
  onRetryTask,
  onClose,
  onToggleWidth,
  isWide = false,
}) => {
  // Estado central do Context Drawer
  const [activeTab, setActiveTab] = useState<DrawerTab>("hub");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  // Filtro de busca no visualizador de artefato
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docCopied, setDocCopied] = useState(false);

  // Entrada de comando no terminal interativo
  const [cliInput, setCliInput] = useState("");
  const [isExecutingCli, setIsExecutingCli] = useState(false);

  // Estados dos Accordions do Hub
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    subagents: false,
    changes: true,
    artifacts: true,
    files: true,
    tasks: true,
    terminals: true,
  });

  // Limites de visualização (máximo 5 itens visíveis por padrão)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleAccordion = (section: string) => {
    setOpenAccordions((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleSeeAll = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Coleta de dados da sessão
  const tasks: AgentTask[] = session?.tasks || [];
  const completedTasks = tasks.filter((t) => t.status === "success").length;
  const changes: AgentChange[] = session?.changes || [];
  const terminals: AgentTerminal[] = session?.terminals || [];
  const files: AgentFile[] = session?.files || [];
  const subagents: AgentSubagent[] = session?.subagents || [];
  const artifacts: AgentArtifact[] = useMemo(() => {
    return session?.artifacts || [];
  }, [session?.artifacts]);

  const activeArtifact = useMemo(() => {
    if (!selectedArtifactId) return null;
    return artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0];
  }, [selectedArtifactId, artifacts]);

  // Terminal selecionado
  const activeTerminal = useMemo(() => {
    if (terminals.length === 0) return null;
    if (!selectedTerminalId) return terminals[terminals.length - 1];
    return terminals.find((t) => t.id === selectedTerminalId) || terminals[terminals.length - 1];
  }, [selectedTerminalId, terminals]);

  // Mudança de arquivo selecionada
  const activeChange = useMemo(() => {
    if (changes.length === 0) return null;
    if (!selectedChangeId) return changes[0];
    return changes.find((c) => c.id === selectedChangeId) || changes[0];
  }, [selectedChangeId, changes]);

  // Abertura de artefato (transiciona para aba de leitura e cria a Pill Tab)
  const handleOpenArtifact = (artId: string) => {
    setSelectedArtifactId(artId);
    setActiveTab("artifact");
  };

  const handleCloseArtifact = () => {
    setSelectedArtifactId(null);
    if (activeTab === "artifact") {
      setActiveTab("hub");
    }
  };

  // Copiar documento Markdown completo
  const handleCopyDocument = (content: string) => {
    navigator.clipboard.writeText(content);
    setDocCopied(true);
    setTimeout(() => setDocCopied(false), 2000);
  };

  // Exportar / Baixar documento
  const handleDownloadDocument = (art: AgentArtifact) => {
    const blob = new Blob([art.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = art.name.endsWith(".md") ? art.name : `${art.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Execução de comando manual no terminal local
  const handleRunManualCli = async () => {
    if (!cliInput.trim() || isExecutingCli) return;
    const cmd = cliInput.trim();
    setCliInput("");
    setIsExecutingCli(true);

    try {
      const res = await executeSystemCommand(cmd);
      const outputText = [
        res.stdout ? res.stdout.trim() : "",
        res.stderr ? `STDERR:\n${res.stderr.trim()}` : "",
        `[Código de saída: ${res.exit_code} | Tempo: ${res.execution_time_ms}ms]`,
      ]
        .filter(Boolean)
        .join("\n\n");

      agentRuntimeStore.addTerminal({
        name: `PowerShell: ${cmd.split(" ")[0]}`,
        shell: "powershell",
        command: cmd,
        output: outputText,
        status: res.success ? "completed" : "failed",
      });
    } catch (err: any) {
      agentRuntimeStore.addTerminal({
        name: `PowerShell: ${cmd.split(" ")[0]}`,
        shell: "powershell",
        command: cmd,
        output: `Erro ao executar no Windows: ${err?.message || err}`,
        status: "failed",
      });
    } finally {
      setIsExecutingCli(false);
    }
  };

  return (
    <aside className="w-full h-full flex flex-col bg-[#090A0F] text-[#EDEDED] border-l border-white/[0.06] select-none overflow-hidden font-sans">
      {/* =========================================================
          1. BARRA DE FERRAMENTAS SUPERIOR (Top Navigation Bar - 40px)
          ========================================================= */}
      <div className="h-10 px-3 bg-[#12151C] border-b border-white/[0.06] flex items-center justify-between shrink-0 text-zinc-400">
        {/* Lado Esquerdo: Modos de Contexto e Pill Tab */}
        <div className="flex items-center gap-1 min-w-0">
          {/* Botão Hub / Document List */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("hub");
              setSelectedArtifactId(null);
            }}
            title="Hub de Ativos e Recursos"
            className={`p-1.5 rounded-md transition cursor-pointer ${
              activeTab === "hub" && !selectedArtifactId
                ? "text-white bg-white/[0.10] shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FolderTree className="w-4 h-4" strokeWidth={1.5} />
          </button>

          {/* Botão Review / Files Changed */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("review");
              setSelectedArtifactId(null);
            }}
            title="Revisão de Arquivos & Diffs"
            className={`relative p-1.5 rounded-md transition cursor-pointer ${
              activeTab === "review"
                ? "text-white bg-white/[0.10] shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <GitPullRequest className="w-4 h-4" strokeWidth={1.5} />
            {changes.length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* Botão Terminal */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("terminal");
              setSelectedArtifactId(null);
            }}
            title="Terminal e Processos Ativos"
            className={`relative p-1.5 rounded-md transition cursor-pointer ${
              activeTab === "terminal"
                ? "text-white bg-white/[0.10] shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Terminal className="w-4 h-4" strokeWidth={1.5} />
            {terminals.some((t) => t.status === "running") && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            )}
          </button>

          {/* Pill Tab (Aba de Leitura Ativa ao abrir documento) */}
          {selectedArtifactId && activeArtifact && (
            <div className="flex items-center gap-1.5 bg-[#1F2430] text-zinc-100 text-[11px] font-mono px-2 py-0.5 rounded-md border border-white/[0.08] ml-1 shadow-sm shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-indigo-300" strokeWidth={1.5} />
              <span className="max-w-[120px] truncate">{activeArtifact.name}</span>
              <button
                type="button"
                onClick={handleCloseArtifact}
                title="Fechar documento"
                className="text-zinc-400 hover:text-white p-0.5 rounded transition cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Lado Direito: Ações do Painel com z-index garantido */}
        <div className="flex items-center gap-1 shrink-0 text-zinc-400 relative z-30">
          <button
            type="button"
            onClick={() => {
              setActiveTab("terminal");
              setSelectedArtifactId(null);
            }}
            title="Novo Terminal / Ação"
            className="p-1 rounded hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </button>

          {onToggleWidth && (
            <button
              type="button"
              onClick={onToggleWidth}
              title={isWide ? "Restaurar largura padrão" : "Expandir painel (Split View ampla)"}
              className="p-1 rounded hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
            >
              {isWide ? (
                <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Fechar painel lateral"
              className="p-1 rounded hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
            >
              <PanelRightClose className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* =========================================================
          2. BANNER DE AUTORIZAÇÃO ZERO-TRUST (se houver pendência)
          ========================================================= */}
      {pendingPermissions.length > 0 && (
        <div className="p-3 bg-amber-950/20 border-b border-amber-500/30 shrink-0 space-y-2">
          {pendingPermissions.map((req) => (
            <div key={req.id} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-amber-300">
                    Autorização Necessária (Zero-Trust)
                  </div>
                  <div className="text-[11px] text-zinc-300 font-mono mt-0.5 break-all">
                    {req.tool} {req.command ? `— ${req.command}` : ""}
                  </div>
                  {req.reason && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">{req.reason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <button
                  type="button"
                  onClick={() => onResolvePermission(req.id, "allow_for_task")}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition cursor-pointer shadow-sm"
                >
                  Autorizar Ação
                </button>
                <button
                  type="button"
                  onClick={() => onResolvePermission(req.id, "deny")}
                  className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#1F2430] text-zinc-300 hover:bg-white/[0.08] transition cursor-pointer"
                >
                  Negar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================
          3. CONTEÚDO PRINCIPAL (Hub, Review, Terminal ou Artefato)
          ========================================================= */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* =========================================================
            MODO A: HUB DE ATIVOS (Árvore de Acordes Verticais)
            ========================================================= */}
        {activeTab === "hub" && !selectedArtifactId && (
          <div className="p-3 space-y-2.5 text-xs">
            {/* 1. Subagents */}
            <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleAccordion("subagents")}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                  {openAccordions.subagents ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold uppercase text-zinc-200">SUBAGENTS</span>
                  <span className="text-zinc-500">({String(subagents.length).padStart(2, "0")})</span>
                </div>
                {subagents.some((s) => s.status === "running") && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
              </button>

              {openAccordions.subagents && (
                <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1.5">
                  {subagents.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-500 px-1 py-0.5">
                      Nenhum subagente ativo
                    </div>
                  ) : (
                    subagents.slice(0, expandedSections.subagents ? subagents.length : 5).map((sub) => (
                      <div
                        key={sub.id}
                        className="p-2 rounded bg-[#12151C]/70 border border-white/[0.04] flex items-center justify-between font-mono text-[11px]"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-semibold text-zinc-200 truncate">{sub.role}</div>
                          <div className="text-zinc-500 text-[10px] truncate">{sub.goal}</div>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            sub.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : sub.status === "running"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                    ))
                  )}
                  {subagents.length > 5 && (
                    <button
                      type="button"
                      onClick={() => toggleSeeAll("subagents")}
                      className="text-[10px] font-mono text-blue-400 hover:underline pt-1 block"
                    >
                      {expandedSections.subagents ? "Mostrar menos" : `Ver todos (${subagents.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 2. Files Changed (com dropdown de branch/estado) */}
            <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleAccordion("changes")}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                  {openAccordions.changes ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <GitPullRequest className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold uppercase text-zinc-200">FILES CHANGED</span>
                  <span className="text-zinc-500">({String(changes.length).padStart(2, "0")})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                    Uncommitted
                  </span>
                </div>
              </button>

              {openAccordions.changes && (
                <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1">
                  {changes.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-500 px-1 py-0.5">
                      Nenhum arquivo alterado
                    </div>
                  ) : (
                    changes.slice(0, expandedSections.changes ? changes.length : 5).map((change) => (
                      <div
                        key={change.id}
                        onClick={() => {
                          setSelectedChangeId(change.id);
                          setActiveTab("review");
                        }}
                        className="p-1.5 rounded hover:bg-[#1F2430] transition cursor-pointer flex items-center justify-between font-mono text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-3.5 h-3.5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                              change.type === "A"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : change.type === "D"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {change.type}
                          </span>
                          <span className="text-zinc-200 truncate">{change.path}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0 pl-2">
                          {change.status}
                        </span>
                      </div>
                    ))
                  )}
                  {changes.length > 5 && (
                    <button
                      type="button"
                      onClick={() => toggleSeeAll("changes")}
                      className="text-[10px] font-mono text-blue-400 hover:underline pt-1 block"
                    >
                      {expandedSections.changes ? "Mostrar menos" : `Ver todos (${changes.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. Artifacts (Renderiza apenas quando houver dados para evitar poluição visual de estados vazios rígidos) */}
            {artifacts.length > 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleAccordion("artifacts")}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                    {openAccordions.artifacts ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold uppercase text-zinc-200">ARTIFACTS</span>
                    <span className="text-zinc-500">({String(artifacts.length).padStart(2, "0")})</span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500">docs / code</span>
                </button>

                {openAccordions.artifacts && (
                  <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1">
                    {artifacts.slice(0, expandedSections.artifacts ? artifacts.length : 5).map((art) => (
                      <div
                        key={art.id}
                        onClick={() => handleOpenArtifact(art.id)}
                        className="p-1.5 rounded hover:bg-[#1F2430] transition cursor-pointer flex items-center justify-between font-mono text-[11px] group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-zinc-400 group-hover:text-blue-300 shrink-0" />
                          <span className="text-zinc-200 group-hover:text-white truncate">
                            {art.name}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 shrink-0">
                          {art.type}
                        </span>
                      </div>
                    ))}
                    {artifacts.length > 5 && (
                      <button
                        type="button"
                        onClick={() => toggleSeeAll("artifacts")}
                        className="text-[10px] font-mono text-blue-400 hover:underline pt-1 block"
                      >
                        {expandedSections.artifacts ? "Mostrar menos" : `Ver todos (${artifacts.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Uploads & Files Analyzed */}
            <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleAccordion("files")}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                  {openAccordions.files ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold uppercase text-zinc-200">FILES ANALYZED</span>
                  <span className="text-zinc-500 font-mono">({String(files.length).padStart(2, "0")})</span>
                </div>
              </button>

              {openAccordions.files && (
                <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1">
                  {files.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-500 px-1 py-0.5">
                      Nenhum arquivo inspecionado
                    </div>
                  ) : (
                    files.slice(0, expandedSections.files ? files.length : 5).map((file) => (
                      <div
                        key={file.id}
                        className="p-1.5 rounded hover:bg-white/[0.02] transition flex items-center justify-between font-mono text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="text-zinc-300 truncate" title={file.path}>
                            {file.name}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-500 shrink-0">
                          {file.category}
                        </span>
                      </div>
                    ))
                  )}
                  {files.length > 5 && (
                    <button
                      type="button"
                      onClick={() => toggleSeeAll("files")}
                      className="text-[10px] font-mono text-blue-400 hover:underline pt-1 block"
                    >
                      {expandedSections.files ? "Mostrar menos" : `Ver todos (${files.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 5. Background Tasks / Plano de Etapas */}
            <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleAccordion("tasks")}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                  {openAccordions.tasks ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-semibold uppercase text-zinc-200">PIPELINE</span>
                  <span className="text-zinc-400 font-mono">
                    {completedTasks}/{tasks.length}
                  </span>
                </div>
              </button>

              {openAccordions.tasks && tasks.length > 0 && (
                <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1.5">
                  {tasks.map((task: AgentTask, idx: number) => {
                    const isSuccess = task.status === "success";
                    const isRunning = task.status === "running" || task.status === "verifying";
                    const isFailed = task.status === "failure";

                    return (
                      <div
                        key={task.id}
                        className="p-1.5 rounded bg-[#12151C]/60 flex items-start gap-2 font-mono text-[11px]"
                      >
                        <div className="shrink-0 mt-0.5">
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : isRunning ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                          ) : isFailed ? (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          ) : (
                            <span className="text-zinc-600 font-bold">{idx + 1}.</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span
                            className={
                              isSuccess
                                ? "text-zinc-400 line-through"
                                : isFailed
                                ? "text-rose-300 font-medium"
                                : "text-zinc-200"
                            }
                          >
                            {task.title}
                          </span>
                          {isFailed && onRetryTask && (
                            <button
                              type="button"
                              onClick={() => onRetryTask(task.id)}
                              className="block text-[10px] text-rose-400 hover:underline mt-0.5 cursor-pointer"
                            >
                              Tentar novamente
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 6. Terminals & Processos Ativos */}
            <div className="rounded-lg border border-white/[0.06] bg-[#12151C] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleAccordion("terminals")}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                  {openAccordions.terminals ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold uppercase text-zinc-200">TERMINALS</span>
                  <span className="text-zinc-500 font-mono">({String(terminals.length).padStart(2, "0")})</span>
                </div>
                <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                  POWERSHELL.EXE
                </span>
              </button>

              {openAccordions.terminals && terminals.length > 0 && (
                <div className="p-2 border-t border-white/[0.04] bg-[#0A0B0E] space-y-1">
                  {terminals.slice(0, expandedSections.terminals ? terminals.length : 5).map((term, i) => (
                    <div
                      key={term.id}
                      onClick={() => {
                        setSelectedTerminalId(term.id);
                        setActiveTab("terminal");
                      }}
                      className="p-1.5 rounded hover:bg-[#1F2430] transition cursor-pointer flex items-center justify-between font-mono text-[11px]"
                    >
                      <div className="min-w-0 flex-1 truncate text-zinc-300">
                        <span className="text-zinc-500 mr-1.5">$</span>
                        {term.command}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <span className="text-[10px] text-zinc-500">
                          PID {10800 + i}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            term.status === "running"
                              ? "bg-indigo-400 animate-pulse"
                              : "bg-emerald-400"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                  {terminals.length > 5 && (
                    <button
                      type="button"
                      onClick={() => toggleSeeAll("terminals")}
                      className="text-[10px] font-mono text-indigo-400 hover:underline pt-1 block"
                    >
                      {expandedSections.terminals ? "Mostrar menos" : `Ver todos (${terminals.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            MODO B (1): SPLIT VIEW DE GIT REVIEW / FILES CHANGED
            ========================================================= */}
        {activeTab === "review" && (
          <div className="h-full flex flex-col md:flex-row bg-[#0A0B0E] divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
            {/* Coluna Esquerda: Lista de Arquivos Alterados */}
            <div className="w-full md:w-56 shrink-0 bg-[#0E0E10] flex flex-col">
              <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="font-semibold text-zinc-200">Uncommitted</span>
                <span className="px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400">
                  {changes.length} arquivos
                </span>
              </div>
              <div className="p-1.5 overflow-y-auto flex-1 space-y-0.5">
                {changes.length > 0 ? (
                  changes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedChangeId(c.id)}
                      className={`w-full p-2 rounded text-left font-mono text-[11px] transition flex items-center justify-between cursor-pointer ${
                        activeChange?.id === c.id
                          ? "bg-[#1F2430] text-white font-medium"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-3.5 h-3.5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                            c.type === "A"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : c.type === "D"
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {c.type}
                        </span>
                        <span className="truncate">{c.path.split(/[/\\]/).pop()}</span>
                      </div>
                      <span className="text-[10px] text-zinc-600">{c.status}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-zinc-600 font-mono text-[11px]">
                    Sem alterações
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita: Visualizador de Diff */}
            <div className="flex-1 flex flex-col bg-[#0A0B0E] overflow-hidden">
              {activeChange ? (
                <>
                  <div className="h-10 px-3 border-b border-white/[0.06] bg-[#12151C] flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200 truncate">{activeChange.path}</span>
                    {onReviewChange && activeChange.status === "pending_review" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onReviewChange(activeChange.id, "accept")}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Aceitar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onReviewChange(activeChange.id, "revert")}
                          className="px-2 py-1 rounded text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reverter</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 p-3 overflow-auto font-mono text-[11px] leading-relaxed text-zinc-300 space-y-0.5">
                    {(activeChange.diff || activeChange.newContent || "")
                      .split("\n")
                      .map((line, idx) => {
                        const isAdd = line.startsWith("+");
                        const isDel = line.startsWith("-");
                        return (
                          <div
                            key={idx}
                            className={`px-2 py-0.5 rounded ${
                              isAdd
                                ? "bg-emerald-950/40 text-emerald-300"
                                : isDel
                                ? "bg-rose-950/40 text-rose-300"
                                : "text-zinc-400"
                            }`}
                          >
                            <span className="text-zinc-600 select-none mr-2 w-6 inline-block text-right">
                              {idx + 1}
                            </span>
                            {line}
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                  <FileCode className="w-8 h-8 text-zinc-700" />
                  <p className="text-xs font-mono text-zinc-400">
                    Nenhuma alteração pendente para revisão
                  </p>
                  <p className="text-[11px] text-zinc-600 max-w-xs">
                    As modificações em arquivos propostas pelo agente durante a execução aparecerão aqui em formato diff para revisão atômica.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            MODO B (2): SPLIT VIEW DE TERMINAL & PROCESSOS ATIVOS
            ========================================================= */}
        {activeTab === "terminal" && (
          <div className="h-full flex flex-col md:flex-row bg-[#0A0B0E] divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
            {/* Coluna Esquerda: Sessões de Terminal */}
            <div className="w-full md:w-56 shrink-0 bg-[#0E0E10] flex flex-col">
              <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="font-semibold text-zinc-200">Sessões Locais</span>
                <span className="px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400">
                  {terminals.length}
                </span>
              </div>
              <div className="p-1.5 overflow-y-auto flex-1 space-y-1">
                {terminals.length > 0 ? (
                  terminals.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTerminalId(t.id)}
                      className={`w-full p-2 rounded text-left font-mono text-[11px] transition flex items-center justify-between cursor-pointer ${
                        activeTerminal?.id === t.id
                          ? "bg-[#1F2430] text-white font-medium"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="truncate pr-1">
                        <span className="text-zinc-500 mr-1">$</span>
                        {t.command}
                      </div>
                      <span className="text-[9px] text-zinc-600">PID {10800 + idx}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-zinc-600 font-mono text-[11px]">
                    Nenhum processo
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita: Buffer xterm-style e Prompt de Entrada */}
            <div className="flex-1 flex flex-col bg-[#0A0B0E] overflow-hidden">
              <div className="h-10 px-3 border-b border-white/[0.06] bg-[#12151C] flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-zinc-300 truncate">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate">{activeTerminal?.command || "PowerShell Windows"}</span>
                </div>
                {activeTerminal && (
                  <button
                    type="button"
                    onClick={() => handleCopyDocument(activeTerminal.output)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
                    title="Copiar buffer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Buffer do Terminal */}
              <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 bg-[#0A0B0E] select-text whitespace-pre-wrap break-all">
                {activeTerminal ? (
                  activeTerminal.output || "[Processo finalizado sem saída de texto]"
                ) : (
                  <div className="text-zinc-600 py-6 text-center">
                    Pronto para executar comandos no Windows.
                  </div>
                )}
              </div>

              {/* Input Interativo no Rodapé */}
              <div className="p-2 border-t border-white/[0.06] bg-[#12151C] flex items-center gap-2 font-mono text-xs">
                <span className="text-indigo-400 font-bold select-none text-[11px]">
                  PS&gt;
                </span>
                <input
                  type="text"
                  value={cliInput}
                  onChange={(e) => setCliInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleRunManualCli();
                    }
                  }}
                  disabled={isExecutingCli}
                  placeholder="Execute um comando no Windows (ex: dir, git status)..."
                  className="flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-600 focus:outline-none text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleRunManualCli}
                  disabled={!cliInput.trim() || isExecutingCli}
                  className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-medium text-[11px] transition cursor-pointer flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  <span>Rodar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            MODO C: VISUALIZADOR DE ARTEFATOS / MARKDOWN COM BUSCA
            ========================================================= */}
        {activeArtifact && (activeTab === "artifact" || selectedArtifactId !== null) && (
          <div className="h-full flex flex-col bg-[#090A0F] overflow-hidden">
            {/* Barra de Ações Rápidas do Documento */}
            <div className="h-10 px-3 bg-[#12151C] border-b border-white/[0.06] flex items-center justify-between text-xs font-mono shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleCloseArtifact}
                  className="text-zinc-400 hover:text-white transition cursor-pointer text-[11px] hover:underline flex items-center gap-1"
                >
                  <span>← Hub</span>
                </button>
                <span className="text-zinc-600">/</span>
                <span className="font-semibold text-zinc-200 truncate max-w-[140px]">
                  {activeArtifact.name}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                  {activeArtifact.type}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Busca rápida */}
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-zinc-500 absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    placeholder="Filtrar..."
                    className="w-24 focus:w-36 transition-all pl-6 pr-2 py-0.5 rounded bg-black/40 border border-white/[0.06] text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyDocument(activeArtifact.content)}
                  title="Copiar conteúdo"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
                >
                  {docCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadDocument(activeArtifact)}
                  title="Exportar documento"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Área de Leitura Fluida */}
            <div className="flex-1 p-4 overflow-y-auto font-sans leading-relaxed text-zinc-200 text-xs select-text">
              <div className="max-w-none prose prose-invert prose-xs space-y-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const isInline = !match && !String(children).includes("\n");
                      if (isInline) {
                        return (
                          <code
                            className="px-1.5 py-0.5 rounded bg-black/40 text-indigo-300 font-mono text-[11px] border border-white/[0.06]"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <CodeBlock
                          language={match ? match[1] : ""}
                          code={String(children).replace(/\n$/, "")}
                        />
                      );
                    },
                  }}
                >
                  {activeArtifact.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

// Export como AgentContextDrawer para atender a especificação idêntica
export const AgentContextDrawer = AgentSidePanel;
export default AgentSidePanel;
