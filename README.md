<p align="center">
  <img src="assets/readme.png" alt="Logotipo del Tutor de Matemáticas" width="150">
</p>


# Tutor de Matemáticas local

Aplicación de escritorio para apoyar el aprendizaje de matemáticas en español. Renderiza lecciones y ofrece un chat de “Problemas” con un LLM local (Transformers/PyTorch).



## Requisitos
- Python 3.10–3.12
- Ver `requirements.txt` (PySide6, Transformers, Torch, etc.)

## Estructura
- `main.py`: ventana principal y tabs (Lecciones, Problemas, Perfil).
- `models/`: `lessons.py` (lee `data/lessons.json`), `profile.py` (XP y progreso).
- `views/`: `lessons.py`, `problems.py`, `profile.py`.
- `services/`: `lm_service.py` (hilo con LLM), `guard.py` (pre-filtro).
- `tutor_backend.py`: carga del modelo local y `generate()`.
- `ui/style.py`: tema y estilos (Fusion + QSS).
- `assets/`: `chat.html` (KaTeX) y `svg/` (ilustraciones).
- `data/`: `lessons.json` y `profile.json`.

## Modelos locales
Coloca los modelos (carpetas) en el mismo directorio que `tutor_backend.py`:
- `gemma-3-1b-it-sft-dpo/`
- `Qwen3-0.6B-sft-dpo/`

La app no descarga nada; todo es `local_files_only=True`.

Opcionalmente, se puede modificar la aplicación para que cargue directamente los modelos desde Hugging Face, alojados en la cuenta `dpabonc`. No es necesario colocar carpetas de modelos localmente a menos que quieras evitar la descarga.

