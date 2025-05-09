import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters, ConversationHandler
from supabase import create_client
import config

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

# States for conversation handler
NAME, TYPE, ADDRESS, LOCATION = range(4)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    user_id = update.effective_user.id
    
    if user_id not in config.AUTHORIZED_USERS:
        await update.message.reply_text(
            "Извините, у вас нет доступа к этому боту. "
            "Пожалуйста, свяжитесь с администратором для получения доступа."
        )
        return
    
    keyboard = [
        [InlineKeyboardButton("📋 Список мест", callback_data='list_places')],
        [InlineKeyboardButton("➕ Добавить место", callback_data='add_place')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Добро пожаловать! Выберите действие:",
        reply_markup=reply_markup
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle button presses."""
    query = update.callback_query
    await query.answer()
    
    if query.data == 'list_places':
        await list_places(update, context)
    elif query.data == 'add_place':
        await query.message.reply_text("Введите название места:")
        return NAME

async def list_places(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """List all places from the database."""
    try:
        response = supabase.table('places').select('*').execute()
        places = response.data
        
        if not places:
            await update.callback_query.message.reply_text("В базе данных пока нет мест.")
            return
        
        message = "Список мест:\n\n"
        for place in places:
            message += f"📍 {place['name']}\n"
            message += f"Тип: {place['type']}\n"
            message += f"Адрес: {place['address']}\n"
            message += f"Координаты: {place['location']['coordinates']}\n\n"
        
        await update.callback_query.message.reply_text(message)
    except Exception as e:
        logger.error(f"Error listing places: {e}")
        await update.callback_query.message.reply_text("Произошла ошибка при получении списка мест.")

async def add_place_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the name and ask for type."""
    context.user_data['name'] = update.message.text
    await update.message.reply_text("Введите тип места (например: cafe, restaurant, bar):")
    return TYPE

async def add_place_type(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the type and ask for address."""
    context.user_data['type'] = update.message.text
    await update.message.reply_text("Введите адрес места:")
    return ADDRESS

async def add_place_address(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the address and ask for location."""
    context.user_data['address'] = update.message.text
    await update.message.reply_text(
        "Отправьте местоположение места (используйте кнопку 'Отправить местоположение' в меню Telegram)"
    )
    return LOCATION

async def add_place_location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Store the location and save the place to database."""
    location = update.message.location
    place_data = {
        'name': context.user_data['name'],
        'type': context.user_data['type'],
        'address': context.user_data['address'],
        'location': {
            'type': 'Point',
            'coordinates': [location.longitude, location.latitude]
        }
    }
    
    try:
        response = supabase.table('places').insert(place_data).execute()
        await update.message.reply_text("Место успешно добавлено в базу данных!")
    except Exception as e:
        logger.error(f"Error adding place: {e}")
        await update.message.reply_text("Произошла ошибка при добавлении места.")
    
    # Clear user data
    context.user_data.clear()
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the conversation."""
    await update.message.reply_text("Операция отменена.")
    context.user_data.clear()
    return ConversationHandler.END

def main() -> None:
    """Start the bot."""
    if not config.TELEGRAM_BOT_TOKEN:
        logger.error("No token provided!")
        return

    # Create the Application
    application = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()

    # Add conversation handler for adding places
    conv_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^add_place$')],
        states={
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_place_name)],
            TYPE: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_place_type)],
            ADDRESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, add_place_address)],
            LOCATION: [MessageHandler(filters.LOCATION, add_place_location)],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    )

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(conv_handler)
    application.add_handler(CallbackQueryHandler(button_handler))

    # Start the Bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main() 