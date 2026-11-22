declare module 'ws' {
  export class WebSocket {
    constructor(
      address: string | URL,
      options?: {
        headers?: Record<string, string>;
        perMessageDeflate?: boolean;
        handshakeTimeout?: number;
      },
    );
    once(event: 'open', listener: () => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    once(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    once(
      event: 'unexpected-response',
      listener: (request: unknown, response: { statusCode?: number }) => void,
    ): this;
    on(event: 'message', listener: (data: Buffer | Buffer[], isBinary: boolean) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    send(data: string): void;
    close(): void;
    terminate(): void;
    removeAllListeners(): this;
  }
}
