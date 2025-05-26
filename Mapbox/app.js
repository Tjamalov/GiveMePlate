class FoodFinder {
    constructor() {
        console.log('Initializing FoodFinder...');
        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.selectedVibe = null;
        
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

    initializeEventListeners() {
        document.getElementById('findPlacesBtn').addEventListener('click', () => {
            this.findPlaces();
        });
        
        document.getElementById('luckyBtn').addEventListener('click', () => {
            this.findLuckyPlace();
        });
        
        document.getElementById('findByVibeBtn').addEventListener('click', () => this.showVibeButtons());
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
            
            this.initializeOrUpdateMap(latitude, longitude);
            console.log('Map initialized/updated');
            
            console.log('Starting places search...');
            await this.searchPlaces(latitude, longitude);
        } catch (error) {
            console.error('Error in findPlaces:', error);
            this.showError(error.message);
        }
    }

    async findLuckyPlace() {
        if (!navigator.geolocation) {
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
        }

        try {
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            // Сохраняем координаты и флаг
            sessionStorage.setItem('userLocation', JSON.stringify({ latitude, longitude }));
            sessionStorage.setItem('isLucky', 'true');

            // Переходим на страницу деталей
            window.location.href = 'Mapbox/placeDetails.html';
        } catch (error) {
            this.showError(error.message);
        }
    }

    async showVibeButtons() {
        try {
            const vibes = await this.db.getUniqueVibes();
            const vibeButtonsContainer = document.getElementById('vibeButtons');
            const findByVibeBtn = document.getElementById('findByVibeBtn');
            
            if (vibes.length === 0) {
                this.showError("Нет доступных вайбов");
                return;
            }

            // Если кнопки уже показаны - скрываем их
            if (vibeButtonsContainer.style.display === 'grid') {
                vibeButtonsContainer.style.display = 'none';
                findByVibeBtn.textContent = 'По вайбу';
                return;
            }

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
            vibeButtonsContainer.style.display = 'grid';
            findByVibeBtn.textContent = 'Скрыть вайбы';

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
                        this.showError(error.message);
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
            const places = await this.db.searchPlacesByVibe(vibe);
            console.log('Все места с вайбом:', places);
            
            // Разделяем места на ближние (до 1км) и дальние (больше 1км)
            const nearbyPlaces = [];
            const farPlaces = [];
            
            places.forEach(place => {
                if (!place.location || !place.location.coordinates) return;
                
                const [placeLon, placeLat] = place.location.coordinates;
                const distance = this.calculateDistance(latitude, longitude, placeLat, placeLon);
                console.log('Место:', place.name, 'Расстояние:', distance);
                
                if (distance <= 1000) { // до 1км
                    nearbyPlaces.push({ ...place, distance });
                } else { // больше 1км
                    farPlaces.push({ ...place, distance });
                }
            });

            console.log('Ближние места:', nearbyPlaces);
            console.log('Дальние места:', farPlaces);

            // Сортируем места по расстоянию
            nearbyPlaces.sort((a, b) => a.distance - b.distance);
            farPlaces.sort((a, b) => a.distance - b.distance);

            // Сохраняем все места в sessionStorage
            this.allPlaces = [...nearbyPlaces, ...farPlaces];
            sessionStorage.setItem('places', JSON.stringify(this.allPlaces));

            // Показываем только ближние места
            this.displayResultsByDistance(nearbyPlaces, farPlaces);
        } catch (error) {
            this.showError("Ошибка при поиске мест по вайбу: " + error.message);
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
            html += visibleNearbyPlaces.map((place, index) => `
                <div class="place" data-index="${index}">
                    <div class="place-content">
                        <strong>${place.name || 'Без названия'}</strong>
                        <div class="place-type">${place.type}</div>
                        <div class="distance">${place.distance} м</div>
                        ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                        ${place.revew ? `<div>${place.revew}</div>` : ''}
                    </div>
                    <button class="map-btn" data-index="${index}">
                        <span class="material-icons">map</span>
                    </button>
                </div>
            `).join('');

            // Если есть еще ближние места, добавляем кнопку "Показать все"
            if (hasMoreNearbyPlaces) {
                html += `
                    <button id="showAllNearbyBtn" class="show-all-btn">
                        Показать все (${nearbyPlaces.length})
                    </button>
                    <div id="allNearbyPlaces" style="display: none;">
                        ${nearbyPlaces.slice(3).map((place, index) => `
                            <div class="place" data-index="${index + 3}">
                                <div class="place-content">
                                    <strong>${place.name || 'Без названия'}</strong>
                                    <div class="place-type">${place.type}</div>
                                    <div class="distance">${place.distance} м</div>
                                    ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                                </div>
                                <button class="map-btn" data-index="${index + 3}">
                                    <span class="material-icons">map</span>
                                </button>
                            </div>
                        `).join('')}
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
                        ${farPlaces.map((place, index) => `
                            <div class="place" data-index="${nearbyPlaces.length + index}">
                                <div class="place-content">
                                    <strong>${place.name || 'Без названия'}</strong>
                                    <div class="place-type">${place.type}</div>
                                    <div class="distance">${place.distance} м</div>
                                    ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                                </div>
                                <button class="map-btn" data-index="${nearbyPlaces.length + index}">
                                    <span class="material-icons">map</span>
                                </button>
                            </div>
                        `).join('')}
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
                    ${farPlaces.map((place, index) => `
                        <div class="place" data-index="${index}">
                            <div class="place-content">
                                <strong>${place.name || 'Без названия'}</strong>
                                <div class="place-type">${place.type}</div>
                                <div class="distance">${place.distance} м</div>
                                ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                                ${place.revew ? `<div>${place.revew}</div>` : ''}
                            </div>
                            <button class="map-btn" data-index="${index}">
                                <span class="material-icons">map</span>
                            </button>
                        </div>
                    `).join('')}
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

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
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

    async searchPlaces(latitude, longitude) {
        try {
            const places = await this.db.searchPlaces(latitude, longitude);
            this.processPlaces(places, latitude, longitude);
            this.displayResults();
        } catch (error) {
            this.showError("Ошибка при поиске мест: " + error.message);
        }
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
        html += visiblePlaces.map((place, index) => `
            <div class="place" data-index="${index}">
                <div class="place-content">
                    <strong>${place.name || 'Без названия'}</strong>
                    ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                    ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                    ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                </div>
                <button class="map-btn" data-index="${index}">
                    <span class="material-icons">map</span>
                </button>
            </div>
        `).join('');

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
        
        // Разделяем места на ближние (до 1км) и дальние (больше 1км)
        const nearbyPlaces = [];
        const farPlaces = [];
        
        this.allPlaces.forEach(place => {
            if (!place.location || !place.location.coordinates) return;
            
            const [placeLon, placeLat] = place.location.coordinates;
            const distance = this.calculateDistance(
                this.userMarker.getLngLat().lat,
                this.userMarker.getLngLat().lng,
                placeLat,
                placeLon
            );
            
            if (distance <= 1000) { // до 1км
                nearbyPlaces.push({ ...place, distance });
            } else { // больше 1км
                farPlaces.push({ ...place, distance });
            }
        });

        // Формируем заголовок с учетом выбранного вайба
        const vibeText = this.selectedVibe ? 
            `${this.selectedVibe} места` : 
            'места';
        let html = `<h3>Найденные ${vibeText} в радиусе 1км:</h3>`;
        
        // Показываем все ближние места
        if (nearbyPlaces.length > 0) {
            html += nearbyPlaces.map((place, index) => `
                <div class="place" data-index="${this.allPlaces.indexOf(place)}">
                    <div class="place-content">
                        <strong>${place.name || 'Без названия'}</strong>
                        ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                        ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                        ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                        ${place.revew ? `<div>${place.revew}</div>` : ''}
                    </div>
                    <button class="map-btn" data-index="${this.allPlaces.indexOf(place)}">
                        <span class="material-icons">map</span>
                    </button>
                </div>
            `).join('');

            // Если есть дальние места, добавляем кнопку "А что есть дальше?"
            if (farPlaces.length > 0) {
                html += `
                    <button id="showFarPlacesBtn" class="show-all-btn">
                        А что есть дальше? (${farPlaces.length})
                    </button>
                    <div id="farPlaces" style="display: none;">
                        ${farPlaces.map((place, index) => `
                            <div class="place" data-index="${this.allPlaces.indexOf(place)}">
                                <div class="place-content">
                                    <strong>${place.name || 'Без названия'}</strong>
                                    ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                                    ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                                    ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                                </div>
                                <button class="map-btn" data-index="${this.allPlaces.indexOf(place)}">
                                    <span class="material-icons">map</span>
                                </button>
                            </div>
                        `).join('')}
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
                    ${farPlaces.map((place, index) => `
                        <div class="place" data-index="${this.allPlaces.indexOf(place)}">
                            <div class="place-content">
                                <strong>${place.name || 'Без названия'}</strong>
                                ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                                ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                                ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
                                ${place.revew ? `<div>${place.revew}</div>` : ''}
                            </div>
                            <button class="map-btn" data-index="${this.allPlaces.indexOf(place)}">
                                <span class="material-icons">map</span>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        resultsDiv.innerHTML = html;
        
        // Добавляем маркеры для всех ближних мест
        if (nearbyPlaces.length > 0) {
            this.addPlaceMarkers(nearbyPlaces);
        }
        this.addPlaceClickHandlers();

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
                    // Возвращаем маркеры для ближних мест
                    if (nearbyPlaces.length > 0) {
                        this.addPlaceMarkers(nearbyPlaces);
                    }
                }
            });
        }

        // Прокручиваем к началу списка
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
}

const app = new FoodFinder(); 