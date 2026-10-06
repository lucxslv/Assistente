import React, { useEffect, useState, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Smartphone,
  Check,
  Copy,
  RefreshCw,
  Wifi,
  Globe,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getApiBase, getServerMode } from "../services/api";

export interface PairingPanelProps {
  onClose?: () => void;
  isModal?: boolean;
}

interface QRPayload {
  v: number;
  id: string;
  lan: string;
  tunnel?: string | null;
  secret: string;
  type?: string;
  pin?: string;
  name?: string;
}

interface PairingData {
  pin: string;
  formattedPin: string;
  pairingId: string;
  lanUrl: string;
  tunnelUrl?: string | null;
  secret: string;
  expiresInSeconds: number;
  qrPayload: QRPayload;
  source: "local" | "cloud" | "fallback";
  apiBaseUrl?: string;
}

interface PairedDeviceInfo {
  device_id: string;
  device_name?: string;
  platform?: string;
  paired_at?: number;
}

function playPairSuccessSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Ignora restrições do navegador
  }
}

export const PairingPanel: React.FC<PairingPanelProps> = ({ onClose, isModal = false }) => {
  const [data, setData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<PairedDeviceInfo | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const soundPlayedRef = useRef(false);

  const initPairing = useCallback(async () => {
    setLoading(true);
    setIsPaired(false);
    setPairedDevice(null);
    setStatusMessage(null);
    soundPlayedRef.current = false;

    // 1. Detecta IP local da máquina via comando nativo Rust (Tauri Win32)
    let localIp = "127.0.0.1";
    try {
      const ip = await invoke<string>("get_local_ip");
      if (ip && !ip.startsWith("127.")) {
        localIp = ip;
      }
    } catch {
      // Fallback
    }

    const defaultLan = `http://${localIp}:8005`;
    const apiBase = getApiBase().replace(/\/+$/, "");

    const serverMode = getServerMode();

    // Em modo Nuvem (padrão), prioriza a URL ativa na nuvem para pareamento WAN imediato
    const candidateBases = (serverMode === "local"
      ? [
          "http://127.0.0.1:8005/api",
          `${defaultLan}/api`,
          apiBase,
          "https://assistente-xi.vercel.app/api",
        ]
      : [
          apiBase,
          "https://assistente-xi.vercel.app/api",
          "http://127.0.0.1:8005/api",
          `${defaultLan}/api`,
        ]
    ).filter((v, idx, arr) => !!v && arr.indexOf(v) === idx);

    const tryFetchInit = async (): Promise<PairingData | null> => {
      for (const base of candidateBases) {
        try {
          const url = `${base}/pair/init`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Desktop Principal",
              port: 8005,
              local_ip: localIp,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            const payload = await res.json();
            const rawPin = payload.pin;
            const pairingId = payload.pairing_id || payload.id || payload.token;
            const secret = payload.secret || payload.token;
            const lanUrl = payload.lan_url || payload.lanUrl || defaultLan;
            const tunnelUrl = payload.tunnel_url || payload.tunnelUrl || (base.includes("vercel.app") ? "https://assistente-xi.vercel.app/api" : null);

            const qrPayload: QRPayload = payload.qr_payload || payload.qrPayload || {
              v: 1,
              id: pairingId,
              lan: lanUrl,
              tunnel: tunnelUrl,
              secret,
              type: "charlie-pair",
              pin: rawPin,
              name: "Desktop Principal",
            };

            return {
              pin: rawPin,
              formattedPin: payload.formatted_pin || `${rawPin.slice(0, 3)}-${rawPin.slice(3)}`,
              pairingId,
              lanUrl,
              tunnelUrl,
              secret,
              expiresInSeconds: payload.expires_in || payload.expiresInSeconds || 300,
              qrPayload,
              source: base.includes("vercel.app") ? "cloud" : "local",
              apiBaseUrl: base,
            };
          }
        } catch {
          // Continua para o próximo endpoint candidato
        }
      }
      return null;
    };

    let resolvedData = await tryFetchInit();

    // 2. Se não respondeu e estiver em modo local, tenta iniciar o backend local
    if (!resolvedData && serverMode === "local") {
      try {
        await invoke("start_local_backend");
      } catch {
        // Ignora
      }

      setStatusMessage("Iniciando serviço Charlie API local (porta 8005)... Aguarde alguns instantes.");

      for (let attempt = 1; attempt <= 8; attempt++) {
        await new Promise((r) => setTimeout(r, 1200));
        resolvedData = await tryFetchInit();
        if (resolvedData) {
          setStatusMessage(null);
          break;
        }
      }
    }

    if (resolvedData) {
      setData(resolvedData);
      setSecondsRemaining(resolvedData.expiresInSeconds);
      setStatusMessage(null);
    } else {
      setData(null);
      setStatusMessage(
        serverMode === "local"
          ? "Servidor Charlie API local (porta 8005) não detectado. Execute 'run_desktop.bat' ou inicie com 'uv run python -m api.main'."
          : "Não foi possível conectar ao servidor Charlie na nuvem. Verifique sua conexão com a internet ou teste o status em Configurações > Servidor & Nuvem."
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initPairing();
  }, [initPairing]);

  // Contagem regressiva de expiração
  useEffect(() => {
    if (!data || isPaired || secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data, isPaired, secondsRemaining]);

  // Polling ativo de pareamento
  useEffect(() => {
    if (!data || isPaired || secondsRemaining <= 0) return;
    const interval = setInterval(async () => {
      try {
        const base = (data.apiBaseUrl || getApiBase()).replace(/\/+$/, "");
        const res = await fetch(`${base}/pair/status?id=${data.pairingId}&pin=${data.pin}`);
        if (res.ok) {
          const status = await res.json();
          if (status.paired) {
            setIsPaired(true);
            setPairedDevice(status.device);
            if (!soundPlayedRef.current) {
              soundPlayedRef.current = true;
              playPairSuccessSound();
            }
          }
        }
      } catch {
        // Ignora erros transitórios
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [data, isPaired, secondsRemaining]);

  const handleCopyPin = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const qrPayloadString = data ? JSON.stringify(data.qrPayload) : "";

  return (
    <div className={`space-y-5 animate-fade-in ${isModal ? "p-1" : ""}`}>
      {/* Cabeçalho da Aba */}
      {!isModal && (
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Pareamento com Dispositivo Mobile</span>
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Conecte seu celular Android ou iOS para controle remoto, telemetria de hardware e chat unificado.
            </p>
          </div>
          <button
            type="button"
            onClick={initPairing}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer"
            title="Atualizar credenciais de pareamento"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Gerar Novo Código</span>
          </button>
        </div>
      )}

      {/* Alerta de status ou aviso */}
      {statusMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-zinc-400">Gerando credenciais criptográficas de pareamento...</p>
        </div>
      ) : isPaired ? (
        <div className="flex flex-col items-center justify-center py-10 gap-4 text-center rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center animate-scale-up">
            <Check className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-base font-bold text-zinc-100">Dispositivo Conectado com Sucesso!</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-md">
              {pairedDevice?.device_name
                ? `${pairedDevice.device_name} (${pairedDevice.platform || "Mobile"}) agora possui acesso autenticado em tempo real a este computador.`
                : "Seu smartphone agora possui acesso autenticado ao Charlie e ao controle remoto."}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={initPairing}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition cursor-pointer"
            >
              Parear Outro Celular
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-indigo-600/30"
              >
                Concluir
              </button>
            )}
          </div>
        </div>
      ) : secondsRemaining <= 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center rounded-2xl bg-rose-500/5 border border-rose-500/20 p-6">
          <p className="text-xs text-rose-400 font-medium">Esta sessão de pareamento expirou por segurança (TTL de 5 min).</p>
          <button
            type="button"
            onClick={initPairing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow-md"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Gerar Novo Código de Pareamento</span>
          </button>
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center rounded-2xl bg-amber-500/5 border border-amber-500/20 p-6">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <div>
            <h4 className="text-sm font-bold text-zinc-100">Serviço Local Charlie API Offline</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-md">
              A porta 8005 não está respondendo. Certifique-se de que o backend Python foi iniciado com{' '}
              <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">run_desktop.bat</code> ou{' '}
              <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">uv run python -m api.main</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={initPairing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow-md mt-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Coluna 1: QR Code */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#0D0F12] border border-white/[0.08] text-center space-y-3">
            <div className="p-4 rounded-xl bg-white shadow-xl">
              {qrPayloadString ? (
                <QRCodeSVG
                  value={qrPayloadString}
                  size={175}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <div className="w-[175px] h-[175px] flex items-center justify-center bg-zinc-100 rounded text-zinc-400 text-xs">
                  Carregando QR Code...
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">
                Escanear com o Celular
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Abra o app Charlie Mobile, vá na aba de pareamento e aponte a câmera.
              </p>
            </div>
          </div>

          {/* Coluna 2: Código PIN e Informações de Rede */}
          <div className="flex flex-col justify-between p-5 rounded-2xl bg-[#0D0F12] border border-white/[0.08] space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium">Código PIN de 6 Dígitos:</span>
                <span className="text-indigo-400 font-mono text-[11px] font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Expira em {timerDisplay}
                </span>
              </div>

              {/* Caixa do PIN */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#161A22] border border-white/[0.08] shadow-inner">
                <span className="font-mono text-2xl font-extrabold tracking-widest text-zinc-100">
                  {data?.formattedPin || data?.pin || "···-···"}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status do Polling */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping shrink-0" />
                <span>Aguardando conexão do celular via QR Code ou PIN...</span>
              </div>
            </div>

            {/* Metadados de Conectividade */}
            <div className="space-y-2 pt-3 border-t border-white/[0.06] text-[11px] text-zinc-400">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Endereço LAN:</span>
                </div>
                <span className="font-mono text-zinc-200">{data?.lanUrl || "Detectando..."}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Modo de Rota:</span>
                </div>
                <span className="font-medium text-zinc-200">
                  {data?.source === "local" ? "Direto Local (LAN)" : data?.source === "cloud" ? "Ponto de Pareamento Nuvem" : "Rede Local Direta"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Segurança:</span>
                </div>
                <span className="text-zinc-300">Troca de Chaves HMAC (32-bytes)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instruções Rápidas de Configuração */}
      {!isModal && (
        <div className="p-4 rounded-xl border border-white/[0.06] bg-zinc-900/40 space-y-2">
          <span className="text-xs font-semibold text-zinc-200 block">
            Como funciona o pareamento:
          </span>
          <ol className="list-decimal list-inside text-[11px] text-zinc-400 space-y-1 leading-relaxed">
            <li>Abra o aplicativo <strong>Charlie Mobile</strong> no seu smartphone (Android ou iPhone).</li>
            <li>No topo da tela inicial ou nas opções, toque no botão <strong>Conectar Desktop</strong>.</li>
            <li>Aponte a câmera para o QR Code acima ou digite os 6 dígitos do código PIN.</li>
            <li>O pareamento é concluído instantaneamente com chave criptografada persistida no seu celular.</li>
          </ol>
        </div>
      )}
    </div>
  );
};
