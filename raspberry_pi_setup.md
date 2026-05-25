# Raspberry Pi Setup Guide for Exchange Rate Stability

## Problem Çözümleri

### 1. Network Connectivity İyileştirmeleri

#### WiFi Güçlendirme
```bash
# WiFi power management'ı kapat
sudo iwconfig wlan0 power off

# Network prioritesini arttır
echo 'net.core.rmem_max = 134217728' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' | sudo tee -a /etc/sysctl.conf
```

#### DNS Optimizasyonu
```bash
# /etc/systemd/resolved.conf'u düzenle
sudo nano /etc/systemd/resolved.conf

# Şunları ekle:
DNS=8.8.8.8 1.1.1.1
FallbackDNS=8.8.4.4 1.0.0.1
DNSStubListener=yes
```

### 2. Memory Management

#### Swap Dosyası Oluştur
```bash
# 1GB swap dosyası oluştur
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# /etc/fstab'a ekle
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### Python Memory Optimizasyonu
```bash
# Python garbage collector'ı optimize et
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
```

### 3. API Monitoring Script

#### Döviz API Monitor
```bash
#!/bin/bash
# /home/pi/monitor_exchange.sh

LOG_FILE="/var/log/exchange_monitor.log"
API_URL="http://localhost:8001/api/exchange-rates"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # API'yi test et
    RESPONSE=$(curl -s --connect-timeout 10 --max-time 30 "$API_URL")
    
    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        USD_RATE=$(echo "$RESPONSE" | jq -r '.rates.USD')
        echo "$TIMESTAMP - SUCCESS: USD=$USD_RATE" >> "$LOG_FILE"
    else
        echo "$TIMESTAMP - ERROR: API Failed" >> "$LOG_FILE"
        
        # Backend'i restart et
        sudo systemctl restart your-backend-service
        sleep 60
    fi
    
    # 5 dakikada bir kontrol et
    sleep 300
done
```

### 4. Systemd Service Oluştur

#### Backend Service
```ini
# /etc/systemd/system/karavan-backend.service
[Unit]
Description=Karavan Backend API
After=network.target mongodb.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/karavan-app/backend
Environment=PATH=/home/pi/karavan-app/venv/bin
ExecStart=/home/pi/karavan-app/venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=karavan-backend

[Install]
WantedBy=multi-user.target
```

#### Monitor Service
```ini
# /etc/systemd/system/exchange-monitor.service
[Unit]
Description=Exchange Rate Monitor
After=karavan-backend.service

[Service]
Type=simple
User=pi
ExecStart=/home/pi/monitor_exchange.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### 5. Crontab Job

#### Günlük Restart
```bash
# crontab -e ile ekle
# Her gün sabah 4'te backend'i restart et
0 4 * * * sudo systemctl restart karavan-backend

# Her 2 saatte bir exchange rate'leri güncelle
0 */2 * * * curl -X POST http://localhost:8001/api/exchange-rates/update
```

### 6. Raspberry Pi Performans Optimizasyonu

#### GPU Memory Azalt
```bash
# /boot/config.txt'e ekle
gpu_mem=16
```

#### Temperature Monitoring
```bash
#!/bin/bash
# Sıcaklık 70°C'yi geçerse uyar
TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d'.' -f1)
if [ $TEMP -gt 70 ]; then
    echo "$(date): Temperature high: ${TEMP}°C" >> /var/log/temperature.log
fi
```

### 7. Network Resilience

#### Connection Retry Script
```python
import time
import requests
import subprocess
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_internet():
    try:
        requests.get('https://8.8.8.8', timeout=5)
        return True
    except:
        return False

def restart_networking():
    try:
        subprocess.run(['sudo', 'systemctl', 'restart', 'networking'], check=True)
        logger.info("Network restarted")
        return True
    except:
        logger.error("Failed to restart network")
        return False

while True:
    if not test_internet():
        logger.warning("Internet connection lost, restarting network...")
        restart_networking()
        time.sleep(30)
    
    time.sleep(60)  # Check every minute
```

## Kurulum Adımları

1. **Dependencies Kurulum**
```bash
sudo apt update
sudo apt install -y nginx supervisor redis-server
```

2. **Python Environment**
```bash
cd /home/pi/karavan-app
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

3. **Services Aktivasyon**
```bash
sudo systemctl enable karavan-backend
sudo systemctl enable exchange-monitor
sudo systemctl start karavan-backend
sudo systemctl start exchange-monitor
```

4. **Firewall Ayarları**
```bash
sudo ufw allow 8001
sudo ufw allow 3000
sudo ufw enable
```

Bu optimizasyonlar Raspberry Pi'da döviz API'sinin kesintisiz çalışmasını sağlar.