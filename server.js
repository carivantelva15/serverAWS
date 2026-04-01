require('dotenv').config(); // <--- AGREGA ESTO AL PRINCIPIO
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');

// ... (todo el resto de tu código igual) ...
const mqtt = require('mqtt');
const admin = require('firebase-admin');
const express = require('express');

// --- CONFIGURACIÓN EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send(`🚨 Sistema SOS Activo - ID: ${process.env.USER_ID || "0648"} - OK`);
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

// --- FIREBASE CON VARIABLES DE ENTORNO ---
console.log('🔧 Inicializando Firebase...');

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Error: FIREBASE_CREDENTIALS no está configurada');
  console.error('📌 Debes configurar esta variable de entorno');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  console.log('✅ Firebase credenciales cargadas');
} catch (error) {
  console.error('❌ Error parseando FIREBASE_CREDENTIALS:', error.message);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com/"
  });
  console.log('✅ Firebase inicializado');
} catch (error) {
  console.error('❌ Error inicializando Firebase:', error);
  process.exit(1);
}

const db = admin.database();

// --- MQTT ---
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const ID_USUARIO = process.env.USER_ID || "0648";

console.log(`🔌 Conectando a MQTT: ${MQTT_BROKER}`);
console.log(`🆔 ID Usuario: ${ID_USUARIO}`);

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
  console.log(`🚀 SERVIDOR ACTIVO - ID: ${ID_USUARIO}`);
  console.log(`📅 Hora: ${getFechaColombia()}`);
  
  client.subscribe(`sos/${ID_USUARIO}/#`, (err) => {
    if (err) {
      console.error('❌ Error suscribiendo:', err);
    } else {
      console.log(`✅ Suscrito a sos/${ID_USUARIO}/#`);
    }
  });
});

client.on('error', (err) => {
  console.error('❌ Error MQTT:', err);
});

client.on('message', (topic, message) => {
  try {
    const msg = message.toString();
    const partes = topic.split('/');
    const tipoEvento = partes[2];
    
    console.log(`📨 ${topic} → ${msg}`);

    if (tipoEvento === 'sos') {
      console.log(`🚨 SOS RECIBIDO`);
      
      db.ref(`alertas_historial/${ID_USUARIO}`).push({
        evento: "BOTON_PRESIONADO",
        mensaje: msg,
        fecha_hora: String(getFechaColombia()),
        unix_time: admin.database.ServerValue.TIMESTAMP
      }).then(() => {
        console.log('✅ SOS guardado');
      }).catch(err => {
        console.error('❌ Error SOS:', err);
      });
    }
    
    else if (tipoEvento === 'online') {
      const estado = (msg === "1") ? "En Línea" : "Desconectado";
      console.log(`📊 Estado: ${estado}`);
      
      db.ref(`monitoreo_estado/${ID_USUARIO}`).update({
        status: estado,
        ultima_conexion: String(getFechaColombia())
      }).catch(err => {
        console.error('❌ Error estado:', err);
      });
    }

  } catch (error) {
    console.error('❌ Error procesando:', error);
  }
});

// --- COMANDOS DESDE FIREBASE ---
console.log('👂 Escuchando comandos...');

db.ref(`comandos/${ID_USUARIO}`).on('child_added', async (snapshot) => {
  try {
    const data = snapshot.val();
    const key = snapshot.key;
    
    if (!data) return;
    
    console.log(`📢 Comando: ${data.mensaje}`);
    
    client.publish(`sos/${ID_USUARIO}/cmd`, data.mensaje, (err) => {
      if (err) {
        console.error('❌ Error publicando:', err);
      } else {
        console.log(`✅ Publicado: ${data.mensaje}`);
      }
    });
    
    if (data.mensaje === "ping") {
      await db.ref(`historial_pings/${ID_USUARIO}`).push({
        supervisor: data.quien || "Familiar",
        accion: "Verificó estado (Ping)",
        fecha_hora: String(getFechaColombia())
      });
      console.log('✅ Ping registrado');
    }
    
    await db.ref(`comandos/${ID_USUARIO}/${key}`).remove();
    console.log(`🗑️ Comando ${key} eliminado`);
    
  } catch (error) {
    console.error('❌ Error comando:', error);
  }
});

console.log('✅ Servidor listo');