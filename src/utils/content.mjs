function stripBody(rawHtml) {
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : rawHtml;
}

function sanitizeInner(innerHtml) {
  return innerHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]*>/gi, "");
}

export function wrapStageHtml(rawHtml, lessonTitle, stageIndex, stageCount) {
  const inner = sanitizeInner(stripBody(rawHtml || "")) || "<p>Contenido no disponible.</p>";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="../assets/katex/katex.min.css" />
  <style>
    :root {
      color-scheme: light;
      --page: #f6f1e8;
      --surface: rgba(255,253,248,0.96);
      --line: #e2ddcf;
      --text: #17313b;
      --muted: #5d7078;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(98,203,255,0.16), transparent 30%),
        linear-gradient(180deg, #f7f5ee 0%, var(--page) 100%);
      padding: 22px;
      line-height: 1.6;
    }
    .shell {
      max-width: 980px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(23, 49, 59, 0.12);
    }
    .hero {
      padding: 24px 28px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(88,204,2,0.18), rgba(98,203,255,0.14));
    }
    .pill {
      display: inline-flex;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.8);
      border: 1px solid rgba(23,49,59,0.08);
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .hero h1 {
      margin: 12px 0 8px;
      font-size: clamp(28px, 4vw, 40px);
      line-height: 1.1;
    }
    .content {
      padding: 28px;
    }
    .content .example,
    .content .task,
    .content .card,
    .content .tip,
    .content .note,
    .content .ex {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px 18px;
      margin: 16px 0;
    }
    .content .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #fff;
      margin: 16px 0;
    }
    .content td, .content th {
      padding: 10px 14px;
      border-bottom: 1px solid var(--line);
      text-align: left;
    }
    img, svg, canvas {
      max-width: 100%;
      height: auto;
    }
    .crop-mode,
    .crop-mode * {
      cursor: crosshair !important;
      user-select: none !important;
    }
    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
    }
  </style>
  <script defer src="../assets/katex/katex.min.js"></script>
  <script defer src="../assets/katex/auto-render.min.js"></script>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <span class="pill">Etapa ${stageIndex}/${stageCount}</span>
      <h1>${lessonTitle}</h1>
      <p>Lectura adaptada para la app Electron con render matemático local.</p>
    </header>
    <section class="content">${inner}</section>
  </main>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\\\[", right: "\\\\]", display: true },
            { left: "\\\\(", right: "\\\\)", display: false }
          ],
          throwOnError: false
        });
      }
    });
  </script>
</body>
</html>`;
}
