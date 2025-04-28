class FoodFinder {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.highlightedMarker = null;
        this.db = new PlacesDatabase();
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('findPlacesBtn').addEventListener('click', () => this.findPlaces());
        document.getElementById('luckyBtn').addEventListener('click', () => this.findLuckyPlace());
        document.getElementById('refresh-map').addEventListener('click', () => this.refreshMap());
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
            
            this.initializeOrUpdateMap(latitude, longitude);
            await this.searchPlaces(latitude, longitude);
        } catch (error) {
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
        this.allPlaces = places.map(place => ({
            ...place,
            distance: this.calculateDistance(userLat, userLon, place.location.coordinates[1], place.location.coordinates[0])
        })).sort((a, b) => a.distance - b.distance);
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        
        if (this.allPlaces.length === 0) {
            resultsDiv.innerHTML = "Места не найдены поблизости 😞";
            return;
        }

        let html = "<h3>Ближайшие места:</h3>";
        const visiblePlaces = this.allPlaces.slice(0, 3);
        html += visiblePlaces.map((place, index) => this.createPlaceHtml(place, index)).join('');
        
        if (this.allPlaces.length > 3) {
            html += `<div class="show-more">
                <button id="showAllBtn" onclick="app.showAllPlaces()">Показать всё (${this.allPlaces.length})</button>
            </div>`;
        }

        resultsDiv.innerHTML = html;
        this.addPlaceMarkers(visiblePlaces);
        this.addPlaceClickHandlers();
    }

    createPlaceHtml(place, index) {
        return `
            <div class="place" data-index="${this.allPlaces.indexOf(place)}">
                <strong>${place.name}</strong>
                ${place.type ? `<span class="place-type">${place.type}</span>` : ''}
                <div>${Math.round(place.distance)} м</div>
                ${place.address || 'Адрес не указан'}
            </div>
        `;
    }

    addPlaceMarkers(places = this.allPlaces) {
        this.clearPlaceMarkers();
        
        this.placeMarkers = places.map(place => {
            const marker = new mapboxgl.Marker()
                .setLngLat([place.location.coordinates[0], place.location.coordinates[1]])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <b>${place.name}</b><br>
                    ${place.type ? `<small>${place.type}</small><br>` : ''}
                    ${place.address || 'Адрес не указан'}
                `))
                .addTo(this.map);
            
            marker.placeIndex = this.allPlaces.indexOf(place);
            return marker;
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
}

const app = new FoodFinder(); 