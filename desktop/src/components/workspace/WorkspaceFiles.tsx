import React, { useState } from "react";
import { AgentFile, AgentFileCategory } from "../../types";
import {
  Folder,
  File,
  Search,
  Copy,
  Check,
} from "lucide-react";

interface WorkspaceFilesProps {
  files: AgentFile[];
}

export const WorkspaceFiles: React.FC<WorkspaceFilesProps> = ({ files }) => {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    files.length > 0 ? files[0].id : null
  );
  const [categoryFilter, setCategoryFilter] = useState<AgentFileCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedFile = files.find((f) => f.id === selectedFileId) || null;

  const categories: { key: AgentFileCategory | "ALL"; label: string }[] = [
    { key: "ALL", label: "Todos" },
    { key: "analyzed", label: "Analisados" },
    { key: "created", label: "Criados" },
    { key: "modified", label: "Modificados" },
    { key: "deleted", label: "Deletados" },
    { key: "referenced", label: "Referenciados" },
    { key: "generated", label: "Gerados" },
  ];

  const counts: Record<string, number> = {
    ALL: files.length,
    analyzed: files.filter((f) => f.category === "analyzed").length,
    created: files.filter((f) => f.category === "created").length,
    modified: files.filter((f) => f.category === "modified").length,
    deleted: files.filter((f) => f.category === "deleted").length,
    referenced: files.filter((f) => f.category === "referenced").length,
    generated: files.filter((f) => f.category === "generated").length,
  };

  const filteredFiles = files.filter((f) => {
    const matchesCategory = categoryFilter === "ALL" || f.category === categoryFilter;
    const matchesSearch =
      !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.path.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadge = (category: AgentFileCategory) => {
    switch (category) {
      case "created":
      case "generated":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "modified":
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      case "deleted":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "analyzed":
      default:
        return "bg-slate-500/10 text-slate-300 border-slate-500/20";
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* ================= Coluna Principal: Navegador de Arquivos ================= */}
      <div className="flex-1 flex flex-col h-full border-r border-white/[0.08]">
        {/* Barra Superior de Busca e Filtros */}
        <div className="p-4 border-b border-white/[0.08] bg-[#12151C]/50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
              Arquivos da Sessão ({files.length})
            </h3>
            <div className="text-xs text-zinc-500 font-mono">
              {counts.analyzed} analisados • {counts.created} criados • {counts.modified} modificados
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar arquivos ou caminhos..."
                className="w-full bg-[#090A0F] text-xs text-zinc-200 placeholder-zinc-500 rounded-lg pl-8 pr-3 py-1.5 border border-white/[0.08] focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Chips de Categorias */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {categories.map((c) => {
                const count = counts[c.key] || 0;
                if (c.key !== "ALL" && count === 0) return null;
                const active = categoryFilter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategoryFilter(c.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                      active
                        ? "bg-white/[0.12] text-zinc-100 border-white/[0.2]"
                        : "bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:bg-white/[0.06]"
                    }`}
                  >
                    <span>{c.label}</span>
                    <span className="text-[10px] opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lista de Arquivos */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-16 px-4 text-xs text-zinc-500">
              Nenhum arquivo correspondente nesta sessão.
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isSelected = selectedFile?.id === file.id;
              return (
                <div
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`p-3.5 flex items-center justify-between gap-3 transition cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.06] border-l-2 border-slate-300"
                      : "hover:bg-white/[0.02] border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-mono text-zinc-200 truncate">{file.name}</div>
                      <div className="text-[11px] font-mono text-zinc-500 truncate">{file.path}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-medium ${getCategoryBadge(
                        file.category
                      )}`}
                    >
                      {file.category}
                    </span>
                    {file.size && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ================= Painel Direito: Detalhes & Prévia do Arquivo ================= */}
      <div className="w-96 flex flex-col h-full bg-[#12151C]/40 overflow-hidden">
        {selectedFile ? (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 font-mono uppercase tracking-wider">
                Detalhes do Arquivo
              </span>
              <button
                type="button"
                onClick={() => handleCopyPath(selectedFile.path)}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
                title="Copiar caminho completo"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="text-[11px]">{copied ? "Copiado" : "Copiar Caminho"}</span>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">
                  Nome do Arquivo
                </label>
                <div className="text-xs font-mono text-zinc-200 font-medium">
                  {selectedFile.name}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">
                  Caminho no Disco
                </label>
                <div className="text-xs font-mono text-zinc-400 break-all p-2 rounded bg-[#090A0F] border border-white/[0.06]">
                  {selectedFile.path}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">
                    Categoria
                  </label>
                  <span
                    className={`inline-block text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-medium ${getCategoryBadge(
                      selectedFile.category
                    )}`}
                  >
                    {selectedFile.category}
                  </span>
                </div>
                {selectedFile.size && (
                  <div>
                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">
                      Tamanho
                    </label>
                    <div className="text-xs font-mono text-zinc-300">
                      {selectedFile.size} bytes
                    </div>
                  </div>
                )}
              </div>

              {selectedFile.contentPreview && (
                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">
                    Prévia do Conteúdo
                  </label>
                  <pre className="text-xs font-mono text-zinc-300 bg-[#090A0F] border border-white/[0.08] rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed select-text">
                    {selectedFile.contentPreview}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
            <Folder className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-xs">Selecione um arquivo para ver detalhes e metadados.</p>
          </div>
        )}
      </div>
    </div>
  );
};
