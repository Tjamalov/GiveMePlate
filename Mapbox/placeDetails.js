document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeDetailsBtn');
    const placeDetails = document.getElementById('placeDetails');
    
    // Получаем ID места из URL
    const urlParams = new URLSearchParams(window.location.search);
    const placeId = urlParams.get('id');
    
    // Получаем кэшированные данные из sessionStorage
    const cachedPlaces = JSON.parse(sessionStorage.getItem('places')) || [];
    const place = cachedPlaces.find(p => p.id === placeId);
    
    if (place) {
        displayPlaceDetails(place);
    } else {
        placeDetails.innerHTML = '<div class="error">Место не найдено</div>';
    }
    
    closeBtn.addEventListener('click', () => {
        // Вместо history.back() используем прямой переход на index.html
        window.location.href = 'index.html';
    });
});

function displayPlaceDetails(place) {
    const placeDetails = document.getElementById('placeDetails');
    let html = `
        <h2>${place.name || 'Без названия'}</h2>
        ${place.type ? `<div class="place-type">${place.type}</div>` : ''}
        ${place.distance ? `<div class="distance">${place.distance} м</div>` : ''}
        ${place.address ? `<div class="address">${place.address}</div>` : ''}
        ${place.revew ? `<div class="description">${place.revew}</div>` : ''}
    `;
    
    placeDetails.innerHTML = html;
} 