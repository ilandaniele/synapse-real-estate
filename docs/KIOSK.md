# Modo kiosko

Modo del showroom para pantallas táctiles en sala de ventas o feria. El objetivo es que cada visitante empiece en la home y no vea la búsqueda del anterior.

## Activar y desactivar

| URL | Efecto |
|---|---|
| `/?kiosk=1` (o cualquier ruta con `?kiosk=1`) | Activa el modo y lo guarda en `localStorage` (`synapse-kiosk`) |
| `?kiosk=0` | Lo desactiva y guarda el cambio |
| Sin parámetro | Usa el último valor guardado; por defecto, apagado |

El modo sigue activo al navegar y al recargar la página. Código: `apps/showroom/src/lib/kiosk.ts` y `apps/showroom/src/components/KioskMode.tsx`.

## Comportamiento

- **Inactividad:** a los 90 s sin `pointerdown`, `keydown`, `input`, `wheel` ni `touchstart` aparece el aviso «¿Seguís ahí?». El aviso tiene una cuenta atrás de 15 s.
- **Seguir navegando:** el botón, Esc o un toque fuera del aviso lo cierran. La sesión sigue en la misma página.
- **Vuelta a Inicio:** al llegar a 0 se borran la villa seleccionada y los filtros (store Zustand). Después se navega a `/` y se sube al principio de la página.
- **Mientras se muestra el aviso**, el temporizador de inactividad está en pausa. Así el toque sobre «Seguir navegando» no cierra el aviso en el `pointerdown` ni dispara un clic fantasma sobre lo que hay debajo.
- **Pantalla completa:** el primer toque pide `requestFullscreen()`. El navegador solo lo permite tras un gesto del usuario.
- **Toques largos:** se bloquea el menú contextual. Con `html[data-kiosk="true"]` se desactivan la selección de texto (salvo en campos), el callout de iOS y el rebote del scroll.

Los tiempos (`KIOSK_IDLE_MS`, `KIOSK_WARNING_SECONDS`) son constantes en `kiosk.ts`. No hay configuración por organización.

## Sin barra del navegador

La Fullscreen API se puede cerrar con un gesto del sistema. En un kiosko real conviene una de estas dos opciones:

1. **Chrome en modo kiosko** (Windows, Linux o ChromeOS):

   ```bash
   chrome --kiosk --noerrdialogs "https://showroom.example.com/?kiosk=1"
   ```

   En Windows, crear un acceso directo con ese destino en la carpeta Inicio del usuario del kiosko. Así arranca al iniciar sesión.

2. **Instalar como app (PWA).** `app/manifest.ts` publica `/manifest.webmanifest` con `display: "fullscreen"`, `orientation: "landscape"` y `start_url: "/?kiosk=1"`. Instalada desde Chrome o Edge, se abre a pantalla completa y ya en modo kiosko.

Bloquear gestos del sistema operativo (Alt+Tab, gesto de inicio en tablets) queda fuera de la app. Eso se hace con la política del dispositivo: Windows Assigned Access, Android/iPad Guided Access o una consola MDM.

## Tests

- Unit: `apps/showroom/src/lib/kiosk.test.ts` (resolución del modo por URL y almacenamiento).
- E2E: `tests/e2e/kiosk.spec.ts` (`@kiosk`, proyectos `desktop` y `kiosk-1920`). Usa el reloj simulado de Playwright para cubrir:
  - aviso y vuelta a Inicio con la búsqueda borrada;
  - «Seguir navegando»;
  - persistencia y `?kiosk=0`;
  - sin reset fuera del modo;
  - el manifiesto.
