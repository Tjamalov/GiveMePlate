from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')

if not GOOGLE_MAPS_API_KEY:
    print('Error: GOOGLE_MAPS_API_KEY is not set in .env file')
    exit(1)

class CustomHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('.html'):
            with open(self.path[1:], 'r', encoding='utf-8') as f:
                content = f.read()
                content = content.replace('%GOOGLE_MAPS_API_KEY%', GOOGLE_MAPS_API_KEY)
                content = content.replace("'%GOOGLE_MAPS_API_KEY%'", f"'{GOOGLE_MAPS_API_KEY}'")
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
        else:
            super().do_GET()

print(f'Server is running at http://localhost:8000')
print(f'Using Google Maps API Key: {GOOGLE_MAPS_API_KEY}')

httpd = HTTPServer(('localhost', 8000), CustomHandler)
httpd.serve_forever() 