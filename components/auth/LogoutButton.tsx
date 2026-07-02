"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { secondaryModuleLinkClass } from "@/components/TutorialLink";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={loading}
      className={`${secondaryModuleLinkClass} disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {loading ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
