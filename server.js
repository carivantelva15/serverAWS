const mqtt = require('mqtt');
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const express = require('express');
const cors = require('cors');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sos-system-5fc8a-default-rtdb.firebaseio.com/"
});

const db = admin.database();

const options = {
  host: '57b7659f151946d6875ff578dc480234.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'system-sos',
  password: 'Pasocananeo15*',
};

const client = mqtt.connect(options);
const USUARIO_ID = "0648";

const getFechaLegible = () => {
  return moment().tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss");
};

const limpiarPath = (texto) => {
  return texto.toString().replace(/[.#$[\]]/g, "_");
};

const idLimpio = limpiarPath(USUARIO_ID);

client.on('connect', () => {
  console.log("✅ Servidor AWS conectado a HiveMQ");
  client.subscribe(`v1/dispositivos/${USUARIO_ID}/sos`);
  client.subscribe(`v1/dispositivos/${USUARIO_ID}/res`);
});

client.on('message', (topic, message) => {
  const msg = message.toString().trim();
  const fecha = getFechaLegible();

  if (topic.endsWith('/sos')) {
    // AJUSTE OBLIGATORIO: 1 activa, 0 desactiva
    if (msg === "1" || msg === "ALERTA_ACTIVA") {
      console.log(`🚨 SOS Recibido: ${msg} a las ${fecha}`);
      db.ref(`logs/${idLimpio}/eventos`).push({ tipo: "SOS_INICIO", fecha: fecha });
      db.ref(`dispositivos/${idLimpio}/estado`).set({ alerta_activa: true, ultima_alerta: fecha });
    } 
    else if (msg === "0") {
      console.log(`✅ SOS Finalizado por ESP a las ${fecha}`);
      db.ref(`dispositivos/${idLimpio}/estado`).update({ alerta_activa: false });
    }
  }

  if (topic.endsWith('/res')) {
    console.log(`🛠️ Respuesta ESP: ${msg}`);
    // Registro de TEST_EXITOSO o cualquier respuesta del ESP
    db.ref(`logs/${idLimpio}/eventos`).push({ tipo: `ESP_RES_${msg}`, fecha: fecha });
  }
});

const app = express();
app.use(cors());
app.use(express.json());

app.post('/login', (req, res) => {
  const { nombre } = req.body;
  const fecha = getFechaLegible();
  db.ref(`logs/${idLimpio}/logins`).push({ usuario: limpiarPath(nombre || "Usuario"), fecha: fecha });
  res.status(200).send({ status: "ok" });
});

app.post('/comando', (req, res) => {
  const { tipo, usuario_app } = req.body;
  const fecha = getFechaLegible();

  if (tipo === "TEST" || tipo === "RESET") {
    client.publish(`v1/dispositivos/${USUARIO_ID}/cmd`, tipo);
    db.ref(`logs/${idLimpio}/eventos`).push({ tipo: `APP_${tipo}`, ejecutado_por: limpiarPath(usuario_app || "Admin"), fecha: fecha });
    
    if (tipo === "RESET") {
      db.ref(`dispositivos/${idLimpio}/estado/alerta_activa`).set(false);
    }
    res.status(200).send({ status: "enviado" });
  } else {
    res.status(400).send({ error: "No válido" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 API SOS escuchando en puerto ${PORT}`));