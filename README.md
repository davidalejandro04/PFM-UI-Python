# TutorMate Electron

Aplicacion de escritorio para aprendizaje de matematicas en espanol, reconstruida como app Electron con runtime local en `Ollama`.

## Stack

- Electron para shell de escritorio.
- HTML/CSS/JS modular en `src/`.
- Ollama como runtime local de modelos.
- JSON local para lecciones y persistencia de perfil/configuracion.

## Estructura

- `package.json`: scripts y dependencias de Electron.
- `electron/main.cjs`: proceso principal, persistencia local e IPC hacia Ollama.
- `electron/preload.cjs`: API segura expuesta al renderer.
- `src/index.html`: entrada de la UI.
- `src/renderer.mjs`: navegacion, lecciones, chat, perfil y settings de Ollama.
- `data/lessons.json`: contenido pedagogico reutilizado por la app.
- `assets/`: SVG y KaTeX local.

## Requisitos

- Node.js 22+
- `Ollama` instalado y levantado localmente

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

## Flujo funcional

- `Lecciones`: explora rutas, abre una leccion y avanza por etapas en un lector embebido.
- `Estudio`: envia preguntas a Ollama con modos dinamicos (`Tutor`, `Paso a paso`, `Reto`).
- `Perfil`: onboarding estilo app educativa, progreso, XP, racha y actividad reciente.
- `Preferencias`: URL/modelo de Ollama y modo por defecto.

## Notas

- El backend Python anterior ya no es necesario para ejecutar la app Electron.
- Ollama es la ruta soportada para inferencia local en esta version.
