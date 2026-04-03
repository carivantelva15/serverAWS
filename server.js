require('dotenv').config();
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');

// --- 1. SERVIDOR EXPRESS (Para salud del sistema) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send(`🚨 Sistema SOS Activo - ID: ${process.env.USER_ID || "0648"} - AWS OK`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN FIREBASE ---
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Error: Falta FIREBASE_CREDENTIALS en el .env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (e) {
  console.error('❌ Error parseando JSON de Firebase');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();

// --- 3. CONFIGURACIÓN MQTT ---
const ID_USUARIO = process.env.USER_ID || "0648";
const client = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com');

const getFechaColombia = () => {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour12: true,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

client.on('connect', () => {
  console.log(`🚀 Conectado a MQTT - Monitoreando ID: ${ID_USUARIO}`);
  client.subscribe(`sos/${ID_USUARIO}/#`);
});

client.on('message', (topic, message) => {
  const msg = message.toString();
  const partes = topic.split('/');
  const tipo = partes[2];

  if (tipo === 'sos') {
    db.ref(`alertas_historial/${ID_USUARIO}`).push({
      evento: "BOTON_PRESIONADO",
      mensaje: msg,
      fecha_hora: getFechaColombia(),
      unix_time: admin.database.ServerValue.TIMESTAMP
    });
    console.log("🚨 SOS Recibido y Guardado");
  } else if (tipo === 'online') {
    db.ref(`monitoreo_estado/${ID_USUARIO}`).update({
      status: (msg === "1") ? "En Línea" : "Desconectado",
      ultima_conexion: getFechaColombia()
    });
  }
});

// --- 4. ESCUCHA DE COMANDOS ---
db.ref(`comandos/${ID_USUARIO}`).on('child_added', (snapshot) => {
  const data = snapshot.val();
  if (data) {
    client.publish(`sos/${ID_USUARIO}/cmd`, data.mensaje);
    db.ref(`comandos/${ID_USUARIO}/${snapshot.key}`).remove();
    console.log(`📢 Comando enviado: ${data.mensaje}`);
  }
});