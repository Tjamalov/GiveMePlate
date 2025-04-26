const CONFIG = {
    map: {
        zoom: 15,
        tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    search: {
        radius: 1000,
        placeTypes: ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'bistro', 'food_court'],
        maxResults: 3
    },
    placeTypes: {
        'cafe': 'Кафе',
        'restaurant': 'Ресторан',
        'fast_food': 'Фастфуд',
        'bar': 'Бар',
        'pub': 'Паб',
        'bistro': 'Бистро',
        'food_court': 'Фудкорт'
    }
};

class FoodFinder {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.placeMarkers = [];
        this.allPlaces = [];
        this.highlightedMarker = null;
        
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
        this.map = L.map('map').setView([lat, lon], CONFIG.map.zoom);
        L.tileLayer(CONFIG.map.tileLayer, {
            attribution: CONFIG.map.attribution
        }).addTo(this.map);
        
        this.userMarker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'user-marker',
                html: '📍',
                iconSize: [30, 30]
            })
        }).addTo(this.map).bindPopup("Ваше местоположение");

        setTimeout(() => {
            this.map.invalidateSize();
            this.map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    layer.redraw();
                }
            });
        }, 100);
    }

    updateMapPosition(lat, lon) {
        this.map.setView([lat, lon], CONFIG.map.zoom);
        this.userMarker.setLatLng([lat, lon]);
    }

    showMap() {
        document.getElementById('map').style.display = 'block';
        document.getElementById('refresh-map').style.display = 'block';
    }

    async searchPlaces(latitude, longitude) {
        const query = this.buildOverpassQuery(latitude, longitude);
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${query}`);
        const data = await response.json();

        this.processPlaces(data, latitude, longitude);
        this.displayResults();
    }

    async searchLuckyPlace(latitude, longitude) {
        const query = this.buildOverpassQuery(latitude, longitude, 500);
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${query}`);
        const data = await response.json();

        this.processPlaces(data, latitude, longitude);
        
        if (this.allPlaces.length === 0) {
            this.showError("К сожалению, поблизости нет подходящих мест 😞");
            return;
        }

        const randomIndex = Math.floor(Math.random() * this.allPlaces.length);
        const luckyPlace = this.allPlaces[randomIndex];
        
        this.displayLuckyPlace(luckyPlace);
    }

    buildOverpassQuery(lat, lon, radius = CONFIG.search.radius) {
        const types = CONFIG.search.placeTypes.join('|');
        return `[out:json];(node["amenity"~"${types}"](around:${radius},${lat},${lon});` +
               `way["amenity"~"${types}"](around:${radius},${lat},${lon}););out body;>;out skel qt;`;
    }

    processPlaces(data, userLat, userLon) {
        this.allPlaces = data.elements
            .map(element => ({
                ...element,
                lat: element.lat || element.center?.lat,
                lon: element.lon || element.center?.lon,
                distance: this.calculateDistance(userLat, userLon, element.lat || element.center?.lat, element.lon || element.center?.lon),
                hasAddress: !!(element.tags?.['addr:street'] || element.tags?.['addr:housenumber']),
                type: element.tags?.amenity || 'unknown'
            }))
            .filter(place => {
                const hasBasicInfo = place.tags?.name?.trim() && place.lat && place.lon;
                const hasValidType = place.type && place.type !== 'unknown' && CONFIG.search.placeTypes.includes(place.type);
                return hasBasicInfo && hasValidType;
            })
            .sort((a, b) => {
                if (a.hasAddress !== b.hasAddress) {
                    return a.hasAddress ? -1 : 1;
                }
                return a.distance - b.distance;
            });
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
                <strong>${place.tags?.name}</strong>
                ${CONFIG.placeTypes[place.type] ? `<span class="place-type">${CONFIG.placeTypes[place.type]}</span>` : ''}
                <div>${Math.round(place.distance)} м</div>
                ${this.getAddress(place) || 'Адрес не указан'}
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
            const marker = L.marker([place.lat, place.lon], {
                riseOnHover: true
            }).addTo(this.map)
            .bindPopup(`
                <b>${place.tags?.name}</b><br>
                ${CONFIG.placeTypes[place.type] ? `<small>${CONFIG.placeTypes[place.type]}</small><br>` : ''}
                ${this.getAddress(place) || 'Адрес не указан'}
            `);
            
            marker.placeIndex = this.allPlaces.indexOf(place);
            return marker;
        });
    }

    addPlaceClickHandlers() {
        document.querySelectorAll('.place').forEach(placeEl => {
            placeEl.addEventListener('click', () => {
                const index = parseInt(placeEl.getAttribute('data-index'));
                const marker = this.placeMarkers.find(m => m.placeIndex === index);
                
                if (marker) {
                    this.highlightMarker(marker);
                }
            });
        });
    }

    highlightMarker(marker) {
        if (this.highlightedMarker) {
            this.highlightedMarker.setZIndexOffset(0);
        }
        
        this.highlightedMarker = marker.setZIndexOffset(1000).openPopup();
        this.map.setView(marker.getLatLng(), CONFIG.map.zoom);
        
        marker.getElement().classList.add('highlighted');
        setTimeout(() => {
            marker.getElement().classList.remove('highlighted');
        }, 1500);
        
        document.getElementById('map').scrollIntoView({
            behavior: 'smooth'
        });
    }

    refreshMap() {
        if (this.map) {
            this.map.invalidateSize();
            this.map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    layer.redraw();
                }
            });
            alert("Кэш карты обновлен");
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

    getAddress(place) {
        return [place.tags?.['addr:street'], place.tags?.['addr:housenumber']].filter(Boolean).join(' ');
    }

    clearPlaceMarkers() {
        this.placeMarkers.forEach(marker => {
            if (marker) this.map.removeLayer(marker);
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

const app = new FoodFinder(); 