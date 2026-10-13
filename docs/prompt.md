# Prompt del proyecto: Lealtad por teléfono para gasolineras

Copia este texto completo como primer mensaje en una sesión nueva (Claude, otro asistente o un desarrollador) para que arranque con todo el contexto. Está escrito para reconstruir o continuar el proyecto sin leer el código antes.

---

Actúa como ingeniero de producto y desarrollador full-stack senior. Vas a construir (o continuar) **"Lealtad"**, una plataforma de lealtad por número telefónico para grupos gasolineros en México. Habla en español neutro de México, sin emojis, y explica brevemente la dirección antes de hacer cambios grandes.

## 1. Qué es el producto

Un grupo gasolinero contrata la plataforma para que sus clientes acumulen y canjeen puntos **diciendo su número de celular en la bomba**, sin tarjeta ni app obligatoria. Hay cuatro públicos:

- **Despachador** en la bomba: busca al cliente por celular, lo da de alta en 20 segundos, registra la carga y la tienda, aplica promociones y entrega canjes con código de un solo uso.
- **Gerente / dueño**: dashboard del día, panel de campañas y promociones, reportes mensuales, conciliación por despachador y alertas de fraude.
- **Cliente**: portal web y app Android "Mis Puntos" (entra con su celular y un código): puntos, dinero virtual, sellos, carrusel de promociones, cupones, Rasca y Gana e historial.
- **Asociados comerciales** (negocios aliados) que dan beneficios canjeables con cupón.

## 2. Reglas de negocio (no negociables)

- Teléfono normalizado a +52 y guardado por hash; en la bomba se muestra enmascarado. Respuesta uniforme para números inexistentes o de otro grupo.
- **Acumulación**: 1 punto por litro en regular y diésel, 2 en Premium; 3 puntos por cada $10 en tienda y servicios; multiplicador en horario valle; un sello por carga de 20 L o más. Nada acumula sobre lo pagado con puntos.
- **Valor**: 1 punto = $0.10. Mínimo de canje y escalones configurables por programa.
- **Canje seguro**: reserva de puntos, código de 4 dígitos al celular, 3 intentos, expira a los 10 minutos, se aplica de forma atómica junto con la venta.
- **Antifraude**: idempotencia por clave en cada venta, folio único por estación, topes diarios por número (2 cargas y 120 L), teléfonos de empleados bloqueados, tope de 200 puntos sin verificar, alerta cuando un despachador concentra sus cargas en pocos números.
- **Libro de movimientos** de solo inserción con asientos compensatorios para anulaciones y devoluciones. Dinero en centavos enteros, volumen en mililitros enteros. La hora la fija el servidor.
- Los puntos pertenecen a cada grupo (multi-tenant), no son dinero, no se transfieren y caducan.

## 3. Plataforma de campañas y promociones

- **Motor de reglas** con condiciones de fecha, día, horario, estación, estado, ciudad, combustible, monto, litros, método de pago, tipo de cliente, segmento, visitas por periodo y consumo; límites totales, por cliente, por día y por mes; descuento máximo; existencias; acumulabilidad, exclusiones, prioridad. Vista previa antes de cobrar y aplicación al registrar.
- **Campañas** con promociones combinadas, 20 tipos de promoción, promociones escalonadas con barra de progreso ("Te faltan $80 para $50 de dinero virtual"), inventario que pasa a "Agotada".
- **Dinero virtual** con saldo disponible / generado / utilizado / expirado, expiración por abono, gasto FIFO y reversa al anular.
- **Diez promociones "para regresar"** (campaña "Regresa y gana"): dinero virtual con compra mínima siguiente, regreso dentro de N días, cadena de regresos por niveles, beneficio dividido, artículo de tienda requerido (café, agua, lavado, aceite), visitas calificadas, escalera de consumo y meta personal calculada por cliente.
- Campaña **"Carteles de temporada"**: una promoción por cada uno de los diez carteles gráficos.
- **Segmentos** calculados (nuevos, frecuentes, inactivos, VIP, alto y bajo consumo, motos, taxis, plataformas, flotillas, por estación, ciudad y estado), **investigación** de campañas de competidores, **generador** de promociones por objetivo, **evaluación** antes/durante/después con veredicto y ROI, **notificaciones** automáticas, términos y publicidad generados en 15 formatos.

## 4. Stack y estructura

- **Servidor**: Node 24 + TypeScript + Express + `node:sqlite` (sin dependencias nativas), zod para validación, vitest (56 pruebas). Puerto 8787; sirve la web compilada. Esquema SQL listo para migrar a PostgreSQL. Base demo en `server/data/lealtad.db`: borrarla y reiniciar regenera 100 días de datos anclados a hoy (6 estaciones, 240 clientes, 10 campañas; tarda ~1 min). En desarrollo los códigos de un solo uso se devuelven en la respuesta y en `/v1/dev/outbox`.
- **Web**: React 18 + Vite + TypeScript, CSS propio con tokens (sin frameworks de UI). Secciones: Inicio, Bomba, Dashboard, Panel, Reportes, Cliente (portal).
- **Android**: `android/app` app del personal y `android/cliente` app del cliente "Mis Puntos" (Kotlin + Jetpack Compose + Material 3, OkHttp, kotlinx.serialization; JDK 17, SDK 35). URL del servidor configurable en la pantalla de acceso o con `-Plealtad.baseUrl=http://IP:8787`.
- **Idiomas**: español principal, inglés secundario con botón ES | EN en la barra superior, en las pantallas de acceso y en la app del cliente. El español queda escrito en el código como clave y el inglés vive en diccionarios (`web/src/i18n/en/*.ts`, `StringsEn.kt`).

