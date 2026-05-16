"use client";

import { AppShell } from "@/components/AppShell";

type FlipHtmlEmbedPageProps = {
  moduleTitle: string;
  moduleDescription: string;
  introMessage: string;
  embedSrc: string;
  embedTitle: string;
};

export function FlipHtmlEmbedPage({
  moduleTitle,
  moduleDescription,
  introMessage,
  embedSrc,
  embedTitle,
}: FlipHtmlEmbedPageProps) {
  return (
    <AppShell moduleTitle={moduleTitle} moduleDescription={moduleDescription}>
      <div className="flex flex-col gap-4 lg:h-[calc(100dvh-9.5rem)]">
        <p className="shrink-0 text-sm leading-relaxed text-slate-300">
          {introMessage}
        </p>

        <section
          aria-label={embedTitle}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/40"
        >
          <div className="relative min-h-[75vh] flex-1 overflow-hidden sm:min-h-[80vh] lg:min-h-0">
            <iframe
              src={embedSrc}
              title={embedTitle}
              width="100%"
              height="100%"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0 bg-slate-950"
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
