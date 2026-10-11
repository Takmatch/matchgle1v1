# 🔒 Matchgle 1 a 1 | Videollamadas Gratis & Chat Privado (+18)

Aplicación web de videochat 1 a 1 con 3 salas privadas, enrutamiento WebRTC anónimo (IP protegida con TURN Relay) y panel de supervisión/moderación para el creador.

---

## 🚀 Características Principales

* **3 Salas 1 a 1:** Capacidad de 2 usuarios por sala (encuentros individuales exclusivos).
* **Ocultación de IP (TURN Relay):** Los usuarios no pueden ver la dirección IP del otro; el tráfico viaja protegido.
* **Panel de Administrador / Creador:** Acceso mediante PIN secreto (`admin1234` por defecto) para entrar a cualquier sala (incluso ocupadas) en modo supervisor con pantalla dividida.
* **Cumplimiento Legal y +18:**
  * Modal obligatorio de verificación de edad (+18) y prohibición de grabación no consentida.
  * Indicador visible en tiempo real de moderación activa (`👁️ Moderador presente`) cuando el administrador está en la sala para evitar delitos contra la intimidad.
* **Chat de Texto Integrado:** Mensajería en tiempo real dentro de la sala.
* **100% Gratuito y Responsivo:** Funciona perfectamente en móviles (con cambio de cámara frontal/trasera) y ordenadores.

---

## 🛠️ Cómo Probarlo en Tu Ordenador (Local)

1. Abre la terminal o consola de comandos en esta carpeta.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia la aplicación:
   ```bash
   npm start
   ```
4. Abre tu navegador en [http://localhost:3000](http://localhost:3000).
   * Para probar una llamada 1 a 1, abre dos ventanas (una normal y otra en modo incógnito) y entra en la misma sala.
   * Para probar el rol de creador, pulsa en **"Administrador"**, introduce el PIN `admin1234` y entra a cualquier sala ocupada para supervisar.

---

## ☁️ Cómo Desplegarlo 100% Gratis en Render.com

1. Sube este proyecto a tu cuenta de **GitHub** (repositorio público o privado).
2. Entra en [Render.com](https://render.com/) e inicia sesión con tu cuenta de GitHub.
3. Haz clic en **"New +"** -> **"Web Service"**.
4. Selecciona tu repositorio de GitHub.
5. Configura los siguientes campos:
   * **Name:** `talkmatch-1a1` (o el nombre que prefieras).
   * **Language:** `Node`.
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free`
6. En la sección **Environment Variables (Variables de Entorno)**, añade:
   * `ADMIN_PIN`: *Tu clave secreta personalizada para moderar* (ej: `MiClaveSecreta99`).
7. Haz clic en **"Deploy Web Service"**.
8. ¡Listo! Render te dará una URL HTTPS gratuita (ej: `https://talkmatch-1a1.onrender.com`) lista para compartir.
