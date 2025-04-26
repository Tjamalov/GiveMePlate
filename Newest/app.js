const CONFIG = {
    map: {
        zoom: 15,
        center: { lat: 55.76, lng: 37.64 }, // Москва по умолчанию
        controls: true
    },
    search: {
        radius: 1000, // в метрах
        placeTypes: ['cafe', 'restaurant', 'food', 'bar', 'pub', 'bistro'],
        maxResults: 3
    },
    placeTypes: {
        'cafe': 'Кафе',
        'restaurant': 'Ресторан',
        'food': 'Фастфуд',
        'bar': 'Бар',
        'pub': 'Паб',
        'bistro': 'Бистро'
    }
};

class FoodFinder {
    constructor() {
        console.log('Инициализация FoodFinder');
        
        // Проверяем загрузку Google Maps API
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            this.showError("Google Maps API не загружен. Пожалуйста, проверьте подключение к интернету и API ключ.");
            console.error("Google Maps API не загружен");
            return;
        }

        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.highlightedMarker = null;
        this.placesService = null;
        
        // Скрываем карту при инициализации
        const mapElement = document.getElementById('map');
        if (mapElement) {
            mapElement.style.display = 'none';
        }
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        console.log('Инициализация обработчиков событий');
        
        const findPlacesBtn = document.getElementById('findPlacesBtn');
        const luckyBtn = document.getElementById('luckyBtn');
        const refreshBtn = document.getElementById('refresh-map');
        
        if (findPlacesBtn) {
            findPlacesBtn.addEventListener('click', () => {
                console.log('Нажата кнопка "Поиск"');
                this.findPlaces();
            });
        }
        
