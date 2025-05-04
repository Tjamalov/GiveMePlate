class FoodFinder {
    constructor() {
        console.log('Initializing FoodFinder...');
        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.highlightedMarker = null;
        
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
        document.getElementById('findPlacesBtn').addEventListener('click', () => this.findPlaces());
        document.getElementById('luckyBtn').addEventListener('click', () => this.findLuckyPlace());
    }

    async findPlaces() {
        console.log('findPlaces called');
        if (!navigator.geolocation) {
            console.error('Geolocation not supported');
            this.showError("Геолокация не поддерживается вашим браузером");
            return;
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
            
            // Сохраняем координаты в sessionStorage
            sessionStorage.setItem('userLocation', JSON.stringify({ latitude, longitude }));
            sessionStorage.setItem('isLucky', 'true');

            // Сразу переходим на страницу деталей
            window.location.href = 'Mapbox/placeDetails.html';
        } catch (error) {
            this.showError(error.message);
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
        .setPopup(new mapboxgl.Popup().setHTML("Ваше местоположение"))
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

        // Показываем только первые 3 места
        const visiblePlaces = this.allPlaces.slice(0, 3);
        const hasMorePlaces = this.allPlaces.length > 3;

        let html = "<h3>Найденные места:</h3>";
        html += visiblePlaces.map((place, index) => `
            <div class="place" data-index="${index}">
                <div class="place-content">
                    <strong>${place.name || 'Без названия'}</strong>
                    ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                    ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
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
        
        let html = "<h3>Найденные места:</h3>";
        html += this.allPlaces.map((place, index) => `
            <div class="place" data-index="${index}">
                <div class="place-content">
                    <strong>${place.name || 'Без названия'}</strong>
                    ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                    ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                </div>
                <button class="map-btn" data-index="${index}">
                    <span class="material-icons">map</span>
                </button>
            </div>
        `).join('');

        resultsDiv.innerHTML = html;
        
        // Добавляем маркеры для всех мест
        this.addPlaceMarkers(this.allPlaces);
        this.addPlaceClickHandlers();
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
                    <b>${place.name || 'Без названия'}</b><br>
                    ${place.type ? `<small>${place.type}</small><br>` : ''}
                    ${place.distance ? `<small>Расстояние: ${place.distance} м</small><br>` : ''}
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
            this.highlightedMarker = null;
        }
    }
}

const app = new FoodFinder(); 