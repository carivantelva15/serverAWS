const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.status(200).send("🚨 Servidor SOS Activo - Limpiando IDs de Firebase");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();

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
  client.subscribe('v1/dispositivos/+/sos');
  client.subscribe('v1/dispositivos/+/status');
  client.subscribe('v1/dispositivos/+/cmd');
});

client.on('message', (topic, message) => {
  const payload = message.toString();
  const topicParts = topic.split('/');
  
  // 🛠️ LIMPIEZA DEL ID: Eliminamos puntos, hashtags, etc.
  // "S.O.S Madre" se convertirá en "SOS Madre"
  const rawDeviceId = topicParts[2];
  const cleanDeviceId = rawDeviceId.replace(/[.#$\[\]]/g, ""); 
  
  const type = topicParts[3];

  if (!payload || payload === "0" || payload === "") return;

  console.log(`📩 [${type.toUpperCase()}] de ${cleanDeviceId}: ${payload}`);

  // Usamos el ID limpio para Firebase
  db.ref('dispositivos/' + cleanDeviceId).update({
    nombre_original: rawDeviceId, // Guardamos el original por si acaso
    ultimo_mensaje: payload,
    tipo_evento: type,
    fecha: new Date().toISOString(),
    timestamp: Date.now()
  })
  .then(() => {
    console.log(`🔥 Firebase actualizado para ${cleanDeviceId}`);
  })
  .catch((err) => console.error("❌ Error Firebase:", err));
});

// ESCUCHA DE COMANDOS (App -> AWS -> ESP8266)
db.ref('comandos').on('child_added', (snapshot) => {
  const deviceId = snapshot.key;
  
  db.ref(`comandos/${deviceId}`).on('child_added', (cmdSnap) => {
    const data = cmdSnap.val();
    if (data && data.mensaje) {
      console.log(`📢 Enviando comando [${data.mensaje}] a dispositivo ${deviceId}`);
      
      // Enviamos el comando al tópico original (con puntos si los tiene)
      // Buscamos si tenemos el nombre real guardado o usamos el ID
      client.publish(`v1/dispositivos/${deviceId}/cmd`, data.mensaje, { qos: 1 });
      
      db.ref(`comandos/${deviceId}/${cmdSnap.key}`).remove();
    }
  });
});

client.on('error', (err) => console.error('❌ Error MQTT:', err));