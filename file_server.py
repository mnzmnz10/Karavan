#!/usr/bin/env python3
"""
Simple HTTP file server for MongoDB Atlas migration files
Serves JSON files for download from /app/downloads directory
"""

import http.server
import socketserver
import os
import sys

# Change to downloads directory
os.chdir('/app/downloads')

PORT = 8888
DIRECTORY = '/app/downloads'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"🌐 MongoDB Atlas Download Server başlatıldı!")
        print(f"📁 Dosya dizini: {DIRECTORY}")
        print(f"🔗 Web adresi: http://localhost:{PORT}")
        print(f"📝 Ana sayfa: http://localhost:{PORT}/")
        print("📤 İndirilebilir dosyalar:")
        
        # List available files
        for file in os.listdir(DIRECTORY):
            if file.endswith('.json'):
                size = os.path.getsize(os.path.join(DIRECTORY, file))
                print(f"   • {file} ({size//1024}KB)")
        
        print(f"\n⏹️  Sunucuyu durdurmak için Ctrl+C tuşlayın")
        print("=" * 60)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Sunucu durduruldu")
            sys.exit(0)