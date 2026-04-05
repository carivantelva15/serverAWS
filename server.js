const mqtt = require('mqtt');
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const express = require('express');
const cors = require('cors');

// --- 1. CONFIGURACIÓN FIREBASE ---
// Asegúrate de que el archivo 'serviceAccountKey.json' esté en la misma carpeta
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tu-proyecto-sos.firebaseio.com" // 👈 CAMBIA POR TU URL DE FIREBASE
});

const db = admin.database();

// --- 2. CONFIGURACIÓN MQTT (HiveMQ) ---
const options = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'system-sos',
  password: 'Pasocananeo15*',
};

const client = mqtt.connect(options);
const USUARIO_ID = "0648"; // ID base para este dispositivo

// --- 3. FUNCIONES DE APOYO ---

// Obtiene la hora actual en formato legible (Colombia)
const getFechaLegible = () => {
  return moment().tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss");
};

// Limpia caracteres prohibidos por Firebase (., #, $, [, ])
const limpiarPath = (texto) => {
  return texto.toString().replace(/[.#$[\]]/g, "_");
};

const idLimpio = limpiarPath(USUARIO_ID);

// --- 4. LÓGICA MQTT ---

client.on('connect', () => {
  console.log("✅ Servidor AWS conectado a HiveMQ");
  // Suscribirse a SOS y a la respuesta del TEST del ESP
  client.subscribe(`v1/dispositivos/${USUARIO_ID}/sos`);
  client.subscribe(`v1/dispositivos/${USUARIO_ID}/res`);
});

client.on('message', (topic, message) => {
  const msg = message.toString();
  const fecha = getFechaLegible();

  // Caso 🚨: Recibe Alerta SOS del ESP8266
  if (topic.endsWith('/sos')) {
    console.log(`🚨 SOS Recibido de ${idLimpio}: ${msg} a las ${fecha}`);
    
    // Registrar en el historial de eventos
    db.ref(`logs/${idLimpio}/eventos`).push({
      tipo: "SOS",
      mensaje: msg,
      fecha: fecha
    });

    // Actualizar estado actual para que la App lo vea
    db.ref(`dispositivos/${idLimpio}/estado`).set({
      alerta_activa: true,
      ultima_alerta: fecha
    });
  }

  // Caso 🛠️: El ESP confirma que recibió el comando TEST
  if (topic.endsWith('/res') && msg === "OK_TEST") {
    console.log(`✅ Test confirmado por ESP ${idLimpio} a las ${fecha}`);
    db.ref(`logs/${idLimpio}/eventos`).push({
      tipo: "TEST_CONFIRMADO_POR_ESP",
      fecha: fecha
    });
  }
});

// --- 5. API EXPRESS PARA LA APP ---

const app = express();
app.use(cors());
app.use(express.json());

// Ruta para registrar Logins desde la App
app.post('/login', (req, res) => {
  const { nombre } = req.body;
  const fecha = getFechaLegible();
  const nombreLimpio = limpiarPath(nombre || "Usuario_Anonimo");

  db.ref(`logs/${idLimpio}/logins`).push({
    usuario: nombreLimpio,
    fecha: fecha
  });

  console.log(`👤 Login registrado: ${nombreLimpio} [${fecha}]`);
  res.status(200).send({ status: "ok", mensaje: "Login guardado", fecha: fecha });
});

// Ruta para enviar comandos (TEST / RESET) desde la App
app.post('/comando', (req, res) => {
  const { tipo, usuario_app } = req.body; // tipo: "TEST" o "RESET"
  const fecha = getFechaLegible();

  if (tipo === "TEST" || tipo === "RESET") {
    // Enviar comando al ESP vía MQTT
    client.publish(`v1/dispositivos/${USUARIO_ID}/cmd`, tipo);
    
    // Registrar quién dio la orden en la App
    db.ref(`logs/${idLimpio}/eventos`).push({
      tipo: `COMANDO_${tipo}`,
      ejecutado_por: limpiarPath(usuario_app || "Admin"),
      fecha: fecha
    });

    // Si es RESET, apagamos la alerta en el estado actual de Firebase
    if (tipo === "RESET") {
      db.ref(`dispositivos/${idLimpio}/estado/alerta_activa`).set(false);
    }

    console.log(`🎮 Comando ${tipo} enviado por ${usuario_app}`);
    res.status(200).send({ status: "enviado", comando: tipo });
  } else {
    res.status(400).send({ error: "Comando no válido" });
  }
});

// Verificación de estado del servidor para la App
app.get('/', (req, res) => {
  res.status(200).send("SERVIDOR SOS ONLINE");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 API SOS escuchando en puerto ${PORT}`);
});