#!/bin/bash

# Переходим в директорию с ботом
cd /home/Creogenka/VibesAdd

# Активируем виртуальное окружение (если используется)
# source ~/venv/bin/activate

# Запускаем бота в background режиме
python3.11 main.py >> /home/Creogenka/VibesAdd/bot.log 2>&1 & 