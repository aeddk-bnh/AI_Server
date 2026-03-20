import type { Locator, Page } from "playwright";

import { GeminiWebError } from "../errors/GeminiWebError";
import {
  resolveFirstLocator,
  waitForFirstLocator,
  type GeminiSelectorRegistry,
} from "../selectors/selectors";
import { log } from "../telemetry/Logger";
import type { LoggerLike, GeminiModelOption } from "../types/public";

interface RawModelOption {
  label: string;
  description: string | null;
  enabled: boolean;
  selected: boolean;
  testId: string | null;
}

const KNOWN_MODEL_ALIASES = [
  {
    id: "fast",
    aliases: ["fast", "quick", "nhanh"],
    testId: "bard-mode-option-fast",
  },
  {
    id: "thinking",
    aliases: ["thinking", "think", "reasoning", "suy luan", "suyluan"],
    testId: "bard-mode-option-thinking",
  },
  {
    id: "pro",
    aliases: ["pro", "professional", "advanced", "gemini pro", "3.1 pro"],
    testId: "bard-mode-option-pro",
  },
] as const;

export class ModelPicker {
  private readonly optionSelectorList: string;

  constructor(
    private readonly selectors: GeminiSelectorRegistry,
    private readonly pollIntervalMs: number,
    private readonly logger: LoggerLike,
  ) {
    this.optionSelectorList = this.selectors.modelPickerOptions.join(", ");
  }

  async getSelectedModel(
    page: Page,
    timeoutMs: number,
  ): Promise<GeminiModelOption | null> {
    const button = await this.resolvePickerButton(page, timeoutMs);

    if (!button) {
      return null;
    }

    return readCurrentModelFromButton(button.locator);
  }

  async listModels(page: Page, timeoutMs: number): Promise<GeminiModelOption[]> {
    const button = await this.requirePickerButton(page, timeoutMs);
    const menuWasOpen = await this.isMenuOpen(page, button.locator);

    if (!menuWasOpen) {
      await button.locator.click();
    }

    try {
      const menu = await this.requireVisibleMenu(page, timeoutMs, button.locator);
      const options = await this.readOptions(menu.locator);

      log(this.logger, "debug", "model_picker_options_read", {
        count: options.length,
        options: options.map((option) => ({
          id: option.id,
          enabled: option.enabled,
          selected: option.selected,
        })),
      });

      return options;
    } finally {
      if (!menuWasOpen) {
        await this.closeMenu(page, button.locator);
      }
    }
  }

  async ensureSelected(
    page: Page,
    requestedModel: string,
    timeoutMs: number,
  ): Promise<GeminiModelOption> {
    const requestedValue = requestedModel.trim();

    if (!requestedValue) {
      throw new GeminiWebError("Model name must not be empty", {
        code: "MODEL_NOT_FOUND",
        phase: "model_select",
        retryable: false,
      });
    }

    const current = await this.getSelectedModel(page, Math.min(timeoutMs, 2_000));
    if (current && matchesRequestedModel(current, requestedValue)) {
      log(this.logger, "debug", "model_selection_skipped", {
        requestedModel,
        currentModel: current.id,
      });
      return current;
    }

    const button = await this.requirePickerButton(page, timeoutMs);
    if (!(await this.isMenuOpen(page, button.locator))) {
      await button.locator.click();
    }

    const menu = await this.requireVisibleMenu(page, timeoutMs, button.locator);
    const options = await this.readOptions(menu.locator);
    const target = findMatchingModelOption(options, requestedValue);

    if (!target) {
      await this.closeMenu(page, button.locator);

      throw new GeminiWebError(`Gemini model "${requestedModel}" was not found`, {
        code: "MODEL_NOT_FOUND",
        phase: "model_select",
        retryable: false,
        details: {
          requestedModel,
          availableModels: options.map((option) => option.id),
        },
      });
    }

    if (!target.enabled) {
      await this.closeMenu(page, button.locator);

      throw new GeminiWebError(`Gemini model "${target.label}" is not available`, {
        code: "MODEL_UNAVAILABLE",
        phase: "model_select",
        retryable: false,
        details: {
          requestedModel,
          modelId: target.id,
          label: target.label,
        },
      });
    }

    if (target.selected) {
      await this.closeMenu(page, button.locator);
      return target;
    }

    const optionLocator = this.resolveOptionLocator(menu.locator, target);
    await optionLocator.click();

    const selected = await this.waitForSelection(page, requestedValue, timeoutMs);
    if (!selected) {
      throw new GeminiWebError(`Gemini model "${requestedModel}" did not apply in time`, {
        code: "MODEL_SELECTION_FAILED",
        phase: "model_select",
        retryable: true,
        details: {
          requestedModel,
          modelId: target.id,
        },
      });
    }

    log(this.logger, "info", "model_selected", {
      requestedModel,
      modelId: selected.id,
      label: selected.label,
    });

    return {
      ...target,
      ...selected,
      description: target.description ?? selected.description,
      testId: target.testId ?? selected.testId,
      selected: true,
    };
  }

