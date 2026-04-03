const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');
const path = require('path');

// --- 1. SERVIDOR EXPRESS ---
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.status(200).send("🚨 Servidor SOS Activo - Monitoreando HiveMQ y Firebase");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

// --- 2. FIREBASE ADMIN ---
// Recuerda que 'serviceAccountKey.json' debe estar físicamente en la carpeta en AWS
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();

// --- 3. CONFIGURACIÓN HIVEMQ ---
const mqttOptions = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'system-sos',
  password: 'Pasocananeo15*',
  reconnectPeriod: 2000
};

const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
  console.log('✅ Conectado a HiveMQ Cloud');
  // Nos suscribimos a SOS, STATUS y CMD de cualquier dispositivo
  client.subscribe('v1/dispositivos/+/sos');
  client.subscribe('v1/dispositivos/+/status');
  client.subscribe('v1/dispositivos/+/cmd');
});

// --- 4. FILTRO DE MENSAJES (Evita bucles de SOS) ---
client.on('message', (topic, message) => {
  const payload = message.toString();
  const topicParts = topic.split('/');
  const deviceId = topicParts[2];
  const type = topicParts[3]; // 'sos', 'status' o 'cmd'

  // Ignoramos mensajes vacíos o el "0" de desconexión para no disparar alertas falsas
  if (!payload || payload === "0" || payload === "") {
    console.log(`ℹ️ Info: Mensaje de control o vacío en [${deviceId}] ignorado.`);
    return;
  }

  console.log(`📩 [${type.toUpperCase()}] de ${deviceId}: ${payload}`);

  // Actualizamos Firebase
  db.ref('dispositivos/' + deviceId).update({
    ultimo_mensaje: payload,
    tipo_evento: type,
    fecha: new Date().toISOString(),
    timestamp: Date.now()
  })
  .then(() => {
    console.log(`🔥 Firebase actualizado para ${deviceId}`);
  })
  .catch((err) => console.error("❌ Error Firebase:", err));
});

// --- 5. ESCUCHA DE COMANDOS (App -> AWS -> ESP8266) ---
// Cuando la App escribe en 'comandos/ID', AWS lo manda al ESP y limpia la DB
db.ref('comandos').on('child_added', (snapshot) => {
  const deviceId = snapshot.key;
  
  db.ref(`comandos/${deviceId}`).on('child_added', (cmdSnap) => {
    const data = cmdSnap.val();
    if (data && data.mensaje) {
      console.log(`📢 Enviando comando [${data.mensaje}] a dispositivo ${deviceId}`);
      
      // Publicamos al ESP8266
      client.publish(`v1/dispositivos/${deviceId}/cmd`, data.mensaje, { qos: 1 });
      
      // Borramos el comando procesado para que no se repita al reiniciar el server
      db.ref(`comandos/${deviceId}/${cmdSnap.key}`).remove();
    }
  });
});

client.on('error', (err) => console.error('❌ Error MQTT:', err));