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
            // Если это режим "Мне повезёт", ищем места
            const userLocation = JSON.parse(sessionStorage.getItem('userLocation'));
            if (!userLocation) {
                showError("Не удалось определить местоположение");
                return;
            }

            // Создаем экземпляр базы данных
            const db = new PlacesDatabase();
            
            // Ищем места в радиусе 3 км
            const places = await db.searchPlaces(userLocation.latitude, userLocation.longitude, 3000);
            
            if (places.length === 0) {
                showError("К сожалению, поблизости нет подходящих мест 😞");
                return;
            }

            // Выбираем случайное место
            const randomIndex = Math.floor(Math.random() * places.length);
            const luckyPlace = places[randomIndex];
            displayPlace(luckyPlace);

            // Очищаем флаг isLucky после использования
            sessionStorage.removeItem('isLucky');
            sessionStorage.removeItem('userLocation');
        } else {
            // Обычный режим - показываем выбранное место
            const places = JSON.parse(sessionStorage.getItem('places') || '[]');
            const placeId = new URLSearchParams(window.location.search).get('id');
            const place = places.find(p => p.id === placeId);
            
            if (place) {
                displayPlace(place);
            } else {
                showError("Место не найдено");
            }
        }
    } catch (error) {
        showError("Произошла ошибка при загрузке данных");
        console.error(error);
    }
});

function displayPlace(place) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="place-details">
            <h2>${place.name}</h2>
            <div class="place-type">${place.type}</div>
            <div class="place-distance">${Math.round(place.distance)} м</div>
            <div class="place-address">${place.address || 'Адрес не указан'}</div>
            ${place.revew ? `<div class="place-description">${place.revew}</div>` : ''}
        </div>
    `;
}

function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="error">
            ${message}
        </div>
    `;
} 