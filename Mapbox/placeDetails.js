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
            // Если это режим "Мне повезёт", используем сохраненное место
            const luckyPlace = JSON.parse(sessionStorage.getItem('luckyPlace'));
            console.log('Lucky place data:', luckyPlace);
            
            if (!luckyPlace) {
                showError("Не удалось найти подходящее место");
                return;
            }

            displayPlace(luckyPlace);

            // Очищаем флаги после использования
            sessionStorage.removeItem('isLucky');
            sessionStorage.removeItem('userLocation');
            sessionStorage.removeItem('luckyPlace');
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