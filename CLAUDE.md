# Claude Code — Construir plataforma inmobiliaria 3D basándose en tres videos reales

## Contexto
El usuario adjuntó 3 MP4 y 3 enlaces de Instagram, que muestran un **showroom inmobiliario**, no un editor 3D generalista:
- https://www.instagram.com/reel/DfsVPUIIpxv/
- https://www.instagram.com/p/Dfp2F_3sovy/
- https://www.instagram.com/reel/DfoFLlfxJ2d/

Existe evidencia visual resumida y timestamped en `docs/EVIDENCIA_DE_LOS_TRES_VIDEOS.md` y montajes `referencias/*.jpg`. El paquete original previo fue una hipótesis genérica; ESTE documento la sustituye para el alcance de producto. No se ha recuperado el código fuente original, de modo que no afirmes librerías originales específicas.

## Orden de lectura OBLIGATORIO
1. `docs/EVIDENCIA_DE_LOS_TRES_VIDEOS.md` (lo que realmente se ve)
2. `docs/ARQUITECTURA_INMOBILIARIA.md` (stack y sistemas propuestos)
3. `docs/BACKLOG_PRODUCTO_REAL.md` (prioridades y pruebas de aceptación)
4. `docs/LIBRERIAS_Y_VERIFICACION.md` (motor render 3D vs 360)
5. `docs/FUENTES_Y_LICENCIAS.md` (licencias; cualquier nota anterior que contradiga esta versión queda reemplazada)

## Resultado que necesito
Quiero una plataforma navegable para promocionar y vender propiedades desde web y pantallas táctiles:
- Home de promoción.
- Masterplan 3D de varias villas seleccionables con zoom/orbit.
- Resaltado visual de unidad y estado, ficha con precio/superficie/dormitorios y CTA.
- Tour 360 por estancias de la vivienda, flechas/hotspots y mini-plano SVG «Ir a un punto».
- Menú Inicio / Masterplan / Áreas / Unidades / Galería / Ubicación / Contacto.
- Mapa de emplazamiento con puntos de interés.
- Panel administrativo para cargar y actualizar propiedades, 360, GLB, hotspots y leads.
- Pipeline CAD/BIM -> assets de showroom como módulo separado y semi-automatizado, con procesamiento asíncrono y revisión manual. **No implementar una supuesta conversión DWG -> renders fotorrealistas automáticos en minutos sin validación.**

## Stack base que recomiendo investigar e implementar
Monorepo pnpm. Next.js/React/TypeScript para showroom y admin; `three` + `@react-three/fiber` + `@react-three/drei` para masterplan GLB; `marzipano` para tour 360 con tiles y escenas; `maplibre-gl` para ubicación; TanStack Query, Zustand y Zod para estado; Fastify o Nest + PostgreSQL + S3 + BullMQ/Redis para backoffice/pipeline. Blender CLI y FFmpeg opcionales para generación y conversión de assets, no en el critical path del primer MVP. Validar compatibilidad y licencias antes de fijar versiones.

## Primeras acciones concretas sin preguntar detalles adicionales
1. Leer todos los docs y dejar constancia de observación vs hipótesis.
2. Levantar monorepo con comandos reales de instalación/ejecución y tests automatizados.
3. Construir MVP con DOS demos (casa interior panorámica, masterplan de villas) con **assets propios o legales**, no capturas fingiendo interacción 3D. Pueden ser placeholders de licencia libre temporalmente, documentados.
4. Hacer masterplan GLB real con 8 villas primitivas si no hay assets; picking por ID; tarjeta unidad/estado; layout semejante al comportamiento observado, no copiar marca.
5. Crear tour 360 con 5 nodos de prueba, vista de plano, botones de habitación y hotspots navegables; si los panoramas no están disponibles, pedirlos solo como siguiente mejora y demostrar que el motor funciona con assets temporales.
6. Integrar rutas, filtros, formulario de lead con persistencia validada y CRUD admin con seed; si aún no hay backend, crear mocks tipados aislados y una fase posterior explícita.
7. Tests: Playwright de recorrido masterplan -> villa -> tour -> otra habitación -> ficha -> lead; accesibilidad teclado y touch; build estricto.
8. Documentar pantallas, decisiones ADR, source attribution, performance real y pruebas corridas; nunca reportar tests no ejecutados.

## Calidad requerida
Mobile/táctil (pinch, drag), pantallas de 1920px, carga progresiva, selección por raycasting, panoramas multires si aplica, estados `loading/error/empty`, tipado estricto, API clara, timestamps, estado comercial actualizado, RBAC/tenants, límites de tamaño de uploads, seguridad leads, cache/CDN.

