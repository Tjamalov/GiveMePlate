document.addEventListener('DOMContentLoaded', async () => {
    const content = document.getElementById('content');
    const closeBtn = document.getElementById('closeBtn');
    let map = null;
    let userMarker = null;
    let placeMarker = null;

    // Обработчик закрытия
    closeBtn.addEventListener('click', () => {
        window.location.href = '../index.html';
    });

    // Инициализация карты
    function initializeMap(lat, lon) {
        console.log('Initializing map with coordinates:', { lat, lon });
        try {
            mapboxgl.accessToken = window.MAPBOX_API_KEY;
            
            if (!mapboxgl.accessToken) {
                throw new Error('Mapbox access token is not set');
            }

            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                throw new Error('Map container not found');
            }

            map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/dark-v11',
                center: [lon, lat],
                zoom: 15
            });

            // Показываем карту сразу
            mapContainer.style.display = 'block';

            // Добавляем обработчик загрузки
            map.on('load', () => {
                console.log('Map loaded successfully');
                map.resize();
            });

            return true;
        } catch (error) {
            console.error('Error initializing map:', error);
            throw error;
        }
    }

    // Добавление маркеров на карту
    function addMarkers(place, userLat, userLon) {
        console.log('Adding markers for place:', place);
        console.log('User location:', { userLat, userLon });

        if (!map) {
            console.error('Map is not initialized');
            return;
        }

        if (!place.location || !place.location.coordinates) {
            console.error('Place has no coordinates:', place);
            return;
        }

        try {
            const [placeLon, placeLat] = place.location.coordinates;

            // Маркер места
            placeMarker = new mapboxgl.Marker()
                .setLngLat([placeLon, placeLat])
                .setPopup(new mapboxgl.Popup().setHTML(`
                    <b>${place.name || 'Без названия'}</b>
                    <small>${place.type || ''}</small>
                    <div class="route-info">
                        <div>🚶‍♂️ Пешком: ${Math.round(place.distance)} м</div>
                        <div>⏱️ Время: ${Math.round(place.duration / 60)} мин</div>
                    </div>
                    ${place.revew ? `<div>${place.revew}</div>` : ''}
                `))
                .addTo(map);

            // Маркер пользователя
            userMarker = new mapboxgl.Marker({
                color: "#FF0000"
            })
            .setLngLat([userLon, userLat])
            .setPopup(new mapboxgl.Popup().setHTML("<b>Ваше местоположение</b>"))
            .addTo(map);

            // Добавляем маршрут
            const directionsRequest = `https://api.mapbox.com/directions/v5/mapbox/walking/${userLon},${userLat};${placeLon},${placeLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

            fetch(directionsRequest)
                .then(response => response.json())
                .then(data => {
                    if (data.routes && data.routes.length > 0) {
                        const route = data.routes[0];
                        const routeGeoJson = {
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates: route.geometry.coordinates
                            }
                        };

                        // Добавляем маршрут на карту
                        map.addSource('route', {
                            type: 'geojson',
                            data: routeGeoJson
                        });

                        map.addLayer({
                            id: 'route',
                            type: 'line',
                            source: 'route',
                            layout: {
                                'line-join': 'round',
                                'line-cap': 'round'
                            },
                            paint: {
                                'line-color': '#4CAF50',
                                'line-width': 4,
                                'line-dasharray': [2, 2]
                            }
                        });

                        // Добавляем информацию о расстоянии и времени
                        const distance = Math.round(route.distance);
                        const duration = Math.round(route.duration / 60); // конвертируем секунды в минуты
                        
                        // Обновляем попап маркера места с информацией о маршруте
                        placeMarker.setPopup(new mapboxgl.Popup().setHTML(`
                            <b>${place.name || 'Без названия'}</b>
                            <small>${place.type || ''}</small>
                            <div class="route-info">
                                <div>🚶‍♂️ Пешком: ${distance} м</div>
                                <div>⏱️ Время: ${duration} мин</div>
                            </div>
                            ${place.revew ? `<div>${place.revew}</div>` : ''}
                        `));

                        // Обновляем границы карты, чтобы включить маршрут
                        const bounds = new mapboxgl.LngLatBounds();
                        route.geometry.coordinates.forEach(coord => {
                            bounds.extend(coord);
                        });
                        map.fitBounds(bounds, { padding: 50 });
                    }
                })
                .catch(error => {
                    console.error('Error fetching route:', error);
                });

            console.log('Markers added successfully');
        } catch (error) {
            console.error('Error adding markers:', error);
        }
    }

    try {
        const isLucky = sessionStorage.getItem('isLucky') === 'true';
        console.log('Is lucky mode:', isLucky);

        if (isLucky) {
            // Если это режим "Мне повезёт", ищем ближайшее место
            const userLocation = JSON.parse(sessionStorage.getItem('userLocation'));
            console.log('User location from session:', userLocation);

            if (!userLocation) {
                showError("Не удалось получить ваше местоположение");
                return;
            }

            // Сразу инициализируем карту
            try {
                initializeMap(userLocation.latitude, userLocation.longitude);
            } catch (error) {
                console.error('Error initializing map:', error);
                showError("Ошибка при инициализации карты: " + error.message);
            }

            // Инициализируем базу данных
            const db = new PlacesDatabase();
            
            // Получаем все места
            const places = await db.searchPlaces(userLocation.latitude, userLocation.longitude);
            console.log('Found places:', places);
            
            // Фильтруем места в радиусе 5 км
            const nearbyPlaces = places.filter(place => {
                if (!place.location || !place.location.coordinates) return false;
                const [placeLon, placeLat] = place.location.coordinates;
                const distance = calculateDistance(userLocation.latitude, userLocation.longitude, placeLat, placeLon);
                return distance <= 5000; // 5 км = 5000 метров
            });

            console.log('Nearby places:', nearbyPlaces);

            if (nearbyPlaces.length === 0) {
                showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Выбираем случайное место из ближайших
            const randomIndex = Math.floor(Math.random() * nearbyPlaces.length);
            const luckyPlace = nearbyPlaces[randomIndex];
            console.log('Selected lucky place:', luckyPlace);
            
            displayPlace(luckyPlace);
            addMarkers(luckyPlace, userLocation.latitude, userLocation.longitude);

            // Очищаем флаги после использования
            sessionStorage.removeItem('isLucky');
            sessionStorage.removeItem('userLocation');
        } else {
            // Обычный режим - показываем выбранное место
            const places = JSON.parse(sessionStorage.getItem('places') || '[]');
            const placeId = new URLSearchParams(window.location.search).get('id');
            console.log('Searching for place with ID:', placeId);
            console.log('Available places:', places);
            
            if (!placeId) {
                showError("ID места не указан");
                return;
            }

            if (places.length === 0) {
                showError("Список мест не найден. Пожалуйста, вернитесь на главную страницу и попробуйте снова.");
                return;
            }
            
            const place = places.find(p => p.id === placeId);
            console.log('Found place:', place);
            
            if (place) {
                displayPlace(place);

                // Получаем координаты пользователя из sessionStorage
                const userLocation = JSON.parse(sessionStorage.getItem('userLocation'));
                console.log('User location from session:', userLocation);

                if (userLocation && place.location && place.location.coordinates) {
                    // Инициализируем карту и добавляем маркеры
                    try {
                        initializeMap(userLocation.latitude, userLocation.longitude);
                        addMarkers(place, userLocation.latitude, userLocation.longitude);
                    } catch (error) {
                        console.error('Error initializing map:', error);
                        showError("Ошибка при инициализации карты: " + error.message);
                    }
                } else {
                    console.error('Missing required data for map:', {
                        hasUserLocation: !!userLocation,
                        hasPlaceLocation: !!(place.location && place.location.coordinates)
                    });
                    showError("Не удалось получить данные о местоположении");
                }
            } else {
                showError("Место не найдено. Возможно, вы перешли по устаревшей ссылке.");
            }
        }
    } catch (error) {
        console.error('Detailed error:', error);
        showError("Произошла ошибка при загрузке данных: " + error.message);
    }
});

// Функция для расчета расстояния между двумя точками
function calculateDistance(lat1, lon1, lat2, lon2) {
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

function displayPlace(place) {
    console.log('Displaying place:', place);
    const content = document.getElementById('content');
    
    // Create photos HTML if placePhotos exists
    let photoHtml = '';
    if (place.placephotos) {
        console.log('Place has photos:', place.placephotos);
        const photos = place.placephotos.split(',').map(url => url.trim());
        photoHtml = `
            <div class="place-photos">
                ${photos.map(photoUrl => `
                    <div class="place-photo">
                        <img src="${photoUrl}" alt="${place.name}" onerror="this.parentElement.remove()" />
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        console.log('No photos available for place');
    }

    content.innerHTML = `
        <div class="place-details">
            <h2>${place.name}</h2>
            <div class="place-type">${place.type}</div>
            ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
            <div class="place-distance">${Math.round(place.distance)} м</div>
            <div class="place-address">${place.address || 'Адрес не указан'}</div>
            ${place.kitchen ? `<div class="place-description">${place.kitchen}</div>` : ''}
            ${place.revew ? `<div class="place-description">${place.revew}</div>` : ''}
            ${photoHtml}
        </div>
    `;
    
    // Log the final HTML structure
    console.log('Generated HTML structure:', content.innerHTML);
}

function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="error">
            ${message}
        </div>
    `;
} 