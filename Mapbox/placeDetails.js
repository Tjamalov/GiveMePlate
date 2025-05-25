document.addEventListener('DOMContentLoaded', async () => {
    const content = document.getElementById('content');
    const closeBtn = document.getElementById('closeBtn');

    // Обработчик закрытия
    closeBtn.addEventListener('click', () => {
        window.location.href = '../index.html';
    });

    try {
        const isLucky = sessionStorage.getItem('isLucky') === 'true';

        if (isLucky) {
            // Если это режим "Мне повезёт", ищем ближайшее место
            const userLocation = JSON.parse(sessionStorage.getItem('userLocation'));
            if (!userLocation) {
                showError("Не удалось получить ваше местоположение");
                return;
            }

            // Инициализируем базу данных
            const db = new PlacesDatabase();
            
            // Получаем все места
            const places = await db.searchPlaces(userLocation.latitude, userLocation.longitude);
            
            // Фильтруем места в радиусе 5 км
            const nearbyPlaces = places.filter(place => {
                if (!place.location || !place.location.coordinates) return false;
                const [placeLon, placeLat] = place.location.coordinates;
                const distance = calculateDistance(userLocation.latitude, userLocation.longitude, placeLat, placeLon);
                return distance <= 5000; // 5 км = 5000 метров
            });

            if (nearbyPlaces.length === 0) {
                showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Выбираем случайное место из ближайших
            const randomIndex = Math.floor(Math.random() * nearbyPlaces.length);
            const luckyPlace = nearbyPlaces[randomIndex];
            
            displayPlace(luckyPlace);

            // Очищаем флаги после использования
            sessionStorage.removeItem('isLucky');
            sessionStorage.removeItem('userLocation');
        } else {
            // Обычный режим - показываем выбранное место
            const places = JSON.parse(sessionStorage.getItem('places') || '[]');
            const placeId = new URLSearchParams(window.location.search).get('id');
            console.log('Searching for place with ID:', placeId);
            console.log('Available places:', places);
            
            const place = places.find(p => p.id === placeId);
            console.log('Found place:', place);
            
            if (place) {
                displayPlace(place);
            } else {
                showError("Место не найдено");
            }
        }
    } catch (error) {
        showError("Произошла ошибка при загрузке данных");
        console.error('Error in placeDetails:', error);
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
    
    // Create photo HTML if placePhotos exists
    let photoHtml = '';
    if (place.placePhotos) {
        console.log('Place has photo:', place.placePhotos);
        // Use the URL directly from placePhotos since it's already a complete URL
        const photoUrl = place.placePhotos;
        console.log('Using photo URL:', photoUrl);
        photoHtml = `
            <div class="place-photo">
                <img src="${photoUrl}" alt="${place.name}" onerror="console.error('Failed to load image:', this.src)" />
            </div>
        `;
    } else {
        console.log('No photo available for place');
    }

    content.innerHTML = `
        <div class="place-details">
            <h2>${place.name}</h2>
            <div class="place-type">${place.type}</div>
            ${place.vibe ? `<div class="place-vibe">${place.vibe}</div>` : ''}
            <div class="place-distance">${Math.round(place.distance)} м</div>
            <div class="place-address">${place.address || 'Адрес не указан'}</div>
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