## Restricción crítica de producto
NO priorices un editor Blender web con timeline/keyframes/materiales: ese alcance fue introducido en el paquete anterior por incertidumbre y NO surge de los videos. El software observado es un showroom / portal 3D de inmuebles. Separá frontend público, backoffice y pipeline de render/ingesta. No copiar marcas ni materiales de terceros.

## Estado y comandos (implementación)

El MVP está implementado; ver `docs/ESTADO.md`, `docs/PROGRESS.md` y `README.md`.

- `pnpm install` · `pnpm assets:generate` · `pnpm db:seed` · `pnpm dev`
- `pnpm typecheck` · `pnpm test` (unit + integración) · `pnpm build` · `pnpm test:e2e` (requiere build y puerto 4000 libre)
- PGlite es monoproceso: parar el API antes de `pnpm db:seed`.
- Datos de demo ficticios; contraseñas de seed solo locales (variable `SEED_PASSWORD`).

# Development desired behaviors

## DRY principle
We expect all code to follow the DRY principle. Avoid duplication of logic, data structures, and configuration. If you find yourself writing the same code more than once, consider abstracting it into a reusable function, module, or component.

We should avoid having single long spaghetti code, if a file is too large we should modularize components, break it into smaller files, and use clear naming conventions to improve readability and maintainability.

## Code readability
Write code that is easy to read and understand. Use meaningful variable and function names, consistent formatting, and clear comments where necessary. Avoid complex one-liners or overly clever code that may be difficult for others to understand.

Avoid comments as much as possible. If you need to explain something, consider refactoring the code to be more self-explanatory instead of adding comments.

## KISS principle
Keep It Simple Stupid. Strive for simplicity in your code. Avoid unnecessary complexity, over-engineering, or premature optimization. Focus on writing clear and straightforward code that gets the job done without unnecessary complications.

## UNIX philosophy
Follow the UNIX philosophy of "Do one thing and do it well." Each function, module, or component should have a single responsibility and should not try to do too much. This promotes modularity, reusability, and maintainability in our codebase.

## Clear responsabilities
Ensure that each part of the code has a clear responsibility and that there is a clear separation of concerns. This helps to improve the maintainability and scalability of the codebase.
For example, on a web api the controller shouldn't contain helper functions, those should be in a separate file, ideally on a utils/ folder. The controller should only be responsible for handling the request and response, while the helper functions should be responsible for the business logic. And so on for other layers of the application.

# Expected anti-patterns to avoid

## N+1 queries/requests
Avoid N+1 query problems where you make one query to fetch a list of items and then make additional queries for each item in the list. This can lead to performance issues and increased latency. Instead, use techniques like eager loading, batch processing, or optimized queries to fetch all necessary data in fewer queries.

Ideally every API endpoint should make a single query to the database.

## Spaghetti code
Avoid writing long, monolithic code that is difficult to read and maintain. If a file or function is getting too large, consider breaking it down into smaller, more focused modules or functions. This will improve readability and make it easier to understand the flow of the code.

# Best practices for development

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# Additions for apps built with /crear-app

## 5. Security by default

- Validate every input on the server (Zod). Never trust client-side validation or client-side permission checks.
- Every protected route checks the session in server middleware, then checks role and resource ownership (no IDOR).
- Secrets live only in `wrangler secret` / `.dev.vars` (gitignored). Never in code, git, logs, chat or client bundles.
- Responses use explicit DTOs: never return password hashes, tokens, API keys or internal fields. List endpoints are always paginated with a maximum page size.
- Errors: generic message to the client, details to the log with a request id. No stack traces in responses.
- Security headers, CORS allow-list, CSRF protection and rate limiting (per IP and per user) are on from the first commit.

## 6. Performance by default

- One query per endpoint where possible; select only needed columns; index every frequent filter and sort.
- Timeouts on every external call; independent requests in parallel; slow work goes to a queue.
- Front end: code splitting per page, optimistic UI, skeletons, lazy images in webp/avif, self-hosted fonts, debounced search, virtualized long lists.
- Measure before optimizing. Fix the single biggest bottleneck first.

## 7. Testing

- Write the test that defines "done" before the code.
- Unit tests for business logic, integration tests for every endpoint (including 401/403/404/429 and cross-user access), E2E for key flows.
- Never disable, skip or weaken a test to make it pass.

## 8. Workflow

- Split large tasks into small, verifiable ones. One commit per task, Conventional Commits.
- Delegate through `/orchestrator`; security work runs on the strongest model available.
- When a task is handed off or left mid-way, write `.claude/handoff/<task>.md`: goal, done, next, exact paths and commands.
- Ask before anything that costs money or deletes data or remote resources.
