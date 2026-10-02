import React, { useState } from "react";
import { AgentUpload, AgentMedia } from "../../types";
import {
  UploadCloud,
  Image as ImageIcon,
  File,
} from "lucide-react";

interface WorkspaceUploadsMediaProps {
  uploads: AgentUpload[];
  media: AgentMedia[];
}

export const WorkspaceUploadsMedia: React.FC<WorkspaceUploadsMediaProps> = ({
  uploads,
  media,
}) => {
  const [activeTab, setActiveTab] = useState<"media" | "uploads">("media");

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* Header com Switcher */}
      <div className="px-6 py-3.5 border-b border-white/[0.08] bg-[#12151C]/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#090A0F] p-1 rounded-lg border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab("media")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition cursor-pointer ${
                activeTab === "media"
                  ? "bg-white/[0.12] text-zinc-100 font-medium"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Mídia & Capturas ({media.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("uploads")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition cursor-pointer ${
                activeTab === "uploads"
                  ? "bg-white/[0.12] text-zinc-100 font-medium"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Uploads ({uploads.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "media" ? (
          <div>
            {media.length === 0 ? (
              <div className="text-center py-20 px-4 text-xs text-zinc-500 border border-dashed border-white/[0.06] rounded-xl max-w-md mx-auto space-y-2">
                <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="font-medium text-zinc-400">Nenhuma mídia gerada nesta sessão</p>
                <p className="text-[11px] text-zinc-500">
                  Screenshots, diagramas de arquitetura e comparações visuais de UI aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {media.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#12151C] border border-white/[0.08] rounded-xl overflow-hidden hover:border-white/[0.16] transition group"
                  >
                    <div className="aspect-video bg-[#0C0D12] flex items-center justify-center border-b border-white/[0.06] relative overflow-hidden">
                      {item.url || item.base64 ? (
                        <img
                          src={item.url || item.base64}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-zinc-600" />
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="text-xs font-mono font-medium text-zinc-200 truncate">
                        {item.name}
                      </div>
                      {item.description && (
                        <div className="text-[11px] text-zinc-400 truncate">{item.description}</div>
                      )}
                      <div className="text-[10px] text-zinc-500 font-mono pt-1">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {uploads.length === 0 ? (
              <div className="text-center py-20 px-4 text-xs text-zinc-500 border border-dashed border-white/[0.06] rounded-xl max-w-md mx-auto space-y-2">
                <UploadCloud className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="font-medium text-zinc-400">Nenhum upload associado à sessão</p>
                <p className="text-[11px] text-zinc-500">
                  Documentos, especificações ou pacotes zip fornecidos para a tarefa serão catalogados aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-w-3xl">
                {uploads.map((up) => (
                  <div
                    key={up.id}
                    className="bg-[#12151C] border border-white/[0.08] rounded-xl p-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-mono text-zinc-200 truncate">{up.filename}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          {Math.round(up.sizeBytes / 1024)} KB • Fonte: {up.source}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(up.uploadedAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
