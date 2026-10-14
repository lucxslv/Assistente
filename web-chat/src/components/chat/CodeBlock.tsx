import React, { useState, useMemo } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { hapticFeedback } from '../../utils/haptics';

interface CodeBlockProps {
  language: string;
  code: string;
}

const KEYWORD_SET = new Set([
  'def', 'return', 'import', 'from', 'as', 'class', 'if', 'elif', 'else', 'for', 'while',
  'try', 'except', 'finally', 'with', 'async', 'await', 'yield', 'True', 'False', 'None',
  'const', 'let', 'var', 'function', 'export', 'default', 'interface', 'type', 'enum',
  'public', 'private', 'protected', 'readonly', 'new', 'throw', 'catch', 'switch', 'case',
  'break', 'continue', 'true', 'false', 'null', 'undefined', 'fn', 'pub', 'struct', 'impl',
  'match', 'mut', 'use', 'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE',
  'JOIN', 'LEFT', 'INNER', 'ORDER', 'BY', 'GROUP', 'LIMIT', 'CREATE', 'TABLE', 'ALTER',
]);

function tokenizeLine(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--')) {
    return [
      <span key="comment" className="text-[#6B7280] italic">
        {line}
      </span>,
    ];
  }

  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index));
    }
    const tok = match[0];
    if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
      nodes.push(
        <span key={match.index} className="text-emerald-300">
          {tok}
        </span>
      );
    } else if (/^\d/.test(tok)) {
      nodes.push(
        <span key={match.index} className="text-amber-300">
          {tok}
        </span>
      );
    } else if (KEYWORD_SET.has(tok)) {
      nodes.push(
        <span key={match.index} className="text-sky-400 font-semibold">
          {tok}
        </span>
      );
    } else if (line[match.index + tok.length] === '(') {
      nodes.push(
        <span key={match.index} className="text-indigo-300">
          {tok}
        </span>
      );
    } else {
      nodes.push(tok);
    }
    lastIdx = match.index + tok.length;
  }

  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx));
  }

  return nodes;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => code.split('\n'), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      hapticFeedback.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
    <div className="relative my-3 rounded-xl overflow-hidden border border-white/[0.08] bg-[#08090C] text-left max-w-full min-w-0">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#12141A] border-b border-white/[0.06] text-[11px] font-mono select-none">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            {language || 'code'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="min-h-[32px] sm:min-h-0 flex items-center gap-1.5 px-2.5 py-1 sm:py-0.5 rounded-lg text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] active:text-white hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-95 transition-all cursor-pointer"
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
          <code>
            {lines.map((line, idx) => (
              <div key={idx} className="table-row">
                {lines.length > 3 && (
                  <span className="table-cell pr-3 select-none text-right text-[10px] text-[#4B5563]">
                    {idx + 1}
                  </span>
                )}
                <span className="table-cell whitespace-pre">{tokenizeLine(line)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
};
