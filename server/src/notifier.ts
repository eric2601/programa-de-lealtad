export type MessageKind = 'auth' | 'utility' | 'marketing';

export interface OutboundMessage {
  to: string;
  kind: MessageKind;
  text: string;
  at: string;
}

/**
 * Adaptador de mensajería. En el MVP guarda los mensajes en una bandeja en memoria y los
 * imprime en consola; en producción se sustituye por el proveedor de WhatsApp (BSP) y SMS.
 * Los mensajes de marketing exigen consentimiento; eso lo valida quien llama, no este módulo.
 */
export class Notifier {
  readonly outbox: OutboundMessage[] = [];
  constructor(private readonly log: boolean = false) {}

  send(to: string, kind: MessageKind, text: string): void {
    const msg: OutboundMessage = { to, kind, text, at: new Date().toISOString() };
    this.outbox.push(msg);
    if (this.outbox.length > 200) this.outbox.shift();
    if (this.log) console.log(`[mensaje ${kind}] ${to}: ${text}`);
  }
}
