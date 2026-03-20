import type { Page } from "playwright";

import type { GeminiSelectorRegistry } from "../selectors/selectors";

import {
  createEmptyAssistantContentSnapshot,
  type AssistantContentSnapshot,
} from "./readLatestAssistantContent";

export interface StreamDomObserverDrainResult {
  queue: AssistantContentSnapshot[];
  latestSnapshot: AssistantContentSnapshot;
}

export class StreamDomObserver {
  constructor(
    private readonly page: Page,
    private readonly selectors: GeminiSelectorRegistry,
  ) {}

  async start(observerId: string, baselineSignature: string): Promise<void> {
    await this.page.evaluate(
      ({ observerId: id, selectors, baselineSignature: baseline }) => {
        type MediaKind = "image" | "video";
        type MediaRenderer = "element" | "canvas";
        type MediaItem = {
          kind: MediaKind;
          url: string | null;
          alt: string | null;
          posterUrl: string | null;
          renderer: MediaRenderer;
          width: number | null;
          height: number | null;
        };
        type Snapshot = {
          text: string;
          media: MediaItem[];
          kind: "text" | "image" | "video" | "mixed" | null;
          hasText: boolean;
          hasMedia: boolean;
          hasContent: boolean;
          signature: string;
        };
        type ObserverStoreEntry = {
          observer: MutationObserver;
          queue: Snapshot[];
          latestSnapshot: Snapshot;
        };
        type StreamWindow = Window &
          typeof globalThis & {
            __geminiStreamObservers?: Record<string, ObserverStoreEntry>;
          };

        const streamWindow = window as StreamWindow;
        const store = (streamWindow.__geminiStreamObservers ??= {});
        store[id]?.observer.disconnect();
        delete store[id];

        const emptySnapshot = (): Snapshot => ({
          text: "",
          media: [],
          kind: null,
          hasText: false,
          hasMedia: false,
          hasContent: false,
          signature: "",
        });

        const normalizeResponseText = (value: string): string =>
          value
            .replace(/\r\n/g, "\n")
            .replace(/^Gemini said(?:\n+|$)/i, "")
            .replace(/^Gemini da noi(?:\n+|$)/i, "")
            .trim();

        const classifyResponseKind = (
          text: string,
          media: MediaItem[],
        ): Snapshot["kind"] => {
          const hasText = text.trim().length > 0;
          const hasImage = media.some((item) => item.kind === "image");
          const hasVideo = media.some((item) => item.kind === "video");

          if (!hasText && !hasImage && !hasVideo) {
            return null;
          }

          if (hasText && !hasImage && !hasVideo) {
            return "text";
          }

          if (!hasText && hasImage && !hasVideo) {
            return "image";
          }

          if (!hasText && !hasImage && hasVideo) {
            return "video";
          }

          return "mixed";
        };

        const createSignature = (text: string, media: MediaItem[]): string => {
          const mediaSignature = media
            .map((item) =>
              [
                item.kind,
                item.url ?? "",
                item.posterUrl ?? "",
                item.renderer,
                item.width ?? "",
                item.height ?? "",
                item.alt ?? "",
              ].join("::"),
            )
            .join("||");

          return `${normalizeResponseText(text)}\n--MEDIA--\n${mediaSignature}`;
        };

        const getTextAttribute = (
          element: Element,
          name: string,
        ): string | null => {
          const value = element.getAttribute(name);
          return value && value.trim().length > 0 ? value : null;
        };

        const shouldIgnoreMediaCandidate = (element: Element): boolean =>
          element.closest(
            [
              "message-actions",
              "response-container-footer",
              ".response-container-footer",
              ".avatar-gutter",
              "bard-avatar",
              "tts-control",
              "thumb-up-button",
              "thumb-down-button",
              "copy-button",
              "share-button",
            ].join(", "),
          ) !== null;

        const dedupeMediaItems = (items: MediaItem[]): MediaItem[] => {
          const seen = new Set<string>();
          const deduped: MediaItem[] = [];

          for (const item of items) {
            const key = [
              item.kind,
              item.url ?? "",
              item.posterUrl ?? "",
              item.renderer,
              item.width ?? "",
              item.height ?? "",
              item.alt ?? "",
            ].join("::");

            if (seen.has(key)) {
              continue;
            }

            seen.add(key);
            deduped.push(item);
          }

          return deduped;
        };

        const readMediaFromRoot = (root: Element): MediaItem[] =>
          dedupeMediaItems(
            Array.from(root.querySelectorAll("img, video, canvas")).reduce<
              MediaItem[]
            >((items, node) => {
              if (shouldIgnoreMediaCandidate(node)) {
                return items;
              }

              if (node instanceof HTMLImageElement) {
                items.push({
                  kind: "image",
                  url: node.currentSrc || getTextAttribute(node, "src"),
                  alt: getTextAttribute(node, "alt"),
                  posterUrl: null,
                  renderer: "element",
                  width:
                    node.naturalWidth ||
                    node.clientWidth ||
                    Number(node.getAttribute("width")) ||
                    null,
                  height:
                    node.naturalHeight ||
                    node.clientHeight ||
                    Number(node.getAttribute("height")) ||
                    null,
                });

                return items;
              }

              if (node instanceof HTMLVideoElement) {
                const source = node.querySelector("source[src]");

                items.push({
                  kind: "video",
                  url:
                    node.currentSrc ||
                    getTextAttribute(node, "src") ||
                    (source instanceof HTMLSourceElement
                      ? getTextAttribute(source, "src")
                      : null),
                  alt: null,
                  posterUrl: getTextAttribute(node, "poster"),
                  renderer: "element",
                  width:
                    node.videoWidth ||
                    node.clientWidth ||
                    Number(node.getAttribute("width")) ||
                    null,
                  height:
                    node.videoHeight ||
                    node.clientHeight ||
                    Number(node.getAttribute("height")) ||
                    null,
                });

                return items;
              }

              if (node instanceof HTMLCanvasElement) {
                const width = node.width || node.clientWidth || null;
                const height = node.height || node.clientHeight || null;

                if (!width && !height) {
                  return items;
                }

                items.push({
                  kind: "image",
                  url: null,
                  alt: null,
                  posterUrl: null,
                  renderer: "canvas",
                  width,
                  height,
                });
              }

              return items;
            }, []),
          );

        const getLastMatch = (selectorList: string[]): Element | null => {
          let bestSelector: string | null = null;
          let bestCount = 0;

          for (const selector of selectorList) {
            const matches = document.querySelectorAll(selector);
            if (matches.length > bestCount) {
              bestSelector = selector;
              bestCount = matches.length;
            }
          }

          if (!bestSelector || bestCount === 0) {
            return null;
          }

          const matches = document.querySelectorAll(bestSelector);
          return matches.item(matches.length - 1);
        };

        const resolveNestedContent = (
          container: Element,
          selectorList: string[],
        ): Element | null => {
          for (const selector of selectorList) {
            const matches = container.querySelectorAll(selector);
            if (matches.length > 0) {
              return matches.item(matches.length - 1);
            }
          }

          return null;
        };

        const readLatestAssistantSnapshot = (): Snapshot => {
          const latestAssistantMessage = getLastMatch(selectors.assistantMessages);
          if (!latestAssistantMessage) {
            return emptySnapshot();
          }

          const target =
            resolveNestedContent(
              latestAssistantMessage,
              selectors.assistantMessageContents,
            ) ?? latestAssistantMessage;
          const rawText =
            target instanceof HTMLElement
              ? target.innerText || target.textContent || ""
              : target.textContent || "";
          const text = normalizeResponseText(rawText);
          const media = readMediaFromRoot(target);
          const kind = classifyResponseKind(text, media);
          const hasText = text.length > 0;
          const hasMedia = media.length > 0;

          return {
            text,
            media,
            kind,
            hasText,
            hasMedia,
            hasContent: hasText || hasMedia,
            signature: createSignature(text, media),
          };
        };

        const latestSnapshot = readLatestAssistantSnapshot();
        const state: ObserverStoreEntry = {
          observer: new MutationObserver(() => {
            const nextSnapshot = readLatestAssistantSnapshot();
            if (nextSnapshot.signature === state.latestSnapshot.signature) {
              return;
            }

            state.latestSnapshot = nextSnapshot;
            state.queue.push(nextSnapshot);
          }),
          queue: [],
          latestSnapshot,
        };

        state.observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });

        if (latestSnapshot.signature !== baseline) {
          state.queue.push(latestSnapshot);
        }

        store[id] = state;
      },
      {
        observerId,
        selectors: this.selectors,
        baselineSignature,
      },
    );
  }

  async drain(observerId: string): Promise<StreamDomObserverDrainResult> {
    const result = await this.page.evaluate(
      ({ observerId: id }) => {
        type MediaKind = "image" | "video";
        type MediaRenderer = "element" | "canvas";
        type MediaItem = {
          kind: MediaKind;
          url: string | null;
          alt: string | null;
          posterUrl: string | null;
          renderer: MediaRenderer;
          width: number | null;
          height: number | null;
        };
        type Snapshot = {
          text: string;
          media: MediaItem[];
          kind: "text" | "image" | "video" | "mixed" | null;
          hasText: boolean;
          hasMedia: boolean;
          hasContent: boolean;
          signature: string;
        };
        type ObserverStoreEntry = {
          observer: MutationObserver;
          queue: Snapshot[];
          latestSnapshot: Snapshot;
        };
        type StreamWindow = Window &
          typeof globalThis & {
            __geminiStreamObservers?: Record<string, ObserverStoreEntry>;
          };

        const streamWindow = window as StreamWindow;
        const state = streamWindow.__geminiStreamObservers?.[id];

        if (!state) {
          return null;
        }

        const queue = state.queue.splice(0, state.queue.length);
        return {
          queue,
          latestSnapshot: state.latestSnapshot,
        };
      },
      { observerId },
    );

    return (
      result ?? {
        queue: [],
        latestSnapshot: createEmptyAssistantContentSnapshot(),
      }
    );
  }

  async stop(observerId: string): Promise<void> {
    await this.page
      .evaluate(({ observerId: id }) => {
        type ObserverStoreEntry = {
          observer: MutationObserver;
        };
        type StreamWindow = Window &
          typeof globalThis & {
            __geminiStreamObservers?: Record<string, ObserverStoreEntry>;
          };

        const streamWindow = window as StreamWindow;
        const state = streamWindow.__geminiStreamObservers?.[id];
        if (!state) {
          return;
        }

        state.observer.disconnect();
        delete streamWindow.__geminiStreamObservers?.[id];
      }, { observerId })
      .catch(() => undefined);
  }
}
