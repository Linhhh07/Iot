// backend/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',        // user mặc định XAMPP
  password: '',        // mặc định rỗng, đổi nếu bạn đặt password
  database: 'iotdb',   // nhớ tạo DB này trong phpMyAdmin
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;


//cd "D:\projects\iot-dashboard\backend"
//npm start
/*CREATE TABLE IF NOT EXISTS device_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_name VARCHAR(50) NOT NULL,
  state ENUM('ON', 'OFF') DEFAULT 'OFF',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sensor_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  temperature FLOAT NOT NULL,
  humidity FLOAT NOT NULL,
  light FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
*/