#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// =======================
// Cấu hình phần cứng
// =======================
#define DHT_PIN 4
#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

#define CDS_ANALOG_PIN 34   // chỉ dùng analog để tính
const int PIN_LIGHT = 2;
const int PIN_FAN   = 18;
const int PIN_AIR   = 19;

// =======================
// Cấu hình WiFi + MQTT
// =======================
const char* ssid = "Huy T3+T4";
const char* password = "123456789";

const char* mqtt_server = "192.168.1.217";
const char* mqtt_user = "user1";
const char* mqtt_password = "123";

WiFiClient espClient;
PubSubClient client(espClient);

// =======================
// Gửi trạng thái thực tế
// =======================
void publishStatus(const char* device, int pin) {
  String topic = "esp/status/" + String(device);
  String msg = digitalRead(pin) == HIGH ? "ON" : "OFF";
  client.publish(topic.c_str(), msg.c_str(), true); // retain = true
}

// =======================
// MQTT Callback
// =======================
void callback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String message = String((char*)payload, length);
  message.trim();

  Serial.print("MQTT Msg topic=");
  Serial.print(topicStr);
  Serial.print(" payload=");
  Serial.println(message);

  bool turnOn = message.equalsIgnoreCase("ON");

  if (topicStr == "esp/control/light") {
    digitalWrite(PIN_LIGHT, turnOn ? HIGH : LOW);
    publishStatus("light", PIN_LIGHT);
  } 
  else if (topicStr == "esp/control/fan") {
    digitalWrite(PIN_FAN, turnOn ? HIGH : LOW);
    publishStatus("fan", PIN_FAN);
  } 
  else if (topicStr == "esp/control/air") {
    digitalWrite(PIN_AIR, turnOn ? HIGH : LOW);
    publishStatus("air", PIN_AIR);
  }
  else if (topicStr == "esp/control/all") {
    digitalWrite(PIN_LIGHT, turnOn ? HIGH : LOW);
    digitalWrite(PIN_FAN, turnOn ? HIGH : LOW);
    digitalWrite(PIN_AIR, turnOn ? HIGH : LOW);
    publishStatus("light", PIN_LIGHT);
    publishStatus("fan", PIN_FAN);
    publishStatus("air", PIN_AIR);
  }
}

// =======================
// MQTT reconnect
// =======================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Đang kết nối MQTT...");
    String clientId = "ESP32Client-" + String(WiFi.macAddress());
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("OK");
      client.subscribe("esp/control/#");

      // 👉 báo hiệu ESP đã lên lại
      client.publish("esp/hello", "online");

      // publish trạng thái hiện tại
      publishStatus("light", PIN_LIGHT);
      publishStatus("fan", PIN_FAN);
      publishStatus("air", PIN_AIR);

    } else {
      Serial.print("Lỗi MQTT, rc=");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

// =======================
// Setup
// =======================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_AIR, OUTPUT);

  dht.begin();

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

// =======================
// Loop
// =======================
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Đọc cảm biến ánh sáng (đảo ngược)
  int rawLight = analogRead(CDS_ANALOG_PIN);
  int invertedLight = 4095 - rawLight;              // đảo: sáng cao, tối thấp
  int cdsDigital = (invertedLight > 2000) ? 1 : 0;  // 1 = sáng, 0 = tối

  // Đọc DHT
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (!isnan(temp) && !isnan(hum)) {
    String payload = "{";
    payload += "\"temp\":" + String(temp, 2) + ",";
    payload += "\"hum\":" + String(hum, 2) + ",";
    payload += "\"cdsDigital\":" + String(cdsDigital) + ",";
    payload += "\"cdsAnalog\":" + String(invertedLight);
    payload += "}";

    client.publish("esp/sensor", payload.c_str());
    Serial.print("Sensor publish: ");
    Serial.println(payload);
  }

  delay(2000);
}
