from __future__ import annotations

import base64
import json
import os
import queue
import shutil
import subprocess
import threading
import tkinter as tk
import urllib.error
import urllib.request
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import psutil

APP_DIR = Path(os.getenv("APPDATA", Path.home())) / "XiaomiKernelCompanion"
CONFIG_FILE = APP_DIR / "settings.json"
BRANCH = "arena/01a0dce0-xiaomi-kernel-opensource"
DEFAULTS = {
    "project_path": "",
    "wsl_distro": "Ubuntu",
    "build_command": "",
    "api_base": "https://api.openai.com/v1",
    "api_model": "",
    "api_key": "",
    "monitor_cpu": True,
    "monitor_gpu": True,
    "monitor_ram": True,
    "monitor_disk": True,
}


def protect_secret(value: str) -> str:
    """Use Windows DPAPI for the API key; never write it as plaintext."""
    if not value:
        return ""
    if os.name != "nt":
        return ""
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

    raw = value.encode("utf-8")
    buffer = ctypes.create_string_buffer(raw)
    source = DATA_BLOB(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    target = DATA_BLOB()
    crypt = ctypes.windll.crypt32.CryptProtectData
    crypt.argtypes = [ctypes.POINTER(DATA_BLOB), wintypes.LPCWSTR, ctypes.c_void_p,
                      ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
                      ctypes.POINTER(DATA_BLOB)]
    crypt.restype = wintypes.BOOL
    if not crypt(ctypes.byref(source), "Xiaomi Kernel Companion", None, None, None, 0, ctypes.byref(target)):
        raise OSError("Windows DPAPI could not protect the API key")
    try:
        data = ctypes.string_at(target.pbData, target.cbData)
        return base64.b64encode(data).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)


