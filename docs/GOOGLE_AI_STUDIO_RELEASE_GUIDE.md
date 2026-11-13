# Incorporar la versión revisada a la app existente de AI Studio

No necesitas reconstruir Wells Prep. Usa la app existente y el código exacto de la rama `release/wells-prep-production-fixes`. Esta guía no ejecuta despliegues ni migraciones. Los resultados locales están en `RELEASE_VERIFICATION.json`.

## 1. Conservar una vuelta atrás

Conserva la versión publicada anterior, la revisión de Cloud Run si existe, la configuración web de Firebase y una copia de las reglas. Antes del cambio real, el propietario debe exportar cada base utilizada mediante la consola de Google Cloud/Firebase. El backup descargado desde la app puede no incluir todas las colecciones ni distinguir bases: no sustituye esa exportación completa.

Actualizar código no necesita importar un backup ni borrar documentos. Guarda copias fuera del repositorio. Nunca pegues claves de administrador o tus datos en AI Studio para que el modelo reconstruya la app.

## 2. Revisar GitHub

La rama contiene las cinco fases, las correcciones finales, las pruebas y los archivos nuevos. Incluye los últimos commits de `main` disponibles durante la revisión; no se ha fusionado hacia `main`.

En un ordenador con Git y Node 24.22.1, después de que la rama esté subida:

```sh
git clone https://github.com/aasalva2004b-oss/wellsprep.git
cd wellsprep
git switch release/wells-prep-production-fixes
npm ci
npm run lint
npm test
npm run test:firebase
npm run test:release
npm run test:phase-a
npm run test:provider
node scripts/phase-d-browser.mjs
node scripts/phase-e-ui.mjs
npm run build
npm audit --omit=dev
```

Java 21 es necesario para los emuladores; Chromium o el navegador de Playwright para las pruebas visuales. Ejecuta estos comandos uno detrás de otro, dejando libres los puertos locales. `npm run dev:local` arranca el desarrollo con emuladores y semilla sintética; no se usa para publicar. No hacen falta credenciales de producción.

Si la rama no pudo subirse desde este entorno, el informe final indicará el motivo y los commits locales. Desde una sesión GitHub autorizada en este mismo checkout:

```sh
git push -u origin release/wells-prep-production-fixes
```

