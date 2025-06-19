import logging
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import Updater, CommandHandler, CallbackQueryHandler, CallbackContext, MessageHandler, Filters, ConversationHandler
from config import TELEGRAM_BOT_TOKEN, AUTHORIZED_USERS
from supabase_client import supabase
from math import radians, sin, cos, sqrt, atan2
import time
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
import signal

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Определяем состояния диалога
NAME, VIBE, TYPE, LOCATION, PHOTO, REVIEW, EDIT_ID, EDIT_CONFIRM, EDIT_NAME, EDIT_VIBE, EDIT_TYPE, EDIT_LOCATION, EDIT_PHOTO, EDIT_REVIEW = range(14)

def start(update: Update, context: CallbackContext) -> None:
    """Send a message when the command /start is issued."""
    user_id = update.effective_user.id
    
    if user_id not in AUTHORIZED_USERS:
        update.message.reply_text(
            "Извините, у вас нет доступа к этому боту. "
        )
        return
    
    show_main_menu(update, context)

def button_handler(update: Update, context: CallbackContext) -> None:
    """Handle button presses."""
    query = update.callback_query
    logger.info(f"Получен callback query: {query.data}")
    
    if query.data == 'list_places':
        logger.info("Нажата кнопка 'Показать места'")
        # Очищаем данные о странице при новом запросе списка
        context.user_data['places_page'] = 0
        list_places(update, context)
    elif query.data == 'add_place':
        # Запрашиваем название места
        query.message.reply_text("Введите название места:")
        return NAME
    elif query.data == 'edit_place':
        # Запрашиваем ID места для редактирования
        query.message.reply_text("Введите ID места, которое хотите отредактировать:")
        return EDIT_ID
    elif query.data == 'more_places':
        # Увеличиваем номер страницы
        context.user_data['places_page'] = context.user_data.get('places_page', 0) + 1
        list_places(update, context)
    elif query.data == 'stop_places':
        # Очищаем данные о странице и показываем главное меню
        context.user_data.pop('places_page', None)
        show_main_menu(update, context)
    else:
        query.message.reply_text("Неизвестная команда")
    
    # Отвечаем на callback query только если это не часть ConversationHandler
    if query.data not in ['add_place', 'edit_place']:
        query.answer()

