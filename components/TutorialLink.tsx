import Link from "next/link";

export const secondaryModuleLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700";

type ModuleNavLinkProps = {
  className?: string;
};

export function ProyectoLink({ className }: ModuleNavLinkProps) {
  return (
    <Link href="/proyecto" className={`${secondaryModuleLinkClass} ${className ?? ""}`}>
      Proyecto
    </Link>
  );
}

export function TutorialLink({ className }: ModuleNavLinkProps) {
  return (
    <Link href="/tutorial" className={`${secondaryModuleLinkClass} ${className ?? ""}`}>
      Tutorial
    </Link>
  );
}
