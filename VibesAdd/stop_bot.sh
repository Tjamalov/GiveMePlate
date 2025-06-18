#!/bin/bash

# Путь к директории бота
BOT_DIR="/home/Creogenka/VibesAdd"
LOG_FILE="$BOT_DIR/bot.log"

echo "=== Остановка всех экземпляров бота ==="
echo "Время: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------"

# Функция для поиска всех процессов бота
find_bot_processes() {
    # Ищем все процессы, содержащие main.py
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

# Находим все процессы бота
echo "🔍 Поиск процессов бота..."
PIDS=$(find_bot_processes)

if [ -z "$PIDS" ]; then
    echo "✅ Процессы бота не найдены"
    echo "=== Остановка завершена ==="
    exit 0
fi

echo "📋 Найдены процессы:"
for pid in $PIDS; do
    echo "  - $(get_process_info $pid)"
done

# Останавливаем все процессы
echo "🛑 Останавливаем процессы..."
for pid in $PIDS; do
    echo "  Останавливаем PID $pid..."
    kill $pid 2>/dev/null
    
    # Ждем 3 секунды
    sleep 3
    
    # Проверяем, остановился ли процесс
    if kill -0 $pid 2>/dev/null; then
        echo "  ⚠️  Процесс $pid не остановился, принудительно завершаем..."
        kill -9 $pid 2>/dev/null
        sleep 1
    else
        echo "  ✅ Процесс $pid остановлен"
    fi
done

# Финальная проверка
echo "🔍 Финальная проверка..."
REMAINING_PIDS=$(find_bot_processes)

if [ -z "$REMAINING_PIDS" ]; then
    echo "✅ Все процессы бота успешно остановлены"
else
    echo "❌ Остались процессы: $REMAINING_PIDS"
    echo "Попробуйте остановить их вручную:"
    echo "  kill -9 $REMAINING_PIDS"
fi

echo "------------------------"
echo "📋 Последние 3 строки лога:"
tail -n 3 "$LOG_FILE" 2>/dev/null || echo "Лог файл недоступен"
echo "=== Остановка завершена ===" 