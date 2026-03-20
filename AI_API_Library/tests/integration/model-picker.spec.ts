import type { Page } from "playwright";
import { expect, test } from "@playwright/test";

import { GeminiWebError } from "../../src/errors/GeminiWebError";
import { ModelPicker } from "../../src/model/ModelPicker";
import { defaultSelectors } from "../../src/selectors/selectors";
import { NoopLogger } from "../../src/telemetry/Logger";

const logger = new NoopLogger();

test("lists Gemini model options from the picker menu", async ({ page }) => {
  await setModelPickerDom(page, {
    currentModelId: "fast",
    disabledModelIds: ["pro"],
  });

  const picker = new ModelPicker(defaultSelectors, 10, logger);
  const models = await picker.listModels(page, 1_000);

  expect(models).toEqual([
    {
      id: "fast",
      label: "Fast",
      description: "Answers quickly",
      enabled: true,
      selected: true,
      testId: "bard-mode-option-fast",
    },
    {
      id: "thinking",
      label: "Thinking",
      description: "Solves complex problems",
      enabled: true,
      selected: false,
      testId: "bard-mode-option-thinking",
    },
    {
      id: "pro",
      label: "Pro",
      description: "Advanced math and code with 3.1 Pro",
      enabled: false,
      selected: false,
      testId: "bard-mode-option-pro",
    },
  ]);
});

test("selects a new Gemini model and updates the current label", async ({ page }) => {
  await setModelPickerDom(page, {
    currentModelId: "fast",
  });

  const picker = new ModelPicker(defaultSelectors, 10, logger);
  const selected = await picker.ensureSelected(page, "thinking", 1_000);
  const current = await picker.getSelectedModel(page, 1_000);

  expect(selected).toMatchObject({
    id: "thinking",
    label: "Thinking",
    selected: true,
  });
  expect(current).toMatchObject({
    id: "thinking",
    label: "Thinking",
  });
});

test("rejects disabled Gemini models with a clear error", async ({ page }) => {
  await setModelPickerDom(page, {
    currentModelId: "fast",
    disabledModelIds: ["pro"],
  });

  const picker = new ModelPicker(defaultSelectors, 10, logger);
  const error = await picker.ensureSelected(page, "pro", 1_000).catch((reason) => reason);

  expect(error).toBeInstanceOf(GeminiWebError);
  expect(error).toMatchObject({
    code: "MODEL_UNAVAILABLE",
    phase: "model_select",
  });
});

async function setModelPickerDom(
  page: Page,
  options: {
    currentModelId: "fast" | "thinking" | "pro";
    disabledModelIds?: Array<"fast" | "thinking" | "pro">;
  },
): Promise<void> {
  const disabledModelIds = options.disabledModelIds ?? [];

  await page.setContent(`
    <div class="model-picker-container">
      <button
        data-test-id="bard-mode-menu-button"
        aria-label="Open mode picker"
        aria-haspopup="menu"
        aria-expanded="false"
        class="mdc-button"
      >
        <span class="mdc-button__label">${labelForModel(options.currentModelId)}</span>
      </button>
    </div>

    <div
      class="mat-mdc-menu-panel gds-mode-switch-menu"
      role="menu"
      hidden
    >
      ${buildModelOptionHtml("fast", options.currentModelId, disabledModelIds)}
      ${buildModelOptionHtml("thinking", options.currentModelId, disabledModelIds)}
      ${buildModelOptionHtml("pro", options.currentModelId, disabledModelIds)}
    </div>

    <script>
      const button = document.querySelector('[data-test-id="bard-mode-menu-button"]');
      const label = button.querySelector('.mdc-button__label');
      const menu = document.querySelector('[role="menu"]');
      const descriptions = {
        fast: 'Answers quickly',
        thinking: 'Solves complex problems',
        pro: 'Advanced math and code with 3.1 Pro',
      };
      const labels = {
        fast: 'Fast',
        thinking: 'Thinking',
        pro: 'Pro',
      };

      function setMenuOpen(open) {
        if (open) {
          menu.removeAttribute('hidden');
        } else {
          menu.setAttribute('hidden', '');
        }

        button.setAttribute('aria-expanded', String(open));
      }

      button.addEventListener('click', () => {
        setMenuOpen(menu.hasAttribute('hidden'));
      });

      document.querySelectorAll('[role="menuitem"]').forEach((option) => {
        option.addEventListener('click', () => {
          if (option.getAttribute('aria-disabled') === 'true') {
            return;
          }

          const selectedId = option.getAttribute('data-test-id').replace('bard-mode-option-', '');

          document.querySelectorAll('[role="menuitem"]').forEach((candidate) => {
            candidate.setAttribute('aria-current', 'false');
            candidate.classList.remove('is-selected');
          });

          option.setAttribute('aria-current', 'true');
          option.classList.add('is-selected');
          label.textContent = labels[selectedId];
          setMenuOpen(false);
        });
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          setMenuOpen(false);
        }
      });
    </script>
  `);
}

function buildModelOptionHtml(
  modelId: "fast" | "thinking" | "pro",
  currentModelId: "fast" | "thinking" | "pro",
  disabledModelIds: Array<"fast" | "thinking" | "pro">,
): string {
  const disabled = disabledModelIds.includes(modelId);
  const selected = currentModelId === modelId;

  return `
    <button
      role="menuitem"
      data-mode-id="${modelId}"
      data-test-id="bard-mode-option-${modelId}"
      class="mat-mdc-menu-item bard-mode-list-button${selected ? " is-selected" : ""}"
      aria-current="${selected ? "true" : "false"}"
      aria-disabled="${disabled ? "true" : "false"}"
      ${disabled ? "disabled" : ""}
    >
      <span class="mode-title">${labelForModel(modelId)}</span>
      <span class="mode-desc">${descriptionForModel(modelId)}</span>
    </button>
  `;
}

function labelForModel(modelId: "fast" | "thinking" | "pro"): string {
  if (modelId === "fast") {
    return "Fast";
  }

  if (modelId === "thinking") {
    return "Thinking";
  }

  return "Pro";
}

function descriptionForModel(modelId: "fast" | "thinking" | "pro"): string {
  if (modelId === "fast") {
    return "Answers quickly";
  }

  if (modelId === "thinking") {
    return "Solves complex problems";
  }

  return "Advanced math and code with 3.1 Pro";
}
