import logging
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from telegram.ext import Updater, CommandHandler, CallbackQueryHandler, CallbackContext, MessageHandler, Filters, ConversationHandler
from config import TELEGRAM_BOT_TOKEN, AUTHORIZED_USERS
from supabase_client import supabase
from math import radians, sin, cos, sqrt, atan2
import time

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler('/home/Creogenka/VibesAdd/bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Настройка прокси
proxy_url = "http://127.0.0.1:7890"  # Измените на ваш прокси, если нужно

# Определяем состояния диалога
NAME, VIBE, TYPE, LOCATION, PHOTO, REVIEW = range(6)

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
    if query.data != 'add_place':
        query.answer()

def show_main_menu(update: Update, context: CallbackContext) -> None:
    """Show the main menu with buttons."""
    keyboard = [
        [InlineKeyboardButton("📋 Показать места", callback_data='list_places')],
        [InlineKeyboardButton("➕ Добавить новое место", callback_data='add_place')]
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
            message += (
                f"ID: {place['id']}\n"
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
    logger.info("Начало функции add_place_location")
    
    if not update.message or not update.message.location:
        # Запрашиваем геолокацию
        logger.info("Запрашиваем геолокацию для нового места")
        context.user_data['waiting_for_place_location'] = True
        message = (
            "Пожалуйста, отправьте геолокацию места. "
            "Нажмите на кнопку ниже, чтобы отправить местоположение."
        )
        send_location_request(message, update)
        return LOCATION
        
    # Если геолокация уже получена
    user_location = update.message.location
    logger.info(f"Получена геолокация для нового места: {user_location.latitude}, {user_location.longitude}")
    
    # Сохраняем координаты
    context.user_data['longitude'] = user_location.longitude
    context.user_data['latitude'] = user_location.latitude
    
    # Получаем адрес из геолокации
    if hasattr(user_location, 'address') and user_location.address:
        context.user_data['address'] = user_location.address
        logger.info(f"Получен адрес из Telegram: {user_location.address}")
    else:
        # Если адрес не доступен, используем координаты как адрес
        context.user_data['address'] = f"{user_location.latitude}, {user_location.longitude}"
        logger.info("Адрес не найден, используем координаты")
    
    # Запрашиваем фото места
    update.message.reply_text(
        "Отлично! Теперь отправьте фото места."
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
        update.message.reply_text("Пожалуйста, отправьте фото места.")
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
        update.message.reply_text(
            "Отлично! Теперь напишите описание места. "
            "Опишите атмосферу, особенности, что здесь можно делать."
        )
        return REVIEW
        
    except Exception as e:
        logger.error(f"Ошибка при обработке фото: {str(e)}")
        update.message.reply_text("Произошла ошибка при обработке фото. Попробуйте еще раз.")
        return PHOTO

def generate_next_id() -> str:
    """Генерирует следующий ID для нового места с учетом формата (01, 02, ..., 09, 10, 11, ...)."""
    response = supabase.table('meal_places').select('id').execute()
    
    # Преобразуем все ID в числа, игнорируя ведущие нули
    existing_ids = []
    for place in response.data:
        try:
            # Преобразуем строковый ID в число, игнорируя ведущие нули
            num_id = int(place['id'])
            existing_ids.append(num_id)
        except ValueError:
            logger.warning(f"Пропущен некорректный ID: {place['id']}")
            continue
    
    # Находим максимальное значение
    max_id = max(existing_ids) if existing_ids else 0
    
    # Генерируем следующий ID
    next_id = max_id + 1
    
    # Форматируем ID в зависимости от его значения
    if next_id < 10:
        # Для чисел 1-9 добавляем ведущий ноль
        return f"0{next_id}"
    else:
        # Для чисел 10+ оставляем как есть
        return str(next_id)

def add_place_review(update: Update, context: CallbackContext) -> int:
    """Сохраняем описание и добавляем место в базу данных."""
    logger.info("Начало функции add_place_review")
    
    if not update.message or not update.message.text:
        logger.error("Получено пустое описание места")
        update.message.reply_text("Пожалуйста, введите описание места.")
        return REVIEW
        
    review = update.message.text
    logger.info(f"Получено описание места: {review}")
    
    try:
        # Сохраняем описание
        context.user_data['revew'] = review
        logger.info("Описание места сохранено")
        
        # Получаем все данные места
        place_data = {
            'id': generate_next_id(),
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
        
        # Добавляем место в базу данных
        logger.info("Добавляем место в базу данных")
        response = supabase.table('meal_places').insert(place_data).execute()
        
        if not response.data:
            logger.error("Ошибка при добавлении места: нет данных в ответе")
            update.message.reply_text("Произошла ошибка при добавлении места. Попробуйте еще раз.")
            return REVIEW
            
        # Отправляем сообщение об успехе
        success_message = (
            f"✅ Место успешно добавлено!\n\n"
            f"ID: {place_data['id']}\n"
            f"Название: {place_data['name']}\n"
            f"Вайб: {place_data['vibe']}\n"
            f"Тип: {place_data['type']}\n"
            f"Адрес: {place_data['address']}"
        )
        if place_data.get('placephotos'):
            success_message += f"\nФото: {place_data['placephotos']}"
            
        update.message.reply_text(success_message)
        
        # Показываем главное меню
        show_main_menu(update, context)
        logger.info("Показано главное меню")
        
        return ConversationHandler.END
            
    except Exception as e:
        logger.error(f"Ошибка при добавлении места: {str(e)}")
        update.message.reply_text("Произошла ошибка при добавлении места. Попробуйте еще раз.")
        return REVIEW

def cancel(update: Update, context: CallbackContext) -> int:
    """Cancel the conversation."""
    # Очищаем данные
    context.user_data.clear()
    
    # Отправляем сообщение об отмене
    update.message.reply_text("❌ Добавление места отменено.")
    
    # Показываем главное меню
    show_main_menu(update, context)
    
    return ConversationHandler.END

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

def main() -> None:
    """Запускаем бота."""
    if not TELEGRAM_BOT_TOKEN:
        logger.error("No token provided!")
        return

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
            PHOTO: [MessageHandler(Filters.photo, handle_photo)],
            REVIEW: [MessageHandler(Filters.text & ~Filters.command, add_place_review)]
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True,
        per_chat=True,
        per_user=True
    )
    dispatcher.add_handler(conv_handler)
    
    # Добавляем обработчик геолокации (после ConversationHandler)
    dispatcher.add_handler(MessageHandler(Filters.location, handle_location))
    
    # Добавляем обработчик кнопок (должен быть после ConversationHandler)
    dispatcher.add_handler(CallbackQueryHandler(button_handler))
    
    # Запускаем бота
    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main() 