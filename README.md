1. Dự Án IoT - Hệ Thống Giám Sát và Điều Khiển Thời Gian Thực

2. Giới thiệu
Dự án xây dựng hệ thống IoT đơn giản dùng ESP32 kết nối các cảm biến DHT11 (nhiệt độ, độ ẩm) và CDS/LDR (ánh sáng). Dữ liệu được gửi về server qua MQTT, hiển thị trực quan trên web và cho phép điều khiển ngược các thiết bị như LED, quạt.

3. Tính cấp thiết
- Hệ thống nhỏ gọn, chi phí thấp, dễ triển khai trong mạng LAN.
- Người dùng theo dõi và điều khiển qua trình duyệt web mà không cần thiết bị chuyên dụng.
- Có thể mở rộng cho các ứng dụng thông minh hơn sau này.

4. Mục tiêu
- Thu thập dữ liệu cảm biến thời gian thực.
- Hiển thị dữ liệu qua giao diện web.
- Điều khiển thiết bị từ xa qua web.
- Cập nhật dữ liệu nhanh qua MQTT/WebSocket.

5. Phạm vi
- Hoạt động trong mạng LAN.
- Thiết bị điều khiển cơ bản (LED, quạt mô phỏng).
- Phần cứng: ESP32, DHT11, CDS/LDR.
- Phần mềm: Node.js server, MySQL database.

---

Liên hệ: linh.email@example.com  
GitHub: https://github.com/linh01
