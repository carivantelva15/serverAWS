require('dotenv').config();
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');

// --- 1. SERVIDOR EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;
const ID_USUARIO = process.env.USER_ID || "0648";

app.get('/', (req, res) => {
  res.status(200).send(`🚨 Sistema SOS Activo - ID: ${ID_USUARIO} - AWS OK`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN FIREBASE ---
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Error: Falta FIREBASE_CREDENTIALS en el .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();

// --- 3. CONFIGURACIÓN MQTT PRIVADO ---
const options = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'system-sos',
  password: 'Pasocananeo15*',
  reconnectPeriod: 1000
};

const client = mqtt.connect(options);

client.on('connect', () => {
  console.log('✅ Servidor AWS reconectado exitosamente a HiveMQ Privado');
  client.subscribe('v1/dispositivos/+/sos');
  client.subscribe('v1/dispositivos/+/status');
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  const topicParts = topic.split('/');
  const deviceId = topicParts[2]; 

  console.log(`📩 Alerta recibida de ${deviceId}: ${payload}`);

  // --- ESCritura en Firebase (ACTIVA) ---
  db.ref('dispositivos/' + deviceId).update({
    ultimo_mensaje: payload,
    fecha: new Date().toISOString(),
    timestamp: Date.now()
  }).then(() => {
    console.log(`🔥 Datos guardados en Firebase para ${deviceId}`);
  }).catch(err => console.error('❌ Error Firebase:', err));
});

client.on('error', (err) => {
  console.error('❌ Error MQTT:', err);
});

// --- 4. ESCUCHA DE COMANDOS ---
db.ref(`comandos/${ID_USUARIO}`).on('child_added', (snapshot) => {
  const data = snapshot.val();
  if (data && data.mensaje) {
    client.publish(`v1/dispositivos/${ID_USUARIO}/cmd`, data.mensaje);
    db.ref(`comandos/${ID_USUARIO}/${snapshot.key}`).remove();
    console.log(`📢 Comando enviado a ${ID_USUARIO}: ${data.mensaje}`);
  }
});