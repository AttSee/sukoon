/**
 * M9 — Flash Guard analyser (Chrome offscreen document).
 *
 * Receives a tab-capture stream id from the service worker, reads frames as
 * they arrive, downsamples each one to 64×36 and feeds the WCAG flash detector.
 * Nothing leaves this document except per-100 ms summaries to the background.
 */
import { browser } from 'wxt/browser';
import { FlashDetector, type FlashFrameResult } from '../../shared/flash';
import type { FlashSample, ToBackground, ToOffscreen } from '../../shared/messages';

const W = 64;
const H = 36;
const REPORT_EVERY_MS = 100;
/** Keeps the service worker awake (it idles out after 30 s) and lets it rebuild its state if it was suspended. */
const HEARTBEAT_MS = 15_000;

let stream: MediaStream | null = null;
let stopLoop: (() => void) | null = null;
let heartbeat = 0;
let generation = 0;

browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse: (r: unknown) => void) => {
  const msg = raw as ToOffscreen;
  if (msg.type === 'offscreen:start') {
    void start(msg.streamId, msg.tabId).then(
      () => sendResponse(true),
      (error: unknown) => sendResponse({ error: String(error) }),
    );
    return true; // respond only once capture and analysis have initialized
  } else if (msg.type === 'offscreen:stop') {
    stop();
    sendResponse(true);
  }
  return false;
});

function send(message: ToBackground) {
  void browser.runtime.sendMessage(message).catch(() => {});
}

async function start(streamId: string, tabId: number): Promise<void> {
  stop();
  const current = generation;
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxWidth: 640,
        maxHeight: 360,
        maxFrameRate: 30,
      },
    },
  } as unknown as MediaStreamConstraints;
  const captured = await navigator.mediaDevices.getUserMedia(constraints);
  if (current !== generation) {
    for (const track of captured.getTracks()) track.stop();
    throw new Error('Flash Guard start was cancelled');
  }
  stream = captured;
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stop();
    throw new Error('Tab capture returned no video track');
  }
  track.addEventListener('ended', () => {
    stop();
    send({ type: 'flash-guard:ended' });
  });

  const detector = new FlashDetector();
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    stop();
    throw new Error('Flash Guard canvas is unavailable');
  }

  let pending: FlashFrameResult | null = null;
  let lastReport = 0;
  const analyse = (source: CanvasImageSource, t: number) => {
    ctx.drawImage(source, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const result = detector.push({ data, width: W, height: H }, t);
    pending = pending
      ? {
          generalArea: Math.max(pending.generalArea, result.generalArea),
          redArea: Math.max(pending.redArea, result.redArea),
          peakTransitions: Math.max(pending.peakTransitions, result.peakTransitions),
          hazard: pending.hazard || result.hazard,
        }
      : result;
    // Report hazards immediately; otherwise batch to keep messaging light.
    if (pending.hazard || t - lastReport >= REPORT_EVERY_MS) {
      const sample: FlashSample = { ...pending, t: Date.now() };
      send({ type: 'flash-guard:sample', tabId, sample });
      pending = null;
      lastReport = t;
    }
  };

  let running = true;
  stopLoop = () => {
    running = false;
  };

  const Processor = (globalThis as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
  if (Processor) {
    // Every captured frame, with its own timestamp.
    const reader = new Processor({ track }).readable.getReader();
    stopLoop = () => {
      running = false;
      void reader.cancel().catch(() => {});
    };
    const readFrames = async () => {
      try {
        while (running) {
          const { value: frame, done } = await reader.read();
          if (done || !frame) break;
          try {
            if (running) analyse(frame, frame.timestamp / 1000);
          } finally {
            frame.close();
          }
        }
      } finally {
        if (current === generation) {
          stop();
          send({ type: 'flash-guard:ended' });
        }
      }
    };
    void readFrames().catch(() => {});
  } else {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      if (current === generation) stop();
      throw error;
    }
    if (current !== generation) throw new Error('Flash Guard start was cancelled');
    const timer = setInterval(() => running && analyse(video, performance.now()), 1000 / 30);
    stopLoop = () => {
      running = false;
      clearInterval(timer);
    };
  }
  if (current === generation) {
    heartbeat = window.setInterval(() => send({ type: 'flash-guard:heartbeat', tabId, t: Date.now() }), HEARTBEAT_MS);
  }
}

function stop(): void {
  generation++;
  clearInterval(heartbeat);
  stopLoop?.();
  stopLoop = null;
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
}
