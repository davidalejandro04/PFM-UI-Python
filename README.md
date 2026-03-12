# TutorMate Electron

Aplicacion de escritorio para aprendizaje de matematicas en espanol, reconstruida como app Electron con dos runtimes locales de inferencia:

- `Ollama` para modelos servidos por API local.
- `WebLLM` para inferencia dentro del renderer con WebGPU.

## Stack

- Electron para shell de escritorio.
- HTML/CSS/JS modular en `src/`.
- Ollama o WebLLM como runtime local de modelos.
- JSON local para lecciones y persistencia de perfil/configuracion.

## Estructura

- `package.json`: scripts y dependencias de Electron/WebLLM.
- `electron/main.cjs`: proceso principal, persistencia local e IPC hacia Ollama.
- `electron/preload.cjs`: API segura expuesta al renderer.
- `src/index.html`: entrada de la UI.
- `src/renderer.mjs`: navegacion, lecciones, chat, perfil, settings y selector de runtime.
- `src/utils/inference.mjs`: presets WebLLM, defaults y config custom para Qwen3.5.
- `src/workers/webllm-worker.mjs`: worker dedicado para WebLLM.
- `data/lessons.json`: contenido pedagogico reutilizado por la app.
- `assets/`: SVG y KaTeX local.

## Requisitos

- Node.js 22+
- Para `Ollama`: Ollama instalado y levantado localmente
- Para `WebLLM`: Electron con WebGPU disponible en el equipo

## Desarrollo

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Preparacion de Ollama

1. Inicia Ollama:

   ```bash
   ollama serve
   ```

2. Descarga al menos un modelo:

   ```bash
   ollama pull qwen3:0.6b
   ```

La app detecta los modelos disponibles desde `http://127.0.0.1:11434/api/tags`.

## WebLLM

La app expone presets WebLLM para:

- `Qwen3-0.6B-q4f16_1-MLC`
- `gemma-2-2b-it-q4f16_1-MLC`
- `Qwen3.5 / Custom MLC`

Importante:

- El catalogo precompilado instalado con `@mlc-ai/web-llm@0.2.81` no incluye una entrada prebuilt para `Qwen3.5`.
- Para usar `Qwen3.5` debes proporcionar artefactos MLC propios en Preferencias: `model`, `model_lib` y el `model_id`.
- Los modelos locales originales del repo no se convierten automaticamente; en WebLLM se usan presets MLC compatibles o artefactos custom ya convertidos.

## Flujo funcional

- `Lecciones`: explora rutas, abre una leccion y avanza por etapas en un lector embebido.
- `Estudio`: envia preguntas al runtime activo con modos dinamicos (`Tutor`, `Paso a paso`, `Reto`).
- `Perfil`: onboarding estilo app educativa, progreso, XP, racha y actividad reciente.
- `Preferencias`: seleccion de runtime, URL/modelo de Ollama o preset/custom model de WebLLM, y modo por defecto.

## Notas

- El backend Python anterior ya no es necesario para ejecutar la app Electron.
- Ollama sigue siendo la ruta mas simple para modelos locales ya servidos.
- WebLLM es util cuando quieres inferencia embebida en Electron y cuentas con WebGPU.