        if (luckyBtn) {
            luckyBtn.addEventListener('click', () => {
                console.log('Нажата кнопка "Мне повезёт"');
                this.findLuckyPlace();
            });
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                console.log('Нажата кнопка "Обновить карту"');
                this.refreshMap();
            });
        }
    }

    initializeMap() {
        console.log('Инициализация карты');
        
        try {
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                throw new Error('Элемент карты не найден');
            }
            
            this.map = new google.maps.Map(mapElement, {
                center: CONFIG.map.center,
                zoom: CONFIG.map.zoom,
                disableDefaultUI: !CONFIG.map.controls
            });

            this.placesService = new google.maps.places.PlacesService(this.map);
            console.log('Карта инициализирована успешно');
        } catch (error) {
            console.error('Ошибка при инициализации карты:', error);
            this.showError("Ошибка при инициализации карты. Пожалуйста, проверьте API ключ.");
        }
    }

    async findPlaces() {
        if (!navigator.geolocation) {
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
        }

        this.showLoading();

        try {
            console.log('Запрашиваем геолокацию...');
            const position = await this.getCurrentPosition();
            console.log('Получены координаты:', position.coords);
            
            const { latitude, longitude } = position.coords;
            
            if (!latitude || !longitude) {
                throw new Error('Не удалось получить координаты');
            }
            
            console.log('Координаты от браузера:', { latitude, longitude });
            
            // Инициализируем карту только после получения координат
            if (!this.map) {
                this.initializeMap();
            }
            
            this.updateMapPosition(latitude, longitude);
            await this.searchPlaces(latitude, longitude);
        } catch (error) {
            console.error('Ошибка при получении геолокации:', error);
            let errorMessage = "Ошибка при определении местоположения";
            
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = "Доступ к геолокации запрещен. Пожалуйста, разрешите доступ в настройках браузера.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = "Информация о местоположении недоступна";
            } else if (error.code === error.TIMEOUT) {
                errorMessage = "Время ожидания определения местоположения истекло";
            }
            
            this.showError(errorMessage);
        }
    }

    async findLuckyPlace() {
        if (!navigator.geolocation) {
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
        }

        this.showLoading();

        try {
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            console.log('Координаты от браузера:', { latitude, longitude });
            
            this.updateMapPosition(latitude, longitude);
            
            const request = {
                location: new google.maps.LatLng(latitude, longitude),
                radius: 500, // Уменьшаем радиус до 500 метров
                types: ['restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery'],
                language: 'ru'
            };

            console.log('Выполняем поиск:', request);

            const placesService = new google.maps.places.PlacesService(this.map);
            const results = await new Promise((resolve, reject) => {
                placesService.nearbySearch(request, (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        resolve(results);
                    } else {
                        reject(new Error(`Ошибка поиска: ${status}`));
                    }
                });
            });

            console.log('Результаты поиска:', results);
            
            if (!results || results.length === 0) {
                this.showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Обрабатываем найденные места
            const places = results.map(place => {
                try {
                    const coords = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    };
                    
                    const name = place.name || 'Без названия';
                    const address = place.vicinity || 'Адрес не указан';
                    
                    // Проверяем расстояние
                    const distance = this.calculateDistance(
                        latitude, longitude,
                        coords.lat, coords.lng
                    );
                    
                    // Если место слишком далеко, пропускаем его
                    if (distance > 500) {
                        return null;
                    }

                    // Определяем тип места на основе types из API
                    const placeType = this.determinePlaceTypeFromTypes(place.types);
                    if (!placeType) {
                        return null;
                    }
                    
                    return {
                        name,
                        address,
                        lat: coords.lat,
                        lng: coords.lng,
                        distance,
                        type: placeType,
                        placeId: place.place_id
                    };
                } catch (error) {
                    console.error('Ошибка при обработке места:', error, place);
                    return null;
                }
            }).filter(place => place !== null)
              .sort((a, b) => a.distance - b.distance);

            console.log('Обработанные места:', places);
            
            if (places.length === 0) {
                this.showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Выбираем случайное место
            const randomIndex = Math.floor(Math.random() * places.length);
            const luckyPlace = places[randomIndex];
            
            // Сразу открываем страницу деталей
            this.openPlaceDetails(luckyPlace);
        } catch (error) {
            console.error('Ошибка при поиске:', error);
            this.showError("Ошибка при поиске мест");
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            console.log('Запуск getCurrentPosition...');
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('Успешно получена позиция:', position);
                    resolve(position);
                },
                (error) => {
                    console.error('Ошибка геолокации:', error);
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    updateMapPosition(lat, lng) {
        if (!this.map) return;
        
        const position = { lat, lng };
        console.log('Устанавливаем центр карты:', position);
        
        this.map.setCenter(position);
        
        if (this.userMarker) {
            this.userMarker.setPosition(position);
        } else {
            const svg = `
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <text x="20" y="20" font-size="30" text-anchor="middle" dominant-baseline="middle" fill="red">📍</text>
                </svg>
            `;
            const encodedSvg = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
            
            this.userMarker = new google.maps.Marker({
                position: position,
                map: this.map,
                title: "Ваше местоположение",
                icon: {
                    url: 'data:image/svg+xml;charset=utf-8,' + encodedSvg,
                    scaledSize: new google.maps.Size(40, 40),
                    anchor: new google.maps.Point(20, 20)
                }
            });
        }
    }

    showMap() {
        const mapElement = document.getElementById('map');
        const refreshButton = document.getElementById('refresh-map');
        
        if (mapElement) {
            mapElement.style.display = 'block';
            // Принудительно обновляем размер карты
            setTimeout(() => {
                if (this.map) {
                    google.maps.event.trigger(this.map, 'resize');
                }
            }, 100);
        }
        
        if (refreshButton) {
            refreshButton.style.display = 'block';
        }
    }

    async searchPlaces(latitude, longitude) {
        console.log('Начинаем поиск мест...', { latitude, longitude });
        
        const request = {
            location: new google.maps.LatLng(latitude, longitude),
            radius: CONFIG.search.radius,
            types: ['restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery'],
            language: 'ru'
        };

        console.log('Выполняем поиск:', request);

        try {
            const placesService = new google.maps.places.PlacesService(this.map);
            const results = await new Promise((resolve, reject) => {
                placesService.nearbySearch(request, (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        resolve(results);
                    } else {
                        reject(new Error(`Ошибка поиска: ${status}`));
                    }
                });
            });

            console.log('Результаты поиска:', results);
            
            if (!results || results.length === 0) {
                this.showError("Места не найдены поблизости");
                return;
            }

            // Обрабатываем найденные места
            this.allPlaces = results.map(place => {
                try {
                    console.log('Обрабатываем место:', place.name, 'с типами:', place.types);
                    
                    const coords = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    };
                    
                    const name = place.name || 'Без названия';
                    const address = place.vicinity || 'Адрес не указан';
                    
                    // Проверяем расстояние
                    const distance = this.calculateDistance(
                        latitude, longitude,
                        coords.lat, coords.lng
                    );
                    
                    // Если место слишком далеко, пропускаем его
                    if (distance > CONFIG.search.radius) {
                        console.log('Место слишком далеко, пропускаем');
                        return null;
                    }

                    // Определяем тип места на основе types из API
                    const placeType = this.determinePlaceTypeFromTypes(place.types);
                    console.log('Определен тип места:', placeType, 'для', name);
                    
                    if (!placeType) {
                        console.log('Место не подходит по категории, пропускаем');
                        return null;
                    }
                    
                    return {
                        name,
                        address,
                        lat: coords.lat,
                        lng: coords.lng,
                        distance,
                        type: placeType,
                        placeId: place.place_id,
                        types: place.types // Сохраняем оригинальные типы
                    };
                } catch (error) {
                    console.error('Ошибка при обработке места:', error, place);
                    return null;
                }
            }).filter(place => place !== null)
              .sort((a, b) => a.distance - b.distance);

            console.log('Обработанные места:', this.allPlaces);
            
            if (this.allPlaces.length === 0) {
                this.showError("Места не найдены поблизости");
                return;
            }
            
            // Показываем карту и отображаем результаты
            this.showMap();
            this.displayResults();
        } catch (error) {
            console.error('Ошибка при поиске:', error);
            this.showError("Ошибка при поиске мест");
        }
    }

    determinePlaceType(name) {
        try {
            if (!name) return null;
            
            const lowerName = name.toLowerCase();
            console.log('Определяем тип для:', lowerName);

            for (const [type, label] of Object.entries(CONFIG.placeTypes)) {
                if (lowerName.includes(type) || lowerName.includes(label.toLowerCase())) {
                    console.log('Найден тип:', type);
                    return type;
                }
            }
            
            console.log('Тип не определен');
            return null;
        } catch (error) {
            console.error('Ошибка при определении типа:', error);
            return null;
        }
    }

    determinePlaceTypeFromTypes(types) {
        if (!types || !Array.isArray(types)) return null;

        console.log('Определяем тип места из:', types);

        // Словарь соответствия типов Google Places нашим категориям
        const typeMapping = {
            'restaurant': 'restaurant',
            'cafe': 'cafe',
            'bar': 'bar',
            'night_club': 'bar',
            'food': 'food',
            'meal_takeaway': 'food',
            'meal_delivery': 'food',
            'bistro': 'bistro',
            'pub': 'pub'
        };

        // Ищем первый подходящий тип
        for (const type of types) {
            if (typeMapping[type]) {
                console.log('Найден тип:', type, '->', typeMapping[type]);
                return typeMapping[type];
            }
        }

        console.log('Тип не определен');
        return null;
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        
        if (this.allPlaces.length === 0) {
            resultsDiv.innerHTML = "Места не найдены поблизости 😞";
            return;
        }

        let html = "<h3>Ближайшие места:</h3>";
        const visiblePlaces = this.allPlaces.slice(0, CONFIG.search.maxResults);
        html += visiblePlaces.map((place, index) => this.createPlaceHtml(place, index)).join('');
        
        if (this.allPlaces.length > CONFIG.search.maxResults) {
            html += `<div class="show-more">
                <button id="showAllBtn" onclick="app.showAllPlaces()">Показать всё (${this.allPlaces.length})</button>
            </div>`;
        }

        resultsDiv.innerHTML = html;
        // Добавляем маркеры только для видимых мест
        this.addPlaceMarkers(visiblePlaces);
        this.addPlaceClickHandlers();
    }

    displayLuckyPlace(place) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <h3>Вам повезло! 🎉</h3>
            ${this.createPlaceHtml(place, 0)}
        `;
        
        this.clearPlaceMarkers();
        this.addPlaceMarkers([place]);
        this.addPlaceClickHandlers();
        
        const marker = this.placeMarkers[0];
        if (marker) {
            this.highlightMarker(marker);
        }
    }

    createPlaceHtml(place, index) {
        return `
            <div class="place" data-index="${this.allPlaces.indexOf(place)}">
                <strong>${place.name}</strong>
                ${CONFIG.placeTypes[place.type] ? `<span class="place-type">${CONFIG.placeTypes[place.type]}</span>` : ''}
                <div>${Math.round(place.distance)} м</div>
                ${place.address || 'Адрес не указан'}
            </div>
        `;
    }

    showAllPlaces() {
        const resultsDiv = document.getElementById('results');
        let html = "<h3>Все места:</h3>";
        html += this.allPlaces.map((place, index) => this.createPlaceHtml(place, index)).join('');
        resultsDiv.innerHTML = html;
        
        // Добавляем маркеры для всех мест
        this.addPlaceMarkers(this.allPlaces);
        this.addPlaceClickHandlers();
        
        // Показываем карту, если она еще не видна
        this.showMap();
    }

    addPlaceMarkers(places = this.allPlaces) {
        console.log('Добавляем маркеры для мест:', places.map(p => p.name));
        this.clearPlaceMarkers();
        
        // Создаем копию массива мест, чтобы не потерять информацию о типах
        const placesCopy = places.map(place => ({
            ...place,
            originalType: place.type // Сохраняем оригинальный тип
        }));
        
        this.placeMarkers = placesCopy.map(place => {
            // Определяем эмоджи в зависимости от типа места
            let emoji;
            console.log('Определяем эмоджи для места:', place.name, 'тип:', place.originalType, 'типы:', place.types);
            
            switch(place.originalType) {
                case 'bar':
                case 'pub':
                    emoji = '🍺';
                    break;
                case 'restaurant':
                    emoji = '🍽️';
                    break;
                case 'cafe':
                    emoji = '☕';
                    break;
                case 'night_club':
                    emoji = '🎉';
                    break;
                default:
                    emoji = '🍽️';
            }
            
            console.log('Выбранное эмоджи:', emoji, 'для места:', place.name);

            const svg = `
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <text x="20" y="20" font-size="30" text-anchor="middle" dominant-baseline="middle" fill="black">${emoji}</text>
                </svg>
            `;
            const encodedSvg = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');

            const marker = new google.maps.Marker({
                position: { lat: place.lat, lng: place.lng },
                map: this.map,
                title: place.name,
                icon: {
                    url: 'data:image/svg+xml;charset=utf-8,' + encodedSvg,
                    scaledSize: new google.maps.Size(40, 40),
                    anchor: new google.maps.Point(20, 20)
                }
            });
            
            marker.addListener('click', () => {
                this.openPlaceDetails(place);
            });
            
            // Сохраняем индекс места в оригинальном массиве
            const originalIndex = this.allPlaces.findIndex(p => p.placeId === place.placeId);
            marker.placeIndex = originalIndex;
            return marker;
        });
    }

    addPlaceClickHandlers() {
        document.querySelectorAll('.place').forEach(placeEl => {
            placeEl.addEventListener('click', () => {
                const index = parseInt(placeEl.getAttribute('data-index'));
                const place = this.allPlaces[index];
                this.openPlaceDetails(place);
            });
        });
    }

    openPlaceDetails(place) {
        // Сохраняем текущие координаты пользователя
        const userPosition = this.userMarker ? this.userMarker.getPosition() : null;
        
        // Формируем URL для страницы деталей
        const url = new URL('place-details.html', window.location.href);
        url.searchParams.set('placeId', place.placeId);
        url.searchParams.set('placeType', place.type);
        
        if (userPosition) {
            url.searchParams.set('userLat', userPosition.lat());
            url.searchParams.set('userLng', userPosition.lng());
        }
        
        // Открываем страницу деталей
        window.location.href = url.toString();
    }

    highlightMarker(marker) {
        if (this.highlightedMarker) {
            // Возвращаем стандартную иконку
            const place = this.allPlaces[this.highlightedMarker.placeIndex];
            let emoji;
            switch(place.type) {
                case 'bar':
                case 'pub':
                    emoji = '🍺';
                    break;
                case 'restaurant':
                    emoji = '🍽️';
                    break;
                case 'cafe':
                    emoji = '☕';
                    break;
                case 'night_club':
                    emoji = '🎉';
                    break;
                default:
                    emoji = '🍽️';
            }

            const svg = `
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <text x="20" y="20" font-size="30" text-anchor="middle" dominant-baseline="middle" fill="black">${emoji}</text>
                </svg>
            `;
            const encodedSvg = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');

            this.highlightedMarker.setIcon({
                url: 'data:image/svg+xml;charset=utf-8,' + encodedSvg,
                scaledSize: new google.maps.Size(40, 40),
                anchor: new google.maps.Point(20, 20)
            });
        }
        
        this.highlightedMarker = marker;
        // Устанавливаем выделенную иконку
        const place = this.allPlaces[marker.placeIndex];
        let emoji;
        switch(place.type) {
            case 'bar':
            case 'pub':
                emoji = '🍺';
                break;
            case 'restaurant':
                emoji = '🍽️';
                break;
            case 'cafe':
                emoji = '☕';
                break;
            case 'night_club':
                emoji = '🎉';
                break;
            default:
                emoji = '🍽️';
        }

        const svg = `
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <text x="20" y="20" font-size="30" text-anchor="middle" dominant-baseline="middle" fill="red">${emoji}</text>
            </svg>
        `;
        const encodedSvg = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');

        marker.setIcon({
            url: 'data:image/svg+xml;charset=utf-8,' + encodedSvg,
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20)
        });
        this.map.setCenter(marker.getPosition());
        
        document.getElementById('map').scrollIntoView({
            behavior: 'smooth'
        });
    }

    refreshMap() {
        if (this.map) {
            google.maps.event.trigger(this.map, 'resize');
            alert("Карта обновлена");
        }
    }

    showLoading() {
        document.getElementById('results').innerHTML = `
            <div class="loading">
                <div class="loader"></div>
                <p>Ищем места поблизости...</p>
            </div>
        `;
    }

    showError(message) {
        document.getElementById('results').innerHTML = `
            <div class="error">
                Ошибка: ${message}
            </div>
        `;
        console.error("Ошибка:", message);
    }

    clearPlaceMarkers() {
        this.placeMarkers.forEach(marker => {
            if (marker) {
                marker.setMap(null);
            }
        });
        this.placeMarkers = [];
        this.highlightedMarker = null;
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }
}

// Инициализируем приложение после загрузки Google Maps API
function initApp() {
    console.log('Инициализация приложения');
    window.app = new FoodFinder();
}

// Проверяем, загружен ли Google Maps API
function checkGoogleMapsLoaded() {
    if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        console.log('Google Maps API загружен');
        initApp();
    } else {
        console.log('Ожидание загрузки Google Maps API...');
        setTimeout(checkGoogleMapsLoaded, 100);
    }
}

// Начинаем проверку загрузки API
checkGoogleMapsLoaded(); 