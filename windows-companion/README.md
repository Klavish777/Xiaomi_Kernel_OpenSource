# Xiaomi Kernel Companion (Windows MVP)

Windows-приложение для локальной сборки Linux-ядра через WSL2, синхронизации фиксированной Arena-ветки через GitHub, мониторинга ресурсов ПК и запросов к ИИ-сервису через OpenAI-совместимый API.

> ИИ-вкладка не подключает этот конкретный чат Arena напрямую. Для ответов нужен отдельный API endpoint/model/API key; синхронизация кода выполняется через GitHub.

## Установка и запуск

1. Установите WSL2 и Ubuntu. Для ядра исходники лучше хранить в Linux-файловой системе WSL (например, `~/src/kernel`), а не в `/mnt/c`, чтобы сборка была быстрее.
2. Скачайте и запустите `XiaomiKernelCompanion-Setup.exe` (релизная ссылка ниже).
3. Укажите папку локального проекта, дистрибутив WSL и команду сборки в настройках.

Установщик создаёт ярлык в меню «Пуск»; ярлык на рабочем столе можно включить при установке. Настройки сохраняются в `%APPDATA%\\XiaomiKernelCompanion\\settings.json`, API key шифруется средствами Windows DPAPI.

Для запуска из исходников установите Python 3.10+ и Git for Windows, выполните `py -m pip install -r requirements.txt`, затем откройте `run.bat`.

## Мониторинг ресурсов

Вкладка **Ресурсы** показывает круговые шкалы CPU, GPU, RAM и HDD + SSD; обновление — раз в 2 секунды. Переключатели «Подключить» включают и выключают мониторинг соответствующего ресурса.

- CPU, RAM и диск измеряются локально через psutil. Диск — том, где находится выбранная папка проекта.
- GPU считывается через `nvidia-smi` (NVIDIA). Без совместимого драйвера шкала GPU покажет «NVIDIA GPU не обнаружен».
- Если в команде сборки использовать `{cpu_threads}`, приложение подставит число логических CPU-потоков; при отключённом мониторинге CPU подставит `1`.
- Переключатели не могут физически подключать/отключать или резервировать компоненты. WSL и Windows сами управляют памятью и ресурсами. GPU обычно не ускоряет компиляцию ядра; для неё важны CPU, RAM и быстрый диск.

## Локальная сборка

На вкладке **Настройки** укажите локальный клон, WSL-дистрибутив и команду сборки. Например, после подготовки defconfig/toolchain команда может быть `make -j{cpu_threads}`. Введённая команда выполняется в Bash внутри WSL; запускайте только доверенные команды.

## Синхронизация с GitHub

Рабочая ветка приложения фиксирована:

```text
arena/01a0dce0-xiaomi-kernel-opensource
```

Кнопка синхронизации требует чистое рабочее дерево, затем выполняет `git fetch`, `git pull --rebase` и обычный `git push` (без force-push). Для аутентификации используйте Git Credential Manager/`gh auth`; приложение не запрашивает и не хранит GitHub-токены.

## ИИ API

На вкладке настроек задайте API base URL, имя модели и ключ. Поддерживается endpoint `/chat/completions` формата OpenAI. При включённой опции в запрос добавляется хвост логов сборки (до 12 000 символов); логи могут содержать приватные пути или данные — проверьте их перед отправкой.

## Скачать установщик

[Скачать XiaomiKernelCompanion-Setup.exe](https://github.com/Klavish777/Xiaomi_Kernel_OpenSource/releases/download/windows-companion-v0.1.0/XiaomiKernelCompanion-Setup.exe). Установщик собран workflow GitHub Actions на Windows.

## Сборка вручную на Windows

```powershell
py -m pip install -r requirements.txt pyinstaller
py -m PyInstaller --clean --noconfirm --onefile --windowed --name XiaomiKernelCompanion app.py
choco install innosetup --yes
& "${env:ProgramFiles(x86)}\\Inno Setup 6\\ISCC.exe" installer.iss
```

Установщик появится в `dist-installer\\XiaomiKernelCompanion-Setup.exe`.

## Ограничения MVP

- WSL/toolchain и корректную конфигурацию ядра настраивает пользователь.
- Текущий checkout Arena не содержит исходников ядра; для реальной сборки нужен локальный клон исходного кода и подготовленная команда.
- Для онлайн-ИИ нужен отдельный API-доступ и квота выбранного провайдера.
