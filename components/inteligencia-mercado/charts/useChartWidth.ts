"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mide el ancho real del contenedor para renderizar SVG en píxeles nítidos
 * (sin deformar trazos ni puntos). Devuelve un ref para el wrapper y el ancho.
 */
export function useChartWidth(fallback = 560) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.round(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
