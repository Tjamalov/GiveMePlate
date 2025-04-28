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
        // TODO: Implement Mapbox Places API search
        this.showError("Функция поиска мест пока не реализована");
    }

    async searchLuckyPlace(latitude, longitude) {
        // TODO: Implement Mapbox Places API search for lucky place
        this.showError("Функция 'Мне повезёт' пока не реализована");
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