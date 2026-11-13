# Desarrollo y pruebas locales sin Firebase real

Este entorno usa **Firebase Emulator Suite**, proyecto ficticio `demo-wellsprep`.
No necesita una cuenta Google, `firebase login`, credenciales de administrador ni
un proyecto Firebase real. No ejecutar `firebase deploy` para estas pruebas.

## Preparación

- Node.js 24 y npm 11 (versiones verificadas en este entorno).
- Java 21 para Firestore Emulator.
- `npm ci` para instalar las dependencias fijadas en `package-lock.json`.
- Chromium del sistema (`/usr/bin/chromium` en este entorno), o el navegador de
  Playwright instalado con `npx playwright install chromium`. Se puede seleccionar
  el ejecutable mediante `CHROMIUM_EXECUTABLE`.
- En el primer arranque Firebase descarga su emulador oficial desde
  `storage.googleapis.com`. Ese dominio debe estar permitido por la política de
  red. Se mantiene TLS y la verificación de integridad del CLI. La caché queda en
  `.cache/firebase/emulators`; no se requiere descargarlo en cada ejecución.

Los comandos se ejecutan desde la raíz de este checkout. No hacen falta worktrees
adicionales: cada tarea en la nube ya tiene su entorno aislado.

## Comandos

```sh
npm test                 # pruebas puras, configuración y bloqueo de red
npm run test:browser     # interfaz + fallo seguro con Auth Emulator inaccesible
npm run test:auth        # integración con Auth Emulator, sin descarga del JAR Firestore
npm run test:firebase    # arranca Auth/Firestore, prueba SDK/reglas, semilla y navegador
npm run dev:local        # arranca emuladores, carga datos sintéticos y abre Express con Vite integrado
npm run test:backup -- /ruta/privada/backup.json # motores e interfaz con copia privada en memoria
```

`test:firebase` y `dev` gestionan el ciclo de vida de los emuladores. No se deben
ejecutar simultáneamente: ambos usan Auth `127.0.0.1:9099`, Firestore
`127.0.0.1:8080` y el navegador de desarrollo `127.0.0.1:5173`. Los puertos deben
estar libres. No se publica ninguna vista ni servicio externo.

En la aplicación, **Entrar con datos sintéticos** accede a la cuenta local que
crea la semilla. El aviso permanente identifica el entorno de pruebas.
Los datos se mantienen solo durante la ejecución de los emuladores; no se
importan ni exportan snapshots de producción.

La semilla es repetible: crea/reutiliza solo una cuenta ficticia y sobrescribe
sus documentos conocidos por ID, sin vaciar bases ni borrar otros usuarios.
Para un flujo manual avanzado puede arrancarse `npm run emulators` y, en otra
terminal, ejecutar `seed:local` con las tres variables exactas:

```sh
GCLOUD_PROJECT=demo-wellsprep \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed:local
```

No usar los datos de acceso ficticios fuera del emulador. Están publicados como
constantes de prueba en el código y no son secretos.

## Datos incluidos

`tests/fixtures/syntheticStudyData.ts` contiene dos usuarios ficticios, temas de
12 y 8 páginas, cobertura del 50 % y 100 %, y doce sesiones. Incluye estudio
parcial, tres refrescos, repaso parcial/completo, cantes con nota y segundos,
PLSEMA por fase y desglose por página. No procede de ninguna exportación real.

La semilla escribe bajo el UID devuelto por Auth Emulator, utilizando el SDK
cliente y las reglas del repositorio. Las pruebas de permisos usan otras cuentas
con sufijo `+firestore-test` y limpian únicamente sus documentos sintéticos.

Los campos de cobertura y PLSEMA representan escenarios para desarrollar y
probar. No significan que los problemas de cálculo y conservación de telemetría
identificados en la auditoría estén resueltos.

El flujo con backup se documenta en [BACKUP_VALIDATION.md](BACKUP_VALIDATION.md).
Usa las pantallas reales con transporte SDK en memoria, sin conexión a Firebase;
no sustituye las pruebas de integración con el emulador.

## Barreras de aislamiento

1. Firebase usa el emulador por defecto, también en la compilación. El proyecto
   y los destinos locales se validan antes de inicializar los SDK.
2. Un emulador caído provoca un error; no existe fallback automático al proyecto
   real. Las pruebas rechazan explícitamente el modo de producción.
3. El lanzador fija el proyecto `demo-wellsprep`, usa un almacén de configuración
   del CLI separado y elimina las variables comunes de credenciales heredadas
   del proceso hijo. No lee archivos de credenciales.
4. Las pruebas Node y la semilla bloquean `fetch` externo y sockets fuera de
   loopback/puertos 8080 y 9099 mediante `local-only-network.cjs`; los tests HTTP habilitan explícitamente también 3321 y 3322. Es una barrera
   para estos procesos, no un sandbox general del sistema operativo.
5. Las pruebas de navegador usan un perfil nuevo y bloquean solicitudes fuera
   de los tres destinos locales. También comprueban la política CSP del servidor
   y fuerzan un fallo de Auth para verificar que no hay conexión a producción.
6. `npm run dev:local` arranca Express con Vite integrado y el backend conectado exclusivamente a los emuladores. No lee `uploads` ni recibe una clave Gemini. Los canales automáticos externos permanecen desactivados; la API local permite probar credenciales personales e ingreso de eventos sintéticos. Las fuentes privadas del servidor y claves están bloqueadas también en desarrollo. Los recorridos visuales de replay usan Vite solo y rechazan `/api`; no son pruebas de persistencia.
7. `test:firebase` incluye el recorrido navegador → Express → Auth/Firestore emulados: login, credencial personal, ingreso autenticado, lectura y denegación de fuentes privadas. Los procesos se cierran al terminar.

El modo local no necesita `.env`. Los valores `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIRESTORE_EMULATOR_HOST` y `VITE_FIREBASE_AUTH_EMULATOR_HOST`, si se indican,
deben coincidir con el proyecto ficticio y los destinos locales admitidos.

## Límites de las verificaciones

Las pruebas de reglas cubren `users/{uid}`, denegación de apropiación de registros raíz y colecciones internas del servidor, con las reglas reales del repositorio. No reparan registros heredados ni certifican reglas desplegadas en producción.

`npm run lint` comprueba tipos y `npm run build` compila. Ninguno demuestra por sí
solo acceso correcto al emulador: la verificación de integración es
`npm run test:firebase`, que debe finalizar sin pruebas omitidas.

La aplicación de producción queda fuera de este flujo. El acceso a ella exige
el opt-in explícito `VITE_FIREBASE_MODE=production`; no establecerlo en pruebas.
Una compilación ordinaria ahora usa el proyecto demo. Antes de cualquier futuro
despliegue real habrá que revisar conscientemente esa configuración.
