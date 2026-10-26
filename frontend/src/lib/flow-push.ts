import { flowUploadInfo } from "@/lib/flow-upload";

/** Entrega o pacote direto à extensão do Flow (sem copiar e colar). Responde true quando a extensão confirmou o recebimento. */
export function pushFlowPackage(raw: string, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    let timer = 0;
    const onAck = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.type !== "package-ack") return;
      window.removeEventListener("message", onAck);
      window.clearTimeout(timer);
      resolve(event.data.ok === true);
    };
    window.addEventListener("message", onAck);
    const send = (upload: unknown) => {
      // O relógio só começa depois do token de envio ficar pronto, para a resposta da extensão não chegar "atrasada".
      timer = window.setTimeout(() => { window.removeEventListener("message", onAck); resolve(false); }, 6000);
      try { window.postMessage({ source: "clipgringa-page", type: "flow-package", raw, upload }, window.location.origin); } catch { /* sem janela */ }
    };
    void flowUploadInfo(label).then(send, () => send(null));
  });
}
