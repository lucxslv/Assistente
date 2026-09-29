"""Ferramenta para reprodução invisível de mídia usando VLC e yt-dlp."""

import logging
import asyncio

import vlc
import yt_dlp

logger = logging.getLogger(__name__)


class MediaManager:
    """Gerenciador Singleton do VLC Player para controle de música em background."""
    
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_player()
        return cls._instance

    def _init_player(self):
        # --no-video garante que janelas do VLC não pipoquem na tela
        self.vlc_instance = vlc.Instance("--no-video --quiet")
        self.player = self.vlc_instance.media_player_new()
        self._user_volume = 100
        self._is_ducking = False
        self.player.audio_set_volume(self._user_volume)
        
    def _apply_volume(self):
        if self._is_ducking:
            self.player.audio_set_volume(int(self._user_volume * 0.2))  # 20% do volume original
        else:
            self.player.audio_set_volume(self._user_volume)

    def set_ducking(self, active: bool):
        """Abaixa o volume da música durante a fala da assistente (ducking)."""
        self._is_ducking = active
        self._apply_volume()

    async def play(self, query: str) -> str:
        """Busca o áudio no YouTube e toca via VLC."""
        ydl_opts = {
            'format': 'bestaudio/best',
            'noplaylist': True,
            'quiet': True,
            'default_search': 'ytsearch',
            'extract_flat': False,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android']
                }
            }
        }
        
        logger.info("Buscando música: %s", query)
        try:
            # yt-dlp é bloqueante, então rodamos em thread
            def _search_and_get_url():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f"ytsearch:{query}", download=False)
                    if 'entries' in info and len(info['entries']) > 0:
                        entry = info['entries'][0]
                        stream_url = entry.get('url')
                        if not stream_url and 'formats' in entry:
                            audio_formats = [
                                f for f in entry['formats']
                                if f.get('acodec') != 'none' and f.get('url')
                            ]
                            if audio_formats:
                                audio_formats.sort(
                                    key=lambda x: x.get('abr') or x.get('tbr') or 0,
                                    reverse=True
                                )
                                stream_url = audio_formats[0].get('url')
                        return stream_url, entry.get('title'), entry.get('http_headers', {})
                    return None, None, {}
            
            stream_url, title, http_headers = await asyncio.to_thread(_search_and_get_url)
            
            if not stream_url:
                return "Não encontrei nenhuma música com esse nome."
                
            media = self.vlc_instance.media_new(stream_url)
            media.add_option(":network-caching=1000")
            if http_headers and 'User-Agent' in http_headers:
                media.add_option(f":http-user-agent={http_headers['User-Agent']}")
                
            self.player.set_media(media)
            self.player.play()
            
            return f"Tocando agora: {title}"
        except Exception as e:
            logger.exception("Erro ao buscar/tocar música")
            return f"Erro ao tentar tocar a música: {e}"

    def pause(self) -> str:
        self.player.set_pause(1)
        return "Música pausada."

    def resume(self) -> str:
        self.player.play()
        return "Música retomada."
        
    def stop(self) -> str:
        self.player.stop()
        return "Música parada."

    def set_volume(self, level: int | str) -> str:
        try:
            level = int(level)
        except (ValueError, TypeError):
            level = 100
            
        level = max(0, min(100, level))
        self._user_volume = level
        self._apply_volume()
        return f"Volume ajustado para {level}%."


# Instância global para acesso pelas funções da ferramenta e pelo engine
media_manager = MediaManager()


# ====== Funções exportadas como Tools para o LLM ======

async def play_music(query: str) -> str:
    """Pesquisa e toca uma música ou artista no YouTube de forma invisível."""
    return await media_manager.play(query)

def pause_music(**kwargs) -> str:
    """Pausa a música que está tocando no momento."""
    return media_manager.pause()

def resume_music(**kwargs) -> str:
    """Retoma a música que estava pausada."""
    return media_manager.resume()

def stop_music(**kwargs) -> str:
    """Para completamente a música que está tocando no momento."""
    return media_manager.stop()

def set_volume(level: int) -> str:
    """Ajusta o volume da música atual.
    
    Args:
        level: Nível de volume entre 0 e 100.
    """
    return media_manager.set_volume(level)