Modelos utilizados:
- [`dpabonc/gemma-3-1b-it-sft-dpo`](https://huggingface.co/dpabonc/gemma-3-1b-it-sft-dpo)
- [`dpabonc/Qwen3-0.6B-sft-dpo`](https://huggingface.co/dpabonc/Qwen3-0.6B-sft-dpo)

Por defecto, la aplicación configurará `local_files_only=False` en `transformers` para que se descarguen automáticamente si no están en caché local.  Si deseas forzar el uso de copias locales sin conexión, cambia la configuración a `local_files_only=True` en `tutor_backend.py`.

### Ejemplo de carga en `tutor_backend.py`:

```python
from transformers import pipeline

# Ejemplo con Gemma
model_id = "dpabonc/gemma-3-1b-it-sft-dpo"
pipe = pipeline(
    "text-generation",
    model=model_id,
    device_map="auto",
    local_files_only=False  # Cambia a True si solo quieres usar modelos ya descargados
)
```

## Ejecutar
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Diagramas

A continuación se presentan diagramas que describen la arquitectura de clases, la secuencia de eventos en el chat de “Problemas” y el flujo de usabilidad general.

---

### Diagrama de clases

```mermaid
classDiagram
    %% ====== MODELOS ======
    class LessonsModel {
        +all_units() dict
        +lessons_of(unit_name) list
        +stages_of(unit_name, lesson_title) list
    }
    class ProfileModel {
        +xp() int
        +lessons_completed() int
        +add_xp(pts) void
        +reset() void
        +record_completion(unit, title, xp_gain) void
        +completed_pairs() list
        +recent(n) list
    }

    %% ====== SERVICIOS ======
    class LMService {
        +ask(question, system_prompt) void
        +set_model(model) void
        +answered(str) signal
        +failed(str) signal
    }
    class Guard {
        +is_math_related(text) bool
        +is_banned(text) bool
        +pregate(user_text) str|None
    }
    class LocalLLM {
        +set_model(model) void
        +generate(user_text, system_prompt) str
    }

    %% ====== VISTAS ======
    class LessonsView {
        +unit_selected(unit_name) signal
        +lesson_selected(lesson_dict) signal
        +open_reader(unit_name, lesson_title) void
        +set_units(units) void
        +set_lessons(lessons) void
    }
    class LessonReader {
        +nextStage() void
        +prevStage() void
        +explainSelected() void
        +finishLesson() void
        +stage_changed(index) signal
        +explain_selected(text) signal
    }
    class ProblemsView {
        +sendClicked() signal
        +add_user(text) void
        +add_bot(text) void
    }
    class ProfileView {
        +openLessonRequested(unit, lesson) signal
        +set_data(xp, lessons_completed) void
        +set_progress(units, completed_pairs) void
        +set_suggestion(unit, lesson) void
    }

    %% ====== CONTROLADORES ======
    class LessonsController {
        -ProfileModel profile
        -LessonsView view
        -LessonsModel lessons
        -LMService lm
        +on_unit_selected(unit_name) void
        +on_lesson_selected(lesson_dict) void
        +on_next_stage() void
        +on_prev_stage() void
        +open_lesson(unit_name, lesson_title) void
        +on_explain_selected(selected_text) void
    }
    class ProblemsController {
        -ProblemsView view
        -LMService lm
        -ProfileModel profile
        +_handle_question(txt) void
        +_bot_reply(resp) void
    }
    class ProfileController {
        -ProfileModel model
        -LessonsModel lessons
        -ProfileView view
        +_reset() void
        +_refresh() void
        +_next_unseen(completed_pairs) tuple
    }

    %% Relaciones
    LessonsController --> LessonsView
    LessonsController --> ProfileModel
    LessonsController --> LMService
    LessonsController --> LessonsModel

    ProblemsController --> ProblemsView
    ProblemsController --> LMService
    ProblemsController --> ProfileModel

    ProfileController --> ProfileView
    ProfileController --> ProfileModel
    ProfileController --> LessonsModel

    LMService --> LocalLLM
    LMService --> Guard

    LessonsView --> LessonReader

```
### Secuencia: pregunta en “Problemas”

```mermaid

sequenceDiagram
    participant U as Usuario
    participant PC as ProblemsController
    participant PV as ProblemsView
    participant LMS as LMService
    participant G as Guard
    participant LLM as LocalLLM
    participant PM as ProfileModel

    %% Flujo principal
    U->>PV: Escribe pregunta y pulsa "Enviar"
    PV-->>PC: Señal sendClicked(txt)
    PC->>PV: add_user(txt)  %% Añade mensaje del usuario al chat
    PC->>LMS: ask(txt)
    PC->>PM: add_xp(1)  %% Gamificación mínima

    %% Filtro previo
    LMS->>G: pregate(txt)
    alt Contenido bloqueado
        G-->>LMS: Mensaje bloqueante
        LMS-->>PC: Señal failed(mensaje)
        PC->>PV: add_bot(mensaje bloqueante)
        PV->>U: Muestra mensaje de bloqueo
    else Contenido permitido
        G-->>LMS: OK
        LMS->>LLM: generate(txt, system_prompt)
        LLM-->>LMS: respuesta
        LMS-->>PC: Señal answered(respuesta)
        PC->>PV: add_bot(respuesta)
        PV->>U: Muestra respuesta en chat
    end
```

### Flujo de usabilidad

```mermaid
flowchart TD
    A[Inicio aplicación] --> A2[Inicializar sistema]
    A2 --> A7[Conectar señales y slots 
    entre vistas, controladores 
    y modelos]
    A7 --> B[Mostrar ventana principal
     con QTabWidget]

    B -->|Lecciones| C[Lista de unidades]
    C --> C1[Usuario selecciona unidad]
    C1 --> C2[LessonsController on_unit_selected]
    C2 --> C3[LessonsView set_lessons
     con lecciones de la unidad]
    C3 --> D[Abrir lección]
    D --> D1[LessonsController on_lesson_selected]
    D1 --> D2[Crear LessonReader 
    para stages de la lección]
    D2 --> E[Ver stage HTML
     en QWebEngineView]
    E --> E1[Usuario pulsa Siguiente o Anterior]
    E1 --> E2[LessonsController on_next_stage
     / on_prev_stage]
    E2 --> E[Actualizar HTML del stage]
    E --> E3[Usuario selecciona 
    texto y pulsa 
    Explicame esto]
    E3 --> E4[LessonsController on_explain_selected 
    texto]
    E4 --> E5[LMService ask 
    texto
     con prompt pedagógico]
    E5 --> E6[Respuesta del
     LLM mostrada en ventana 
     aparte]
    E --> E7[Usuario finaliza 
    lección → ProfileModel
     record_completion]
    E7 --> E8[Incrementar XP 
    y guardar profile.json]

    B -->|Problemas| F[Escribir pregunta 
    en caja de texto]
    F --> F1[Usuario pulsa 
    Enviar]
    F1 --> F2[ProblemsController
     _handle_question]
    F2 --> F3[ProblemsView 
    add_user texto]
    F3 --> G[Guard pregate 
    analiza texto]
    G -->|Bloqueo| H[ProblemsView 
    add_bot mensaje de bloqueo]
    H --> H1[No se envía al LLM]
    G -->|OK| I[Enviar a LLM 
    con LMService ask]
    I --> I1[LocalLLM generate
     produce respuesta]
    I1 --> J[ProblemsView 
    add_bot respuesta]
    J --> J1[Respuesta renderizada 
    con soporte KaTeX]

    B -->|Perfil| K[Ver progreso y XP]
    K --> K1[ProfileController _refresh]
    K1 --> K2[ProfileView set_data 
    XP y lecciones 
    completadas]
    K2 --> K3[ProfileView set_progress
     unidades y lecciones
      completadas]
    K3 --> K4[ProfileView set_suggestion
     siguiente lección
      no vista]
    K --> K5[Usuario pulsa 
    Resetear perfil]
    K5 --> K6[ProfileModel
     reset]
    K6 --> K7[Guardar cambios 
    en profile.json]
```


## Empaquetado con PyInstaller

```
pyinstaller ^
  --name TutorMate ^
  --noconfirm ^
  --windowed ^
  --add-data "assets;assets" ^
  --add-data "data;data" ^
  --hidden-import PySide6.QtWebEngineCore ^
  --hidden-import PySide6.QtWebEngineWidgets ^
  --hidden-import PySide6.QtWebChannel ^
  --hidden-import PySide6.QtSvgWidgets ^
  main.py
```