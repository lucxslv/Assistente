import React, { useState } from "react";
import { AgentArtifact } from "../../types";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Copy,
  Check,
  Download,
  Search,
  Code,
  Eye,
} from "lucide-react";

interface WorkspaceArtifactsProps {
  artifacts: AgentArtifact[];
  onDeleteArtifact?: (id: string) => void;
}

export const WorkspaceArtifacts: React.FC<WorkspaceArtifactsProps> = ({
  artifacts,
}) => {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    artifacts.length > 0 ? artifacts[0].id : null
  );
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedArtifact =
    artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0] || null;

  const filteredArtifacts = artifacts.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = () => {
    if (!selectedArtifact) return;
    navigator.clipboard.writeText(selectedArtifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedArtifact) return;
    const blob = new Blob([selectedArtifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedArtifact.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "markdown":
      case "report":
        return <FileText className="w-4 h-4 text-slate-300" />;
      case "json":
      case "code":
        return <FileCode className="w-4 h-4 text-amber-300/80" />;
      case "csv":
        return <FileSpreadsheet className="w-4 h-4 text-emerald-300/80" />;
      case "image":
        return <ImageIcon className="w-4 h-4 text-purple-300/80" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* ================= Painel Lateral: Lista de Artefatos ================= */}
      <div className="w-72 border-r border-white/[0.08] bg-[#12151C]/60 flex flex-col h-full">
        {/* Header da Barra Lateral */}
        <div className="p-3.5 border-b border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300 font-mono uppercase tracking-wider">
              Artefatos ({artifacts.length})
            </span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar artefatos..."
              className="w-full bg-[#090A0F] text-xs text-zinc-200 placeholder-zinc-500 rounded-lg pl-8 pr-3 py-1.5 border border-white/[0.08] focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {/* Lista Scrollável */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {filteredArtifacts.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-zinc-500">
              Nenhum artefato encontrado.
            </div>
          ) : (
            filteredArtifacts.map((art) => {
              const isSelected = selectedArtifact?.id === art.id;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setSelectedArtifactId(art.id)}
                  className={`w-full text-left p-3 flex items-start gap-2.5 transition cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] border-l-2 border-slate-300"
                      : "hover:bg-white/[0.03] border-l-2 border-transparent"
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{renderIcon(art.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono font-medium text-zinc-200 truncate">
                      {art.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                        {art.type}
                      </span>
                      {art.sizeBytes && (
                        <span className="text-[10px] text-zinc-500">
                          {Math.round(art.sizeBytes / 1024)} KB
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ================= Visualizador Principal de Artefato ================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#090A0F]">
        {selectedArtifact ? (
          <>
            {/* Header do Visualizador */}
            <div className="px-6 py-3.5 border-b border-white/[0.08] bg-[#12151C]/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  {renderIcon(selectedArtifact.type)}
                </div>
                <div>
                  <h3 className="text-xs font-mono font-semibold text-zinc-100 truncate">
                    {selectedArtifact.name}
                  </h3>
                  {selectedArtifact.path && (
                    <p className="text-[11px] text-zinc-500 font-mono truncate">
                      {selectedArtifact.path}
                    </p>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2">
                {selectedArtifact.type === "markdown" || selectedArtifact.type === "report" ? (
                  <div className="flex items-center bg-[#12151C] border border-white/[0.08] rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("rendered")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        viewMode === "rendered"
                          ? "bg-white/[0.12] text-zinc-100 font-medium"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Formatado</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("raw")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        viewMode === "raw"
                          ? "bg-white/[0.12] text-zinc-100 font-medium"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Fonte</span>
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12151C] hover:bg-zinc-800 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
                  title="Copiar Conteúdo"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copiado!" : "Copiar"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12151C] hover:bg-zinc-800 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
                  title="Baixar Arquivo"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>

            {/* Conteúdo Renderizado */}
            <div className="flex-1 overflow-y-auto p-6">
              {viewMode === "rendered" && (selectedArtifact.type === "markdown" || selectedArtifact.type === "report") ? (
                <div className="max-w-4xl mx-auto space-y-4 text-zinc-200 text-sm leading-relaxed font-sans">
                  {selectedArtifact.content.split("\n\n").map((block, idx) => {
                    if (block.startsWith("# ")) {
                      return (
                        <h1 key={idx} className="text-xl font-bold text-zinc-100 border-b border-white/[0.08] pb-2 font-mono">
                          {block.replace("# ", "")}
                        </h1>
                      );
                    }
                    if (block.startsWith("## ")) {
                      return (
                        <h2 key={idx} className="text-base font-semibold text-zinc-100 pt-2 font-mono">
                          {block.replace("## ", "")}
                        </h2>
                      );
                    }
                    if (block.startsWith("### ")) {
                      return (
                        <h3 key={idx} className="text-sm font-semibold text-zinc-200 font-mono">
                          {block.replace("### ", "")}
                        </h3>
                      );
                    }
                    if (block.startsWith("- ") || block.startsWith("* ")) {
                      return (
                        <ul key={idx} className="list-disc list-inside space-y-1 text-zinc-300 text-xs pl-2">
                          {block.split("\n").map((item, itemIdx) => (
                            <li key={itemIdx}>{item.replace(/^[-*]\s+/, "")}</li>
                          ))}
                        </ul>
                      );
                    }
                    if (block.startsWith("```")) {
                      return (
                        <pre key={idx} className="p-3 bg-[#0C0D12] border border-white/[0.08] rounded-lg font-mono text-xs text-zinc-300 overflow-x-auto">
                          {block.replace(/```[a-z]*\n?/g, "")}
                        </pre>
                      );
                    }
                    return (
                      <p key={idx} className="text-zinc-300 text-xs">
                        {block}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <pre className="p-4 bg-[#0C0D12] border border-white/[0.08] rounded-xl font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre leading-relaxed select-text">
                    {selectedArtifact.content}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
            <FileCode className="w-10 h-10 text-zinc-600 mb-2" />
            <h4 className="text-sm font-medium text-zinc-400">Nenhum artefato selecionado</h4>
            <p className="text-xs max-w-sm">
              Quando o Charlie gerar relatórios, análises ou arquivos estruturados, eles aparecerão aqui para leitura e inspeção.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