La rama ya se subió desde este entorno. La creación automática de la PR devolvió `Forbidden`; puedes abrir [esta comparación](https://github.com/aasalva2004b-oss/wellsprep/compare/main...release/wells-prep-production-fixes?expand=1) y usar `docs/PULL_REQUEST_BODY.md` como descripción. Abre una PR hacia `main`, revisa el diff completo y las pruebas. La aprobación y la fusión las realiza el propietario. No elegir solamente los archivos modificados: los nuevos servicios y componentes también son necesarios.

## 3. Llevar el código a la app existente

1. Abre tu aplicación Wells Prep en AI Studio y conserva una copia/versionado anterior.
2. Si tu interfaz ofrece actualizar/importar desde GitHub, comprueba que la dirección sea **GitHub → AI Studio** y selecciona el commit revisado. Exportar a GitHub hace la operación contraria.
3. Si esa función no aparece, utiliza el editor de archivos para sustituir el proyecto por los archivos del commit, conservando rutas y lockfile. No pedir una recreación a partir de un prompt ni aceptar una transferencia parcial.
4. Para preparar un paquete exacto del commit desde Git:

```sh
git archive --format=zip --output ../wellsprep-version-revisada.zip HEAD
```

El ZIP contiene el código confirmado, no datos privados. Adjuntar el ZIP no demuestra por sí solo que AI Studio lo importe; compara el árbol de archivos resultante. La interfaz actual de tu cuenta y su importación directa no se han inspeccionado en este entorno. Si AI Studio no permite transferir el árbol fielmente, conserva GitHub como fuente y publica el runtime desde Cloud Run; no conviertas ese límite del editor en una reconstrucción de la app.

## 4. Ensayo con un Firebase remoto de pruebas

1. Crea un proyecto Firebase separado. Habilita Google Auth y Firestore y carga únicamente datos sintéticos.
2. En la **copia destinada al ensayo**, configura su información web pública en `firebase-applet-config.json`. El proyecto remoto del cliente se toma de ese archivo; `VITE_FIREBASE_PROJECT_ID` no lo sustituye.
3. Elige la base indicada por `firestoreDatabaseId`, o `(default)` si no hay una. La app conserva lectura histórica de la base predeterminada; revisa sus reglas también si se usa una base con nombre.
4. Copia las nuevas `firestore.rules` a la base de pruebas y verifica dos cuentas. No aplicarlas todavía a producción.
5. Añade el dominio de la URL de pruebas a Authentication → Configuración → Dominios autorizados. Prueba login en navegador completo y en la vista previa incrustada.
6. Asigna al servicio una identidad administrada del proyecto de pruebas con los permisos necesarios de Firestore y lectura de usuarios Firebase Auth. El Admin SDK del servidor utiliza esa identidad; no necesita una clave JSON exportada.

## 5. Compilar y arrancar correctamente

Usa Node 24.22.1 y el lockfile. **El modo remoto se fija durante la compilación**, aunque el destino sea un proyecto de pruebas:

```sh
npm ci
VITE_FIREBASE_MODE=production npm run build
```

En la configuración del proceso del servidor, fuera de Git:

```text
NODE_ENV=production
FIREBASE_SERVER_MODE=production
FIREBASE_ALLOW_REMOTE=true
FIREBASE_PROJECT_ID=ID_DEL_PROYECTO_COMPROBADO
FIREBASE_DATABASE_ID=BASE_COMPROBADA
```

El ID y la base deben coincidir con el JSON utilizado al compilar. No definir `FIRESTORE_EMULATOR_HOST` ni `FIREBASE_AUTH_EMULATOR_HOST` en ese servicio remoto. La plataforma suministra `PORT`; el servidor escucha en `0.0.0.0`.

```sh
npm start
```

No usar `npm run dev:local` ni `vite preview` como servidor publicado: las rutas API se sirven mediante Express. Si la plataforma solo sirve archivos estáticos, no soporta este backend; hay que utilizar un runtime Node/Cloud Run.

Alternativa reproducible con Docker, después de comprobar el JSON del proyecto de pruebas:

```sh
docker build --build-arg VITE_FIREBASE_MODE=production -t wellsprep:candidato .
```

El Dockerfile deja el modo emulador como valor seguro predeterminado. La imagen publicada necesita la compilación remota explícita y las variables/identidad de ejecución anteriores. La imagen final funciona con usuario no privilegiado, sin herramientas de desarrollo ni código del backend en la carpeta pública. No incluir `.env`, backups ni claves en la imagen.

## 6. Configurar y probar AeroFocus

1. En Ajustes de Wells Prep, con tu cuenta de pruebas, genera una credencial personal. Se registra su hash privado en Firestore. Rotarla invalida la anterior.
2. Configura el emisor AeroFocus para enviar esa credencial en `X-Webhook-Token` al endpoint HTTPS `/api/webhook/aerofocus`. Conserva identificadores estables de vuelo/transacción al reintentar. No incluyas el token en URLs ni Git.
3. Si AeroFocus usa otro origen web, añade su origen HTTPS exacto en `AEROFOCUS_ALLOWED_ORIGINS` (servidor) y `VITE_AEROFOCUS_ALLOWED_ORIGINS` (compilación del cliente). No usar `*`.
4. Envía un evento sintético dos veces: solo debe aparecer una vez en cuarentena. Edítalo, recarga y reinicia el servicio; debe conservarse. Otra cuenta no debe verlo.
5. Incorpóralo y comprueba su sesión, duración y vínculo. Un aviso del navegador no debe crear registros sin pasar por almacenamiento autenticado.

El token compartido de versiones antiguas ya no funciona. Las URLs antiguas de despliegues independientes deben retirarse o actualizarse; cambiar este repositorio no apaga esos servicios.

PDF/Gemini es opcional. Si se usa, guarda `GEMINI_API_KEY` como secreto **solo del servidor** y prueba un PDF sintético. No añadirlo a variables `VITE_*`. La disponibilidad del modelo externo y esa llamada real permanecen pendientes de ensayo.

## 7. Lista de aceptación antes de usar tus registros

- Dos cuentas: aislamiento de Firestore y API, edición/borrado y tokens falsos rechazados.
- Tema de 6 páginas: estudiar 1–3 deja 3 pendientes; repasarlas no completa estudio; estudiar 4–6 permite refresco de 6 páginas.
- Páginas y palabras coherentes en ficha, temario, estadísticas y planificación; incógnitas sin valores inventados.
- PLSEMA, primer/quinto repaso, refrescos, cante con segundos y capturas de estimación se conservan tras recarga.
- Editar tema/tipo de una sesión invalida un enlace incompatible; reintentar una entrega no duplica registros.
- Política personal de retención conserva sus valores tras medianoche y al volver a una pestaña suspendida.
- Propuestas por cantes: cancelar no guarda; confirmar conserva tareas manuales, compromisos y sumas.
- Móvil a 320/390 px y escritorio: navegación, formularios, modales, foco y teclado utilizables.
- Sin sesión, API privada devuelve 401. `/server.cjs`, `/server.cjs.map`, `/.env`, `/build/server.cjs` y `/package.json` devuelven 404; salud pública no devuelve secretos.
- Credencial AeroFocus y cambios sobreviven a reinicio y varias instancias del servicio.

En producción, inventaría primero las rutas y UID de **ambas bases**. Registros raíz sin propietario o bajo correos requieren revisión aparte: no abrir reglas para hacerlos aparecer. No se ha certificado ese inventario con la copia parcial aportada.

## 8. Publicación manual y reversión

Cuando el ensayo anterior esté aprobado, confirma manualmente el JSON web original, sus dominios Auth y base; construye una nueva imagen remota para ese proyecto y configura la identidad del servicio de producción. Revisa y aplica las reglas aprobadas a cada base correspondiente mediante la consola, conservando una copia de las anteriores. No hay una migración de registros obligatoria demostrada ni un nuevo índice compuesto identificado.

Publica una revisión de Cloud Run desde la versión aprobada, según el flujo disponible en tu app de AI Studio/Google Cloud. Comprueba URL, login, aislamiento y persistencia antes de dirigir todo el tráfico. No validar escribiendo sesiones falsas en tu historial real.

Si falla, vuelve a la revisión anterior del servicio. Revertir código no revierte datos ni reglas: no restaures backups ni reglas antiguas inseguras automáticamente. Conserva los campos nuevos y revisa especialmente clientes antiguos que no entienden sesiones fusionadas. Ninguno de estos pasos externos se ha ejecutado desde este entorno.
