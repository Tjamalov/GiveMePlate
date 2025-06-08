#!/bin/bash

# Путь к директории бота
BOT_DIR="/home/Creogenka/VibesAdd"
LOG_FILE="$BOT_DIR/bot.log"

echo "=== Проверка состояния бота ==="
echo "Время: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------"

# Функция для проверки, запущен ли бот
check_bot_running() {
    pgrep -f "python3.11 main.py" > /dev/null
    return $?
}

# Проверяем, запущен ли бот
if ! check_bot_running; then
    echo "❌ Бот не запущен"
    echo "🔄 Запускаем бота..."
    
    # Если бот не запущен, запускаем его
    cd "$BOT_DIR"
    nohup python3.11 main.py >> "$LOG_FILE" 2>&1 &
    
    # Ждем 5 секунд, чтобы бот успел запуститься
    sleep 5
    
    # Проверяем, запустился ли бот
    if check_bot_running; then
        echo "✅ Бот успешно запущен"
        echo "📝 PID: $(pgrep -f 'python3.11 main.py')"
    else
        echo "❌ Ошибка: Не удалось запустить бота"
        echo "📋 Последние ошибки из лога:"
        tail -n 5 "$LOG_FILE"
    fi
else
    PID=$(pgrep -f 'python3.11 main.py')
    echo "✅ Бот уже запущен"
    echo "📝 PID: $PID"
    echo "📊 Статистика процесса:"
    ps -p $PID -o %mem,%cpu,cmd | tail -n 1
fi

echo "------------------------"
echo "📋 Последние 5 строк лога:"
tail -n 5 "$LOG_FILE"
echo "=== Проверка завершена ===" 