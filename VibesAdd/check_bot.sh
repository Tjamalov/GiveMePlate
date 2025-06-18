#!/bin/bash

# Путь к директории бота
BOT_DIR="/home/Creogenka/VibesAdd"
LOG_FILE="$BOT_DIR/bot.log"

echo "=== Проверка состояния бота ==="
echo "Время: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------"

# Функция для поиска всех процессов бота
find_bot_processes() {
    # Ищем все процессы, содержащие main.py (более широкий поиск)
    pgrep -f "main.py" 2>/dev/null
}

# Функция для получения информации о процессе
get_process_info() {
    local pid=$1
    if [ -n "$pid" ]; then
        echo "PID: $pid"
        ps -p $pid -o %mem,%cpu,cmd --no-headers 2>/dev/null || echo "Процесс не найден"
    fi
}

# Проверяем, запущены ли процессы бота
echo "🔍 Поиск процессов бота..."
PIDS=$(find_bot_processes)

if [ -z "$PIDS" ]; then
    echo "❌ Бот не запущен"
    echo "🔄 Запускаем бота..."
    
    # Если бот не запущен, запускаем его
    cd "$BOT_DIR"
    nohup python3.11 main.py >> "$LOG_FILE" 2>&1 &
    
    # Ждем 5 секунд, чтобы бот успел запуститься
    sleep 5
    
    # Проверяем, запустился ли бот
    NEW_PIDS=$(find_bot_processes)
    if [ -n "$NEW_PIDS" ]; then
        echo "✅ Бот успешно запущен"
        for pid in $NEW_PIDS; do
            echo "📝 PID: $pid"
        done
    else
        echo "❌ Ошибка: Не удалось запустить бота"
        echo "📋 Последние ошибки из лога:"
        tail -n 5 "$LOG_FILE" 2>/dev/null || echo "Лог файл недоступен"
    fi
else
    # Подсчитываем количество процессов
    PID_COUNT=$(echo "$PIDS" | wc -w)
    
    if [ "$PID_COUNT" -eq 1 ]; then
        echo "✅ Бот запущен (1 экземпляр)"
        for pid in $PIDS; do
            echo "📝 PID: $pid"
            echo "📊 Статистика процесса:"
            get_process_info $pid
        done
    else
        echo "⚠️  ВНИМАНИЕ: Запущено $PID_COUNT экземпляров бота!"
        echo "📋 Найденные процессы:"
        for pid in $PIDS; do
            echo "  - $(get_process_info $pid)"
        done
        echo ""
        echo "🛑 Рекомендуется остановить все экземпляры и запустить заново:"
        echo "   ./stop_bot.sh"
        echo "   ./run_bot.sh"
    fi
fi

echo "------------------------"
echo "📋 Последние 5 строк лога:"
tail -n 5 "$LOG_FILE" 2>/dev/null || echo "Лог файл недоступен"
echo "=== Проверка завершена ===" 