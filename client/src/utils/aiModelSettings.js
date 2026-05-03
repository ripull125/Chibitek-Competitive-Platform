const AI_SETTINGS_STORAGE_KEY = "chibitek-ai-settings";
const AI_SETTINGS_EVENT = "chibitek:ai-settings-changed";

const MODEL_CATALOG = [
    // GitHub Models
    { provider: "github", model: "openai/gpt-5", label: "GPT-5 (GitHub)" },
    { provider: "github", model: "openai/gpt-5-mini", label: "GPT-5 Mini (GitHub)" },
    { provider: "github", model: "openai/gpt-5-nano", label: "GPT-5 Nano (GitHub)" },
    { provider: "github", model: "openai/gpt-4.1", label: "GPT-4.1 (GitHub)" },
    { provider: "github", model: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini (GitHub)" },
    { provider: "github", model: "openai/gpt-4o", label: "GPT-4o (GitHub)" },
    { provider: "github", model: "openai/gpt-4o-mini", label: "GPT-4o Mini (GitHub)" },
    { provider: "github", model: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (GitHub)" },
    { provider: "github", model: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (GitHub)" },
    { provider: "github", model: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct (GitHub)" },
    { provider: "github", model: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B Instruct (GitHub)" },
    { provider: "github", model: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B Instruct (GitHub)" },
    { provider: "github", model: "mistral/mistral-large", label: "Mistral Large (GitHub)" },
    { provider: "github", model: "mistral/mistral-small", label: "Mistral Small (GitHub)" },
    // Cerebras
    { provider: "cerebras", model: "llama3.1-70b", label: "Llama 3.1 70B (Cerebras)" },
    { provider: "cerebras", model: "llama3.1-8b", label: "Llama 3.1 8B (Cerebras)" },
    { provider: "cerebras", model: "llama-3.3-70b", label: "Llama 3.3 70B (Cerebras)" },
    { provider: "cerebras", model: "qwen-3-32b", label: "Qwen 3 32B (Cerebras)" },
    { provider: "cerebras", model: "qwen-3-14b", label: "Qwen 3 14B (Cerebras)" },
    { provider: "cerebras", model: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B (Cerebras)" },
].map((item) => ({
    ...item,
    value: `${item.provider}:${item.model}`,
}));

export const AI_MODEL_OPTIONS = MODEL_CATALOG.map((item) => ({
    value: item.value,
    label: item.label,
}));

export const DEFAULT_MODEL_CHOICE = "github:openai/gpt-5-nano";

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
    if (getModelMeta(normalized)) return normalized;
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