  private async resolvePickerButton(
    page: Page,
    timeoutMs: number,
  ): Promise<Awaited<ReturnType<typeof waitForFirstLocator>> | null> {
    return waitForFirstLocator(page, this.selectors.modelPickerButton, {
      state: "visible",
      timeoutMs: Math.min(timeoutMs, 3_000),
      pollIntervalMs: this.pollIntervalMs,
    });
  }

  private async requirePickerButton(
    page: Page,
    timeoutMs: number,
  ): Promise<NonNullable<Awaited<ReturnType<typeof waitForFirstLocator>>>> {
    const button = await this.resolvePickerButton(page, timeoutMs);

    if (!button) {
      throw new GeminiWebError("Could not find the Gemini model picker", {
        code: "MODEL_PICKER_NOT_FOUND",
        phase: "model_select",
        retryable: true,
      });
    }

    return button;
  }

  private async requireVisibleMenu(
    page: Page,
    timeoutMs: number,
    button?: Locator,
  ): Promise<NonNullable<Awaited<ReturnType<typeof waitForFirstLocator>>>> {
    const controlledMenu = await this.resolveControlledMenu(page, button);
    if (controlledMenu) {
      const deadline = Date.now() + Math.min(timeoutMs, 3_000);

      while (Date.now() <= deadline) {
        if (await controlledMenu.locator.isVisible().catch(() => false)) {
          return controlledMenu;
        }

        await page.waitForTimeout(this.pollIntervalMs);
      }
    }

    const menu = await waitForFirstLocator(page, this.selectors.modelPickerMenu, {
      state: "visible",
      timeoutMs: Math.min(timeoutMs, 3_000),
      pollIntervalMs: this.pollIntervalMs,
    });

    if (!menu) {
      throw new GeminiWebError("Could not open the Gemini model picker menu", {
        code: "MODEL_PICKER_NOT_FOUND",
        phase: "model_select",
        retryable: true,
      });
    }

    return menu;
  }

  private async isMenuOpen(page: Page, button?: Locator): Promise<boolean> {
    const controlledMenu = await this.resolveControlledMenu(page, button);
    if (controlledMenu) {
      return controlledMenu.locator.isVisible().catch(() => false);
    }

    return (await resolveFirstLocator(page, this.selectors.modelPickerMenu, {
      state: "visible",
    })) !== null;
  }

  private async closeMenu(page: Page, button: Locator): Promise<void> {
    if (!(await this.isMenuOpen(page, button))) {
      return;
    }

    await page.keyboard.press("Escape").catch(() => undefined);

    const deadline = Date.now() + 2_000;
    while (Date.now() <= deadline) {
      if (!(await this.isMenuOpen(page, button))) {
        return;
      }

      await page.waitForTimeout(this.pollIntervalMs);
    }

    const expanded = await button.getAttribute("aria-expanded").catch(() => null);
    if (expanded === "true") {
      await button.click().catch(() => undefined);
    }
  }

  private async readOptions(menu: Locator): Promise<GeminiModelOption[]> {
    const rawOptions = await menu
      .evaluate<RawModelOption[], string>((menuElement, optionSelectorList) => {
        const collapseWhitespace = (value: string): string =>
          value.replace(/\s+/g, " ").trim();

        return [...menuElement.querySelectorAll(optionSelectorList)].map((element) => {
          const labelNode =
            element.querySelector(".mode-title") ??
            element.querySelector(".title-and-description") ??
            element;
          const descriptionNode =
            element.querySelector(".mode-desc") ??
            element.querySelector("[data-test-id*='description' i]");
          const label = collapseWhitespace(labelNode.textContent ?? "");
          const description = collapseWhitespace(descriptionNode?.textContent ?? "");
          const htmlElement = element as HTMLElement;

          return {
            label,
            description: description.length > 0 ? description : null,
            enabled:
              !htmlElement.hasAttribute("disabled") &&
              htmlElement.getAttribute("aria-disabled") !== "true",
            selected:
              htmlElement.getAttribute("aria-current") === "true" ||
              htmlElement.classList.contains("is-selected"),
            testId: htmlElement.getAttribute("data-test-id"),
          };
        });
      },
        this.optionSelectorList,
      )
      .catch(() => []);

    return rawOptions
      .filter((option) => option.label.length > 0)
      .map((option) => ({
        id: deriveModelId(option.testId, option.label),
        label: option.label,
        description: option.description,
        enabled: option.enabled,
        selected: option.selected,
        testId: option.testId,
      }));
  }

