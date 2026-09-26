# Xiaomi Kernel Companion (Windows MVP)

Небольшое Windows-приложение для локальной сборки Linux-ядра через WSL2, синхронизации фиксированной Arena-ветки через GitHub и обращения к ИИ-сервису с OpenAI-совместимым API.

> Приложение не подключает этот конкретный чат Arena напрямую. Для онлайн-ответов нужен отдельный API endpoint/model/API key. Синхронизация кода с рабочим пространством выполняется отдельно через GitHub.

## Установка и запуск

1. Установите WSL2 и Ubuntu. Для ядра исходники лучше хранить в Linux-файловой системе WSL (например, `~/src/kernel`), а не в `/mnt/c`, чтобы сборка была быстрее.
2. Скачайте и запустите `XiaomiKernelCompanion-Setup.exe` (сборка доступна как GitHub Actions artifact; инструкция ниже).
3. Укажите локальную папку проекта, дистрибутив WSL и команду сборки в настройках.

Установщик создаёт ярлык в меню «Пуск»; ярлык на рабочем столе можно включить при установке. Приложение сохраняет настройки в `%APPDATA%\\XiaomiKernelCompanion\\settings.json`, а API key шифрует средствами Windows DPAPI.

Для запуска из исходников установите Python 3.10+ для Windows и Git for Windows, затем откройте `run.bat`.

## Локальная сборка

На вкладке **Настройки** укажите папку локального клона, дистрибутив WSL и команду сборки. Если вы уже подготовили defconfig/toolchain, команда может быть `make -j$(nproc)`. Приложение выполняет введённую команду в Bash внутри выбранного WSL-дистрибутива; запускайте только доверенные команды.

## Синхронизация с GitHub

Рабочая ветка приложения фиксирована:

```text
arena/01a0dce0-xiaomi-kernel-opensource
```

Кнопка синхронизации требует чистое рабочее дерево, затем выполняет `git fetch`, `git pull --rebase` и обычный `git push` (без force-push). Для GitHub-аутентификации используйте Git Credential Manager/`gh auth`; приложение не запрашивает и не хранит GitHub-токены.

## ИИ API

На вкладке настроек задайте API base URL (например, `https://api.openai.com/v1`), имя модели и ключ. Поддерживается endpoint `/chat/completions` формата OpenAI. При включённой опции в запрос будет добавлен хвост логов последней сборки (до 12 000 символов); логи могут содержать приватные пути или данные — проверьте их перед отправкой. Этот API не является прямым подключением к текущему чату Arena.

## Скачать установщик

GitHub Actions workflow **Build Windows installer** собирает Windows-установщик для Arena-ветки и публикует его как артефакт на 14 дней. После завершения сборки файл `XiaomiKernelCompanion-Setup.exe` можно скачать со страницы запуска workflow в GitHub Actions.

## Сборка вручную на Windows

```powershell
py -m pip install pyinstaller
py -m PyInstaller --onefile --windowed --name XiaomiKernelCompanion app.py
choco install innosetup --yes
& "${env:ProgramFiles(x86)}\\Inno Setup 6\\ISCC.exe" installer.iss
```

Установщик появится в `dist-installer\\XiaomiKernelCompanion-Setup.exe`.

## Ограничения MVP

- Установка WSL/toolchain и выбор правильной конфигурации ядра выполняются пользователем.
- Текущий checkout Arena содержит только пустой `README.md`; для настоящей сборки нужен локальный клон исходников ядра и подготовленная команда.
- Для онлайн-ИИ нужны отдельные API-доступ и квота выбранного провайдера.
