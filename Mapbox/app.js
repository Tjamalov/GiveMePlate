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
        document.getElementById('refresh-map').addEventListener('click', () => this.refreshMap());
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

        this.showLoading();

        try {
            const position = await this.getCurrentPosition();
            const { latitude, longitude } = position.coords;
            
            this.initializeOrUpdateMap(latitude, longitude);
            await this.searchLuckyPlace(latitude, longitude);
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
        document.getElementById('refresh-map').style.display = 'block';
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

    async searchLuckyPlace(latitude, longitude) {
        try {
            const places = await this.db.searchPlaces(latitude, longitude, 500);
            this.processPlaces(places, latitude, longitude);
            
            if (this.allPlaces.length === 0) {
                this.showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            const randomIndex = Math.floor(Math.random() * this.allPlaces.length);
            const luckyPlace = this.allPlaces[randomIndex];
            
            this.displayLuckyPlace(luckyPlace);
        } catch (error) {
            this.showError("Ошибка при поиске случайного места: " + error.message);
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

        // Просто сохраняем места как есть, без дополнительной обработки
        this.allPlaces = places;
        console.log('Processed places:', this.allPlaces);
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        
        if (this.allPlaces.length === 0) {
            resultsDiv.innerHTML = "Места не найдены 😞";
            return;
        }

        let html = "<h3>Найденные места:</h3>";
        html += this.allPlaces.map((place, index) => `
            <div class="place" data-index="${index}">
                <strong>${place.name || 'Без названия'}</strong>
                ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                ${place.revew ? `<div>${place.revew}</div>` : ''}
            </div>
        `).join('');

        resultsDiv.innerHTML = html;
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
                    ${place.revew || ''}
                `))
                .addTo(this.map);
            
            marker.placeIndex = this.allPlaces.indexOf(place);
            return marker;
        }).filter(marker => marker !== null);
    }

    addPlaceClickHandlers() {
        document.querySelectorAll('.place').forEach(placeEl => {
            placeEl.addEventListener('click', () => {
                const index = parseInt(placeEl.getAttribute('data-index'));
                const marker = this.placeMarkers.find(m => m.placeIndex === index);
                
                if (marker) {
                    marker.togglePopup();
                    this.map.flyTo({
                        center: marker.getLngLat(),
                        zoom: 15
                    });
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

    refreshMap() {
        if (this.map) {
            this.map.resize();
            alert("Карта обновлена");
        }
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