def show_main_menu(update: Update, context: CallbackContext) -> None:
    """Show the main menu with buttons."""
    keyboard = [
        [InlineKeyboardButton("📋 Показать места", callback_data='list_places')],
        [InlineKeyboardButton("➕ Добавить новое место", callback_data='add_place')],
        [InlineKeyboardButton("✏️ Редактировать место", callback_data='edit_place')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Если это callback query, редактируем существующее сообщение
    if update.callback_query:
        update.callback_query.message.edit_text(
            "Выберите действие:",
            reply_markup=reply_markup
        )
    else:
        # Если это обычное сообщение, отправляем новое
        update.message.reply_text(
            "Выберите действие:",
            reply_markup=reply_markup
        )

def list_places(update: Update, context: CallbackContext) -> None:
    """Получаем и отображаем список мест."""
    logger.info("Начало функции list_places")
    
    # Проверяем наличие геолокации
    user_location = context.user_data.get('user_location')
    logger.info(f"Текущая геолокация пользователя: {user_location}")
    
    if not user_location:
        logger.info("Геолокация не найдена, запрашиваем у пользователя")
        message = "Для показа ближайших мест, пожалуйста, отправьте вашу геолокацию."
        send_location_request(message, update)
        return

    try:
        # Получаем список мест из базы данных
        logger.info("Запрашиваем места из базы данных")
        response = supabase.table('meal_places').select('*').execute()
        places = response.data
        logger.info(f"Получено {len(places)} мест из базы данных")
        
        if not places:
            logger.info("Места не найдены")
            if update.callback_query:
                update.callback_query.message.reply_text("Места не найдены.")
            else:
                update.message.reply_text("Места не найдены.")
            return
        
        # Сортируем места по расстоянию
        logger.info("Сортируем места по расстоянию")
        for place in places:
            try:
                # Проверяем формат location
                if isinstance(place['location'], dict) and 'coordinates' in place['location']:
                    # Если location в формате PostGIS с coordinates
                    coords = place['location']['coordinates']
                    place['distance'] = calculate_distance(
                        user_location.latitude,
                        user_location.longitude,
                        float(coords[1]),  # latitude
                        float(coords[0])   # longitude
                    )
                else:
                    # Старый формат "POINT(lon lat)"
                    location_str = place['location'].replace('POINT(', '').replace(')', '')
                    lon, lat = map(float, location_str.split())
                    place['distance'] = calculate_distance(
                        user_location.latitude,
                        user_location.longitude,
                        lat,
                        lon
                    )
            except Exception as e:
                logger.error(f"Ошибка при расчете расстояния для места {place.get('name', 'Unknown')}: {str(e)}")
                place['distance'] = float('inf')
        
        # Сортируем по расстоянию
        places.sort(key=lambda x: x['distance'])
        
        # Разбиваем на страницы по 5 мест
        page_size = 5
        page = context.user_data.get('places_page', 0)
        start_idx = page * page_size
        end_idx = start_idx + page_size
        
        # Получаем места для текущей страницы
        page_places = places[start_idx:end_idx]
        logger.info(f"Показываем места с {start_idx} по {end_idx}")
        
        if not page_places:
            logger.info("Больше мест нет")
            if update.callback_query:
                update.callback_query.message.reply_text("Больше мест нет.")
            else:
                update.message.reply_text("Больше мест нет.")
            return
        
        # Формируем сообщение
        message = "📍 Ближайшие места:\n\n"
        for place in page_places:
            # Безопасно получаем ID, преобразуя в строку
            place_id = str(place.get('id', 'N/A'))
            message += (
                f"ID: {place_id}\n"
                f"Название: {place['name']}\n"
                f"Вайб: {place['vibe']}\n"
                f"Тип: {place['type']}\n"
                f"Адрес: {place['address']}\n"
                f"Расстояние: {place['distance']:.1f} км\n"
                f"Описание: {place['revew']}\n\n"
            )
        
        # Создаем клавиатуру
        keyboard = []
        if end_idx < len(places):
            keyboard.append([InlineKeyboardButton("Ещё", callback_data='more_places')])
        keyboard.append([InlineKeyboardButton("Хватит", callback_data='stop_places')])
        
        # Отправляем сообщение
        logger.info("Отправляем сообщение с местами")
        if update.callback_query:
            update.callback_query.message.reply_text(
                message,
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
        else:
            update.message.reply_text(
                message,
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            
    except Exception as e:
        logger.error(f"Ошибка при получении списка мест: {str(e)}")
        if update.callback_query:
            update.callback_query.message.reply_text("Произошла ошибка при получении списка мест.")
        else:
            update.message.reply_text("Произошла ошибка при получении списка мест.")

def handle_location(update: Update, context: CallbackContext) -> None:
    """Обработчик получения геолокации."""
    logger.info("Получена геолокация от пользователя")
    
    if not update.message or not update.message.location:
        logger.error("Получена пустая геолокация")
        update.message.reply_text("Не удалось получить геолокацию. Попробуйте еще раз.")
        return
        
    user_location = update.message.location
    # Сохраняем геолокацию
    context.user_data['user_location'] = user_location
    logger.info(f"Геолокация сохранена: {user_location.latitude}, {user_location.longitude}")
    
    # Проверяем, находимся ли мы в процессе добавления места
    if context.user_data.get('name') or context.user_data.get('vibe') or context.user_data.get('type'):
        logger.info("Геолокация получена в процессе добавления места, пропускаем обработку")
        return
    
    # Проверяем, находимся ли мы в процессе редактирования места
    if context.user_data.get('editing_place') or context.user_data.get('edit_name') or context.user_data.get('edit_vibe') or context.user_data.get('edit_type'):
        logger.info("Геолокация получена в процессе редактирования места, пропускаем обработку")
        return
    
    # Если это для показа списка мест
    logger.info("Геолокация получена для показа мест")
    list_places(update, context)

def send_location_request(message, update: Update) -> None:
    """Отправляет сообщение с кнопкой запроса геолокации."""
    reply_markup = ReplyKeyboardMarkup(
        [[KeyboardButton("Отправить местоположение", request_location=True)]],
        one_time_keyboard=True,
        resize_keyboard=True
    )
    if update.callback_query:
        update.callback_query.message.reply_text(message, reply_markup=reply_markup)
    else:
        update.message.reply_text(message, reply_markup=reply_markup)

def add_place_name(update: Update, context: CallbackContext) -> int:
    """Сохраняем название места и запрашиваем вайб."""
    logger.info("Начало функции add_place_name")
    name = update.message.text
    logger.info(f"Получено название места: {name}")
    
    # Сохраняем название
    context.user_data['name'] = name
    logger.info("Название места сохранено")
    
    # Создаем кнопки с вариантами вайба
    keyboard = [
        [InlineKeyboardButton("тусовый", callback_data='vibe_party'),
        InlineKeyboardButton("панк", callback_data='vibe_punk')],
        [InlineKeyboardButton("хипстерский", callback_data='vibe_hipster'),
        InlineKeyboardButton("семейный", callback_data='vibe_family')],
        [InlineKeyboardButton("локальный", callback_data='vibe_local'),
        InlineKeyboardButton("туристический", callback_data='vibe_tourist')],
        [InlineKeyboardButton("лакшери", callback_data='vibe_luxury'),
        InlineKeyboardButton("романтический", callback_data='vibe_romantic')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Запрашиваем вайб
    update.message.reply_text(
        "Выберите вайб места:",
        reply_markup=reply_markup
    )
    logger.info("Запрошен вайб места через кнопки")
    return VIBE

def add_place_vibe(update: Update, context: CallbackContext) -> int:
    """Сохраняем вайб места и запрашиваем тип."""
    logger.info("Начало функции add_place_vibe")
    
    # Получаем вайб из callback_data
    query = update.callback_query
    vibe_map = {
        'vibe_party': 'тусовый',
        'vibe_punk': 'панк',
        'vibe_hipster': 'хипстерский',
        'vibe_family': 'семейный',
        'vibe_local': 'локальный',
        'vibe_tourist': 'туристический',
        'vibe_luxury': 'лакшери',
        'vibe_romantic': 'романтический'
    }
    
    vibe = vibe_map.get(query.data)
    if not vibe:
        logger.error(f"Получен неизвестный вайб: {query.data}")
        query.message.reply_text("Пожалуйста, выберите вайб из предложенных вариантов.")
        return VIBE
    
    logger.info(f"Получен вайб места: {vibe}")
    
    # Сохраняем вайб
    context.user_data['vibe'] = vibe
    logger.info("Вайб места сохранен")
    
    # Создаем кнопки с вариантами типа места
    keyboard = [
        [InlineKeyboardButton("бар", callback_data='type_bar'),
        InlineKeyboardButton("кафе", callback_data='type_cafe')],
        [InlineKeyboardButton("ресторан", callback_data='type_restaurant'),
        InlineKeyboardButton("паб", callback_data='type_pub')],
        [InlineKeyboardButton("пиццерия", callback_data='type_pizzeria'),
        InlineKeyboardButton("кальянная", callback_data='type_hookah')],
        [InlineKeyboardButton("кофейня", callback_data='type_coffee')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Запрашиваем тип места
    query.message.reply_text(
        "Выберите тип места:",
        reply_markup=reply_markup
    )
    logger.info("Запрошен тип места через кнопки")
    return TYPE

def add_place_type(update: Update, context: CallbackContext) -> int:
    """Сохраняем тип места и запрашиваем геолокацию."""
    logger.info("Начало функции add_place_type")
    
    # Получаем тип из callback_data
    query = update.callback_query
    type_map = {
        'type_bar': 'бар',
        'type_cafe': 'кафе',
        'type_restaurant': 'ресторан',
        'type_pub': 'паб',
        'type_pizzeria': 'пиццерия',
        'type_hookah': 'кальянная',
        'type_coffee': 'кофейня'
    }
    
    place_type = type_map.get(query.data)
    if not place_type:
        logger.error(f"Получен неизвестный тип места: {query.data}")
        query.message.reply_text("Пожалуйста, выберите тип из предложенных вариантов.")
        return TYPE
    
    logger.info(f"Получен тип места: {place_type}")
    
    # Сохраняем тип
    context.user_data['type'] = place_type
    logger.info("Тип места сохранен")
    
    # Запрашиваем геолокацию
    keyboard = [[KeyboardButton("📍 Отправить местоположение", request_location=True)]]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)
    query.message.reply_text(
        "Отправьте геолокацию места:",
        reply_markup=reply_markup
    )
    logger.info("Запрошена геолокация места")
    return LOCATION

def add_place_location(update: Update, context: CallbackContext) -> int:
    """Сохраняем геолокацию и запрашиваем фото места."""
    logger.info("[LOCATION] Начало функции add_place_location")
    
    if not update.message or not update.message.location:
        # Запрашиваем геолокацию
        logger.info("[LOCATION] Запрашиваем геолокацию для нового места")
        context.user_data['waiting_for_place_location'] = True
        message = (
            "Пожалуйста, отправьте геолокацию места. "
            "Нажмите на кнопку ниже, чтобы отправить местоположение."
        )
        send_location_request(message, update)
        return LOCATION
        
    # Если геолокация уже получена
    user_location = update.message.location
    logger.info(f"[LOCATION] Получена геолокация для нового места: {user_location.latitude}, {user_location.longitude}")
    
    # Сохраняем координаты
    context.user_data['longitude'] = user_location.longitude
    context.user_data['latitude'] = user_location.latitude
    logger.info(f"[LOCATION] Координаты сохранены в контексте: {user_location.longitude}, {user_location.latitude}")
    
    # Получаем адрес через Nominatim
    logger.info(f"[LOCATION] Начинаем получение адреса через Nominatim")
    address = get_address_from_coordinates(user_location.latitude, user_location.longitude)
    context.user_data['address'] = address
    logger.info(f"[LOCATION] Адрес получен и сохранен в контексте: {address}")
    
    # Очищаем reply-клавиатуру
    update.message.reply_text(
        "Отлично! Теперь отправьте фото места.",
        reply_markup=ReplyKeyboardRemove()
    )
    return PHOTO

def sanitize_filename(filename: str) -> str:
    """Очищает имя файла от недопустимых символов."""
    # Заменяем пробелы и кириллицу на латиницу
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    }
    
    # Транслитерация
    for cyr, lat in translit_map.items():
        filename = filename.replace(cyr, lat)
    
    # Заменяем пробелы на подчеркивания
    filename = filename.replace(' ', '_')
    
    # Оставляем только буквы, цифры, точки, подчеркивания и дефисы
    filename = ''.join(c for c in filename if c.isalnum() or c in '._-')
    
    return filename

def handle_photo(update: Update, context: CallbackContext) -> int:
    """Обработчик получения фото."""
    logger.info("Начало функции handle_photo")
    
    if not update.message or not update.message.photo:
        logger.error("Получено пустое фото")
        update.message.reply_text(
            "Пожалуйста, отправьте фото места."
        )
        return PHOTO
        
    try:
        # Получаем фото с наилучшим качеством
        photo = update.message.photo[-1]
        file_id = photo.file_id
        
        # Получаем файл через Telegram API
        file = context.bot.get_file(file_id)
        
        # Скачиваем файл во временную директорию
        temp_path = f"/tmp/{file_id}.jpg"
        file.download(temp_path)
        
        # Загружаем файл в Supabase Storage
        with open(temp_path, 'rb') as f:
            file_data = f.read()
            
        # Генерируем уникальное имя файла
        place_name = sanitize_filename(context.user_data.get('name', 'unknown'))
        file_name = f"place_{place_name}_{int(time.time())}.jpg"
        
        # Загружаем в Storage
        response = supabase.storage.from_('photo').upload(
            file_name,
            file_data,
            {'content-type': 'image/jpeg'}
        )
        
        # Получаем публичный URL
        photo_url = supabase.storage.from_('photo').get_public_url(file_name)
        
        # Сохраняем URL в контексте
        context.user_data['placephotos'] = photo_url
        logger.info(f"Фото успешно загружено: {photo_url}")
        
        # Удаляем временный файл
        os.remove(temp_path)
        
        # Запрашиваем описание места
        logger.info("Запрашиваем описание места у пользователя")
        update.message.reply_text(
            "Отлично! Теперь напишите описание места. "
            "Опишите атмосферу, особенности, что здесь можно делать."
        )
        logger.info("Переходим к состоянию REVIEW")
        return REVIEW
        
    except Exception as e:
        logger.error(f"Ошибка при обработке фото: {str(e)}")
        update.message.reply_text(
            "Произошла ошибка при обработке фото. Попробуйте еще раз."
        )
        return PHOTO

def add_place_review(update: Update, context: CallbackContext) -> int:
    """Сохраняем описание и добавляем место в базу данных."""
    logger.info("Начало функции add_place_review")
    
    if not update.message or not update.message.text:
        logger.error("Получено пустое описание места")
        update.message.reply_text(
            "Пожалуйста, введите описание места."
        )
        return REVIEW
        
    review = update.message.text
    logger.info(f"Получено описание места: {review}")
    
    try:
        # Сохраняем описание
        context.user_data['revew'] = review
        logger.info("Описание места сохранено")
        
        # Получаем все данные места (без ID - он генерируется автоматически)
        place_data = {
            'name': context.user_data.get('name'),
            'vibe': context.user_data.get('vibe'),
            'type': context.user_data.get('type'),
            'address': context.user_data.get('address'),
            'longitude': context.user_data.get('longitude'),
            'latitude': context.user_data.get('latitude'),
            'location': f"POINT({context.user_data.get('longitude')} {context.user_data.get('latitude')})",
            'revew': review,
            'placephotos': context.user_data.get('placephotos')  # Добавляем URL фото
        }
        
        # Приводим типы данных к правильным форматам
        try:
            # Преобразуем координаты в float
            place_data['longitude'] = float(place_data['longitude']) if place_data['longitude'] is not None else None
            place_data['latitude'] = float(place_data['latitude']) if place_data['latitude'] is not None else None
            
            # Убираем None значения, которые могут вызвать проблемы
            place_data = {k: v for k, v in place_data.items() if v is not None}
            
            logger.info(f"[DATABASE] Подготовленные данные для вставки: {place_data}")
            
            # Логируем типы данных для диагностики
            logger.info(f"[DATABASE] Типы данных:")
            for key, value in place_data.items():
                logger.info(f"[DATABASE] {key}: {type(value).__name__} = {value}")
            
            # Проверяем наличие обязательных полей
            required_fields = ['name', 'vibe', 'type', 'address', 'longitude', 'latitude', 'location', 'revew']
            missing_fields = [field for field in required_fields if field not in place_data or place_data[field] is None]
            
            if missing_fields:
                logger.error(f"[DATABASE] Отсутствуют обязательные поля: {missing_fields}")
                update.message.reply_text(f"Отсутствуют обязательные данные: {', '.join(missing_fields)}. Попробуйте еще раз.")
                return REVIEW
            
            logger.info(f"[DATABASE] Все обязательные поля присутствуют")
            
        except (ValueError, TypeError) as e:
            logger.error(f"[DATABASE] Ошибка при приведении типов данных: {e}")
            update.message.reply_text("Произошла ошибка при подготовке данных. Попробуйте еще раз.")
            return REVIEW
        
        # Добавляем место в базу данных
        logger.info("[DATABASE] Отправляем запрос к Supabase для добавления места")
        response = supabase.table('meal_places').insert(place_data).execute()
        
        logger.info(f"[DATABASE] Получен ответ от Supabase: {response}")
        logger.info(f"[DATABASE] Данные в ответе: {response.data}")
        
        if not response.data:
            logger.error("[DATABASE] Ошибка при добавлении места: нет данных в ответе")
            update.message.reply_text("Произошла ошибка при добавлении места. Попробуйте еще раз.")
            return REVIEW
        
        # Получаем сгенерированный ID из ответа базы данных
        inserted_place = response.data[0]
        generated_id = inserted_place.get('id', 'N/A')
        logger.info(f"[DATABASE] Сгенерированный ID: {generated_id}")
            
        # Отправляем сообщение об успехе
        success_message = (
            f"✅ Место успешно добавлено!\n\n"
            f"ID: {generated_id}\n"
            f"Название: {place_data['name']}\n"
            f"Вайб: {place_data['vibe']}\n"
            f"Тип: {place_data['type']}\n"
            f"Адрес: {place_data['address']}"
        )
        if place_data.get('placephotos'):
            success_message += f"\nФото: {place_data['placephotos']}"
        
        logger.info(f"[DATABASE] Отправляем сообщение об успехе: {success_message}")
        update.message.reply_text(success_message)
        
        # Показываем главное меню
        show_main_menu(update, context)
        logger.info("Показано главное меню")
        
        return ConversationHandler.END
            
    except Exception as e:
        logger.error(f"[DATABASE] Ошибка при добавлении места: {str(e)}")
        logger.error(f"[DATABASE] Тип ошибки: {type(e).__name__}")
        logger.error(f"[DATABASE] Полный traceback:", exc_info=True)
        update.message.reply_text("Произошла ошибка при добавлении места. Попробуйте еще раз.")
        return REVIEW

def cancel(update: Update, context: CallbackContext) -> int:
    """Cancel the conversation."""
    # Очищаем данные
    context.user_data.clear()
    
    # Отправляем сообщение об отмене с очисткой клавиатуры
    update.message.reply_text(
        "❌ Операция отменена.",
        reply_markup=ReplyKeyboardRemove()
    )
    
    # Показываем главное меню
    show_main_menu(update, context)
    
    return ConversationHandler.END

def get_address_from_coordinates(latitude, longitude):
    """Получает адрес по координатам через Nominatim и обрезает до улицы и дома."""
    logger.info(f"[GEOCODING] Начало получения адреса для координат: {latitude}, {longitude}")
    
    try:
        logger.info(f"[GEOCODING] Создаем геолокатор Nominatim")
        geolocator = Nominatim(user_agent="VibesAdd_Bot")
        
        logger.info(f"[GEOCODING] Отправляем запрос к Nominatim")
        location = geolocator.reverse(f"{latitude}, {longitude}")
        
        if location and location.address:
            logger.info(f"[GEOCODING] Получен ответ от Nominatim")
            logger.info(f"[GEOCODING] Полный адрес: {location.address}")
            logger.info(f"[GEOCODING] Сырые данные: {location.raw}")
            
            # Ищем улицу и дом в адресе
            logger.info(f"[GEOCODING] Извлекаем улицу и дом из адреса")
            street_address = extract_street_and_house(location.raw)
            
            if street_address:
                logger.info(f"[GEOCODING] Успешно извлечен адрес улицы: {street_address}")
                return street_address
            else:
                logger.warning(f"[GEOCODING] Не удалось извлечь улицу и дом из адреса. Используем координаты")
                fallback_address = f"{latitude}, {longitude}"
                logger.info(f"[GEOCODING] Fallback адрес: {fallback_address}")
                return fallback_address
        else:
            logger.warning(f"[GEOCODING] Адрес не получен от Nominatim. Используем координаты")
            fallback_address = f"{latitude}, {longitude}"
            logger.info(f"[GEOCODING] Fallback адрес: {fallback_address}")
            return fallback_address
            
    except (GeocoderTimedOut, GeocoderUnavailable) as e:
        logger.warning(f"[GEOCODING] Ошибка получения адреса (GeocoderTimedOut/GeocoderUnavailable): {e}")
        fallback_address = f"{latitude}, {longitude}"
        logger.info(f"[GEOCODING] Fallback адрес: {fallback_address}")
        return fallback_address
    except Exception as e:
        logger.error(f"[GEOCODING] Неожиданная ошибка при получении адреса: {e}")
        fallback_address = f"{latitude}, {longitude}"
        logger.info(f"[GEOCODING] Fallback адрес: {fallback_address}")
        return fallback_address

def extract_street_and_house(address_data):
    """Извлекает улицу и дом из данных адреса Nominatim."""
    logger.info(f"[ADDRESS_PARSING] Начало извлечения улицы и дома из данных: {address_data}")
    
    try:
        # Проверяем наличие вложенного объекта 'address'
        if 'address' in address_data and isinstance(address_data['address'], dict):
            address_info = address_data['address']
            logger.info(f"[ADDRESS_PARSING] Найден объект 'address': {address_info}")
            
            # Ищем улицу в объекте address
            if 'road' in address_info:
                street = address_info['road']
                house_number = address_info.get('house_number', '')
                
                logger.info(f"[ADDRESS_PARSING] Найдена улица 'road': {street}")
                logger.info(f"[ADDRESS_PARSING] Номер дома: {house_number}")
                
                if house_number:
                    result = f"{street}, {house_number}"
                    logger.info(f"[ADDRESS_PARSING] Результат: {result}")
                    return result
                else:
                    logger.info(f"[ADDRESS_PARSING] Результат (только улица): {street}")
                    return street
                    
            elif 'street' in address_info:
                street = address_info['street']
                house_number = address_info.get('house_number', '')
                
                logger.info(f"[ADDRESS_PARSING] Найдена улица 'street': {street}")
                logger.info(f"[ADDRESS_PARSING] Номер дома: {house_number}")
                
                if house_number:
                    result = f"{street}, {house_number}"
                    logger.info(f"[ADDRESS_PARSING] Результат: {result}")
                    return result
                else:
                    logger.info(f"[ADDRESS_PARSING] Результат (только улица): {street}")
                    return street
            else:
                logger.warning(f"[ADDRESS_PARSING] Улица не найдена в объекте 'address'")
                logger.info(f"[ADDRESS_PARSING] Доступные ключи в 'address': {list(address_info.keys())}")
                
                # Если нет улицы, пробуем найти что-то похожее
                for key in ['name', 'amenity', 'building']:
                    if key in address_info:
                        result = address_info[key]
                        logger.info(f"[ADDRESS_PARSING] Найден альтернативный ключ '{key}': {result}")
                        return result
                
                logger.warning(f"[ADDRESS_PARSING] Не найдено подходящих данных для адреса")
                return None
        else:
            # Fallback: проверяем в корне объекта (для обратной совместимости)
            logger.info(f"[ADDRESS_PARSING] Объект 'address' не найден, проверяем корень")
            
            if 'road' in address_data:
                street = address_data['road']
                house_number = address_data.get('house_number', '')
                
                logger.info(f"[ADDRESS_PARSING] Найдена улица 'road' в корне: {street}")
                logger.info(f"[ADDRESS_PARSING] Номер дома: {house_number}")
                
                if house_number:
                    result = f"{street}, {house_number}"
                    logger.info(f"[ADDRESS_PARSING] Результат: {result}")
                    return result
                else:
                    logger.info(f"[ADDRESS_PARSING] Результат (только улица): {street}")
                    return street
                    
            elif 'street' in address_data:
                street = address_data['street']
                house_number = address_data.get('house_number', '')
                
                logger.info(f"[ADDRESS_PARSING] Найдена улица 'street' в корне: {street}")
                logger.info(f"[ADDRESS_PARSING] Номер дома: {house_number}")
                
                if house_number:
                    result = f"{street}, {house_number}"
                    logger.info(f"[ADDRESS_PARSING] Результат: {result}")
                    return result
                else:
                    logger.info(f"[ADDRESS_PARSING] Результат (только улица): {street}")
                    return street
            else:
                logger.warning(f"[ADDRESS_PARSING] Улица не найдена в данных адреса")
                logger.info(f"[ADDRESS_PARSING] Доступные ключи: {list(address_data.keys())}")
                
                # Если нет улицы, пробуем найти что-то похожее
                for key in ['name', 'amenity', 'building']:
                    if key in address_data:
                        result = address_data[key]
                        logger.info(f"[ADDRESS_PARSING] Найден альтернативный ключ '{key}': {result}")
                        return result
                
                logger.warning(f"[ADDRESS_PARSING] Не найдено подходящих данных для адреса")
                return None
            
    except Exception as e:
        logger.error(f"[ADDRESS_PARSING] Ошибка при извлечении улицы и дома: {e}")
        return None

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in kilometers."""
    R = 6371  # радиус Земли в километрах
    
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    distance = R * c
    
    return distance

def find_place_by_id(update: Update, context: CallbackContext) -> int:
    """Поиск места по ID и показ информации."""
    logger.info("Начало функции find_place_by_id")
    
    if not update.message or not update.message.text:
        logger.error("Получен пустой ID места")
        update.message.reply_text("Пожалуйста, введите ID места.")
        return EDIT_ID
        
    try:
        place_id = int(update.message.text.strip())
        logger.info(f"Поиск места с ID: {place_id}")
        
        # Ищем место в базе данных
        response = supabase.table('meal_places').select('*').eq('id', place_id).execute()
        
        if not response.data:
            logger.warning(f"Место с ID {place_id} не найдено")
            update.message.reply_text(f"Место с ID {place_id} не найдено. Попробуйте другой ID.")
            return EDIT_ID
        
        place = response.data[0]
        logger.info(f"Найдено место: {place['name']}")
        
        # Показываем информацию о месте
        place_info = (
            f"📍 Информация о месте:\n\n"
            f"ID: {place['id']}\n"
            f"Название: {place['name']}\n"
            f"Вайб: {place['vibe']}\n"
            f"Тип: {place['type']}\n"
            f"Адрес: {place['address']}"
        )
        if place.get('placephotos'):
            place_info += f"\nФото: {place['placephotos']}"
        
        # Сохраняем найденное место в контексте для редактирования
        context.user_data['editing_place'] = place
        
        # Создаем кнопки для подтверждения
        keyboard = [
            [InlineKeyboardButton("✅ Да, редактировать", callback_data='edit_confirm_yes')],
            [InlineKeyboardButton("❌ Нет, отменить", callback_data='edit_confirm_no')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        update.message.reply_text(
            f"{place_info}\n\n"
            f"Хотите отредактировать это место?",
            reply_markup=reply_markup
        )
        
        return EDIT_CONFIRM
        
    except ValueError:
        logger.error("Получен некорректный ID")
        update.message.reply_text("Пожалуйста, введите корректный ID (число).")
        return EDIT_ID
    except Exception as e:
        logger.error(f"Ошибка при поиске места: {str(e)}")
        update.message.reply_text("Произошла ошибка при поиске места. Попробуйте еще раз.")
        return EDIT_ID

def handle_edit_confirmation(update: Update, context: CallbackContext) -> int:
    """Обработка подтверждения редактирования."""
    query = update.callback_query
    logger.info(f"Получено подтверждение редактирования: {query.data}")
    
    if query.data == 'edit_confirm_yes':
        logger.info("Пользователь подтвердил редактирование")
        # Устанавливаем начальное состояние для функции skip
        context.user_data['current_edit_state'] = EDIT_NAME
        
        # Начинаем процесс редактирования - запрашиваем новое название с кнопкой пропуска
        keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        query.message.reply_text(
            "Введите новое название места:",
            reply_markup=reply_markup
        )
        
        return EDIT_NAME
    elif query.data == 'edit_confirm_no':
        logger.info("Пользователь отменил редактирование")
        # Очищаем данные и возвращаемся в главное меню
        context.user_data.pop('editing_place', None)
        context.user_data.pop('current_edit_state', None)
        show_main_menu(update, context)
        return ConversationHandler.END
    
    return EDIT_CONFIRM

def edit_place_name(update: Update, context: CallbackContext) -> int:
    """Сохраняем новое название места и запрашиваем вайб."""
    logger.info("Начало функции edit_place_name")
    name = update.message.text
    logger.info(f"Получено новое название места: {name}")
    
    # Сохраняем новое название
    context.user_data['edit_name'] = name
    logger.info("Новое название места сохранено")
    
    # Сохраняем текущее состояние для функции skip
    context.user_data['current_edit_state'] = EDIT_NAME
    
    # Создаем кнопки с вариантами вайба
    keyboard = [
        [InlineKeyboardButton("тусовый", callback_data='edit_vibe_party'),
        InlineKeyboardButton("панк", callback_data='edit_vibe_punk')],
        [InlineKeyboardButton("хипстерский", callback_data='edit_vibe_hipster'),
        InlineKeyboardButton("семейный", callback_data='edit_vibe_family')],
        [InlineKeyboardButton("локальный", callback_data='edit_vibe_local'),
        InlineKeyboardButton("туристический", callback_data='edit_vibe_tourist')],
        [InlineKeyboardButton("лакшери", callback_data='edit_vibe_luxury'),
        InlineKeyboardButton("романтический", callback_data='edit_vibe_romantic')],
        [InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Запрашиваем вайб
    update.message.reply_text(
        "Выберите новый вайб места:",
        reply_markup=reply_markup
    )
    
    logger.info("Запрошен новый вайб места через кнопки")
    return EDIT_VIBE

def edit_place_vibe(update: Update, context: CallbackContext) -> int:
    """Сохраняем новый вайб места и запрашиваем тип."""
    logger.info("Начало функции edit_place_vibe")
    
    # Получаем вайб из callback_data
    query = update.callback_query
    vibe_map = {
        'edit_vibe_party': 'тусовый',
        'edit_vibe_punk': 'панк',
        'edit_vibe_hipster': 'хипстерский',
        'edit_vibe_family': 'семейный',
        'edit_vibe_local': 'локальный',
        'edit_vibe_tourist': 'туристический',
        'edit_vibe_luxury': 'лакшери',
        'edit_vibe_romantic': 'романтический'
    }
    
    vibe = vibe_map.get(query.data)
    if not vibe:
        logger.error(f"Получен неизвестный вайб: {query.data}")
        query.message.reply_text("Пожалуйста, выберите вайб из предложенных вариантов.")
        return EDIT_VIBE
    
    logger.info(f"Получен новый вайб места: {vibe}")
    
    # Сохраняем вайб
    context.user_data['edit_vibe'] = vibe
    logger.info("Новый вайб места сохранен")
    
    # Сохраняем текущее состояние для функции skip
    context.user_data['current_edit_state'] = EDIT_VIBE
    
    # Создаем кнопки с вариантами типа места
    keyboard = [
        [InlineKeyboardButton("бар", callback_data='edit_type_bar'),
        InlineKeyboardButton("кафе", callback_data='edit_type_cafe')],
        [InlineKeyboardButton("ресторан", callback_data='edit_type_restaurant'),
        InlineKeyboardButton("паб", callback_data='edit_type_pub')],
        [InlineKeyboardButton("пиццерия", callback_data='edit_type_pizzeria'),
        InlineKeyboardButton("кальянная", callback_data='edit_type_hookah')],
        [InlineKeyboardButton("кофейня", callback_data='edit_type_coffee')],
        [InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Запрашиваем тип места
    query.message.reply_text(
        "Выберите новый тип места:",
        reply_markup=reply_markup
    )
    
    logger.info("Запрошен новый тип места через кнопки")
    return EDIT_TYPE

def edit_place_type(update: Update, context: CallbackContext) -> int:
    """Сохраняем новый тип места и запрашиваем геолокацию."""
    logger.info("Начало функции edit_place_type")
    
    # Получаем тип из callback_data
    query = update.callback_query
    type_map = {
        'edit_type_bar': 'бар',
        'edit_type_cafe': 'кафе',
        'edit_type_restaurant': 'ресторан',
        'edit_type_pub': 'паб',
        'edit_type_pizzeria': 'пиццерия',
        'edit_type_hookah': 'кальянная',
        'edit_type_coffee': 'кофейня'
    }
    
    place_type = type_map.get(query.data)
    if not place_type:
        logger.error(f"Получен неизвестный тип места: {query.data}")
        query.message.reply_text("Пожалуйста, выберите тип из предложенных вариантов.")
        return EDIT_TYPE
    
    logger.info(f"Получен новый тип места: {place_type}")
    
    # Сохраняем тип
    context.user_data['edit_type'] = place_type
    logger.info("Новый тип места сохранен")
    
    # Сохраняем текущее состояние для функции skip
    context.user_data['current_edit_state'] = EDIT_TYPE
    
    # Запрашиваем геолокацию
    keyboard = [[KeyboardButton("📍 Отправить местоположение", request_location=True)]]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)
    
    query.message.reply_text(
        "Отправьте новую геолокацию места:",
        reply_markup=reply_markup
    )
    
    logger.info("Запрошена новая геолокация места")
    return EDIT_LOCATION

def edit_place_location(update: Update, context: CallbackContext) -> int:
    """Сохраняем новую геолокацию и запрашиваем фото места."""
    logger.info("[EDIT_LOCATION] Начало функции edit_place_location")
    
    if not update.message or not update.message.location:
        # Запрашиваем геолокацию
        logger.info("[EDIT_LOCATION] Запрашиваем геолокацию для редактирования места")
        context.user_data['waiting_for_edit_location'] = True
        message = (
            "Пожалуйста, отправьте новую геолокацию места. "
            "Нажмите на кнопку ниже, чтобы отправить местоположение."
        )
        send_location_request(message, update)
        return EDIT_LOCATION
        
    # Если геолокация уже получена
    user_location = update.message.location
    logger.info(f"[EDIT_LOCATION] Получена новая геолокация: {user_location.latitude}, {user_location.longitude}")
    
    # Сохраняем координаты
    context.user_data['edit_longitude'] = user_location.longitude
    context.user_data['edit_latitude'] = user_location.latitude
    logger.info(f"[EDIT_LOCATION] Новые координаты сохранены: {user_location.longitude}, {user_location.latitude}")
    
    # Получаем адрес через Nominatim
    logger.info(f"[EDIT_LOCATION] Начинаем получение нового адреса через Nominatim")
    address = get_address_from_coordinates(user_location.latitude, user_location.longitude)
    context.user_data['edit_address'] = address
    logger.info(f"[EDIT_LOCATION] Новый адрес получен: {address}")
    
    # Сохраняем текущее состояние для функции skip
    context.user_data['current_edit_state'] = EDIT_LOCATION
    
    # Очищаем reply-клавиатуру и запрашиваем фото места с кнопкой пропуска
    logger.info("[EDIT_LOCATION] Запрашиваем новое фото места")
    keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    update.message.reply_text(
        "Отлично! Теперь отправьте новое фото места.",
        reply_markup=ReplyKeyboardRemove()
    )
    
    return EDIT_PHOTO

def handle_edit_photo(update: Update, context: CallbackContext) -> int:
    """Обработчик получения нового фото."""
    logger.info("Начало функции handle_edit_photo")
    
    if not update.message or not update.message.photo:
        logger.error("Получено пустое фото")
        update.message.reply_text(
            "Пожалуйста, отправьте новое фото места."
        )
        return EDIT_PHOTO
        
    try:
        # Получаем фото с наилучшим качеством
        photo = update.message.photo[-1]
        file_id = photo.file_id
        
        # Получаем файл через Telegram API
        file = context.bot.get_file(file_id)
        
        # Скачиваем файл во временную директорию
        temp_path = f"/tmp/{file_id}.jpg"
        file.download(temp_path)
        
        # Загружаем файл в Supabase Storage
        with open(temp_path, 'rb') as f:
            file_data = f.read()
            
        # Генерируем уникальное имя файла
        place_name = sanitize_filename(context.user_data.get('edit_name', 'unknown'))
        file_name = f"place_{place_name}_{int(time.time())}.jpg"
        
        # Загружаем в Storage
        response = supabase.storage.from_('photo').upload(
            file_name,
            file_data,
            {'content-type': 'image/jpeg'}
        )
        
        # Получаем публичный URL
        photo_url = supabase.storage.from_('photo').get_public_url(file_name)
        
        # Сохраняем URL в контексте
        context.user_data['edit_placephotos'] = photo_url
        logger.info(f"Новое фото успешно загружено: {photo_url}")
        
        # Удаляем временный файл
        os.remove(temp_path)
        
        # Сохраняем текущее состояние для функции skip
        context.user_data['current_edit_state'] = EDIT_PHOTO
        
        # Запрашиваем описание места с кнопкой пропуска
        logger.info("Запрашиваем новое описание места")
        keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        update.message.reply_text(
            "Отлично! Теперь напишите новое описание места. "
            "Опишите атмосферу, особенности, что здесь можно делать.",
            reply_markup=reply_markup
        )
        
        logger.info("Переходим к состоянию EDIT_REVIEW")
        return EDIT_REVIEW
        
    except Exception as e:
        logger.error(f"Ошибка при обработке нового фото: {str(e)}")
        update.message.reply_text(
            "Произошла ошибка при обработке фото. Попробуйте еще раз."
        )
        return EDIT_PHOTO

def edit_place_review(update: Update, context: CallbackContext) -> int:
    """Сохраняем новое описание и обновляем место в базе данных."""
    logger.info("Начало функции edit_place_review")
    
    if not update.message or not update.message.text:
        logger.error("Получено пустое описание места")
        update.message.reply_text(
            "Пожалуйста, введите новое описание места."
        )
        return EDIT_REVIEW
        
    review = update.message.text
    logger.info(f"Получено новое описание места: {review}")
    
    # Сохраняем текущее состояние для функции skip
    context.user_data['current_edit_state'] = EDIT_REVIEW
    
    try:
        # Получаем ID редактируемого места
        editing_place = context.user_data.get('editing_place')
        if not editing_place:
            logger.error("Не найдено место для редактирования")
            update.message.reply_text("Ошибка: место для редактирования не найдено.")
            return ConversationHandler.END
        
        place_id = editing_place['id']
        logger.info(f"Обновляем место с ID: {place_id}")
        
        # Подготавливаем данные для обновления
        update_data = {}
        
        # Добавляем только те поля, которые были изменены
        if 'edit_name' in context.user_data:
            update_data['name'] = context.user_data['edit_name']
        if 'edit_vibe' in context.user_data:
            update_data['vibe'] = context.user_data['edit_vibe']
        if 'edit_type' in context.user_data:
            update_data['type'] = context.user_data['edit_type']
        if 'edit_address' in context.user_data:
            update_data['address'] = context.user_data['edit_address']
        if 'edit_longitude' in context.user_data and 'edit_latitude' in context.user_data:
            update_data['longitude'] = float(context.user_data['edit_longitude'])
            update_data['latitude'] = float(context.user_data['edit_latitude'])
            update_data['location'] = f"POINT({context.user_data['edit_longitude']} {context.user_data['edit_latitude']})"
        if 'edit_placephotos' in context.user_data:
            update_data['placephotos'] = context.user_data['edit_placephotos']
        
        # Всегда обновляем описание
        update_data['revew'] = review
        
        logger.info(f"[DATABASE] Данные для обновления: {update_data}")
        
        # Обновляем место в базе данных
        logger.info("[DATABASE] Отправляем запрос к Supabase для обновления места")
        response = supabase.table('meal_places').update(update_data).eq('id', place_id).execute()
        
        logger.info(f"[DATABASE] Получен ответ от Supabase: {response}")
        
        if not response.data:
            logger.error("[DATABASE] Ошибка при обновлении места: нет данных в ответе")
            update.message.reply_text("Произошла ошибка при обновлении места. Попробуйте еще раз.")
            return EDIT_REVIEW
        
        # Отправляем сообщение об успехе
        success_message = (
            f"✅ Место успешно обновлено!\n\n"
            f"ID: {place_id}\n"
            f"Название: {update_data.get('name', editing_place['name'])}\n"
            f"Вайб: {update_data.get('vibe', editing_place['vibe'])}\n"
            f"Тип: {update_data.get('type', editing_place['type'])}\n"
            f"Адрес: {update_data.get('address', editing_place['address'])}"
        )
        if update_data.get('placephotos'):
            success_message += f"\nФото: {update_data['placephotos']}"
        
        logger.info(f"[DATABASE] Отправляем сообщение об успехе: {success_message}")
        update.message.reply_text(success_message)
        # Очищаем данные редактирования
        context.user_data.pop('editing_place', None)
        context.user_data.pop('edit_name', None)
        context.user_data.pop('edit_vibe', None)
        context.user_data.pop('edit_type', None)
        context.user_data.pop('edit_address', None)
        context.user_data.pop('edit_longitude', None)
        context.user_data.pop('edit_latitude', None)
        context.user_data.pop('edit_placephotos', None)
        context.user_data.pop('current_edit_state', None)
        show_main_menu(update, context)
        return ConversationHandler.END
            
    except Exception as e:
        logger.error(f"[DATABASE] Ошибка при обновлении места: {str(e)}")
        logger.error(f"[DATABASE] Тип ошибки: {type(e).__name__}")
        logger.error(f"[DATABASE] Полный traceback:", exc_info=True)
        update.message.reply_text("Произошла ошибка при обновлении места. Попробуйте еще раз.")
        return EDIT_REVIEW

def skip_button_handler(update: Update, context: CallbackContext) -> int:
    """Обработчик для inline-кнопки 'Пропустить'."""
    logger.info("Начало функции skip_button_handler")
    
    # Получаем callback query
    query = update.callback_query
    query.answer()  # Отвечаем на callback query
    
    # Создаем новый update с message из callback query
    # Это нужно для совместимости с skip_edit_step
    if not hasattr(update, 'message') or update.message is None:
        update.message = query.message
    
    # Вызываем основную функцию пропуска
    return skip_edit_step(update, context)

def skip_edit_step(update: Update, context: CallbackContext) -> int:
    """Пропускает текущий шаг редактирования и переходит к следующему."""
    logger.info("Начало функции skip_edit_step")
    
    # Определяем текущее состояние
    current_state = context.user_data.get('current_edit_state')
    logger.info(f"Пропускаем шаг: {current_state}")
    
    if current_state == EDIT_NAME:
        logger.info("Пропускаем редактирование названия")
        # Переходим к выбору вайба
        keyboard = [
            [InlineKeyboardButton("тусовый", callback_data='edit_vibe_party'),
            InlineKeyboardButton("панк", callback_data='edit_vibe_punk')],
            [InlineKeyboardButton("хипстерский", callback_data='edit_vibe_hipster'),
            InlineKeyboardButton("семейный", callback_data='edit_vibe_family')],
            [InlineKeyboardButton("локальный", callback_data='edit_vibe_local'),
            InlineKeyboardButton("туристический", callback_data='edit_vibe_tourist')],
            [InlineKeyboardButton("лакшери", callback_data='edit_vibe_luxury'),
            InlineKeyboardButton("романтический", callback_data='edit_vibe_romantic')],
            [InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        update.message.reply_text(
            "Выберите новый вайб места:",
            reply_markup=reply_markup
        )
        
        # Обновляем состояние
        context.user_data['current_edit_state'] = EDIT_VIBE
        return EDIT_VIBE
        
    elif current_state == EDIT_VIBE:
        logger.info("Пропускаем редактирование вайба")
        # Переходим к выбору типа
        keyboard = [
            [InlineKeyboardButton("бар", callback_data='edit_type_bar'),
            InlineKeyboardButton("кафе", callback_data='edit_type_cafe')],
            [InlineKeyboardButton("ресторан", callback_data='edit_type_restaurant'),
            InlineKeyboardButton("паб", callback_data='edit_type_pub')],
            [InlineKeyboardButton("пиццерия", callback_data='edit_type_pizzeria'),
            InlineKeyboardButton("кальянная", callback_data='edit_type_hookah')],
            [InlineKeyboardButton("кофейня", callback_data='edit_type_coffee')],
            [InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        update.message.reply_text(
            "Выберите новый тип места:",
            reply_markup=reply_markup
        )
        
        # Обновляем состояние
        context.user_data['current_edit_state'] = EDIT_TYPE
        return EDIT_TYPE
        
    elif current_state == EDIT_TYPE:
        logger.info("Пропускаем редактирование типа")
        # Переходим к геолокации - только inline-кнопка пропуска
        skip_keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
        skip_markup = InlineKeyboardMarkup(skip_keyboard)
        
        update.message.reply_text(
            "Отправьте новую геолокацию места:",
            reply_markup=skip_markup
        )
        
        # Обновляем состояние
        context.user_data['current_edit_state'] = EDIT_LOCATION
        return EDIT_LOCATION
        
    elif current_state == EDIT_LOCATION:
        logger.info("Пропускаем редактирование геолокации")
        # Переходим к фото - только inline-кнопка пропуска
        skip_keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
        skip_markup = InlineKeyboardMarkup(skip_keyboard)
        
        update.message.reply_text(
            "Отлично! Теперь отправьте новое фото места.",
            reply_markup=skip_markup
        )
        
        # Обновляем состояние
        context.user_data['current_edit_state'] = EDIT_PHOTO
        return EDIT_PHOTO
        
    elif current_state == EDIT_PHOTO:
        logger.info("Пропускаем редактирование фото")
        # Переходим к описанию - только inline-кнопка пропуска
        skip_keyboard = [[InlineKeyboardButton("⏭️ Пропустить", callback_data='edit_skip')]]
        skip_markup = InlineKeyboardMarkup(skip_keyboard)
        
        update.message.reply_text(
            "Отлично! Теперь напишите новое описание места. "
            "Опишите атмосферу, особенности, что здесь можно делать.",
            reply_markup=skip_markup
        )
        
        # Обновляем состояние
        context.user_data['current_edit_state'] = EDIT_REVIEW
        return EDIT_REVIEW
        
    elif current_state == EDIT_REVIEW:
        logger.info("Пропускаем редактирование описания")
        # Завершаем редактирование - создаем правильный update для edit_place_review
        if not hasattr(update, 'message') or update.message is None:
            # Если update из callback query, создаем фиктивное сообщение
            class FakeMessage:
                def __init__(self, text):
                    self.text = text
                def reply_text(self, text, **kwargs):
                    # Используем query.message для отправки
                    return update.callback_query.message.reply_text(text, **kwargs)
            
            update.message = FakeMessage("")
        
        return edit_place_review(update, context)
    
    else:
        logger.error(f"Неизвестное состояние для пропуска: {current_state}")
        update.message.reply_text("Произошла ошибка. Попробуйте еще раз.")
        return ConversationHandler.END

def main() -> None:
    """Запускаем бота."""
    if not TELEGRAM_BOT_TOKEN:
        logger.error("No token provided!")
        return

    # Проверяем, не запущен ли уже бот
    pid_file = "/tmp/vibesadd_bot.pid"
    
    if os.path.exists(pid_file):
        with open(pid_file, 'r') as f:
            old_pid = f.read().strip()
        
        # Проверяем, работает ли процесс с этим PID
        try:
            os.kill(int(old_pid), 0)  # Проверяем существование процесса
            logger.error(f"Бот уже запущен с PID {old_pid}")
            logger.error("Остановите предыдущий экземпляр перед запуском нового")
            return
        except (OSError, ValueError):
            # Процесс не существует, удаляем старый PID файл
            os.remove(pid_file)
    
    # Сохраняем PID текущего процесса
    with open(pid_file, 'w') as f:
        f.write(str(os.getpid()))
    
    logger.info(f"Бот запущен с PID {os.getpid()}")
    
    # Функция для очистки PID файла при завершении
    def cleanup_pid_file(signum, frame):
        if os.path.exists(pid_file):
            os.remove(pid_file)
        logger.info("Бот завершен, PID файл очищен")
        exit(0)
    
    # Регистрируем обработчики сигналов
    signal.signal(signal.SIGINT, cleanup_pid_file)   # Ctrl+C
    signal.signal(signal.SIGTERM, cleanup_pid_file)  # kill

    # Создаем Updater и передаем ему токен бота
    updater = Updater(TELEGRAM_BOT_TOKEN)
    
    # Получаем диспетчер для регистрации обработчиков
    dispatcher = updater.dispatcher
    
    # Добавляем обработчик команды /start
    dispatcher.add_handler(CommandHandler("start", start))
    
    # Добавляем обработчик диалога добавления места
    conv_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^add_place$')],
        states={
            NAME: [MessageHandler(Filters.text & ~Filters.command, add_place_name)],
            VIBE: [CallbackQueryHandler(add_place_vibe, pattern='^vibe_')],
            TYPE: [CallbackQueryHandler(add_place_type, pattern='^type_')],
            LOCATION: [MessageHandler(Filters.location, add_place_location)],
            PHOTO: [
                MessageHandler(Filters.photo, handle_photo),
            ],
            REVIEW: [
                MessageHandler(Filters.text & ~Filters.command, add_place_review),
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
        per_chat=True,
        per_user=True
    )
    dispatcher.add_handler(conv_handler)
    
    # Добавляем обработчик диалога редактирования места
    edit_conv_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^edit_place$')],
        states={
            EDIT_ID: [MessageHandler(Filters.text & ~Filters.command, find_place_by_id)],
            EDIT_CONFIRM: [CallbackQueryHandler(handle_edit_confirmation, pattern='^edit_confirm_')],
            EDIT_NAME: [
                MessageHandler(Filters.text & ~Filters.command, edit_place_name),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ],
            EDIT_VIBE: [
                CallbackQueryHandler(edit_place_vibe, pattern='^edit_vibe_'),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ],
            EDIT_TYPE: [
                CallbackQueryHandler(edit_place_type, pattern='^edit_type_'),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ],
            EDIT_LOCATION: [
                MessageHandler(Filters.location, edit_place_location),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ],
            EDIT_PHOTO: [
                MessageHandler(Filters.photo, handle_edit_photo),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ],
            EDIT_REVIEW: [
                MessageHandler(Filters.text & ~Filters.command, edit_place_review),
                CallbackQueryHandler(skip_button_handler, pattern='^edit_skip$'),
                CommandHandler("skip", skip_edit_step)
            ]
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
        per_chat=True,
        per_user=True
    )
    dispatcher.add_handler(edit_conv_handler)
    
    # Добавляем обработчик геолокации (после ConversationHandler)
    dispatcher.add_handler(MessageHandler(Filters.location, handle_location))
    
    # Добавляем обработчик кнопок (должен быть после ConversationHandler)
    dispatcher.add_handler(CallbackQueryHandler(button_handler))
    
    # Запускаем бота
    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main() 