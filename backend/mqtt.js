// backend/mqtt.js
const mqtt = require('mqtt');
const db = require('./db');

const MQTT_BROKER = 'mqtt://172.20.10.4:1883';

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: 'user1',
  password: '123'
});

// socket.io instance (sẽ được inject bởi server.js)
let io = null;
function setIO(ioInstance) {
  io = ioInstance;
}

mqttClient.on('connect', () => {
  console.log('MQTT connected');

  mqttClient.subscribe("esp/sensor", (err) => {
    if (err) console.error("Subscribe error esp/sensor:", err);
    else console.log("Subscribed to esp/sensor");
  });

  mqttClient.subscribe("esp/status/#", (err) => {
    if (err) console.error("Subscribe error esp/status/#:", err);
    else console.log("Subscribed to esp/status/#");
  });

  mqttClient.subscribe("esp/hello", (err) => {
    if (err) console.error("Subscribe error esp/hello:", err);
    else console.log("Subscribed to esp/hello");
  });
});

// Xử lý message MQTT ở đây
mqttClient.on('message', async (topic, message) => {
  try {
    const raw = message.toString();

    // sensor
    if (topic === "esp/sensor") {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error("Sensor JSON parse error:", e.message);
        return;
      }

      if (data.temp != null && data.hum != null && data.cdsAnalog != null) {
        await db.query(
          "INSERT INTO sensor_data (temperature, humidity, light) VALUES (?, ?, ?)",
          [data.temp, data.hum, data.cdsAnalog]
        );
        console.log("Sensor data saved:", data);

        if (io) {
          io.emit("new_sensor", {
            temperature: data.temp,
            humidity: data.hum,
            light: data.cdsAnalog,
            created_at: new Date()
          });
        }
      } else {
        console.warn("Incomplete sensor data:", data);
      }
    }

    // device status from ESP (ack)
    else if (topic.startsWith("esp/status/")) {
      const device = topic.split("/")[2];
      const state = raw.trim().toUpperCase(); // ON/OFF
      console.log(`Status update: ${device} = ${state}`);

      await db.query(
        "INSERT INTO device_history (device_name, state) VALUES (?, ?)",
        [device, state]
      );

      if (io) {
        io.emit("device_status", {
          device,
          state,
          created_at: new Date()
        });
      }
    }

    // ESP greeting => restore last known states (from history)
    else if (topic === "esp/hello") {
      console.log("ESP connected, syncing last state...");

      const [rows] = await db.query(`
        SELECT t1.device_name, t1.state
        FROM device_history t1
        INNER JOIN (
          SELECT device_name, MAX(created_at) as max_time
          FROM device_history
          GROUP BY device_name
        ) t2 ON t1.device_name = t2.device_name AND t1.created_at = t2.max_time
      `);

      rows.forEach(r => {
        mqttClient.publish(`esp/control/${r.device_name}`, r.state, { qos: 1 });
        console.log(`Restored ${r.device_name} = ${r.state}`);
      });
    }
  } catch (err) {
    console.error("MQTT message error:", err);
  }
});

module.exports = { mqttClient, setIO };
