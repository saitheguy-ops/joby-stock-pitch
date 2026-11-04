import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown with GFM tables, external links in a new tab, and `~` left alone (no strikethrough). */
export function Markdown({
  children,
  className = "",
  inline = false,
}: {
  children: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? className
          : `prose prose-slate max-w-none prose-a:text-sky-700 dark:prose-invert dark:prose-a:text-sky-400 ${className}`
      }
    >
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        components={{
          p: ({ children }) => (inline ? <>{children}</> : <p>{children}</p>),
          a: ({ href, children }) =>
            href?.startsWith("/") || href?.startsWith("#") ? (
              <a
                href={href}
                className={
                  inline
                    ? "text-sky-700 underline decoration-dotted dark:text-sky-400"
                    : undefined
                }
              >
                {children}
              </a>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  inline
                    ? "text-sky-700 underline decoration-dotted dark:text-sky-400"
                    : undefined
                }
              >
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
