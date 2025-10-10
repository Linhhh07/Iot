//// backend/routes/api.js
const express = require('express');
const db = require('../db');
const moment = require('moment-timezone');
const { mqttClient } = require('../mqtt'); // dùng destructure

const router = express.Router();

function formatRows(rows) {
  return rows.map(r => ({
    ...r,
    created_at: moment(r.created_at)
      .tz("Asia/Ho_Chi_Minh")
      .format("YYYY-MM-DD HH:mm:ss")
  }));
}

// ===================
// 🔎 Sensors Search API (multi-field + time + pagination + precise + sort)
// ===================
// ===================
// 🔎 Sensors Search API (multi-field + time + pagination + precise + sort)
// ===================
// ===================
// 🔎 Sensors Search API (rút gọn, bỏ "query=", hỗ trợ search=... hoặc field cụ thể)
// ===================
router.get('/sensors/search', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      temperature,
      humidity,
      light,
      time,
      sortKey = "created_at",
      sortOrder = "desc"
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "1=1";
    const params = [];

    // ===== 1Lọc theo field cụ thể =====
    if (temperature) {
      where += " AND temperature = ?";
      params.push(parseFloat(temperature));
    }
    if (humidity) {
      where += " AND humidity = ?";
      params.push(parseInt(humidity));
    }
    if (light) {
      where += " AND light = ?";
      params.push(parseFloat(light));
    }

    // ===== 2️ Tìm toàn cục =====
    if (search && !temperature && !humidity && !light) {
      const q = search.trim();
      if (!isNaN(q)) {
        // Nếu là số → tìm theo tất cả trường số
        where += ` AND (
          temperature = ? OR
          humidity = ? OR
          light = ?
        )`;
        params.push(parseFloat(q), parseInt(q), parseFloat(q));
      } else {
        // Nếu là chữ → tìm trong thời gian
        where += " AND created_at LIKE ?";
        params.push(`%${q}%`);
      }
    }

    // ===== 3 Lọc theo thời gian =====
    if (time) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
        where += " AND created_at BETWEEN ? AND ?";
        params.push(`${time} 00:00:00`, `${time} 23:59:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)) {
        where += " AND created_at BETWEEN ? AND ?";
        params.push(`${time}:00`, `${time}:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)) {
        where += " AND created_at = ?";
        params.push(time);
      } else {
        return res.status(400).json({ error: "Invalid time format" });
      }
    }

    // ===== 4 Đếm tổng =====
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM sensor_data WHERE ${where}`,
      params
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / parseInt(limit));

    // ===== 5 Sort an toàn =====
    const validSortKeys = ["id", "temperature", "humidity", "light", "created_at"];
    const safeSortKey = validSortKeys.includes(sortKey) ? sortKey : "created_at";
    const safeSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    // ===== 6 Lấy dữ liệu =====
    const [rows] = await db.query(
      `SELECT id, temperature, humidity, light, created_at
       FROM sensor_data
       WHERE ${where}
       ORDER BY ${safeSortKey} ${safeSortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      sortKey: safeSortKey,
      sortOrder: safeSortOrder,
      data: formatRows(rows)
    });

  } catch (err) {
    console.error("❌ /sensors/search error:", err);
    res.status(500).json({ error: 'DB error' });
  }
});



