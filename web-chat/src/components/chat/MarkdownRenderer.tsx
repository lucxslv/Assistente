import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert max-w-none text-[14px] leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const rawCode = String(children).replace(/\n$/, '');
            const isMultiline = rawCode.includes('\n');

            if (match || isMultiline) {
              return <CodeBlock language={match ? match[1] : 'text'} code={rawCode} />;
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-white/[0.08] text-primary font-mono text-[12px] font-normal"
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="min-w-full divide-y divide-white/[0.08] text-left text-xs">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-[#12141A] font-semibold text-[#F3F4F6]">{children}</thead>;
          },
          th({ children }) {
            return <th className="px-3 py-2 border-b border-white/[0.08]">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 border-b border-white/[0.04] text-[#D1D5DB]">{children}</td>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/60 pl-3.5 my-2.5 text-[#9CA3AF] italic bg-white/[0.02] py-1 rounded-r">
                {children}
              </blockquote>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1 text-[#E5E7EB]">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1 text-[#E5E7EB]">{children}</ol>;
          },
          p({ children }) {
            return <p className="mb-2.5 last:mb-0 text-[#E5E7EB]">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-[#F3F4F6] mt-4 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold text-[#F3F4F6] mt-3.5 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-[#F3F4F6] mt-3 mb-1.5">{children}</h3>;
          },
          hr() {
            return <hr className="my-4 border-white/[0.08]" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
