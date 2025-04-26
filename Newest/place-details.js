class PlaceDetails {
    constructor() {
        this.map = null;
        this.placeMarker = null;
        this.userMarker = null;
        this.place = null;
        
        this.initialize();
    }

    async initialize() {
        // Получаем параметры из URL
        const urlParams = new URLSearchParams(window.location.search);
        const placeId = urlParams.get('placeId');
        const userLat = parseFloat(urlParams.get('userLat'));
        const userLng = parseFloat(urlParams.get('userLng'));

        if (!placeId) {
            this.showError('ID места не указан');
            return;
        }

        // Инициализируем карту
        this.initializeMap(userLat, userLng);
        
        // Загружаем информацию о месте
        await this.loadPlaceDetails(placeId);
    }

    initializeMap(userLat, userLng) {
        const mapElement = document.getElementById('placeMap');
        this.map = new google.maps.Map(mapElement, {
            zoom: 15,
            center: { lat: userLat, lng: userLng },
            disableDefaultUI: true
        });

        // Добавляем маркер пользователя
        if (userLat && userLng) {
            this.userMarker = new google.maps.Marker({
                position: { lat: userLat, lng: userLng },
                map: this.map,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }
            });
        }
    }

    async loadPlaceDetails(placeId) {
        try {
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
                    'geometry'
                ]
            };

            const placesService = new google.maps.places.PlacesService(this.map);
            const place = await new Promise((resolve, reject) => {
                placesService.getDetails(request, (place, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        resolve(place);
                    } else {
                        reject(new Error(`Ошибка загрузки: ${status}`));
                    }
                });
            });

            this.place = place;
            this.displayPlaceDetails();
        } catch (error) {
            console.error('Ошибка при загрузке деталей места:', error);
            this.showError('Не удалось загрузить информацию о месте');
        }
    }

    displayPlaceDetails() {
        // Устанавливаем название места
        document.getElementById('placeName').textContent = this.place.name;

        // Добавляем маркер места на карту
        if (this.place.geometry) {
            this.placeMarker = new google.maps.Marker({
                position: this.place.geometry.location,
                map: this.map,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                }
            });

            // Центрируем карту на месте
            this.map.setCenter(this.place.geometry.location);
        }

        // Отображаем фотографии
        const photosContainer = document.getElementById('placePhotos');
        if (this.place.photos && this.place.photos.length > 0) {
            this.place.photos.forEach(photo => {
                const photoUrl = photo.getUrl({ maxWidth: 400, maxHeight: 300 });
                const photoElement = document.createElement('div');
                photoElement.className = 'place-photo';
                photoElement.innerHTML = `<img src="${photoUrl}" alt="${this.place.name}">`;
                photosContainer.appendChild(photoElement);
            });
        }

        // Отображаем информацию о месте
        const infoContainer = document.getElementById('placeInfo');
        let infoHTML = `
            <h2>Информация</h2>
            <p><strong>Адрес:</strong> ${this.place.formatted_address}</p>
        `;

        if (this.place.formatted_phone_number) {
            infoHTML += `<p><strong>Телефон:</strong> ${this.place.formatted_phone_number}</p>`;
        }

        if (this.place.website) {
            infoHTML += `<p><strong>Сайт:</strong> <a href="${this.place.website}" target="_blank">${this.place.website}</a></p>`;
        }

        if (this.place.rating) {
            infoHTML += `<p><strong>Рейтинг:</strong> ${this.place.rating} (${this.place.user_ratings_total} отзывов)</p>`;
        }

        if (this.place.opening_hours && this.place.opening_hours.weekday_text) {
            infoHTML += `<p><strong>Часы работы:</strong></p><ul>`;
            this.place.opening_hours.weekday_text.forEach(day => {
                infoHTML += `<li>${day}</li>`;
            });
            infoHTML += `</ul>`;
        }

        infoContainer.innerHTML = infoHTML;
    }

    showError(message) {
        const infoContainer = document.getElementById('placeInfo');
        infoContainer.innerHTML = `
            <div class="error">
                <h2>Ошибка</h2>
                <p>${message}</p>
            </div>
        `;
    }
}

// Инициализируем приложение после загрузки Google Maps API
function initApp() {
    window.placeDetails = new PlaceDetails();
}

// Проверяем загрузку Google Maps API
function checkGoogleMapsLoaded() {
    if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        initApp();
    } else {
        setTimeout(checkGoogleMapsLoaded, 100);
    }
}

// Начинаем проверку загрузки API
checkGoogleMapsLoaded(); 