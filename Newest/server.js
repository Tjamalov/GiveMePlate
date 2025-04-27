const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
    console.error('Error: GOOGLE_MAPS_API_KEY is not set in .env file');
    process.exit(1);
}

const server = http.createServer((req, res) => {
    // Получаем путь к файлу
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Определяем Content-Type на основе расширения файла
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
    }

    // Читаем файл
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            
            // Заменяем переменные окружения только в HTML файлах
            if (contentType === 'text/html') {
                content = content.toString()
                    .replace(/%GOOGLE_MAPS_API_KEY%/g, GOOGLE_MAPS_API_KEY)
                    .replace(/'%GOOGLE_MAPS_API_KEY%'/g, `'${GOOGLE_MAPS_API_KEY}'`);
            }
            
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log('Using Google Maps API Key:', GOOGLE_MAPS_API_KEY);
}); 