// ===================
// Devices API (latest device state, có filter time nếu cần)
// ===================
router.get('/devices', async (req, res) => {
  try {
    const { time } = req.query;

    let where = "1=1";
    const params = [];

    // ⏰ Filter theo time (giống sensors/search)
    if (time) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
        where += " AND t1.created_at BETWEEN ? AND ?";
        params.push(`${time} 00:00:00`, `${time} 23:59:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)) {
        where += " AND t1.created_at BETWEEN ? AND ?";
        params.push(`${time}:00`, `${time}:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)) {
        where += " AND t1.created_at = ?";
        params.push(time);
      }
    }

    const [rows] = await db.query(`
      SELECT t1.device_name, t1.state, t1.created_at
      FROM device_history t1
      INNER JOIN (
        SELECT device_name, MAX(created_at) as max_time
        FROM device_history
        GROUP BY device_name
      ) t2 
      ON t1.device_name = t2.device_name 
      AND t1.created_at = t2.max_time
      WHERE ${where}
    `, params);

    res.json(formatRows(rows));
  } catch (err) {
    console.error("❌ /devices error:", err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Toggle device: gửi lệnh MQTT
router.post('/devices/:id/toggle', async (req, res) => {
  const { id } = req.params;
  let { action } = req.body || {}; // action có thể undefined

  try {
    if (!action) {
      // lấy trạng thái gần nhất từ history
      const [rows] = await db.query(
        "SELECT state FROM device_history WHERE device_name = ? ORDER BY created_at DESC LIMIT 1",
        [id]
      );
      const current = rows.length ? rows[0].state : 'OFF';
      action = (current === 'ON') ? 'OFF' : 'ON';
    } else {
      action = action.toUpperCase() === 'ON' ? 'ON' : 'OFF';
    }

    mqttClient.publish(`esp/control/${id}`, action, { qos: 1 });
    console.log(`📤 Sent control -> esp/control/${id} = ${action}`);

    res.json({ device: id, requested: action, status: "sent" });
  } catch (err) {
    console.error("❌ toggle error:", err);
    res.status(500).json({ error: 'server error' });
  }
});

// Device status (latest from history)
router.get('/devices/:id/status', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT device_name, state, created_at FROM device_history WHERE device_name = ? ORDER BY created_at DESC LIMIT 1",
      [req.params.id]
    );
    res.json(rows.length ? formatRows(rows)[0] : null);
  } catch (err) {
    console.error("❌ /devices/:id/status error:", err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Device history
// Device history (advanced: pagination + multi-field filter + totalPages)
// Device history (filter action)
// Device history (advanced: pagination + multi-field filter + totalPages + sort)
// Device history (advanced: pagination + multi-field filter + totalPages + sort)
router.get('/devices/history/:device', async (req, res) => {
  try {
    const { device } = req.params;
    const { page = 1, limit = 10, query, time, action, sortKey = "created_at", sortOrder = "desc" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = "1=1";
    const params = [];

    // Filter device
    if (device && device !== "All") {
      where += " AND device_name = ?";
      params.push(device);
    }

    // Filter action
    if (action && action !== "") {
      where += " AND UPPER(state) = ?";
      params.push(action.toUpperCase());
    }

    // Search query
    if (query) {
      const fields = query.split(";");
      fields.forEach(f => {
        const [key, value] = f.split("=");
        if (value !== undefined && value !== "") {
          if (key === "state") {
            where += " AND state LIKE ?";
            params.push(`%${value}%`);
          }
        }
      });
    }

    // Filter time
    if (time) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
        where += " AND created_at BETWEEN ? AND ?";
        params.push(`${time} 00:00:00`, `${time} 23:59:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)) {
        where += " AND created_at BETWEEN ? AND ?";
        params.push(`${time}:00`, `${time}:59`);
      } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)) {
        where += " AND created_at = ?";
        params.push(time);
      }
    }

    // Count tổng
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM device_history WHERE ${where}`,
      params
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / parseInt(limit));

    // Sort key validate
    const validSortKeys = ["id", "created_at"];
    const safeSortKey = validSortKeys.includes(sortKey) ? sortKey : "created_at";
    const safeSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    // safe escapeId (nếu db.escapeId không tồn tại thì fallback đơn giản)
    const escapeId = typeof db.escapeId === 'function'
      ? db.escapeId.bind(db)
      : (k) => `\`${String(k).replace(/`/g, '')}\``;

    // Nếu sort theo id thì không cần duplicate id; nếu sort theo created_at thì tie-breaker id cùng chiều sort
    let orderBy = "";
    if (safeSortKey === "id") {
      orderBy = `ORDER BY id ${safeSortOrder}`;
    } else {
      orderBy = `ORDER BY ${escapeId(safeSortKey)} ${safeSortOrder}, id ${safeSortOrder}`;
    }

    // Data query
    const [rows] = await db.query(
      `SELECT id, device_name, state, created_at
       FROM device_history
       WHERE ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      sortKey: safeSortKey,
      sortOrder: safeSortOrder,
      data: formatRows(rows)
    });
  } catch (err) {
    console.error("❌ /devices/history error:", err);
    res.status(500).json({ error: 'DB error' });
  }
});




module.exports = router;
