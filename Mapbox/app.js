class FoodFinder {
    constructor() {
        console.log('Initializing FoodFinder...');
        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.selectedVibe = null;
        this.watchId = null;
        this.currentPosition = null;
        
        // Маппинг вайбов на эмоджи
        this.vibeEmojis = {
            'тусовый': '🎉',
            'семейный': '👨‍👩‍👧‍👦',
            'хипстерский': '📸',
            'локальный': '☂️',
            'домашний': '🧶',
            'романтичный': '💘',
            'панк': '🎸',
            'студенческий': '🥤',
            'лакшери': '💰',
            'туристический': '🎒'
        };
        
        try {
            console.log('Creating PlacesDatabase instance...');
            this.db = new PlacesDatabase();
            console.log('PlacesDatabase created successfully');
        } catch (error) {
            console.error('Error creating PlacesDatabase:', error);
            throw error;
        }
        
        this.initializeEventListeners();
    }

    async getCurrentPosition() {
        console.log('getCurrentPosition called');

        // Если у нас уже есть позиция и watchId, используем её
        if (this.currentPosition && this.watchId) {
            console.log('Using cached position');
            return this.currentPosition;
        }

        return new Promise((resolve, reject) => {
            // Сначала пробуем получить позицию один раз
            navigator.geolocation.getCurrentPosition(
                position => {
                    console.log('Initial position received');
                    this.currentPosition = position;
                    
                    // После успешного получения позиции, начинаем отслеживать изменения
                    this.watchId = navigator.geolocation.watchPosition(
                        newPosition => {
                            console.log('Position updated');
                            this.currentPosition = newPosition;
                        },
                        error => {
                            console.error('Watch position error:', error);
                        },
                        { enableHighAccuracy: true }
                    );
                    
                    resolve(position);
                },
                error => {
                    console.error('getCurrentPosition error:', error);
                    reject(error);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
    }

    initializeEventListeners() {
        document.getElementById('findPlacesBtn').addEventListener('click', () => this.findPlaces());
        document.getElementById('findByVibeBtn').addEventListener('click', () => this.showVibeButtons());
        document.getElementById('luckyBtn').addEventListener('click', () => this.findLuckyPlace());
        document.getElementById('clearCacheBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.db.clearCache();
            window.location.reload();
        });
    }

    async findPlaces() {
        console.log('findPlaces called');
        if (!navigator.geolocation) {
            console.error('Geolocation not supported');
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
        }

        // Скрываем вайбы если они открыты
        const vibeButtonsContainer = document.getElementById('vibeButtons');
        const findByVibeBtn = document.getElementById('findByVibeBtn');
        if (vibeButtonsContainer.style.display === 'grid') {
            vibeButtonsContainer.style.display = 'none';
            findByVibeBtn.textContent = 'По вайбу';
        }

        this.showLoading();
        console.log('Getting current position...');

        try {
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            console.log('Got position:', { latitude, longitude });
            
            // Сохраняем местоположение пользователя
            this.userLocation = { latitude, longitude };
            sessionStorage.setItem('userLocation', JSON.stringify(this.userLocation));
            
            this.initializeOrUpdateMap(latitude, longitude);
            console.log('Map initialized/updated');
            
            console.log('Starting places search...');
            await this.searchPlaces();
        } catch (error) {
            console.error('Error in findPlaces:', error);
            await this.handleGeolocationError(error);
        }
    }

    async findLuckyPlace() {
        if (!navigator.geolocation) {
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
        }

        try {
            // Проверяем статус разрешения
            if (this.geolocationPermission === 'denied') {
                this.showError('Для работы приложения необходим доступ к геолокации. Пожалуйста, разрешите доступ в настройках браузера.');
                return;
            }

            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            // Сохраняем координаты и флаг
            sessionStorage.setItem('userLocation', JSON.stringify({ latitude, longitude }));
            sessionStorage.setItem('isLucky', 'true');

            // Сразу переходим на страницу деталей
            window.location.href = 'Mapbox/placeDetails.html';
        } catch (error) {
            console.error('Error in findLuckyPlace:', error);
            await this.handleGeolocationError(error);
        }
    }

    showVibeButtons() {
        const vibeButtonsContainer = document.getElementById('vibeButtons');
        const findByVibeBtn = document.getElementById('findByVibeBtn');
        
        if (vibeButtonsContainer.style.display === 'grid') {
            vibeButtonsContainer.style.display = 'none';
            findByVibeBtn.textContent = 'По вайбу';
        } else {
            this.loadAndShowVibeButtons();
            vibeButtonsContainer.style.display = 'grid';
            findByVibeBtn.textContent = 'Скрыть вайбы';
        }
    }

    async loadAndShowVibeButtons() {
        try {
            const vibes = await this.db.getUniqueVibes();
            const vibeButtonsContainer = document.getElementById('vibeButtons');
            const resultsContainer = document.getElementById('results');
            const mapContainer = document.getElementById('map-container');
            
            if (vibes.length === 0) {
                this.showError("Нет доступных вайбов");
                return;
            }

            // Скрываем результаты и карту
            resultsContainer.innerHTML = '';
            if (this.map) {
                this.map.remove();
                this.map = null;
            }
            const mapElement = document.getElementById('map');
            if (mapElement) {
                mapElement.style.display = 'none';
            }
            this.clearPlaceMarkers();

            // Create buttons for each vibe with emojis only
            const buttons = vibes.map(vibe => {
                const emoji = this.vibeEmojis[vibe.toLowerCase()] || vibe;
                return `
                    <button class="vibe-button" data-vibe="${vibe}" title="${vibe}">
                        ${emoji}
                    </button>
                `;
            }).join('');

            vibeButtonsContainer.innerHTML = buttons;

            // Add click handlers
            document.querySelectorAll('.vibe-button').forEach(button => {
                button.addEventListener('click', async () => {
                    const vibe = button.dataset.vibe;
                    this.selectedVibe = vibe;
                    
                    // Update active state
                    document.querySelectorAll('.vibe-button').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    button.classList.add('active');

                    // Show loading state
                    this.showLoading();

                    // Get current position and search places
                    try {
                        const position = await this.getCurrentPosition();
                        const { latitude, longitude } = position.coords;
                        this.initializeOrUpdateMap(latitude, longitude);
                        await this.searchPlacesByVibe(vibe, latitude, longitude);
                        
                        // Scroll to results
                        document.getElementById('results').scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start' 
                        });
                    } catch (error) {
                        console.error('Error in vibe button click:', error);
                        await this.handleGeolocationError(error);
                    }
                });
            });
        } catch (error) {
            this.showError("Ошибка при загрузке вайбов");
            console.error(error);
        }
    }

    async searchPlacesByVibe(vibe, latitude, longitude) {
        try {
            if (!vibe) {
                console.error('Vibe parameter is required');
                this.showError('Не указан тип вайба');
                return;
            }

            console.log('Searching places by vibe:', vibe);
            const places = await this.db.searchPlacesByVibe(vibe, latitude, longitude);
            
            if (!places || !Array.isArray(places)) {
                console.error('Invalid places data received:', places);
                this.showError('Получены некорректные данные о местах');
                return;
            }

            this.allPlaces = places;
            const resultsDiv = document.getElementById('results');
            let html = `<h3>Места с вайбом "${vibe}":</h3>`;
            html += places.map((place, index) => this.createPlaceHtml(place, index)).join('');
            resultsDiv.innerHTML = html;
            this.addPlaceMarkers(places);
            this.addPlaceClickHandlers();
            // Сохраняем места в sessionStorage
            sessionStorage.setItem('places', JSON.stringify(places));
        } catch (error) {
            console.error('Error searching places by vibe:', error);
            this.showError('Ошибка при поиске мест: ' + (error.message || 'Неизвестная ошибка'));
        }
    }

    async searchPlaces() {
        try {
            if (!this.userLocation) {
                throw new Error('User location is not available');
            }

            console.log('Searching places with user location:', this.userLocation);
            const places = await this.db.searchPlaces(
                this.userLocation.latitude,
                this.userLocation.longitude
            );

            if (!places || places.length === 0) {
                this.showError("Места не найдены поблизости");
                return;
            }

            // Сохраняем все места
            this.allPlaces = places;
            
            // Разделяем места на ближние и дальние
            const nearbyPlaces = places.filter(place => {
                if (!place.location || !place.location.coordinates) return false;
                const [placeLon, placeLat] = place.location.coordinates;
                const distance = this.calculateDistance(
                    this.userLocation.latitude,
                    this.userLocation.longitude,
                    placeLat,
                    placeLon
                );
                place.distance = distance; // Сохраняем расстояние в объекте места
                return distance <= 1000;
            });

            const farPlaces = places.filter(place => {
                if (!place.location || !place.location.coordinates) return false;
                const [placeLon, placeLat] = place.location.coordinates;
                const distance = this.calculateDistance(
                    this.userLocation.latitude,
                    this.userLocation.longitude,
                    placeLat,
                    placeLon
                );
                place.distance = distance; // Сохраняем расстояние в объекте места
                return distance > 1000;
            });

            console.log('Places divided:', {
                total: places.length,
                nearby: nearbyPlaces.length,
                far: farPlaces.length
            });

            // Сохраняем все места в sessionStorage для placeDetails
            sessionStorage.setItem('places', JSON.stringify(places));

            // Отображаем результаты с учетом расстояния
            this.displayResultsByDistance(nearbyPlaces, farPlaces);
        } catch (error) {
            console.error('Error searching places:', error);
            this.showError("Ошибка при поиске мест: " + error.message);
        }
    }

    displayResultsByDistance(nearbyPlaces, farPlaces) {
        const resultsDiv = document.getElementById('results');
        
        if (nearbyPlaces.length === 0 && farPlaces.length === 0) {
            resultsDiv.innerHTML = "Интересных мест поблизости нет";
            return;
        }

        // Формируем заголовок с учетом выбранного вайба
        const vibeText = this.selectedVibe ? 
            `${this.selectedVibe} места` : 
            'места';
        let html = `<h3>Найденные ${vibeText} в радиусе 1км:</h3>`;
        
        // Показываем только первые 3 ближних места
        const visibleNearbyPlaces = nearbyPlaces.slice(0, 3);
        const hasMoreNearbyPlaces = nearbyPlaces.length > 3;
        
        if (visibleNearbyPlaces.length > 0) {
            // Используем индекс из оригинального массива this.allPlaces
            html += visibleNearbyPlaces.map(place => {
                const originalIndex = this.allPlaces.findIndex(p => p.id === place.id);
                return this.createPlaceHtml(place, originalIndex);
            }).join('');

            // Если есть еще ближние места, добавляем кнопку "Показать все"
            if (hasMoreNearbyPlaces) {
                html += `
                    <button id="showAllNearbyBtn" class="show-all-btn">
                        Показать все (${nearbyPlaces.length})
                    </button>
                    <div id="allNearbyPlaces" style="display: none;">
                        ${nearbyPlaces.slice(3).map(place => {
                            const originalIndex = this.allPlaces.findIndex(p => p.id === place.id);
                            return this.createPlaceHtml(place, originalIndex);
                        }).join('')}
                    </div>
                `;
            }

            // Если есть дальние места, добавляем кнопку "А что есть дальше?"
            if (farPlaces.length > 0) {
                html += `
                    <button id="showFarPlacesBtn" class="show-all-btn">
                        А что есть дальше? (${farPlaces.length})
                    </button>
                    <div id="farPlaces" style="display: none;">
                        ${farPlaces.map(place => {
                            const originalIndex = this.allPlaces.findIndex(p => p.id === place.id);
                            return this.createPlaceHtml(place, originalIndex);
                        }).join('')}
                    </div>
                `;
            }
        } else if (farPlaces.length > 0) {
            // Если нет ближних мест, но есть дальние, показываем кнопку "А что есть дальше?"
            html += `
                <div class="no-nearby-places">
                    Интересных мест поблизости нет
                </div>
                <button id="showFarPlacesBtn" class="show-all-btn">
                    А что есть дальше? (${farPlaces.length})
                </button>
                <div id="farPlaces" style="display: none;">
                    ${farPlaces.map(place => {
                        const originalIndex = this.allPlaces.findIndex(p => p.id === place.id);
                        return this.createPlaceHtml(place, originalIndex);
                    }).join('')}
                </div>
            `;
        }

        resultsDiv.innerHTML = html;
        
        // Добавляем маркеры для видимых ближних мест
        if (visibleNearbyPlaces.length > 0) {
            this.addPlaceMarkers(visibleNearbyPlaces);
        }
        this.addPlaceClickHandlers();

        // Добавляем обработчик для кнопки "Показать все"
        if (hasMoreNearbyPlaces) {
            const showAllNearbyBtn = document.getElementById('showAllNearbyBtn');
            const allNearbyPlacesDiv = document.getElementById('allNearbyPlaces');
            
            showAllNearbyBtn.addEventListener('click', () => {
                if (allNearbyPlacesDiv.style.display === 'none') {
                    allNearbyPlacesDiv.style.display = 'block';
                    showAllNearbyBtn.textContent = 'Скрыть';
                    // Добавляем маркеры для всех ближних мест
                    this.addPlaceMarkers(nearbyPlaces);
                } else {
                    allNearbyPlacesDiv.style.display = 'none';
                    showAllNearbyBtn.textContent = `Показать все (${nearbyPlaces.length})`;
                    // Возвращаем маркеры только для первых 3 мест
                    this.clearPlaceMarkers();
                    this.addPlaceMarkers(visibleNearbyPlaces);
                }
            });
        }

        // Добавляем обработчик для кнопки "А что есть дальше?"
        if (farPlaces.length > 0) {
            const showFarPlacesBtn = document.getElementById('showFarPlacesBtn');
            const farPlacesDiv = document.getElementById('farPlaces');
            
            showFarPlacesBtn.addEventListener('click', () => {
                if (farPlacesDiv.style.display === 'none') {
                    farPlacesDiv.style.display = 'block';
                    showFarPlacesBtn.textContent = 'Скрыть дальние места';
                    // Добавляем маркеры для дальних мест
                    this.addPlaceMarkers(farPlaces);
                } else {
                    farPlacesDiv.style.display = 'none';
                    showFarPlacesBtn.textContent = `А что есть дальше? (${farPlaces.length})`;
                    // Удаляем маркеры дальних мест
                    this.clearPlaceMarkers();
                    // Возвращаем маркеры для видимых ближних мест
                    if (visibleNearbyPlaces.length > 0) {
                        this.addPlaceMarkers(visibleNearbyPlaces);
                    }
                }
            });
        }
    }

    initializeOrUpdateMap(lat, lon) {
        if (!this.map) {
            this.initializeMap(lat, lon);
        } else {
            this.updateMapPosition(lat, lon);
        }
        this.showMap();
    }

    initializeMap(lat, lon) {
        mapboxgl.accessToken = window.MAPBOX_API_KEY;
        
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [lon, lat],
            zoom: 15
        });

        this.userMarker = new mapboxgl.Marker({
            color: "#FF0000"
        })
        .setLngLat([lon, lat])
        .setPopup(new mapboxgl.Popup().setHTML("<b>Ваше местоположение</b>"))
        .addTo(this.map);

        this.map.on('load', () => {
            this.map.resize();
        });
    }

    updateMapPosition(lat, lon) {
        this.map.setCenter([lon, lat]);
        this.userMarker.setLngLat([lon, lat]);
    }

    showMap() {
        document.getElementById('map').style.display = 'block';
    }

    processPlaces(places, userLat, userLon) {
        console.log('Processing places:', {
            placesCount: places?.length,
            userLat,
            userLon
        });
        
        if (!places || !Array.isArray(places)) {
            console.error('Invalid places data:', places);
            this.allPlaces = [];
            return;
        }

        // Calculate distances and add them to each place
        this.allPlaces = places.map(place => {
            if (!place.location || !place.location.coordinates) {
                return { ...place, distance: null };
            }
            
            const [placeLon, placeLat] = place.location.coordinates;
            const distance = this.calculateDistance(userLat, userLon, placeLat, placeLon);
            return { ...place, distance };
        })
        // Sort places by distance
        .sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        // Кэшируем места в sessionStorage
        sessionStorage.setItem('places', JSON.stringify(this.allPlaces));

        console.log('Processed places with distances:', this.allPlaces);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return Math.round(R * c); // Distance in meters
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        
        if (this.allPlaces.length === 0) {
            resultsDiv.innerHTML = "Места не найдены 😞";
            return;
        }

        console.log('Displaying places:', this.allPlaces.map(p => ({ 
            id: p.id, 
            name: p.name,
            distance: p.distance,
            vibe: p.vibe
        })));

        // Показываем первые 3 места
        const visiblePlaces = this.allPlaces.slice(0, 3);
        const hasMorePlaces = this.allPlaces.length > 3;

        let html = "<h3>Найденные места:</h3>";
        html += visiblePlaces.map((place, index) => this.createPlaceHtml(place, index)).join('');
        resultsDiv.innerHTML = html;
        this.addPlaceMarkers(visiblePlaces);
        this.addPlaceClickHandlers();

        // Добавляем кнопку "Показать все", если есть еще места
        if (hasMorePlaces) {
            html += `
                <button id="showAllBtn" class="show-all-btn">
                    Показать все (${this.allPlaces.length})
                </button>
            `;
        }

        resultsDiv.innerHTML = html;
        
        // Добавляем маркеры только для видимых мест
        this.addPlaceMarkers(visiblePlaces);
        this.addPlaceClickHandlers();

        // Добавляем обработчик для кнопки "Показать все"
        if (hasMorePlaces) {
            document.getElementById('showAllBtn').addEventListener('click', () => {
                this.showAllPlaces();
            });
        }
    }

    showAllPlaces() {
        const resultsDiv = document.getElementById('results');
        let html = "<h3>Все места:</h3>";
        html += this.allPlaces.map((place, index) => this.createPlaceHtml(place, index)).join('');
        resultsDiv.innerHTML = html;
        this.addPlaceMarkers(this.allPlaces);
        this.addPlaceClickHandlers();
        // Сохраняем места в sessionStorage
        sessionStorage.setItem('places', JSON.stringify(this.allPlaces));
    }

    addPlaceMarkers(places = this.allPlaces) {
        this.clearPlaceMarkers();
        
        this.placeMarkers = places.map(place => {
            // Пропускаем места без координат
            if (!place.location || !place.location.coordinates) {
                return null;
            }

            const marker = new mapboxgl.Marker()
                .setLngLat([place.location.coordinates[0], place.location.coordinates[1]])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <b>${place.name || 'Без названия'}</b>
                    <small>${place.type || ''}</small>
                    <small>${place.distance ? `Расстояние: ${place.distance} м` : ''}</small>
                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                    <a href="Mapbox/placeDetails.html?id=${place.id}" class="details-btn">Подробнее</a>
                `))
                .addTo(this.map);
            
            marker.placeIndex = this.allPlaces.indexOf(place);
            return marker;
        }).filter(marker => marker !== null);
    }

    createPlaceHtml(place, index) {
        return `
            <div class="place" data-index="${index}">
                <div class="place-content">
                    <strong>${place.name || 'Без названия'}</strong>
                    ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                    ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                    ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                    ${place.placephotos ? `
                        <div class="place-photos">
                            ${place.placephotos.split(',').slice(0, 3).map(photo => `
                                <div class="place-photo">
                                    <img src="${photo.trim()}" alt="${place.name}" onerror="this.parentElement.remove()" />
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <button class="map-btn" data-index="${index}">
                    <span class="material-icons">map</span>
                </button>
            </div>
        `;
    }

    addPlaceClickHandlers() {
        document.querySelectorAll('.place').forEach(placeEl => {
            // Обработчик клика по карточке - переход в детали
            placeEl.addEventListener('click', (e) => {
                // Если клик был по кнопке с картой, не переходим в детали
                if (e.target.closest('.map-btn')) {
                    return;
                }
                
                const index = parseInt(placeEl.getAttribute('data-index'));
                const place = this.allPlaces[index];
                if (place) {
                    // Сохраняем местоположение пользователя перед переходом
                    if (this.userMarker) {
                        const userLngLat = this.userMarker.getLngLat();
                        sessionStorage.setItem('userLocation', JSON.stringify({
                            latitude: userLngLat.lat,
                            longitude: userLngLat.lng
                        }));
                    }
                    window.location.href = `Mapbox/placeDetails.html?id=${place.id}`;
                }
            });
        });

        // Обработчик клика по кнопке с картой
        document.querySelectorAll('.map-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем всплытие события до карточки
                const index = parseInt(btn.getAttribute('data-index'));
                const marker = this.placeMarkers.find(m => m.placeIndex === index);
                
                if (marker) {
                    marker.togglePopup();
                    this.map.flyTo({
                        center: marker.getLngLat(),
                        zoom: 15
                    });
                    
                    // Сохраняем местоположение пользователя
                    if (this.userMarker) {
                        const userLngLat = this.userMarker.getLngLat();
                        sessionStorage.setItem('userLocation', JSON.stringify({
                            latitude: userLngLat.lat,
                            longitude: userLngLat.lng
                        }));
                    }
                    
                    // Скроллим к карте
                    const mapContainer = document.getElementById('map-container');
                    mapContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
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
        if (this.placeMarkers && this.placeMarkers.length > 0) {
            this.placeMarkers.forEach(marker => {
                if (marker) {
                    marker.remove();
                }
            });
            this.placeMarkers = [];
        }
    }

    async handleGeolocationError(error) {
        console.error('Geolocation error:', error);
        
        if (error.code === error.PERMISSION_DENIED) {
            this.geolocationPermission = 'denied';
            this.showError('Для работы приложения необходим доступ к геолокации. Пожалуйста, разрешите доступ в настройках браузера.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            this.showError('Информация о местоположении недоступна. Пожалуйста, проверьте настройки геолокации на вашем устройстве.');
        } else if (error.code === error.TIMEOUT) {
            this.showError('Превышено время ожидания получения местоположения. Пожалуйста, проверьте подключение к интернету.');
        } else {
            this.showError('Произошла ошибка при получении местоположения. Пожалуйста, попробуйте еще раз.');
        }
    }

    showMessage(message) {
        const results = document.getElementById('results');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.textContent = message;
        results.appendChild(messageDiv);
        
        // Удаляем сообщение через 3 секунды
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

const app = new FoodFinder(); 