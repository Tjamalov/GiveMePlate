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
        
        this.initializeEventListeners();
        this.initializeMap();
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
            
            // Показываем карту после инициализации
            this.showMap();
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
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            console.log('Координаты от браузера:', { latitude, longitude });
            
            this.updateMapPosition(latitude, longitude);
            await this.searchPlaces(latitude, longitude);
        } catch (error) {
            console.error('Ошибка при получении геолокации:', error);
            this.showError("Ошибка при определении местоположения");
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
            await this.searchLuckyPlace(latitude, longitude);
        } catch (error) {
            console.error('Ошибка при получении геолокации:', error);
            this.showError("Ошибка при определении местоположения");
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
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
            this.userMarker = new google.maps.Marker({
                position: position,
                map: this.map,
                title: "Ваше местоположение",
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
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
                    console.log('Обрабатываем место:', place);
                    
                    const coords = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    };
                    console.log('Координаты места:', coords);
                    
                    const name = place.name || 'Без названия';
                    const address = place.vicinity || 'Адрес не указан';
                    
                    console.log('Название и адрес:', { name, address });
                    
                    // Проверяем расстояние
                    const distance = this.calculateDistance(
                        latitude, longitude,
                        coords.lat, coords.lng
                    );
                    console.log('Расстояние:', distance, 'метров');
                    
                    // Если место слишком далеко, пропускаем его
                    if (distance > CONFIG.search.radius) {
                        console.log('Место слишком далеко, пропускаем');
                        return null;
                    }

                    // Определяем тип места на основе types из API
                    const placeType = this.determinePlaceTypeFromTypes(place.types);
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
                        placeId: place.place_id
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
            
            this.displayResults();
        } catch (error) {
            console.error('Ошибка при поиске:', error);
            this.showError("Ошибка при поиске мест");
        }
    }

    async searchLuckyPlace(latitude, longitude) {
        console.log('Начинаем поиск случайного места...', { latitude, longitude });
        
        const request = {
            location: new google.maps.LatLng(latitude, longitude),
            radius: CONFIG.search.radius,
            types: CONFIG.search.placeTypes,
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
                this.showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Обрабатываем найденные места
            this.allPlaces = results.map(place => {
                try {
                    console.log('Обрабатываем место:', place);
                    
                    const coords = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    };
                    console.log('Координаты места:', coords);
                    
                    const name = place.name || 'Без названия';
                    const address = place.vicinity || 'Адрес не указан';
                    
                    console.log('Название и адрес:', { name, address });
                    
                    // Проверяем расстояние
                    const distance = this.calculateDistance(
                        latitude, longitude,
                        coords.lat, coords.lng
                    );
                    console.log('Расстояние:', distance, 'метров');
                    
                    // Если место слишком далеко, пропускаем его
                    if (distance > CONFIG.search.radius) {
                        console.log('Место слишком далеко, пропускаем');
                        return null;
                    }
                    
                    return {
                        name,
                        address,
                        lat: coords.lat,
                        lng: coords.lng,
                        distance,
                        type: this.determinePlaceType(name),
                        placeId: place.place_id
                    };
                } catch (error) {
                    console.error('Ошибка при обработке места:', error, place);
                    return null;
                }
            }).filter(place => place !== null)
              .sort((a, b) => a.distance - b.distance);

            console.log('Обработанные места:', this.allPlaces);
            
            if (this.allPlaces.length === 0) {
                this.showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            const randomIndex = Math.floor(Math.random() * this.allPlaces.length);
            const luckyPlace = this.allPlaces[randomIndex];
            
            this.displayLuckyPlace(luckyPlace);
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
                return typeMapping[type];
            }
        }

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
        this.addPlaceMarkers(this.allPlaces);
        this.addPlaceClickHandlers();
    }

    addPlaceMarkers(places = this.allPlaces) {
        this.clearPlaceMarkers();
        
        this.placeMarkers = places.map(place => {
            const marker = new google.maps.Marker({
                position: { lat: place.lat, lng: place.lng },
                map: this.map,
                title: place.name,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                }
            });
            
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="place-info">
                        <h4>${place.name}</h4>
                        ${place.type ? `<p class="place-type">${CONFIG.placeTypes[place.type]}</p>` : ''}
                        <p>${place.address || 'Адрес не указан'}</p>
                        <p>Расстояние: ${Math.round(place.distance)} м</p>
                        <div class="loading-photo">
                            <div class="loader"></div>
                            <p>Загружаем фото...</p>
                        </div>
                    </div>
                `
            });
            
            marker.addListener('click', () => {
                console.log('Клик по маркеру:', place.name);
                this.highlightMarker(marker);
                // Открываем InfoWindow сразу
                infoWindow.open(this.map, marker);
                // Затем загружаем детали
                this.getPlaceDetails(place.placeId, infoWindow);
            });
            
            marker.infoWindow = infoWindow;
            marker.placeIndex = this.allPlaces.indexOf(place);
            return marker;
        });
    }

    getPlaceDetails(placeId, infoWindow) {
        if (!placeId) {
            console.error('placeId не указан');
            return;
        }
        
        console.log('Запрашиваем детали места:', placeId);
        
        const request = {
            placeId: placeId,
            fields: [
                'name',
                'formatted_address',
                'formatted_phone_number',
                'website',
                'opening_hours',
                'rating',
                'user_ratings_total',
                'photos',
                'types'
            ]
        };

        console.log('Параметры запроса:', request);

        const placesService = new google.maps.places.PlacesService(this.map);
        placesService.getDetails(request, (place, status) => {
            console.log('Статус ответа:', status);
            
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                console.log('Получены детали места:', place);
                console.log('Типы места:', place.types);
                console.log('Фотографии:', place.photos);
                
                let content = `
                    <div class="place-info">
                        <h4>${place.name}</h4>
                `;

                // Добавляем фотографию, если она есть
                if (place.photos && place.photos.length > 0) {
                    console.log('Найдены фотографии:', place.photos.length);
                    try {
                        const photo = place.photos[0];
                        console.log('Первая фотография:', photo);
                        
                        // Получаем URL фотографии с максимальным размером
                        const photoUrl = photo.getUrl({
                            maxWidth: 400,
                            maxHeight: 300
                        });
                        console.log('URL фотографии:', photoUrl);
                        
                        // Создаем временный div для загрузки фото
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = `
                            <div class="place-photo">
                                <img src="${photoUrl}" alt="${place.name}" 
                                     style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 10px;"
                                     onerror="this.style.display='none'">
                            </div>
                        `;
                        
                        // Устанавливаем таймаут для скрытия индикатора загрузки
                        setTimeout(() => {
                            const loadingDiv = infoWindow.getContent().querySelector('.loading-photo');
                            if (loadingDiv) {
                                loadingDiv.style.display = 'none';
                            }
                        }, 5000); // 5 секунд таймаут
                        
                        content += tempDiv.innerHTML;
                    } catch (error) {
                        console.error('Ошибка при получении URL фотографии:', error);
                    }
                } else {
                    console.log('Фотографии не найдены для места:', place.name);
                    // Скрываем индикатор загрузки, если фото нет
                    const loadingDiv = infoWindow.getContent().querySelector('.loading-photo');
                    if (loadingDiv) {
                        loadingDiv.style.display = 'none';
                    }
                }

                content += `
                        <p>${place.formatted_address || 'Адрес не указан'}</p>
                `;

                if (place.formatted_phone_number) {
                    content += `<p>Телефон: ${place.formatted_phone_number}</p>`;
                }

                if (place.website) {
                    content += `<p><a href="${place.website}" target="_blank">Сайт</a></p>`;
                }

                if (place.rating) {
                    content += `<p>Рейтинг: ${place.rating} (${place.user_ratings_total} отзывов)</p>`;
                }

                if (place.opening_hours && place.opening_hours.weekday_text) {
                    content += `<p>Часы работы:</p><ul>`;
                    place.opening_hours.weekday_text.forEach(day => {
                        content += `<li>${day}</li>`;
                    });
                    content += `</ul>`;
                }

                content += `</div>`;
                infoWindow.setContent(content);
            } else {
                console.error('Ошибка при получении деталей места:', status);
                infoWindow.setContent(`
                    <div class="place-info">
                        <h4>Ошибка загрузки</h4>
                        <p>Не удалось загрузить детальную информацию о месте</p>
                    </div>
                `);
            }
        });
    }

    addPlaceClickHandlers() {
        document.querySelectorAll('.place').forEach(placeEl => {
            placeEl.addEventListener('click', () => {
                const index = parseInt(placeEl.getAttribute('data-index'));
                const place = this.allPlaces[index];
                const marker = this.placeMarkers.find(m => m.placeIndex === index);
                
                if (marker) {
                    console.log('Клик по месту в списке:', place.name);
                    this.highlightMarker(marker);
                    // Открываем InfoWindow сразу
                    marker.infoWindow.open(this.map, marker);
                    // Затем загружаем детали
                    this.getPlaceDetails(place.placeId, marker.infoWindow);
                }
            });
        });
    }

    highlightMarker(marker) {
        if (this.highlightedMarker) {
            this.highlightedMarker.setIcon({
                url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
            });
            this.highlightedMarker.infoWindow.close();
        }
        
        this.highlightedMarker = marker;
        marker.setIcon({
            url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
        });
        marker.infoWindow.open(this.map, marker);
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
                if (marker.infoWindow) {
                    marker.infoWindow.close();
                }
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