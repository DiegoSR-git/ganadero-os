# GanaderOS — V1 Piloto

## Base de datos
- [x] Campos de piloto en explotaciones (pilot_status, pilot_started_at, pilot_notes, is_demo)
- [x] Idempotencia WhatsApp (wa_messages.wa_message_id único)
- [x] Idempotencia de escrituras IA (eventos/gastos/ingresos)
- [x] Tabla de feedback
- [x] Tabla de eventos de producto (analítica)
- [x] Tabla de auditoría por explotación
- [x] Índices de rendimiento + crotal único por explotación
- [x] RLS y grants de todo lo nuevo

## WhatsApp / IA
- [x] Dedupe de webhook por id de mensaje de Meta
- [x] AYUDA breve con ejemplos reales
- [x] FEEDBACK ... guarda opinión
- [x] CANCELAR / OLVIDA ESO / EMPEZAR DE NUEVO
- [x] Corrección de la propuesta antes de confirmar
- [x] Resultado real de la base de datos antes de decir "registrado"
- [x] Fix de responderCrotalWa (bug: res.animales)
- [x] Métricas de OCR de crotal (leído/corregido/fallido)

## App
- [x] Importación masiva CSV/XLSX con wizard y plantilla
- [x] Alta rápida de animal
- [x] Onboarding en 3 pasos
- [x] Estado de WhatsApp en Configuración
- [x] Enviar opinión (widget global)
- [x] Ayuda y soporte
- [x] Panel interno de piloto (solo admin)
- [x] Listado de animales paginado y con búsqueda en servidor

## Pruebas
- [x] Aislamiento entre explotaciones (RLS)
- [x] Webhook duplicado → un solo evento
- [x] Fallo al guardar → no se afirma éxito
- [x] Cancelar → no se modifica nada

## Verificación V1 piloto (realizada)
- [x] Aislamiento entre explotaciones probado a nivel de base de datos (animales, eventos, gastos, ingresos, lotes, fincas, tareas, documentos, actividad): 0 filas ajenas visibles.
- [x] Idempotencia comprobada: una misma acción de IA no puede guardarse dos veces.
- [x] Webhook de WhatsApp deduplicado por identificador de mensaje de Meta.
- [x] Funciones de servidor desplegadas y verificadas (ganadero-ai, wa-webhook, wa-process-message).
- [x] Importación CSV/XLSX, onboarding, ayuda, opiniones y panel interno integrados en la navegación.
- [x] Paginación en la lista de animales (50 por bloque).
- [x] Protección de contraseñas filtradas activada; métricas de piloto restringidas.
- [ ] Pruebas E2E completas con ganaderos reales (pendiente de datos reales del piloto).