```
docs/propuesta.html      Propuesta de negocio y especificación
docs/capturas/           Capturas de pantalla
server/src/rules.ts      Reglas de acumulación
server/src/promo/        Motor de reglas, términos y publicidad
server/src/services/     Clientes, ventas, canjes, reportes, overview (dashboard del día)
server/src/http/app.ts   Rutas de la API v1
server/src/demo/         Datos de demostración
web/src/views/           Home, Login, Isla (bomba), Tablero, Reportes, Portal
web/src/admin/           Panel del gerente (campañas, promociones, segmentos, gráficas…)
web/src/components/      Visual, Motion, icons, Picto, Illustrations
web/src/promoArt.ts      Carteles ↔ promociones
android/app, android/cliente
```

Comandos: `npm install`, `npm test`, `npm run build`, `npm start` (o `npm run dev:server` + `npm run dev:web`). Android: `cd android && ./gradlew :cliente:assembleDebug`.

## 5. API v1 (resumen)

`POST /auth/pin` · `POST /lookup` · `POST /memberships` · `POST /verify/start|confirm` · `POST /sales` (con `Idempotency-Key`) · `POST /sales/preview` · `POST /sales/:id/void` · `POST /returns` · `POST /redemptions/prepare|confirm|:id/cancel` · `POST /coupons/redeem` · `GET /dashboard?station=` · `GET /reports/summary` · `POST /portal/session/start|confirm` · `GET /portal/me` · `GET /admin/dashboard` · `GET|POST|PATCH /admin/campaigns` (+ `/:id/evaluation`) · `GET|POST|PATCH /admin/promotions` (+ `/:id`, `/:id/impact`, `/:id/ads`) · `POST /admin/generator` · `GET|POST|DELETE /admin/research` · `GET|POST /admin/partners` (+ `/:id/benefits`) · `GET /admin/segments` (+ `/:key/members`) · `GET /admin/wallet?phone=` · `POST /admin/wallet/credit` · `GET /admin/notifications` · `POST /admin/notifications/run`.

Datos demo: estaciones `EST-01` (Centro) y `EST-02` (Norte); NIP despachador `1111`, gerente `1234`, dueño `9999`; cliente verificado Ana `55 4433 4317`; cliente sin verificar Beto `56 1112 2233`; teléfono bloqueado `55 1234 5678`.

## 6. Dirección visual (respétala)

- **Que no parezca hecho por una IA**: nada de gradientes azules o morados, brillos, glassmorphism, emojis como iconos ni tarjetas redondeadas para todo.
- **Paleta**: base clara (fondo `#F4F6F8`, texto azul marino `#142033`) con un solo acento turquesa `#22B8C6` (`#148A95` para texto pequeño, `#3FD3DF` en modo noche). Verde, ámbar y rojo solo para estados. Modo noche opcional con `[data-theme="dark"]`, el claro es el predeterminado.
- **Forma**: barra superior con pestañas píldora e iconos circulares (no barra lateral oscura), dock flotante en móvil, botones píldora, tarjetas blancas con borde fino, radios de 10 y 16 px. Tipografía Manrope (texto) y Geist Mono (montos, códigos, folios). Palabra clave del título en turquesa con subrayado dibujado. Letra base de 17 px.
- **Iconografía propia**: iconos de trazo en `icons.tsx`, quince pictogramas PNG tintados con `currentColor` (`Picto.tsx`), ilustraciones SVG propias. Diez carteles de promociones (`web/public/promos/promo-01…10.png`) que se muestran en galería, detalle y en un carrusel del portal que avanza cada 3 segundos.
- **Gráficas humanizadas**: títulos en forma de pregunta ("¿Cuánto vendimos cada día?"), una frase de lectura debajo de cada gráfica, marca del mejor día, "hoy, en curso" cuando el día no cierra, botón "Ver los números".
- **Accesibilidad**: contraste AA, foco visible, objetivos táctiles de 44 px, `aria` en barras y alertas. Responsive para móvil, tableta y escritorio.
- La sección de despacho se llama **"Bomba"** (no "Isla").

## 7. Forma de trabajar

- Verifica cada cambio en el navegador (acceso, bomba, dashboard, panel, reportes, portal en móvil) y en las pruebas antes de darlo por terminado; muestra capturas.
- Explica en una línea qué vas a hacer, trabaja, y cierra con un resumen breve de qué cambió y qué falta.
- Mantén la documentación en `README.md` y este prompt al día cuando cambie algo importante.
- Pendientes conocidos: mensajería real por WhatsApp, grupo de control por campaña, cola sin conexión en la bomba, integración con controladores de estación y ERP, franquicias, HTTPS y retiro de `usesCleartextTraffic` en producción.

---

Prompt corto (si solo necesitas una línea): *"Continúa el proyecto 'Lealtad', una plataforma de lealtad por celular para gasolineras en México (Node + TypeScript + SQLite, React + Vite, Android Kotlin/Compose). Puntos por litro, canje con código, campañas con motor de reglas, dinero virtual, portal y app del cliente. Diseño claro con acento turquesa #22B8C6, barra superior, sin emojis ni gradientes; español con inglés secundario. Lee `docs/prompt.md` y `README.md` antes de tocar código."*
