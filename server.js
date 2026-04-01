require('dotenv').config();
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');

// --- 1. CONFIGURACIÓN EXPRESS (Para que AWS sepa que el server vive) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send(`🚨 Sistema SOS Activo - ID: ${process.env.USER_ID || "0648"} - AWS OK`);
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'active',
    id: process.env.USER_ID || "0648",
    mqtt_connected: client ? client.connected : false,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
});

// --- 2. CONFIGURACIÓN FIREBASE (Desde Variable de Entorno) ---
console.log('🔧 Inicializando Firebase...');

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Error: FIREBASE_CREDENTIALS no está configurada en el .env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  console.log('✅ Credenciales de Firebase procesadas');
} catch (error) {
  console.error('❌ Error parseando FIREBASE_CREDENTIALS:', error.message);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com"
  });
  console.log('✅ Firebase inicializado correctamente');
} catch (error) {
  console.error('❌ Error fatal al inicializar Firebase:', error);
  process.exit(1);
}

const db = admin.database();

// --- 3. CONFIGURACIÓN MQTT ---
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const ID_USUARIO = process.env.USER_ID || "0648";

console.log(`🔌 Conectando a MQTT: ${MQTT_BROKER}`);
const client = mqtt.connect(MQTT_BROKER);

const getFechaColombia = () => {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour12: true,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

client.on('connect', () => {
  console.log(`🚀 SERVIDOR SOS CONECTADO - ID: ${ID_USUARIO}`);
  
  client.subscribe(`sos/${ID_USUARIO}/#`, (err) => {
    if (err) console.error('❌ Error suscribiendo:', err);
    else console.log(`✅ Suscrito a tópicos de: sos/${ID_USUARIO}/#`);
  });
});

client.on('message', (topic, message) => {
  try {
    const msg = message.toString();
    const partes = topic.split('/');
    const tipoEvento = partes[2]; // sos o online
    
    console.log(`📨 [${tipoEvento}] → ${msg}`);

    if (tipoEvento === 'sos') {
      db.ref(`alertas_historial/${ID_USUARIO}`).push({
        evento: "BOTON_PRESIONADO",
        mensaje: msg,
        fecha_hora: getFechaColombia(),
        unix_time: admin.database.ServerValue.TIMESTAMP
      }).then(() => console.log('🚨 SOS Guardado en Firebase'));
    } 
    else if (tipoEvento === 'online') {
      const estado = (msg === "1") ? "En Línea" : "Desconectado";
      db.ref(`monitoreo_estado/${ID_USUARIO}`).update({
        status: estado,
        ultima_conexion: getFechaColombia()
      });
    }
  } catch (error) {
    console.error('❌ Error en procesamiento de mensaje:', error);
  }
});

// --- 4. ESCUCHA DE COMANDOS DESDE FIREBASE ---
db.ref(`comandos/${ID_USUARIO}`).on('child_added', async (snapshot) => {
  const data = snapshot.val();
  const key = snapshot.key;
  if (!data) return;

  console.log(`📢 Enviando comando al dispositivo: ${data.mensaje}`);
  
  client.publish(`sos/${ID_USUARIO}/cmd`, data.mensaje, async (err) => {
    if (!err) {
      await db.ref(`comandos/${ID_USUARIO}/${key}`).remove();
      console.log(`🗑️ Comando ${key} procesado y eliminado`);
    }
  });
});