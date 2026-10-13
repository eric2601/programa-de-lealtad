# Lealtad por teléfono para gasolineras

Plataforma que contratan grupos gasolineros para que sus clientes acumulen y canjeen puntos en la isla diciendo su número de teléfono. Puntos por litro en combustible, puntos por peso en tienda y servicios, sellos por carga, canje protegido con código de un solo uso y controles contra el fraude de despachadores.

📄 La propuesta de negocio y la especificación completa (referentes con fuentes, flujo en isla, catálogo de promociones, simulador económico, arquitectura, plan de piloto y decisiones pendientes) está en [`docs/propuesta.html`](docs/propuesta.html).

## Estado

MVP en construcción. Lo que ya funciona:

- **Identidad por teléfono** normalizado a +52, búsqueda por hash, teléfono enmascarado en isla, respuesta uniforme para números inexistentes o de otro grupo.
- **Reglas por litro**: 1 punto por litro en regular y diésel, 2 en Premium, 3 puntos por cada $10 de tienda; multiplicador por horario valle; sello por carga de 20 L o más. Nada acumula sobre lo pagado con puntos.
- **Libro de movimientos** de solo inserción con asientos compensatorios para anulaciones y devoluciones; dinero en centavos y volumen en mililitros enteros.
- **Canje seguro**: reserva de puntos, código de 4 dígitos al teléfono, 3 intentos, expiración a 10 minutos, aplicación atómica junto con la venta.
- **Idempotencia** por clave en cada venta; folio único por estación; topes diarios de cargas y litros por número; teléfonos de empleados bloqueados; tope de 200 puntos sin verificar.
- **Portal del cliente** sin app: código al teléfono, saldo, sellos, historial propio y baja de promociones.
- **Reporte** de litros identificados, puntos, activos a 30 y 90 días, pasivo de puntos y conciliación por despachador con alerta de concentración.
- **Pruebas** de reglas, teléfono, ventas, canjes, doble gasto, expiración, aislamiento y límites de consulta.

**Plataforma de campañas y promociones** (11 sep 2026):

- **Motor de reglas** (`server/src/promo/engine.ts`): fecha, día, horario, estación, estado, ciudad, combustible, monto, litros, método de pago, tipo de cliente, segmento, visitas por periodo, consumo mensual y acumulado; límites totales, por cliente, por día y por mes; descuento máximo; existencias; acumulabilidad, exclusiones, prioridad y máximo por transacción. Vista previa antes de cobrar (`POST /v1/sales/preview`) y aplicación al registrar.
- **Campañas con promociones combinadas**, 20 tipos de promoción, escalonadas con barra de progreso ("Te faltan $80 para $50 de dinero virtual"), inventario que pasa a "Agotada" solo.
- **Restricciones y términos** generados automáticamente y **publicidad** en 15 formatos (`server/src/promo/terms.ts`).
- **Dinero virtual** con saldo disponible/generado/utilizado/expirado, expiración por abono, gasto FIFO y reversa al anular.
- **Asociados comerciales** con beneficios e inventario propio; cupones con código único.
- **Segmentos** calculados (nuevos, frecuentes, inactivos, VIP, alto/bajo consumo, motos, taxis, plataformas, flotillas, por estación/ciudad/estado).
- **Investigación de campañas** de competidores con comparativas; **generador de promociones** por objetivo.
- **Dashboard** con KPI y series, **evaluación antes/durante/después** con veredicto y ROI, **notificaciones automáticas**.
- **Datos de demostración** realistas: 6 estaciones, 240 clientes, 100 días de cargas, 10 campañas (`server/src/demo/seedRich.ts`; desactivar con `DEMO=lite`).
- **Diez promociones "para regresar"** (campaña "Regresa y gana"): dinero virtual con compra mínima siguiente, uso único y ámbito (combustible o tienda); regreso dentro de N días; cadena de regresos con niveles; beneficio dividido ($100 repartido en combustible, tienda, café y lavado); tienda mínima o artículo requerido (el despachador marca café, agua, lavado, aceite); visitas calificadas por monto; escalera de consumo; y **meta personal** calculada por cliente (ticket habitual + 10 %, beneficio por tabla, probabilidad de regreso y rentabilidad esperada).

Pendiente (ver matriz por fase en la propuesta): mensajería real por WhatsApp, grupo de control por campaña, cola sin conexión en la isla, integración con controladores de estación y ERP, franquicias.

## Diseño de la interfaz web

Sistema visual propio (`web/src/styles.css`), con shell de aplicación (barra lateral en escritorio, dock flotante en móvil):

