// Server-Sent Events writer.
//
// Deferred from setup to the AI Assistant owner (docs/05 "Deferred during setup" item 2,
// docs/06 Assistant "Also owns" item 1). Generic on the event type so other request-scoped
// streams can reuse it.
//
// Why SSE and not a socket: assistant replies are request-scoped, one-directional, and
// private to the requester — a socket room would be the wrong shape (docs/02 §5).
import type { Response } from 'express';

export interface SseWriterOptions {
  /**
   * Comment frames keep proxies and load balancers from closing an idle stream.
   * Render's free tier is the reason this defaults to on.
   */
  heartbeatMs?: number;
}

export class SseWriter<TEvent> {
  private closed = false;
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly res: Response,
    options: SseWriterOptions = {},
  ) {
    const heartbeatMs = options.heartbeatMs ?? 15_000;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disables response buffering in nginx-style proxies; harmless everywhere else.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // The client hung up (closed the panel, navigated away, reloaded).
    res.on('close', () => this.markClosed());

    if (heartbeatMs > 0) {
      this.heartbeat = setInterval(() => this.comment('keep-alive'), heartbeatMs);
      // Never hold the process open for a heartbeat.
      this.heartbeat.unref?.();
    }
  }

  /** True once the client disconnected or `close()` ran — stop doing expensive work. */
  get isClosed(): boolean {
    return this.closed || this.res.writableEnded;
  }

  /** Write one `data:` frame. No-op after the stream is closed. */
  send(event: TEvent): void {
    if (this.isClosed) return;
    // JSON.stringify never emits a raw newline, so a single data: line is always valid.
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** Write a comment frame (ignored by EventSource; keeps the connection warm). */
  comment(text: string): void {
    if (this.isClosed) return;
    this.res.write(`: ${text}\n\n`);
  }

  /** End the stream. Safe to call more than once. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.markClosed();
    if (!this.res.writableEnded) {
      this.res.end();
    }
  }

  private markClosed(): void {
    this.closed = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }
}
