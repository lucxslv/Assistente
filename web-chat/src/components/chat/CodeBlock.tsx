import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { hapticFeedback } from '../../utils/haptics';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      hapticFeedback.success();
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
      hapticFeedback.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#08090C] text-left max-w-full">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#12141A] border-b border-white/[0.06] text-[11px] font-mono select-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="min-h-[36px] sm:min-h-0 flex items-center gap-1.5 px-2.5 py-1 sm:py-0.5 rounded-lg text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] active:text-white hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-95 transition-all cursor-pointer"
          title="Copiar código"
          aria-label="Copiar código"
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
      <div className="p-3.5 sm:p-4 overflow-x-auto text-xs sm:text-[13px] font-mono leading-relaxed text-[#E5E7EB] overscroll-x-contain">
        <pre className="!bg-transparent !p-0 !m-0 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
