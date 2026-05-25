const AI_SETTINGS_STORAGE_KEY = "chibitek-ai-settings";
const AI_SETTINGS_EVENT = "chibitek:ai-settings-changed";

const MODEL_CATALOG = [
    // GitHub Models
    { provider: "github", model: "openai/gpt-5", label: "GPT-5 (GitHub)" },
    { provider: "github", model: "openai/gpt-5-mini", label: "GPT-5 Mini (GitHub)" },
    { provider: "github", model: "openai/gpt-5-nano", label: "GPT-5 Nano (GitHub)" },
    { provider: "github", model: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (GitHub)" },
    { provider: "github", model: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (GitHub)" },
    // Cerebras public endpoint models kept for token efficiency + availability
    { provider: "cerebras", model: "gpt-oss-120b", label: "GPT OSS 120B (Cerebras)" },
    { provider: "cerebras", model: "zai-glm-4.7", label: "Z.ai GLM 4.7 Preview (Cerebras)" },
].map((item) => ({
    ...item,
    value: `${item.provider}:${item.model}`,
}));

export const AI_MODEL_OPTIONS = MODEL_CATALOG.map((item) => ({
    value: item.value,
    label: item.label,
}));

export const DEFAULT_MODEL_CHOICE = "github:openai/gpt-5-nano";

const LEGACY_MODEL_CHOICE_ALIASES = {
    // Retired Cerebras public endpoints fall forward to the safest production model.
    "cerebras:llama3.1-8b": "cerebras:gpt-oss-120b",
    "cerebras:llama3.1-70b": "cerebras:gpt-oss-120b",
    "cerebras:llama-3.1-70b": "cerebras:gpt-oss-120b",
    "cerebras:llama-3.3-70b": "cerebras:gpt-oss-120b",
    "cerebras:qwen-3-235b-a22b-instruct-2507": "cerebras:gpt-oss-120b",
    "cerebras:qwen-3-32b": "cerebras:gpt-oss-120b",
    "cerebras:qwen-3-14b": "cerebras:gpt-oss-120b",
    "cerebras:deepseek-r1-distill-llama-70b": "cerebras:gpt-oss-120b",

    // Removed GitHub UI options fall back to the lightweight default.
    "github:openai/gpt-4.1": DEFAULT_MODEL_CHOICE,
    "github:openai/gpt-4.1-mini": DEFAULT_MODEL_CHOICE,
    "github:openai/gpt-4o": DEFAULT_MODEL_CHOICE,
    "github:openai/gpt-4o-mini": DEFAULT_MODEL_CHOICE,
    "github:meta/llama-3.3-70b-instruct": DEFAULT_MODEL_CHOICE,
    "github:meta/llama-3.1-70b-instruct": DEFAULT_MODEL_CHOICE,
    "github:mistral/mistral-large": DEFAULT_MODEL_CHOICE,
    "github:mistral/mistral-small": DEFAULT_MODEL_CHOICE,
};

export function normalizeProvider(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "cerebras") return "cerebras";
    if (normalized === "openai") return "openai";
    return "github";
}

export function getModelMeta(modelChoice) {
    const value = String(modelChoice || "").trim();
    return MODEL_CATALOG.find((item) => item.value === value) || null;
}

export function normalizeModelChoice(value) {
    const normalized = String(value || "").trim();
    const aliased = LEGACY_MODEL_CHOICE_ALIASES[normalized] || LEGACY_MODEL_CHOICE_ALIASES[normalized.toLowerCase()] || normalized;
    if (getModelMeta(aliased)) return aliased;
    return DEFAULT_MODEL_CHOICE;
}

export function getDefaultAiSettings() {
    const modelChoice = DEFAULT_MODEL_CHOICE;
    const meta = getModelMeta(modelChoice);
    return {
        modelChoice,
        provider: meta?.provider || "github",
        model: meta?.model || "openai/gpt-5-nano",
    };
}

export function loadAiSettings() {
    if (typeof window === "undefined") return getDefaultAiSettings();

    try {
        const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
        if (!raw) return getDefaultAiSettings();

        const parsed = JSON.parse(raw);
        const directChoice = normalizeModelChoice(parsed?.modelChoice);
        if (getModelMeta(directChoice)) {
            const meta = getModelMeta(directChoice);
            return {
                modelChoice: directChoice,
                provider: meta?.provider,
                model: meta?.model,
            };
        }

        // Backward compatibility for older payload shape: { provider, model }
        const legacyProvider = normalizeProvider(parsed?.provider);
        const legacyModel = String(parsed?.model || "").trim();
        const legacyChoice = normalizeModelChoice(`${legacyProvider}:${legacyModel}`);
        const legacyMeta = getModelMeta(legacyChoice);
        return {
            modelChoice: legacyChoice,
            provider: legacyMeta?.provider,
            model: legacyMeta?.model,
        };
    } catch {
        return getDefaultAiSettings();
    }
}

export function saveAiSettings(next) {
    if (typeof window === "undefined") return;

    const modelChoice = normalizeModelChoice(next?.modelChoice);
    const meta = getModelMeta(modelChoice);
    const payload = {
        modelChoice,
        provider: meta?.provider,
        model: meta?.model,
    };

    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_EVENT, { detail: payload }));
}

export function getAiSettingsEventName() {
    return AI_SETTINGS_EVENT;
}
