function createPlacemark(place) {
    // Определяем иконку в зависимости от типа места питания
    let iconName;
    switch(place.types[0]) {
        case 'bar':
        case 'pub':
            iconName = 'local_bar';
            break;
        case 'restaurant':
            iconName = 'restaurant';
            break;
        case 'cafe':
            iconName = 'local_cafe';
            break;
        case 'night_club':
            iconName = 'nightlife';
            break;
        default:
            iconName = 'restaurant';
    }

    // Создаем HTML для маркера
    const markerHtml = `
        <div style="
            background: rgba(255, 255, 255, 0.9);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        ">
            <span class="material-icons" style="
                color: #000;
                font-size: 24px;
            ">${iconName}</span>
        </div>
    `;

    // Создаем маркер с кастомной иконкой
    const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: map,
        title: place.name,
        icon: {
            url: 'data:image/svg+xml;base64,' + btoa(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="20" fill="white" opacity="0.9"/>
                    <text x="20" y="20" font-family="Material Icons" font-size="24" text-anchor="middle" dominant-baseline="middle">${iconName}</text>
                </svg>
            `),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20)
        }
    });

    // Добавляем обработчик клика
    marker.addListener('click', function() {
        window.location.href = `place.html?id=${place.place_id}`;
    });

    return marker;
} 