- **Paleta:** base clara (fondo `#F4F6F8`, texto azul marino `#142033`), barra lateral oscura `#1C2736` y un solo acento turquesa `#22B8C6` (`#148A95` para texto pequeño). Verde, ámbar y rojo se reservan para estados. Modo noche opcional (`[data-theme="dark"]`), recordado por dispositivo.
- **Tipografía:** Manrope para texto y títulos (palabra clave del título en turquesa con subrayado dibujado) y Geist Mono para montos, códigos y folios.
- **Forma:** botones tipo píldora, tarjetas blancas con borde fino y sombra suave, radios de 10 y 16 px. Iconos de trazo propios en `web/src/components/icons.tsx` (sin emojis ni librerías) e ilustraciones SVG propias en `web/src/components/Illustrations.tsx`.
- **Componentes reutilizables** en `web/src/components/Visual.tsx` (anillos, mosaicos, barras, pestañas con icono, avisos, esqueletos) y `web/src/components/Motion.tsx` (contador animado, sparkline, tarjeta con brillo al cursor, entrada escalonada, punto "en vivo").
- **Material gráfico:** diez carteles verticales en `web/public/promos/promo-01…10.png` (recortados de `sheet.png`) más un cartel cuadrado. `web/src/promoArt.ts` asocia cada promoción a su cartel (por nombre exacto o palabras clave); se muestran como galería y miniaturas en el panel, cartel grande en el detalle y carrusel en el portal del cliente. La campaña de demostración "Carteles de temporada" tiene una promoción por cartel.
- **Pictogramas:** quince máscaras PNG en `web/public/pictos/` (bomba, coche, regalo, etiqueta, tarjeta, tienda, lavado, llanta, herramientas, cargador, monedas, mapa, cliente estrella, campana, gráfica) que se pintan con `currentColor` mediante `web/src/components/Picto.tsx`.
- **Dashboard del día** (`web/src/views/Tablero.tsx`, ruta `GET /v1/dashboard`): cuadrícula bento con cifras animadas, cargas por hora contra la semana pasada, beneficios entregados, alertas accionables, despachadores y últimas cargas; se actualiza cada minuto.
- **Accesibilidad:** contraste AA en texto y estados, foco visible en todos los controles, objetivos táctiles de 44 px o más, barras de progreso con `aria-valuetext`, estados de error con `role="alert"`.
- **Idiomas:** español como idioma principal e inglés como secundario, con un botón ES | EN en la barra superior, en las dos pantallas de acceso (NIP y portal) y en la app del cliente. El español queda escrito en el código como clave (`t('Texto en español')`, `web/src/i18n.tsx`) y el inglés vive en diccionarios por área en `web/src/i18n/en/` (común, bomba, portal, panel, gráficas; ~1 100 entradas). Las frases con variables usan `{nombre}`; las cifras y fechas se formatean con el `locale` activo. La elección se recuerda por dispositivo y arranca en inglés si el navegador está en inglés. Los datos que vienen del servidor (nombres de promociones, campañas, clientes, estaciones) no se traducen. En Android, `Strings.kt` + `StringsEn.kt` hacen lo mismo con `tr()`.

## Estructura

```
docs/propuesta.html   Propuesta de negocio y especificación
docs/capturas/        Capturas de pantalla de la web y la app
server/               API en Node + TypeScript + SQLite (node:sqlite), sin dependencias nativas
  src/rules.ts        Reglas de acumulación por litro y tienda
  src/services/       Clientes, ventas, canjes, reportes
  src/http/app.ts     Rutas de la API v1
  src/schema.sql      Esquema (listo para migrar a PostgreSQL)
  test/               Pruebas con vitest
web/                  Bomba (isla del despachador), dashboard del día, panel, reportes y portal del cliente (React + Vite)
android/              App Android nativa (Kotlin + Jetpack Compose) con las mismas pantallas
```

## App Android (APK)

La app vive en `android/` y habla con la misma API. Kotlin, Jetpack Compose y Material 3, sin frameworks adicionales: OkHttp y kotlinx.serialization bastan. Requiere JDK 17 o superior y el SDK de Android (plataforma 35).

```bash
cd android && ./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Instálalo con `adb install -r` o copiándolo al teléfono.

- En el **emulador**, la app usa `http://10.0.2.2:8787`, que es tu computadora.
- En un **teléfono físico**, escribe la IP de tu computadora en la pantalla de acceso (por ejemplo `http://192.168.1.20:8787`) o compila con `-Plealtad.baseUrl=http://192.168.1.20:8787`.
- El tráfico es HTTP sin cifrar solo para desarrollo; en producción la API va detrás de HTTPS y se retira `usesCleartextTraffic`.

Pantallas: acceso por estación y NIP, bomba (buscar, alta breve, verificación, canje con código, despacho, anulación), reportes para gerente y portal del cliente.

