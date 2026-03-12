export const WEBLLM_CUSTOM_QWEN35_ID = "Qwen3.5-Custom-MLC";

const modelVersion = "v0_2_80";
const modelLibURLPrefix = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/";

const prebuiltAppConfig = {
  useIndexedDBCache: false,
  model_list: [
    {
      model: "https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC",
      model_id: "Qwen3-0.6B-q4f16_1-MLC",
      model_lib: `${modelLibURLPrefix}${modelVersion}/Qwen3-0.6B-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
      vram_required_MB: 1403.34,
      low_resource_required: true,
      overrides: {
        context_window_size: 4096
      }
    },
    {
      model: "https://huggingface.co/mlc-ai/gemma-2-2b-it-q4f16_1-MLC",
      model_id: "gemma-2-2b-it-q4f16_1-MLC",
      model_lib: `${modelLibURLPrefix}${modelVersion}/gemma-2-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
      vram_required_MB: 1895.3,
      low_resource_required: false,
      required_features: ["shader-f16"],
      overrides: {
        context_window_size: 4096
      }
    }
  ]
};

const preferredPresets = [
  {
    modelId: "Qwen3-0.6B-q4f16_1-MLC",
    label: "Qwen3 0.6B",
    note: "Opcion WebLLM mas cercana al Qwen ligero actual.",
    family: "qwen"
  },
  {
    modelId: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B",
    note: "Opcion WebLLM mas cercana al modelo Gemma local actual.",
    family: "gemma"
  },
  {
    modelId: WEBLLM_CUSTOM_QWEN35_ID,
    label: "Qwen3.5 / Custom MLC",
    note: "No viene precompilado en el catalogo actual de WebLLM. Requiere artefactos MLC propios.",
    family: "qwen",
    custom: true
  }
];

function findRecord(modelId) {
  return prebuiltAppConfig.model_list.find((record) => record.model_id === modelId) || null;
}

export function getWebLLMModelChoices() {
  return preferredPresets.map((preset) => {
    const record = findRecord(preset.modelId);
    return {
      ...preset,
      supported: Boolean(record) || Boolean(preset.custom),
      builtIn: Boolean(record),
      record
    };
  });
}

export function getDefaultWebLLMModel() {
  return getWebLLMModelChoices().find((item) => item.builtIn)?.modelId || "";
}

export function getWebLLMModelLabel(modelId) {
  const choice = getWebLLMModelChoices().find((item) => item.modelId === modelId);
  return choice?.label || modelId || "WebLLM";
}

export function isCustomWebLLMModel(modelId) {
  return modelId === WEBLLM_CUSTOM_QWEN35_ID;
}

export function buildWebLLMEngineConfig(settings) {
  const modelId = settings.currentModel || getDefaultWebLLMModel();

  if (!modelId) {
    return { ok: false, reason: "No hay un modelo WebLLM seleccionado." };
  }

  if (!isCustomWebLLMModel(modelId)) {
    const record = findRecord(modelId);
    if (!record) {
      return {
        ok: false,
        reason: `El modelo ${modelId} no esta en el catalogo precompilado de WebLLM.`
      };
    }
    return {
      ok: true,
      selectedModel: modelId,
      appConfig: prebuiltAppConfig,
      signature: JSON.stringify({ modelId })
    };
  }

  const customModelId = settings.webllmCustomModelId?.trim() || WEBLLM_CUSTOM_QWEN35_ID;
  const modelUrl = settings.webllmCustomModelUrl?.trim();
  const modelLibUrl = settings.webllmCustomModelLibUrl?.trim();

  if (!modelUrl || !modelLibUrl) {
    return {
      ok: false,
      reason: "Qwen3.5 en WebLLM requiere URL del modelo MLC y URL del wasm compilado."
    };
  }

  return {
    ok: true,
    selectedModel: customModelId,
    appConfig: {
      useIndexedDBCache: false,
      model_list: [
        ...prebuiltAppConfig.model_list,
        {
          model: modelUrl,
          model_id: customModelId,
          model_lib: modelLibUrl
        }
      ]
    },
    signature: JSON.stringify({
      modelId: customModelId,
      modelUrl,
      modelLibUrl
    })
  };
}
