# Mis Finanzas

App web instalable en el celular (PWA) para controlar gastos, ingresos, cuentas de banco, tarjetas de crédito, deudas y metas de ahorro.
Se aloja gratis en **GitHub Pages** y guarda los datos en **Supabase**.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Cuentas** | Débito, ahorro, efectivo, inversión y tarjetas de crédito. Puedes crear, editar y archivar todas las que quieras. |
| **Movimientos** | Gasto, ingreso, transferencia entre cuentas (depósitos, retiros, pago de tarjeta), abono a deuda y aportación a meta. |
| **Tarjetas de crédito** | Según el día de corte, calcula cuánto pagar del periodo cerrado, cuánto llevas del nuevo periodo, el disponible y la fecha de pago. |
| **Ajustar saldo** | Cuadra cualquier cuenta contra el banco con un movimiento de ajuste, sin perder el historial. |
| **Deudas** | Préstamos que debes o que te deben, con abonos, avance y fecha límite. Se marcan como saldadas solas al llegar a $0. |
| **Metas** | Ligadas a una o varias cuentas (avance = suma de sus saldos) o por aportaciones. Calcula cuánto ahorrar al mes para llegar a la fecha. |
| **Categorías** | Personalizables, con ícono, color y presupuesto mensual. Inicio avisa cuando te acercas al límite o lo rebasas. |
| **Respaldo** | Exporta los movimientos a Excel (.csv) y un respaldo completo (.json) que se puede volver a importar. Cada domingo se envía por correo. |
| **Presupuesto semanal** | De lunes a domingo, total y por categoría. Inicio muestra cuánto queda y cuánto puedes gastar al día. |
| **Aviso del lunes** | Notificación y mensaje flotante con el cierre de la semana anterior y el monto a apartar en cualquier cuenta de tipo Ahorro. |
| **Por cobrar** | Personas que te deben, agrupadas, con recordatorio por WhatsApp. |
| **Meses sin intereses** | Compras a MSI: al estado de cuenta solo entra la mensualidad de cada corte. |
| **Gastos fijos** | Renta, servicios, suscripciones e ingresos fijos; se registran o se omiten con un toque. |
| **Dividir gasto** | Registra tu parte como gasto y la de los demás como cuentas por cobrar. |
| **Consultor** | Consejos con reglas sobre tus propios datos (ritmo semanal, gastos hormiga, tarjetas, fondo de emergencia, inversión). |
| **Reportes** | Mes contra mes, gráfica de 6 meses, categorías, gastos mayores e historial de semanas. |

Los saldos **no se guardan**: se calculan a partir del saldo inicial y los movimientos. Si editas o borras un movimiento, todo se recalcula.

## Estructura

```
index.html              página principal
css/styles.css          estilos (modo claro y oscuro automático)
js/config.js            ← aquí van la URL y la llave de Supabase
js/store.js             capa de datos (Supabase o modo demo)
js/app.js               lógica y pantallas
sw.js                   funcionamiento sin conexión
manifest.webmanifest    datos para instalar como app
icons/                  íconos
supabase/schema.sql             tablas + seguridad (RLS)
supabase/migracion_v2.sql       presupuesto semanal, por cobrar, MSI, gastos fijos, ajustes, push
supabase/tareas_programadas.sql aviso de los lunes y respaldo de los domingos (pg_cron)
supabase/functions/             Edge Function que envía notificaciones y correos
```

Si `js/config.js` está vacío, la app funciona en **modo demo** (los datos quedan solo en ese navegador). Sirve para probarla antes de conectar Supabase.

## Puesta en marcha

### 1. Supabase
1. Entra a supabase.com → **New project** (plan Free). Elige una región cercana (por ejemplo, `us-east-1`).
2. **SQL Editor → New query**: pega todo `supabase/schema.sql` y pulsa **Run**.
3. **Authentication → Users → Add user → Create new user**: tu correo y contraseña, con *Auto Confirm User* activado.
4. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up** para que nadie más pueda crear cuenta.
5. **Project Settings → API Keys**: copia la **Project URL** y la llave **publishable** (o *anon public*) y pégalas en `js/config.js`.

> La llave publishable es pública por diseño. Lo que protege tus datos es el inicio de sesión más las políticas RLS: cada fila solo la puede ver su dueño. **Nunca** uses la llave `service_role` / `secret` en este archivo.

### 2. GitHub Pages
1. Crea un repositorio y sube el contenido de esta carpeta, con `index.html` en la raíz.
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / `(root)`.
3. En 1 o 2 minutos queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

> Con el plan gratuito de GitHub, Pages requiere un repositorio público. Eso solo deja ver el código, no tus datos, que viven en Supabase detrás de tu login.

### 3. Instalar en el celular
- **iPhone (Safari):** abre la URL → Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome):** abre la URL → menú ⋮ → *Instalar app*.

## Uso diario
- **Botón +**: registra gasto, ingreso, *Mover* (transferencias y pago de tarjeta), *Deuda* (abonos) o *Meta* (aportaciones). La app recuerda la última cuenta usada en cada tipo.
- **Al empezar:** en Cuentas, toca cada cuenta → **Ajustar saldo** y escribe lo que marca hoy tu banco. En las tarjetas, escribe la deuda que trae tu estado de cuenta.
- **Tarjetas:** las compras con fecha posterior al corte van al *Nuevo periodo*. Para pagar, toca la tarjeta → *Pagar tarjeta*.
- **Mes a mes:** usa las flechas ‹ › en Inicio y Movimientos.

## Cuidados del plan gratuito de Supabase
- **Pausa por inactividad:** Supabase pausa los proyectos gratis con poca actividad en 7 días. Usarla a diario lo evita. Si te llega el aviso por correo, entra al panel de Supabase y se reactiva. Los datos no se pierden.
- **Sin respaldos automáticos:** en **Más → Respaldo**, descarga el *Respaldo completo (.json)* al menos una vez al mes.

## Pasar datos del modo demo a Supabase
En modo demo: Más → Respaldo → *Respaldo completo (.json)*. Después, ya con Supabase configurado e iniciada la sesión: Más → Respaldo → *Importar respaldo*.

## Publicar cambios
Cada vez que modifiques archivos, cambia `VERSION` en `sw.js` (por ejemplo `mf-v1.0.1`). Así los celulares descargan la versión nueva.