### App del cliente ("Mis Puntos")

Módulo aparte en `android/cliente` (`applicationId` `mx.lealtad.cliente`): solo el portal, con el diseño turquesa de la web. Entra por celular y código, muestra puntos, dinero virtual y sellos, el carrusel de los diez carteles (avanza cada 3 s), promociones con su cartel y progreso, dinero virtual, cupones, Rasca y Gana, últimas cargas y el consentimiento de WhatsApp. Reutiliza los modelos y el cliente HTTP de la app del personal (copiados a su paquete) y guarda la sesión del portal en preferencias.

```bash
cd android && ./gradlew :cliente:assembleDebug
```

El APK queda en `android/cliente/build/outputs/apk/debug/cliente-debug.apk`. Misma regla de URL: `10.0.2.2:8787` en el emulador o la IP de tu computadora desde la pantalla de acceso ("Servidor").

## Ejecutar

Requiere Node 22.13 o superior (usa `node:sqlite`). Probado con Node 24.

```bash
npm install
npm test
npm run build
npm start
```

Abre <http://localhost:8787>. El servidor sirve la interfaz compilada y siembra datos de demostración:

| Qué | Valor |
|---|---|
| Estación | `EST-01` (Centro) y `EST-02` (Norte) |
| NIP despachador | `1111` (Luis, Centro) · `2222` (Marta, Norte) |
| NIP gerente | `1234` · dueño `9999` |
| Cliente verificado | Ana, `55 4433 4317`, con historial y saldo para canjear |
| Cliente sin verificar | Beto, `56 1112 2233` |
| Teléfono bloqueado (empleado) | `55 1234 5678` |

En desarrollo, los códigos de un solo uso se muestran en la respuesta y en la bandeja "Mensajes enviados" de la bomba, en lugar de enviarse por WhatsApp.

Para desarrollo con recarga automática, en dos terminales:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

## API v1 (resumen)

| Ruta | Uso |
|---|---|
| `POST /v1/auth/pin` | Sesión con código de estación y NIP |
| `POST /v1/lookup` | Identificar por teléfono (límite 60 por hora por persona) |
| `POST /v1/memberships` | Alta breve con consentimientos separados |
| `POST /v1/verify/start` · `/confirm` | Verificación de posesión del teléfono |
| `POST /v1/sales` | Registrar despacho y tienda (`Idempotency-Key` obligatorio) |
| `POST /v1/sales/:id/void` · `POST /v1/returns` | Anulación y devolución parcial de tienda |
| `POST /v1/redemptions/prepare` · `/confirm` · `/:id/cancel` | Canje con código de un solo uso |
| `GET /v1/dashboard?station=` | Dashboard de operación del día: cargas por hora, beneficios, despachadores, últimas cargas y alertas (gerente en adelante) |
| `GET /v1/reports/summary` | Reporte del grupo (gerente en adelante) |
| `POST /v1/portal/session/start` · `/confirm` · `GET /v1/portal/me` | Portal del cliente (puntos, dinero virtual, cupones, promociones con progreso, notificaciones) |
| `POST /v1/sales/preview` | Promociones aplicables, descuentos, dinero virtual y "te faltan…" antes de cobrar |
| `POST /v1/coupons/redeem` | Canje de cupón por código |
| `GET /v1/admin/dashboard` | KPI y series del panel |
| `GET/POST/PATCH /v1/admin/campaigns` · `GET /:id/evaluation` | Campañas y evaluación antes/durante/después |
| `GET/POST/PATCH /v1/admin/promotions` · `GET /:id` · `/:id/impact` · `/:id/ads` | Promociones, impacto en ticket y publicidad |
| `POST /v1/admin/generator` | Propuestas de promoción por objetivo |
| `GET/POST/DELETE /v1/admin/research` | Investigación de campañas competidoras |
| `GET/POST /v1/admin/partners` · `POST /:id/benefits` | Asociados comerciales |
| `GET /v1/admin/segments` · `/:key/members` | Segmentación |
| `GET /v1/admin/wallet?phone=` · `POST /v1/admin/wallet/credit` | Dinero virtual por cliente |
| `GET /v1/admin/notifications` · `POST /run` | Notificaciones automáticas |

## Decisiones de diseño

- Los puntos pertenecen a cada grupo gasolinero; un cliente puede participar en varios sin que un grupo vea sus compras en otro.
- El combustible se premia por litro porque el precio está regulado y el margen es por litro; la tienda se premia por peso porque ahí está el margen.
- Los puntos no son dinero: no se canjean por efectivo ni se transfieren, y caducan.
- La hora del despacho la fija el servidor salvo en operaciones sincronizadas después de perder conexión, que traen su hora original.
