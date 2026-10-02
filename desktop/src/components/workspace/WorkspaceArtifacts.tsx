import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
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
  Sparkles,
} from "lucide-react";

interface WorkspaceArtifactsProps {
  artifacts: AgentArtifact[];
  initialArtifactId?: string;
  onDeleteArtifact?: (id: string) => void;
}

export const WorkspaceArtifacts: React.FC<WorkspaceArtifactsProps> = ({
  artifacts,
  initialArtifactId,
}) => {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    initialArtifactId || (artifacts.length > 0 ? artifacts[0].id : null)
  );
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialArtifactId) {
      setSelectedArtifactId(initialArtifactId);
    } else if (!selectedArtifactId && artifacts.length > 0) {
      setSelectedArtifactId(artifacts[0].id);
    }
  }, [initialArtifactId, artifacts]);

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
        return <FileText className="w-4 h-4 text-indigo-300" />;
      case "json":
      case "code":
        return <FileCode className="w-4 h-4 text-amber-300" />;
      case "csv":
        return <FileSpreadsheet className="w-4 h-4 text-emerald-300" />;
      case "image":
        return <ImageIcon className="w-4 h-4 text-purple-300" />;
      default:
        return <FileText className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5] select-none">
      {/* ================= Painel Lateral: Lista de Artefatos ================= */}
      <div className="w-64 sm:w-72 border-r border-white/[0.08] bg-[#12151C]/60 flex flex-col h-full shrink-0">
        {/* Header da Barra Lateral */}
        <div className="p-3.5 border-b border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Artefatos Produzidos ({artifacts.length})
            </span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artefato..."
              className="w-full bg-[#090A0F] text-xs text-zinc-200 placeholder-zinc-500 rounded-lg pl-8 pr-3 py-1.5 border border-white/[0.08] focus:outline-none focus:border-white/20"
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
                      ? "bg-white/[0.08] border-l-2 border-indigo-400"
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
                      {art.sizeBytes ? (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {Math.round(art.sizeBytes / 1024)} KB
                        </span>
                      ) : null}
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
            <div className="px-6 py-3 border-b border-white/[0.08] bg-[#12151C]/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  {renderIcon(selectedArtifact.type)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-mono font-semibold text-zinc-100 truncate flex items-center gap-2">
                    <span>{selectedArtifact.name}</span>
                    <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                      {selectedArtifact.type}
                    </span>
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
                {(selectedArtifact.type === "markdown" || selectedArtifact.type === "report") && (
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
                )}

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
                  title="Exportar Arquivo"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar</span>
                </button>
              </div>
            </div>

            {/* Conteúdo Renderizado com ReactMarkdown GFM de Primeira Classe */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 select-text">
              {viewMode === "rendered" && (selectedArtifact.type === "markdown" || selectedArtifact.type === "report") ? (
                <div className="max-w-4xl mx-auto space-y-4 text-zinc-200 text-sm leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-zinc-100 border-b border-white/[0.08] pb-2.5 mt-2 mb-4 font-mono tracking-tight">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-semibold text-zinc-100 border-b border-white/[0.05] pb-1.5 mt-6 mb-3 font-mono flex items-center gap-2">
                          <span className="text-indigo-400">#</span>
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-semibold text-zinc-200 mt-4 mb-2 font-mono">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-xs text-zinc-300 leading-relaxed mb-3">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 text-xs text-zinc-300 mb-3 pl-2">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 text-xs text-zinc-300 mb-3 pl-2 font-mono">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-indigo-400/80 bg-indigo-500/5 px-3 py-2 rounded-r my-3 text-xs italic text-zinc-300">
                          {children}
                        </blockquote>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4 border border-white/[0.08] rounded-xl bg-[#0C0D12]">
                          <table className="w-full text-left text-xs border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-[#12151C] text-zinc-300 font-mono text-[11px] uppercase border-b border-white/[0.08]">
                          {children}
                        </thead>
                      ),
                      tbody: ({ children }) => (
                        <tbody className="divide-y divide-white/[0.04]">
                          {children}
                        </tbody>
                      ),
                      tr: ({ children }) => (
                        <tr className="hover:bg-white/[0.02] transition">
                          {children}
                        </tr>
                      ),
                      th: ({ children }) => (
                        <th className="py-2 px-3 font-semibold text-zinc-200">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="py-2 px-3 text-zinc-300 font-mono text-[11.5px]">
                          {children}
                        </td>
                      ),
                      code: ({ className, children }) => {
                        const isInline = !className;
                        if (isInline) {
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-indigo-300 font-mono text-[11px] border border-white/[0.06]">
                              {children}
                            </code>
                          );
                        }
                        return (
                          <pre className="p-3 bg-[#0C0D12] border border-white/[0.08] rounded-lg font-mono text-[11.5px] text-zinc-300 overflow-x-auto my-3 leading-relaxed">
                            <code>{children}</code>
                          </pre>
                        );
                      },
                      hr: () => (
                        <hr className="my-6 border-white/[0.08]" />
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-zinc-100">
                          {children}
                        </strong>
                      ),
                    }}
                  >
                    {selectedArtifact.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <pre className="p-4 bg-[#0C0D12] border border-white/[0.08] rounded-xl font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre leading-relaxed">
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
