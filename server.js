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
const mqtt = require('mqtt');

// 1. Configuración con tus nuevas credenciales de HiveMQ Privado
const options = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts', // 'mqtts' es obligatorio para el puerto 8883 (TLS)
  username: 'system-sos',
  password: 'Pasocananeo15*',
  reconnectPeriod: 1000 // Intenta reconectar cada segundo si se cae
};

const client = mqtt.connect(options);

client.on('connect', () => {
  console.log('✅ Servidor AWS reconectado exitosamente a HiveMQ Privado');
  
  // 2. Suscribirse a los nuevos tópicos que definimos para el ESP8266
  // Usamos el "+" para capturar el ID 0648 y cualquier otro
  client.subscribe('v1/dispositivos/+/sos');
  client.subscribe('v1/dispositivos/+/status');
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  const topicParts = topic.split('/');
  const deviceId = topicParts[2]; // Aquí extrae el "0648"

  console.log(`📩 Alerta recibida de ${deviceId}: ${payload}`);

  // 3. AQUÍ REUTILIZA TU LÓGICA DE FIREBASE QUE YA TENÍAS
  // Ejemplo (mantén el código de Firebase que ya te funcionaba):
  /*
  db.ref('tu_ruta_de_firebase/' + deviceId).update({
    mensaje: payload,
    timestamp: Date.now()
  });
  */
});

client.on('error', (err) => {
  console.error('❌ Error de conexión MQTT en AWS:', err);
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