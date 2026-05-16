const PROYECTO_PDF_HREF = "/Pickup_4x4_Intelligence.pdf";
const TUTORIAL_PDF_HREF = "/Manual-de-Uso-Pickup-4x4-Intelligence.pdf";

const baseClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700";

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4 shrink-0"}
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

type PdfMenuLinkProps = {
  href: string;
  label: string;
  collapsedInitials: string;
  title: string;
  className?: string;
  iconOnly?: boolean;
};

function PdfMenuLink({
  href,
  label,
  collapsedInitials,
  title,
  className,
  iconOnly = false,
}: PdfMenuLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`${baseClass} ${iconOnly ? "h-9 w-9 p-0" : "px-4 py-2"} ${className ?? ""}`}
    >
      {iconOnly ? (
        <span className="text-xs font-bold">{collapsedInitials}</span>
      ) : (
        <>
          <PdfIcon />
          <span>{label}</span>
        </>
      )}
    </a>
  );
}

type SidebarPdfLinkProps = {
  className?: string;
  iconOnly?: boolean;
};

/** PDF del proyecto (presentación). */
export function ProyectoLink({ className, iconOnly = false }: SidebarPdfLinkProps) {
  return (
    <PdfMenuLink
      href={PROYECTO_PDF_HREF}
      label="Proyecto"
      collapsedInitials="PR"
      title="Abrir proyecto (PDF)"
      className={className}
      iconOnly={iconOnly}
    />
  );
}

/** Manual de uso. */
export function TutorialLink({ className, iconOnly = false }: SidebarPdfLinkProps) {
  return (
    <PdfMenuLink
      href={TUTORIAL_PDF_HREF}
      label="Tutorial"
      collapsedInitials="TU"
      title="Abrir manual de uso (PDF)"
      className={className}
      iconOnly={iconOnly}
    />
  );
}
