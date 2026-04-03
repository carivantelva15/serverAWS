const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');
const path = require('path');

// --- 1. CONFIGURACIÓN DEL SERVIDOR WEB (Express) ---
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.status(200).send("🚨 Servidor SOS en AWS - Conectado a HiveMQ y Firebase");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Express escuchando en el puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN DE FIREBASE ---
// Importante: El archivo 'serviceAccountKey.json' debe estar en la misma carpeta
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();

// --- 3. CONFIGURACIÓN DE HIVEMQ CLOUD (MQTT Privado) ---
const mqttOptions = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts', // 'mqtts' es obligatorio para puerto 8883 (TLS)
  username: 'system-sos',
  password: 'Pasocananeo15*',
  reconnectPeriod: 2000 // Reintento automático cada 2 segundos
};

const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
  console.log('✅ Servidor AWS conectado exitosamente a HiveMQ Cloud');
  
  // Nos suscribimos a los tópicos del ESP8266 (el "+" captura cualquier ID)
  client.subscribe('v1/dispositivos/+/sos');
  client.subscribe('v1/dispositivos/+/status');
});

// --- 4. LÓGICA DE RECEPCIÓN Y REENVÍO A FIREBASE ---
client.on('message', (topic, message) => {
  const payload = message.toString();
  const topicParts = topic.split('/');
  const deviceId = topicParts[2]; // Extrae el ID (ej: 0648)

  console.log(`📩 Mensaje recibido de [${deviceId}]: ${payload}`);

  // Actualizamos Firebase Realtime Database
  db.ref('dispositivos/' + deviceId).update({
    ultimo_mensaje: payload,
    fecha: new Date().toISOString(),
    timestamp: Date.now()
  })
  .then(() => {
    console.log(`🔥 Firebase actualizado para el dispositivo ${deviceId}`);
  })
  .catch((error) => {
    console.error('❌ Error al escribir en Firebase:', error);
  });
});

client.on('error', (err) => {
  console.error('❌ Error de conexión MQTT:', err);
});

// --- 5. ESCUCHA DE COMANDOS (Opcional: De Firebase a HiveMQ) ---
// Si quieres enviar "ping" o comandos desde Firebase al ESP8266
db.ref('comandos/0648').on('child_added', (snapshot) => {
  const data = snapshot.val();
  if (data && data.mensaje) {
    client.publish('v1/dispositivos/0648/cmd', data.mensaje);
    db.ref('comandos/0648/' + snapshot.key).remove(); // Limpia el comando procesado
    console.log(`📢 Comando enviado al ESP8266: ${data.mensaje}`);
  }
});