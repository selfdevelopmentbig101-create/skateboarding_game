"""Sketch Skate launcher bot.

/start  -> greeting + a button that opens the Mini App
/help   -> short instructions
On startup the bot also sets the chat menu button (next to the text box) to open the Mini App.

Config comes from the environment (a local .env file is loaded automatically):
  BOT_TOKEN     token from @BotFather
  MINI_APP_URL  https address of the hosted game/ folder
Uses long polling, so it needs no public server of its own.

Optional network settings for slow or filtered connections (all in .env, all optional):
  TELEGRAM_PROXY  proxy address, e.g. http://127.0.0.1:7890 or socks5://127.0.0.1:1080
  FORCE_IPV4      set to 1 to connect over IPv4 only (helps when IPv6 hangs; ignored when a proxy is set)
"""
import asyncio
import html
import logging
import os
import sys

from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.constants import ChatType, ParseMode
from telegram.error import NetworkError, TimedOut
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.request import HTTPXRequest

GAME_NAME = "Sketch Skate"
PLAY_LABEL = "\U0001F6F9 Play Sketch Skate"  # skateboard emoji
MENU_LABEL = "\U0001F6F9 Play"

log = logging.getLogger("sketch-skate-bot")


def read_config() -> tuple[str, str]:
    """Reads BOT_TOKEN and MINI_APP_URL; exits with a clear message if they are missing or still placeholders."""
    load_dotenv()
    token = os.environ.get("BOT_TOKEN", "").strip()
    url = os.environ.get("MINI_APP_URL", "").strip()
    problems = []
    if not token or "<" in token:
        problems.append("BOT_TOKEN is missing (get one from @BotFather with /newbot and put it in .env)")
    if not url or "<" in url:
        problems.append("MINI_APP_URL is missing (the https address where you hosted the game/ folder)")
    elif not url.startswith("https://"):
        problems.append("MINI_APP_URL must start with https:// (Telegram only opens secure pages)")
    if problems:
        sys.exit("Configuration error:\n  - " + "\n  - ".join(problems))
    return token, url


def make_request(read_timeout: float = 20.0) -> HTTPXRequest:
    """HTTP client with generous timeouts (the library default is only 5 s, too short on slow networks)."""
    proxy = os.environ.get("TELEGRAM_PROXY", "").strip() or None
    extra: dict = {}
    if proxy is None and os.environ.get("FORCE_IPV4", "").strip() in ("1", "true", "yes"):
        import httpx  # installed together with python-telegram-bot

        extra["httpx_kwargs"] = {"transport": httpx.AsyncHTTPTransport(local_address="0.0.0.0")}
    return HTTPXRequest(
        connection_pool_size=8,
        connect_timeout=20.0,
        read_timeout=read_timeout,
        write_timeout=20.0,
        pool_timeout=20.0,
        proxy=proxy,
        **extra,
    )


async def reply(message, text: str, **kwargs):
    """reply_text with up to 3 attempts, so one slow connection does not lose the answer."""
    for attempt in range(1, 4):
        try:
            return await message.reply_text(text, **kwargs)
        except (TimedOut, NetworkError):
            if attempt == 3:
                raise
            log.warning("Telegram did not answer (attempt %d/3), retrying...", attempt)
            await asyncio.sleep(1.5 * attempt)


def play_keyboard(app_url: str) -> InlineKeyboardMarkup:
    """One button that opens the Mini App in Telegram."""
    return InlineKeyboardMarkup([[InlineKeyboardButton(PLAY_LABEL, web_app=WebAppInfo(url=app_url))]])


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/start: greet the user and show the Play button."""
    message, chat, user = update.effective_message, update.effective_chat, update.effective_user
    if message is None or chat is None:
        return
    # Web App buttons only work in private chats, so send groups to the bot's own chat.
    if chat.type != ChatType.PRIVATE:
        username = context.bot.username
        await reply(message, f"Open a private chat with @{username} to play {GAME_NAME}.")
        return
    name = html.escape(user.first_name) if user and user.first_name else "skater"
    await reply(
        message,
        f"Hey {name}! \U0001F44B Welcome to <b>{GAME_NAME}</b>, a hand-drawn skateboarding game.\n"
        "Tap the button below to start rolling.",
        parse_mode=ParseMode.HTML,
        reply_markup=play_keyboard(context.application.bot_data["app_url"]),
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/help: how to play."""
    message = update.effective_message
    if message is None:
        return
    await reply(
        message,
        f"{GAME_NAME} controls:\n"
        "\u2022 Tap anywhere: ollie (hold a little longer to jump higher)\n"
        "\u2022 Swipe up in the air: kickflip\n"
        "\u2022 Swipe left or right in the air: 360 spin\n"
        "\u2022 Swipe down (hold): grab\n"
        "\u2022 Land clean to build your combo. Landing in the middle of a trick is a crash!\n\n"
        "Commands: /start opens the game, /help shows this message."
    )


async def post_init(application: Application) -> None:
    """Runs once at startup: make the chat menu button open the Mini App."""
    try:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=MENU_LABEL, web_app=WebAppInfo(url=application.bot_data["app_url"]))
        )
        log.info("Menu button set.")
    except Exception:  # not fatal: /start still works
        log.exception("Could not set the menu button")


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, NetworkError):  # includes TimedOut
        log.warning(
            "Network problem talking to Telegram (%s). Check your internet connection; if it keeps happening "
            "set FORCE_IPV4=1 or TELEGRAM_PROXY in .env.", context.error,
        )
        return
    log.error("Unhandled error", exc_info=context.error)


def build_application(token: str, app_url: str) -> Application:
    application = (
        Application.builder()
        .token(token)
        .request(make_request())
        .get_updates_request(make_request(read_timeout=30.0))
        .post_init(post_init)
        .build()
    )
    application.bot_data["app_url"] = app_url
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_error_handler(on_error)
    return application


def main() -> None:
    logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO)
    # httpx logs every request URL at INFO level, and the URL contains the bot token.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    token, app_url = read_config()
    # Python 3.14+ no longer creates an event loop automatically, and python-telegram-bot's
    # run_polling() asks for the current one. Create it here so every Python version works.
    asyncio.set_event_loop(asyncio.new_event_loop())
    build_application(token, app_url).run_polling(
        allowed_updates=Update.ALL_TYPES,
        bootstrap_retries=-1,  # keep retrying if Telegram is unreachable at startup
    )


if __name__ == "__main__":
    main()
