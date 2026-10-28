"use client";

import { useEffect } from "react";

/**
 * Dissuasão no navegador: bloqueia atalhos de "ver código-fonte" / DevTools e o menu de
 * contexto fora de campos de texto. Não é segurança real (o navegador sempre recebe o
 * JavaScript da página), mas impede cópia casual do código e arrastar mídia para fora.
 */
export function CodeGuard() {
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("input, textarea, [contenteditable='true']");

    const onContextMenu = (event: MouseEvent) => {
      if (!isField(event.target)) event.preventDefault();
    };
    const onDragStart = (event: DragEvent) => {
      if (event.target instanceof Element && event.target.closest("img, video")) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const blocked =
        key === "f12" ||
        (ctrl && event.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
        (ctrl && event.altKey && ["i", "j", "u"].includes(key)) ||
        (ctrl && ["u", "s"].includes(key) && !isField(event.target));
      if (blocked) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