def unprotect_secret(value: str) -> str:
    if not value or os.name != "nt":
        return ""
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

    raw = base64.b64decode(value)
    buffer = ctypes.create_string_buffer(raw)
    source = DATA_BLOB(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    target = DATA_BLOB()
    crypt = ctypes.windll.crypt32.CryptUnprotectData
    crypt.argtypes = [ctypes.POINTER(DATA_BLOB), ctypes.POINTER(wintypes.LPWSTR), ctypes.c_void_p,
                      ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
                      ctypes.POINTER(DATA_BLOB)]
    crypt.restype = wintypes.BOOL
    if not crypt(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(target)):
        return ""
    try:
        return ctypes.string_at(target.pbData, target.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)


def load_settings() -> dict:
    settings = DEFAULTS.copy()
    try:
        stored = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        settings.update({k: v for k, v in stored.items() if k in settings})
        settings["api_key"] = unprotect_secret(settings.get("api_key", ""))
    except (OSError, ValueError, TypeError):
        pass
    return settings


class ResourceGauge(tk.Canvas):
    def __init__(self, parent, title: str):
        super().__init__(parent, width=190, height=190, bg="#ffffff", highlightthickness=0)
        self.title = title
        self.value = None
        self.detail = "Отключено"
        self.draw()

    def draw(self):
        self.delete("all")
        x0, y0, x1, y1 = 24, 24, 166, 166
        self.create_arc(x0, y0, x1, y1, start=135, extent=270, style="arc", outline="#e5eaf0", width=13)
        if self.value is not None:
            color = "#22a06b" if self.value < 70 else "#e49b25" if self.value < 90 else "#d64545"
            self.create_arc(x0, y0, x1, y1, start=135, extent=270 * max(0, min(100, self.value)) / 100,
                            style="arc", outline=color, width=13)
            value_text = f"{self.value:.0f}%"
        else:
            value_text = "--"
        self.create_text(95, 78, text=self.title, fill="#526174", font=("Segoe UI", 10, "bold"))
        self.create_text(95, 108, text=value_text, fill="#172b4d", font=("Segoe UI", 22, "bold"))
        self.create_text(95, 137, text=self.detail, fill="#526174", font=("Segoe UI", 8), width=135)

    def set_reading(self, value, detail):
        self.value = value
        self.detail = detail
        self.draw()


class Companion(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Xiaomi Kernel Companion")
        self.geometry("920x700")
        self.minsize(760, 560)
        self.settings = load_settings()
        self.events: queue.Queue = queue.Queue()
        self.process: subprocess.Popen | None = None
        self.busy = False
        self._build_ui()
        self._load_fields()
        self.after(100, self._drain_events)
        self.after(700, self.update_resource_monitor)

    def _build_ui(self):
        style = ttk.Style(self)
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        header = ttk.Frame(self, padding=(16, 12))
        header.pack(fill="x")
        ttk.Label(header, text="Xiaomi Kernel Companion", font=("Segoe UI", 18, "bold")).pack(side="left")
        ttk.Label(header, text="Локальная сборка · GitHub · ИИ API", foreground="#526174").pack(side="right", pady=7)

        self.tabs = ttk.Notebook(self)
        self.tabs.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        self.build_tab = ttk.Frame(self.tabs, padding=14)
        self.resources_tab = ttk.Frame(self.tabs, padding=14)
        self.sync_tab = ttk.Frame(self.tabs, padding=14)
        self.ai_tab = ttk.Frame(self.tabs, padding=14)
        self.settings_tab = ttk.Frame(self.tabs, padding=14)
        self.tabs.add(self.build_tab, text="Сборка локально")
        self.tabs.add(self.resources_tab, text="Ресурсы")
        self.tabs.add(self.sync_tab, text="Синхронизация")
        self.tabs.add(self.ai_tab, text="ИИ-помощник")
        self.tabs.add(self.settings_tab, text="Настройки")
        self._build_build_tab()
        self._build_resources_tab()
        self._build_sync_tab()
        self._build_ai_tab()
        self._build_settings_tab()

    def _build_build_tab(self):
        ttk.Label(self.build_tab, text="Сборка выполняется в Linux через WSL2.", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        self.build_summary = ttk.Label(self.build_tab, text="Укажите папку проекта и команду сборки в настройках.", wraplength=820)
        self.build_summary.pack(anchor="w", pady=(5, 12))
        row = ttk.Frame(self.build_tab)
        row.pack(fill="x", pady=(0, 10))
        self.start_button = ttk.Button(row, text="Начать сборку", command=self.start_build)
        self.start_button.pack(side="left")
        self.stop_button = ttk.Button(row, text="Остановить", command=self.stop_build, state="disabled")
        self.stop_button.pack(side="left", padx=8)
        self.build_status = ttk.Label(row, text="Готово")
        self.build_status.pack(side="right")
        self.build_log = self._text_area(self.build_tab, height=24)
        self.build_log.pack(fill="both", expand=True)

    def _build_resources_tab(self):
        ttk.Label(self.resources_tab, text="Мониторинг и подключение ресурсов ПК", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        ttk.Label(
            self.resources_tab,
            text="Кольцевые шкалы обновляются каждые 2 секунды. CPU/RAM/диск используются WSL автоматически; GPU показывается при наличии NVIDIA-драйвера и nvidia-smi.",
            wraplength=820,
        ).pack(anchor="w", pady=(5, 12))
        self.resource_vars = {
            "cpu": tk.BooleanVar(value=bool(self.settings.get("monitor_cpu", True))),
            "gpu": tk.BooleanVar(value=bool(self.settings.get("monitor_gpu", True))),
            "ram": tk.BooleanVar(value=bool(self.settings.get("monitor_ram", True))),
            "disk": tk.BooleanVar(value=bool(self.settings.get("monitor_disk", True))),
        }
        self.resource_gauges = {}
        self.resource_states = {}
        cards = ttk.Frame(self.resources_tab)
        cards.pack(fill="both", expand=True)
        for index in range(2):
            cards.columnconfigure(index, weight=1)
            cards.rowconfigure(index, weight=1)
        labels = {"cpu": "CPU", "gpu": "GPU", "ram": "RAM", "disk": "HDD + SSD"}
        help_text = {
            "cpu": "Ядра/потоки; для авто-параллельности команда может содержать {cpu_threads}.",
            "gpu": "NVIDIA telemetry; GPU обычно не ускоряет компиляцию ядра.",
            "ram": "Использование памяти Windows; лимит WSL задаётся отдельно.",
            "disk": "Использование диска, где расположена папка проекта.",
        }
        for index, key in enumerate(("cpu", "gpu", "ram", "disk")):
            row, column = divmod(index, 2)
            card = ttk.LabelFrame(cards, text=labels[key], padding=8)
            card.grid(row=row, column=column, sticky="nsew", padx=8, pady=8)
            gauge = ResourceGauge(card, labels[key])
            gauge.pack(pady=(2, 0))
            self.resource_gauges[key] = gauge
            check = ttk.Checkbutton(card, text=f"Мониторить {labels[key]}", variable=self.resource_vars[key], command=self._save_resource_options)
            check.pack(pady=(0, 3))
            state = ttk.Label(card, text=help_text[key], wraplength=310, justify="center", foreground="#526174")
            state.pack(fill="x", padx=6, pady=(0, 4))
            self.resource_states[key] = state
        actions = ttk.LabelFrame(self.resources_tab, text="Доступ для локальной сборки в WSL2", padding=8)
        actions.pack(fill="x", pady=(4, 6))
        ttk.Button(actions, text="Подключить CPU + RAM", command=self.apply_wsl_profile).pack(side="left", padx=3)
        ttk.Button(actions, text="Вернуть прежние настройки WSL", command=self.restore_wsl_profile).pack(side="left", padx=3)
        ttk.Button(actions, text="Проверить GPU в WSL", command=self.check_wsl_gpu).pack(side="left", padx=3)
        ttk.Button(actions, text="Проверить доступ к папке проекта", command=self.check_wsl_project_access).pack(side="left", padx=3)
        self.resource_action_status = ttk.Label(self.resources_tab, text="Доступ к CPU/RAM настраивается для WSL2 целиком; GPU и проект проверяются отдельно.", wraplength=820)
        self.resource_action_status.pack(anchor="w", pady=(0, 4))
        ttk.Label(
            self.resources_tab,
            text="WSL получает лимиты, а не эксклюзивную резервацию устройств. Применение CPU/RAM меняет пользовательский .wslconfig; перезапуск WSL остановит все работающие WSL-сессии. GPU passthrough зависит от драйвера, а Windows-диски доступны через /mnt.",
            wraplength=820,
            foreground="#76551b",
        ).pack(anchor="w", pady=(4, 0))

    def _save_resource_options(self):
        self.settings.update({f"monitor_{key}": var.get() for key, var in self.resource_vars.items()})
        try:
            APP_DIR.mkdir(parents=True, exist_ok=True)
            saved = {key: var.get().strip() for key, var in self.vars.items()}
            saved.update({f"monitor_{key}": var.get() for key, var in self.resource_vars.items()})
            saved["api_key"] = protect_secret(self.api_key_var.get().strip())
            CONFIG_FILE.write_text(json.dumps(saved, indent=2, ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            self._append(self.build_log, f"Не удалось сохранить настройки ресурсов: {exc}\n")

    def _wsl_config_paths(self):
        return Path.home() / ".wslconfig", APP_DIR / "wslconfig-backup.json"

    @staticmethod
    def _merge_wsl2_settings(text: str, values: dict[str, str]) -> str:
        lines = text.splitlines()
        section_start = next((i for i, line in enumerate(lines) if line.strip().lower() == "[wsl2]"), None)
        if section_start is None:
            if lines and lines[-1].strip():
                lines.append("")
            lines.append("[wsl2]")
            section_start = len(lines) - 1
        section_end = next((i for i in range(section_start + 1, len(lines)) if lines[i].strip().startswith("[")), len(lines))
        seen = set()
        for i in range(section_start + 1, section_end):
            stripped = lines[i].strip()
            if "=" not in stripped or stripped.startswith((";", "#")):
                continue
            key = stripped.split("=", 1)[0].strip().lower()
            if key in values:
                lines[i] = f"{key}={values[key]}"
                seen.add(key)
        additions = [f"{key}={value}" for key, value in values.items() if key not in seen]
        lines[section_end:section_end] = additions
        return "\n".join(lines).rstrip() + "\n"

    def apply_wsl_profile(self):
        config_path, backup_path = self._wsl_config_paths()
        try:
            original_exists = config_path.exists()
            original = config_path.read_text(encoding="utf-8") if original_exists else ""
            if not backup_path.exists():
                APP_DIR.mkdir(parents=True, exist_ok=True)
                backup_path.write_text(json.dumps({"existed": original_exists, "content": original}, ensure_ascii=False), encoding="utf-8")
            total_gb = psutil.virtual_memory().total / (1024 ** 3)
            reserve_gb = min(4, max(2, round(total_gb * 0.2)))
            memory_gb = max(2, int(total_gb - reserve_gb))
            processors = psutil.cpu_count(logical=True) or 1
            updated = self._merge_wsl2_settings(original, {"processors": str(processors), "memory": f"{memory_gb}GB"})
            config_path.write_text(updated, encoding="utf-8")
            choice = messagebox.askyesnocancel(
                "Настройки WSL2 сохранены",
                f"Для WSL2 настроено до {processors} логических потоков и {memory_gb} ГБ RAM.\n\n"
                "Да — сейчас выполнить wsl --shutdown (остановятся все WSL-дистрибутивы).\n"
                "Нет — применить при следующем ручном запуске WSL.\n"
                "Отмена — оставить настройки сохранёнными без перезапуска.",
            )
            if choice is True:
                result = subprocess.run(["wsl.exe", "--shutdown"], capture_output=True, text=True, timeout=30)
                if result.returncode:
                    raise RuntimeError(result.stderr.strip() or "wsl --shutdown завершился с ошибкой")
                self.resource_action_status.configure(text=f"Профиль применён: {processors} потоков, до {memory_gb} ГБ RAM. WSL остановлен и перезапустится с новыми лимитами.")
            else:
                self.resource_action_status.configure(text=f"Профиль сохранён в {config_path}; он заработает при следующем полном перезапуске WSL.")
        except Exception as exc:
            messagebox.showerror("Не удалось подключить CPU/RAM к WSL2", str(exc))

    def restore_wsl_profile(self):
        config_path, backup_path = self._wsl_config_paths()
        if not backup_path.exists():
            messagebox.showinfo("Настройки WSL2", "Резервная копия исходного .wslconfig не найдена; приложение ещё не меняло настройки WSL.")
            return
        if not messagebox.askyesno("Восстановить настройки WSL2", "Вернуть .wslconfig к состоянию до подключения ресурсов и остановить все WSL-сессии?"):
            return
        try:
            backup = json.loads(backup_path.read_text(encoding="utf-8"))
            if backup.get("existed"):
                config_path.write_text(backup.get("content", ""), encoding="utf-8")
            elif config_path.exists():
                config_path.unlink()
            backup_path.unlink(missing_ok=True)
            result = subprocess.run(["wsl.exe", "--shutdown"], capture_output=True, text=True, timeout=30)
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or "wsl --shutdown завершился с ошибкой")
            self.resource_action_status.configure(text="Исходный .wslconfig восстановлен; WSL остановлен и будет запущен со старыми настройками.")
        except Exception as exc:
            messagebox.showerror("Не удалось восстановить настройки WSL2", str(exc))

    def check_wsl_gpu(self):
        distro = self.vars["wsl_distro"].get().strip() or "Ubuntu"
        try:
            result = subprocess.run(["wsl.exe", "-d", distro, "--", "nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                                    capture_output=True, text=True, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                self.resource_action_status.configure(text="GPU доступен из WSL: " + result.stdout.strip().replace("\n", ", "))
            else:
                detail = result.stderr.strip() or "nvidia-smi не найден в WSL. Требуется совместимый NVIDIA-драйвер и WSL2."
                self.resource_action_status.configure(text="GPU пока недоступен в WSL: " + detail[:240])
        except (OSError, subprocess.SubprocessError) as exc:
            self.resource_action_status.configure(text=f"Не удалось проверить GPU в WSL: {exc}")

    def check_wsl_project_access(self):
        try:
            project = self._project()
            distro = self.vars["wsl_distro"].get().strip() or "Ubuntu"
            wsl_path = subprocess.run(["wsl.exe", "-d", distro, "--", "wslpath", "-a", "-u", project],
                                      check=True, capture_output=True, text=True, timeout=15).stdout.strip()
            check = subprocess.run(["wsl.exe", "-d", distro, "--", "test", "-d", wsl_path], timeout=15)
            if check.returncode == 0:
                self.resource_action_status.configure(text=f"Папка проекта доступна в WSL как {wsl_path}")
            else:
                self.resource_action_status.configure(text=f"WSL не видит папку {wsl_path}; проверьте монтирование Windows-дисков.")
        except (ValueError, OSError, subprocess.SubprocessError) as exc:
            messagebox.showerror("Нет доступа к папке проекта", str(exc))

    def update_resource_monitor(self):
        try:
            self._update_resource_readings()
        finally:
            self.after(2000, self.update_resource_monitor)

    def _update_resource_readings(self):
        if not hasattr(self, "resource_gauges"):
            return
        if self.resource_vars["cpu"].get():
            cpu = psutil.cpu_percent(interval=None)
            count = psutil.cpu_count(logical=True) or 1
            self.resource_gauges["cpu"].set_reading(cpu, f"{count} логических потоков")
        else:
            self.resource_gauges["cpu"].set_reading(None, "Отключено")

        if self.resource_vars["ram"].get():
            memory = psutil.virtual_memory()
            used = (memory.total - memory.available) / (1024 ** 3)
            total = memory.total / (1024 ** 3)
            self.resource_gauges["ram"].set_reading(memory.percent, f"{used:.1f} / {total:.1f} ГБ")
        else:
            self.resource_gauges["ram"].set_reading(None, "Отключено")

        if self.resource_vars["disk"].get():
            path = self.vars["project_path"].get().strip() or str(Path.home())
            try:
                disk = psutil.disk_usage(path)
            except (OSError, ValueError):
                disk = psutil.disk_usage(str(Path.home()))
                path = str(Path.home())
            self.resource_gauges["disk"].set_reading(disk.percent, f"Свободно {disk.free / (1024 ** 3):.1f} ГБ · {path}")
        else:
            self.resource_gauges["disk"].set_reading(None, "Отключено")

        if self.resource_vars["gpu"].get():
            self._update_gpu_reading()
        else:
            self.resource_gauges["gpu"].set_reading(None, "Отключено")

    def _update_gpu_reading(self):
        executable = shutil.which("nvidia-smi")
        if not executable:
            self.resource_gauges["gpu"].set_reading(None, "NVIDIA GPU не обнаружен")
            return
        try:
            result = subprocess.run(
                [executable, "--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=2, check=True,
            )
            samples = []
            for line in result.stdout.strip().splitlines():
                fields = [field.strip() for field in line.split(",")]
                if len(fields) >= 3 and all(field.replace(".", "", 1).isdigit() for field in fields[:3]):
                    samples.append(tuple(float(field) for field in fields[:3]))
            if not samples:
                raise ValueError("nvidia-smi returned no GPU telemetry")
            utilization = sum(sample[0] for sample in samples) / len(samples)
            used = sum(sample[1] for sample in samples)
            total = sum(sample[2] for sample in samples)
            self.resource_gauges["gpu"].set_reading(utilization, f"VRAM {used:.0f} / {total:.0f} МБ")
        except (OSError, subprocess.SubprocessError, ValueError):
            self.resource_gauges["gpu"].set_reading(None, "Нет данных от nvidia-smi")

    def _build_sync_tab(self):
        ttk.Label(self.sync_tab, text="Синхронизация исходников через GitHub", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        ttk.Label(self.sync_tab, text=f"Ветка Arena: {BRANCH}\nСначала проверяется рабочее дерево; при незакоммиченных изменениях синхронизация остановится. Затем выполняется fetch, rebase и push.", wraplength=820).pack(anchor="w", pady=(6, 14))
        bar = ttk.Frame(self.sync_tab)
        bar.pack(fill="x", pady=(0, 10))
        self.sync_button = ttk.Button(bar, text="Синхронизировать с GitHub", command=self.start_sync)
        self.sync_button.pack(side="left")
        self.sync_status = ttk.Label(bar, text="Готово")
        self.sync_status.pack(side="right")
        self.sync_log = self._text_area(self.sync_tab, height=24)
        self.sync_log.pack(fill="both", expand=True)

    def _build_ai_tab(self):
        ttk.Label(self.ai_tab, text="Вопрос к ИИ-сервису с OpenAI-совместимым API", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        ttk.Label(self.ai_tab, text="Это отдельное API-подключение, не прямое соединение с текущим чатом Arena. Ключ хранится в Windows DPAPI.", wraplength=820).pack(anchor="w", pady=(5, 10))
        self.ai_log = self._text_area(self.ai_tab, height=18)
        self.ai_log.pack(fill="both", expand=True, pady=(0, 10))
        ttk.Label(self.ai_tab, text="Ваш вопрос").pack(anchor="w")
        self.prompt = tk.Text(self.ai_tab, height=4, wrap="word", font=("Segoe UI", 10))
        self.prompt.pack(fill="x", pady=(4, 8))
        bar = ttk.Frame(self.ai_tab)
        bar.pack(fill="x")
        self.attach_logs = tk.BooleanVar(value=True)
        ttk.Checkbutton(bar, text="Приложить последние логи сборки", variable=self.attach_logs).pack(side="left")
        self.ask_button = ttk.Button(bar, text="Отправить запрос", command=self.ask_ai)
        self.ask_button.pack(side="right")

    def _build_settings_tab(self):
        self.vars = {key: tk.StringVar() for key in ("project_path", "wsl_distro", "build_command", "api_base", "api_model")}
        self.api_key_var = tk.StringVar()
        self._entry_row(self.settings_tab, 0, "Папка проекта (Windows)", self.vars["project_path"], browse=True)
        self._entry_row(self.settings_tab, 1, "WSL-дистрибутив", self.vars["wsl_distro"])
        ttk.Label(self.settings_tab, text="Команда сборки (выполняется в корне проекта внутри WSL)").grid(row=2, column=0, sticky="w", pady=6)
        ttk.Entry(self.settings_tab, textvariable=self.vars["build_command"]).grid(row=2, column=1, sticky="ew", pady=6)
        self._entry_row(self.settings_tab, 3, "API base URL", self.vars["api_base"])
        self._entry_row(self.settings_tab, 4, "API model", self.vars["api_model"])
        ttk.Label(self.settings_tab, text="API key (зашифруется средствами Windows)").grid(row=5, column=0, sticky="w", pady=6)
        ttk.Entry(self.settings_tab, textvariable=self.api_key_var, show="•").grid(row=5, column=1, sticky="ew", pady=6)
        self.settings_tab.columnconfigure(1, weight=1)
        ttk.Button(self.settings_tab, text="Сохранить настройки", command=self.save_settings).grid(row=6, column=1, sticky="e", pady=(12, 0))
        ttk.Label(self.settings_tab, text="Для Xiaomi kernel source в Windows потребуется установленный WSL2 и Linux toolchain. Текущий репозиторий Arena пока не содержит исходников ядра.", wraplength=760, foreground="#76551b").grid(row=7, column=0, columnspan=2, sticky="w", pady=(18, 0))

    def _entry_row(self, parent, row, title, var, browse=False):
        ttk.Label(parent, text=title).grid(row=row, column=0, sticky="w", pady=6)
        ttk.Entry(parent, textvariable=var).grid(row=row, column=1, sticky="ew", pady=6)
        if browse:
            ttk.Button(parent, text="Обзор…", command=self.browse_project).grid(row=row, column=2, padx=(6, 0))

    def _text_area(self, parent, height=20):
        frame = ttk.Frame(parent)
        text = tk.Text(frame, height=height, wrap="word", font=("Consolas", 9), state="disabled", background="#101820", foreground="#d8e1e8", insertbackground="white")
        scroll = ttk.Scrollbar(frame, command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        text.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        text._frame = frame
        return text

    def _load_fields(self):
        for key, var in self.vars.items():
            var.set(self.settings.get(key, ""))
        self.api_key_var.set(self.settings.get("api_key", ""))
        self._update_summary()

    def _update_summary(self):
        path = self.vars["project_path"].get().strip()
        command = self.vars["build_command"].get().strip()
        self.build_summary.configure(text=f"Проект: {path or 'не выбран'}\nКоманда: {command or 'не задана'}\nДистрибутив WSL: {self.vars['wsl_distro'].get() or 'Ubuntu'}")

    def browse_project(self):
        path = filedialog.askdirectory(title="Выберите папку локального репозитория")
        if path:
            self.vars["project_path"].set(path)
            self.save_settings()

    def save_settings(self):
        APP_DIR.mkdir(parents=True, exist_ok=True)
        values = {key: var.get().strip() for key, var in self.vars.items()}
        values.update({f"monitor_{key}": var.get() for key, var in self.resource_vars.items()})
        values["api_key"] = protect_secret(self.api_key_var.get().strip())
        CONFIG_FILE.write_text(json.dumps(values, indent=2, ensure_ascii=False), encoding="utf-8")
        self.settings.update({key: var.get().strip() for key, var in self.vars.items()})
        self.settings["api_key"] = self.api_key_var.get().strip()
        self._update_summary()
        self._append(self.build_log, "Настройки сохранены.\n")

    def _append(self, widget, text):
        widget.configure(state="normal")
        widget.insert("end", text)
        widget.see("end")
        widget.configure(state="disabled")

    def _project(self):
        path = self.vars["project_path"].get().strip()
        if not path or not Path(path).is_dir():
            raise ValueError("Сначала укажите существующую папку проекта в настройках.")
        return path

    def _spawn(self, cmd, widget, cwd=None):
        if self.busy:
            return
        self.busy = True
        def worker():
            try:
                self.events.put(("status", "Выполняется…"))
                self.process = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                                stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
                                                bufsize=1, shell=False)
                for line in iter(self.process.stdout.readline, ""):
                    self.events.put(("log", widget, line))
                code = self.process.wait()
                self.events.put(("done", code))
            except Exception as exc:
                self.events.put(("log", widget, f"Ошибка: {exc}\n"))
                self.events.put(("done", -1))
            finally:
                self.process = None
        threading.Thread(target=worker, daemon=True).start()

    def start_build(self):
        if self.busy:
            messagebox.showinfo("Выполняется операция", "Дождитесь окончания текущей сборки или синхронизации.")
            return
        try:
            project = self._project()
            command = self.vars["build_command"].get().strip()
            distro = self.vars["wsl_distro"].get().strip() or "Ubuntu"
            if "{cpu_threads}" in command:
                threads = (psutil.cpu_count(logical=True) or 1) if self.resource_vars["cpu"].get() else 1
                command = command.replace("{cpu_threads}", str(threads))
            if not command:
                raise ValueError("Задайте команду сборки в настройках, например make -j$(nproc).")
            wsl_path = subprocess.run(["wsl.exe", "-d", distro, "--", "wslpath", "-a", "-u", project],
                                      check=True, capture_output=True, text=True, timeout=20).stdout.strip()
            self.build_log.configure(state="normal"); self.build_log.delete("1.0", "end"); self.build_log.configure(state="disabled")
            self._append(self.build_log, f"Запуск в {distro}: {wsl_path}\n$ {command}\n\n")
            self.start_button.configure(state="disabled"); self.stop_button.configure(state="normal")
            self._spawn(["wsl.exe", "-d", distro, "--", "bash", "-lc", f"cd -- {self._quote(wsl_path)} && {command}"], self.build_log)
        except (ValueError, OSError, subprocess.SubprocessError) as exc:
            messagebox.showerror("Не удалось запустить сборку", str(exc))

    @staticmethod
    def _quote(value):
        return "'" + value.replace("'", "'\\''") + "'"

    def stop_build(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self._append(self.build_log, "\nЗапрошена остановка процесса.\n")

    def start_sync(self):
        if self.busy:
            messagebox.showinfo("Выполняется операция", "Дождитесь окончания текущей сборки или синхронизации.")
            return
        try:
            project = self._project()
            check = subprocess.run(["git", "status", "--porcelain"], cwd=project, capture_output=True, text=True, check=True)
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=project, capture_output=True, text=True, check=True).stdout.strip()
            if branch != BRANCH:
                raise ValueError(f"Ожидается ветка {BRANCH}, сейчас активна {branch or '(нет ветки)'}.")
            if check.stdout.strip():
                raise ValueError("В рабочем дереве есть незакоммиченные изменения. Сначала сохраните их коммитом или отдельно скопируйте.")
            self.sync_log.configure(state="normal"); self.sync_log.delete("1.0", "end"); self.sync_log.configure(state="disabled")
            self._append(self.sync_log, f"Ветка: {branch}\nПроверка GitHub…\n")
            self.sync_button.configure(state="disabled")
            self.busy = True
            threading.Thread(target=self._sync_worker, args=(project,), daemon=True).start()
        except (ValueError, subprocess.SubprocessError, OSError) as exc:
            messagebox.showerror("Синхронизация остановлена", str(exc))

    def _sync_worker(self, project):
        try:
            for label, args in (
                ("fetch", ["git", "fetch", "origin", BRANCH]),
                ("rebase", ["git", "pull", "--rebase", "origin", BRANCH]),
                ("push", ["git", "push", "origin", BRANCH]),
            ):
                self.events.put(("log", self.sync_log, f"\n$ {' '.join(args)}\n"))
                result = subprocess.Popen(args, cwd=project, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                          stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace")
                self.process = result
                for line in iter(result.stdout.readline, ""):
                    self.events.put(("log", self.sync_log, line))
                code = result.wait()
                self.process = None
                if code:
                    self.events.put(("done", code))
                    return
            self.events.put(("done", 0))
        except Exception as exc:
            self.events.put(("log", self.sync_log, f"Ошибка синхронизации: {exc}\n"))
            self.events.put(("done", -1))

    def ask_ai(self):
        question = self.prompt.get("1.0", "end").strip()
        if not question:
            messagebox.showinfo("ИИ-помощник", "Введите вопрос.")
            return
        api_key = self.api_key_var.get().strip()
        base = self.vars["api_base"].get().strip().rstrip("/")
        model = self.vars["api_model"].get().strip()
        if not api_key or not base or not model:
            messagebox.showerror("Не настроен ИИ", "Укажите API URL, модель и API key в настройках.")
            return
        prompt = question
        if self.attach_logs.get():
            logs = self.build_log.get("1.0", "end").strip()[-12000:]
            if logs:
                prompt += "\n\nПоследние логи сборки:\n```\n" + logs + "\n```"
        self._append(self.ai_log, f"\nВы: {question}\n\nИИ: запрашиваю…\n")
        self.ask_button.configure(state="disabled")
        threading.Thread(target=self._request_ai, args=(base, model, api_key, prompt), daemon=True).start()

    def _request_ai(self, base, model, api_key, prompt):
        try:
            data = json.dumps({"model": model, "messages": [
                {"role": "system", "content": "You are a helpful assistant for Linux kernel development and build troubleshooting."},
                {"role": "user", "content": prompt}], "temperature": 0.2}).encode("utf-8")
            req = urllib.request.Request(base + "/chat/completions", data=data, headers={
                "Authorization": "Bearer " + api_key, "Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
            answer = result["choices"][0]["message"]["content"]
            self.events.put(("ai", answer))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:3000]
            self.events.put(("ai", f"HTTP {exc.code}: {detail}"))
        except Exception as exc:
            self.events.put(("ai", f"Ошибка запроса: {exc}"))

    def _drain_events(self):
        try:
            while True:
                event = self.events.get_nowait()
                if event[0] == "log":
                    self._append(event[1], event[2])
                elif event[0] == "status":
                    self.build_status.configure(text=event[1])
                    self.sync_status.configure(text=event[1])
                elif event[0] == "done":
                    self.busy = False
                    self.start_button.configure(state="normal")
                    self.stop_button.configure(state="disabled")
                    self.sync_button.configure(state="normal")
                    status = "Завершено успешно" if event[1] == 0 else f"Завершено с кодом {event[1]}"
                    self.build_status.configure(text=status)
                    self.sync_status.configure(text=status)
                elif event[0] == "ai":
                    self.ask_button.configure(state="normal")
                    self._append(self.ai_log, event[1] + "\n")
        except queue.Empty:
            pass
        self.after(100, self._drain_events)


if __name__ == "__main__":
    Companion().mainloop()
