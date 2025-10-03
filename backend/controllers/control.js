const mqtt = require('mqtt');
const db = require('./db');

const MQTT_BROKER = 'mqtt://192.168.1.217:1883';

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: 'user1',
  password: '123'
});

// socket.io instance (inject từ server.js)
let io;
function setIO(ioInstance) {
  io = ioInstance;
}

mqttClient.on('connect', () => {
  console.log('✅ MQTT connected');

  // subscribe cảm biến
  mqttClient.subscribe("esp/sensor", (err) => {
    if (err) console.error("❌ Subscribe error:", err);
    else console.log("📡 Subscribed to esp/sensor");
  });

  // subscribe trạng thái thiết bị
  mqttClient.subscribe("esp/status/#", (err) => {
    if (err) console.error("❌ Subscribe error:", err);
    else console.log("📡 Subscribed to esp/status/#");
  });

  // 👉 thêm hello để sync lại trạng thái khi ESP bật lên
  mqttClient.subscribe("esp/hello", (err) => {
    if (err) console.error("❌ Subscribe error:", err);
    else console.log("📡 Subscribed to esp/hello");
  });
});

// =======================
// Xử lý dữ liệu MQTT
// =======================
mqttClient.on('message', async (topic, message) => {
  try {
    const raw = message.toString();

    // ---------- Cảm biến ----------
    if (topic === "esp/sensor") {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error("❌ Sensor JSON parse error:", e.message);
        return;
      }

      if (data.temp != null && data.hum != null && data.cdsAnalog != null) {
        await db.query(
          "INSERT INTO sensor_data (temperature, humidity, light) VALUES (?, ?, ?)",
          [data.temp, data.hum, data.cdsAnalog]
        );

        console.log("🌡️ Sensor saved:", data);

        if (io) {
          io.emit("new_sensor", {
            temperature: data.temp,
            humidity: data.hum,
            light: data.cdsAnalog,
            created_at: new Date()
          });
        }
      } else {
        console.warn("⚠️ Incomplete sensor data:", data);
      }
    }

    // ---------- Trạng thái thiết bị ----------
        // ---------- Trạng thái thiết bị ----------
    else if (topic.startsWith("esp/status/")) {
      const device = topic.split("/")[2]; // ví dụ: esp/status/light
      const state = raw.trim().toUpperCase(); // ép thành ON / OFF

      console.log(`📥 Status update: ${device} = ${state}`);

      // 👉 Lấy trạng thái gần nhất từ DB
      const [lastRows] = await db.query(
        "SELECT state FROM device_history WHERE device_name = ? ORDER BY created_at DESC LIMIT 1",
        [device]
      );

      const lastState = lastRows.length ? lastRows[0].state : null;

      if (lastState !== state) {
        // Chỉ insert nếu có thay đổi
        await db.query(
          "INSERT INTO device_history (device_name, state) VALUES (?, ?)",
          [device, state]
        );
        console.log(`💾 Saved history: ${device} -> ${state}`);
      } else {
        console.log(`⏩ No change, skip insert for ${device}`);
      }

      // Phát realtime cho frontend (luôn emit để UI update kịp)
      if (io) {
        io.emit("device_status", {
          device,
          state,
          created_at: new Date()
        });
      }
    }


    // ---------- ESP báo kết nối lại ----------
    else if (topic === "esp/hello") {
      console.log("📡 ESP connected, syncing last state...");

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
        mqttClient.publish(`esp/control/${r.device_name}`, r.state);
        console.log(`➡️ Restore ${r.device_name} = ${r.state}`);
      });
    }
  } catch (err) {
    console.error("❌ MQTT message error:", err);
  }
});

module.exports = { mqttClient, setIO };