  private resolveOptionLocator(menu: Locator, option: GeminiModelOption): Locator {
    if (option.testId) {
      return menu.locator(`button[data-test-id="${option.testId}"]`).first();
    }

    return menu.locator(this.optionSelectorList).filter({
      hasText: option.label,
    }).first();
  }

  private async waitForSelection(
    page: Page,
    requestedModel: string,
    timeoutMs: number,
  ): Promise<GeminiModelOption | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const selected = await this.getSelectedModel(page, Math.min(timeoutMs, 1_000));
      const menuOpen = await this.isMenuOpen(page);

      if (selected && matchesRequestedModel(selected, requestedModel) && !menuOpen) {
        return selected;
      }

      await page.waitForTimeout(this.pollIntervalMs);
    }

    return null;
  }

  private async resolveControlledMenu(
    page: Page,
    button?: Locator,
  ): Promise<Awaited<ReturnType<typeof resolveFirstLocator>> | null> {
    if (!button) {
      return null;
    }

    const menuId = await button.getAttribute("aria-controls").catch(() => null);
    if (!menuId) {
      return null;
    }

    const locator = page.locator(`[id="${menuId}"]`).first();
    if (!(await locator.count().catch(() => 0))) {
      return null;
    }

    return {
      locator,
      selector: `[id="${menuId}"]`,
    };
  }
}

async function readCurrentModelFromButton(
  button: Locator,
): Promise<GeminiModelOption | null> {
  const raw = await button
    .evaluate((element) => {
      const labelContainer =
        element.querySelector('[data-test-id="logo-pill-label-container"]') ??
        element.querySelector(".logo-pill-label-container") ??
        element.querySelector(".mdc-button__label") ??
        element;
      const labelNode = labelContainer.querySelector("span") ?? labelContainer;
      const htmlElement = element as HTMLElement;

      return {
        label: (labelNode.textContent ?? "").replace(/\s+/g, " ").trim(),
        enabled:
          !htmlElement.hasAttribute("disabled") &&
          htmlElement.getAttribute("aria-disabled") !== "true",
      };
    })
    .catch(() => null);

  if (!raw || !raw.label) {
    return null;
  }

  return {
    id: deriveModelId(null, raw.label),
    label: raw.label,
    description: null,
    enabled: raw.enabled,
    selected: true,
    testId: null,
  };
}

function findMatchingModelOption(
  options: GeminiModelOption[],
  requestedModel: string,
): GeminiModelOption | undefined {
  return options.find((option) => matchesRequestedModel(option, requestedModel));
}

function matchesRequestedModel(
  option: Pick<GeminiModelOption, "id" | "label" | "testId">,
  requestedModel: string,
): boolean {
  const normalizedRequest = normalizeModelText(requestedModel);
  const normalizedLabel = normalizeModelText(option.label);
  const normalizedId = normalizeModelText(option.id);
  const normalizedTestId = normalizeModelText(option.testId ?? "");

  if (!normalizedRequest) {
    return false;
  }

  if (
    normalizedRequest === normalizedId ||
    normalizedRequest === normalizedLabel ||
    normalizedTestId.includes(normalizedRequest)
  ) {
    return true;
  }

  return KNOWN_MODEL_ALIASES.some((entry) => {
    if (normalizedId !== entry.id && normalizedTestId !== normalizeModelText(entry.testId)) {
      return false;
    }

    return entry.aliases.some(
      (alias) => normalizeModelText(alias) === normalizedRequest,
    );
  });
}

function deriveModelId(testId: string | null, label: string): string {
  const testIdMatch = testId?.match(/bard-mode-option-(.+)$/i);
  if (testIdMatch?.[1]) {
    return normalizeModelKey(testIdMatch[1]);
  }

  const normalizedLabel = normalizeModelText(label);
  const knownMatch = KNOWN_MODEL_ALIASES.find((entry) =>
    entry.aliases.some((alias) => normalizeModelText(alias) === normalizedLabel),
  );

  if (knownMatch) {
    return knownMatch.id;
  }

  return normalizeModelKey(label);
}

function normalizeModelKey(value: string): string {
  return normalizeModelText(value).replace(/\s+/g, "-");
}

function normalizeModelText(value: string): string {
  return collapseWhitespace(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s.-]+/gu, " "),
  ).toLowerCase();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
