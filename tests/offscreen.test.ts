import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addListener, sendMessage } = vi.hoisted(() => ({
  addListener: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('wxt/browser', () => ({ browser: { runtime: { onMessage: { addListener }, sendMessage } } }));

describe('Flash Guard capture startup', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('window', globalThis);
    await import('../src/entrypoints/offscreen/main');
  });

  afterEach(() => {
    addListener.mock.calls[0]?.[0]({ type: 'offscreen:stop' }, {}, vi.fn());
    vi.unstubAllGlobals();
  });

  it('acknowledges successful startup and releases resources on stop', async () => {
    const stopTrack = vi.fn();
    const track = { stop: stopTrack, addEventListener: vi.fn() };
    const captured = { getVideoTracks: () => [track], getTracks: () => [track] };
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(captured) } });
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return {}; } });
    vi.stubGlobal('MediaStreamTrackProcessor', undefined);
    vi.stubGlobal('document', { createElement: () => ({ play }) });
    const listener = addListener.mock.calls[0]![0];
    const reply = vi.fn();
    listener({ type: 'offscreen:start', streamId: 'test', tabId: 1 }, {}, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(true), { interval: 1 });
    expect(play).toHaveBeenCalledOnce();
    listener({ type: 'offscreen:stop' }, {}, vi.fn());
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('acknowledges processor startup while the frame reader is waiting', async () => {
    const stopTrack = vi.fn();
    const cancel = vi.fn();
    const track = { stop: stopTrack, addEventListener: vi.fn() };
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getVideoTracks: () => [track], getTracks: () => [track] }) },
    });
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return {}; } });
    vi.stubGlobal('MediaStreamTrackProcessor', class {
      readable = new ReadableStream({ cancel });
    });
    const listener = addListener.mock.calls[0]![0];
    const reply = vi.fn();
    listener({ type: 'offscreen:start', streamId: 'test', tabId: 1 }, {}, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(true), { interval: 1 });
    listener({ type: 'offscreen:stop' }, {}, vi.fn());
    expect(cancel).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('reports capture failure instead of acknowledging a running guard', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('capture denied')) } });
    const reply = vi.fn();
    const listener = addListener.mock.calls[0]![0];
    expect(listener({ type: 'offscreen:start', streamId: 'test', tabId: 1 }, {}, reply)).toBe(true);
    expect(reply).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'Error: capture denied' }));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('releases a capture that resolves after stop without starting analysis', async () => {
    let resolveCapture!: (stream: unknown) => void;
    const stopTrack = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => new Promise((resolve) => { resolveCapture = resolve; }) },
    });
    const listener = addListener.mock.calls[0]![0];
    const reply = vi.fn();
    listener({ type: 'offscreen:start', streamId: 'test', tabId: 1 }, {}, reply);
    listener({ type: 'offscreen:stop' }, {}, vi.fn());
    resolveCapture({ getTracks: () => [{ stop: stopTrack }] });
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'Error: Flash Guard start was cancelled' }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('releases a capture without video tracks and reports failure', async () => {
    const stopTrack = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [{ stop: stopTrack }] }) },
    });
    const reply = vi.fn();
    addListener.mock.calls[0]![0]({ type: 'offscreen:start', streamId: 'test', tabId: 1 }, {}, reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'Error: Tab capture returned no video track' }));
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
