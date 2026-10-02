import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#08090C] text-left">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#12141A] border-b border-white/[0.06] text-[11px] font-mono select-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed text-[#E5E7EB]">
        <pre className="!bg-transparent !p-0 !m-0 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
