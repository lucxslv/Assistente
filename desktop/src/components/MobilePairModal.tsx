import React, { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Smartphone, Check, Copy, RefreshCw, Wifi, Globe, ShieldCheck } from "lucide-react";

interface MobilePairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PairingData {
  pin: string;
  token: string;
  name: string;
  lanUrl: string;
  tunnelUrl?: string;
  availableIps: string[];
  expiresInSeconds: number;
  qrPayload: {
    type: "charlie-pair";
    name: string;
    lanUrl: string;
    tunnelUrl?: string;
    token: string;
    pin: string;
  };
}

export const MobilePairModal: React.FC<MobilePairModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300);

  const initPairing = useCallback(async () => {
    setLoading(true);
    setIsPaired(false);
    try {
      const res = await fetch("http://127.0.0.1:8005/api/pair/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Desktop Charlie" }),
      });
      if (res.ok) {
        const payload: PairingData = await res.json();
        setData(payload);
        setSecondsRemaining(payload.expiresInSeconds || 300);
      }
    } catch (e) {
      console.error("Falha ao inicializar pareamento:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      initPairing();
    } else {
      setData(null);
      setIsPaired(false);
    }
  }, [isOpen, initPairing]);

  // Contagem regressiva
  useEffect(() => {
    if (!isOpen || !data || isPaired || secondsRemaining <= 0) return;
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
  }, [isOpen, data, isPaired, secondsRemaining]);

  // Polling de status para confirmar quando o mobile conecta
  useEffect(() => {
    if (!isOpen || !data || isPaired || secondsRemaining <= 0) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8005/api/pair/status?pin=${data.pin}`);
        if (res.ok) {
          const status = await res.json();
          if (status.paired) {
            setIsPaired(true);
          }
        }
      } catch {
        // Ignora erros de polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isOpen, data, isPaired, secondsRemaining]);

  if (!isOpen) return null;

  const formattedPin = data?.pin
    ? `${data.pin.slice(0, 3)} - ${data.pin.slice(3, 6)}`
    : "--- ---";

  const handleCopyPin = () => {
    if (data?.pin) {
      navigator.clipboard.writeText(data.pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#262D3D] bg-[#12161F] p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-[#212736]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Conectar App Mobile</h2>
              <p className="text-xs text-slate-400">Escaneie o QR Code ou digite o PIN no seu celular</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-[#1E2433] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm">Gerando sessão de pareamento segura...</p>
          </div>
        ) : isPaired ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse">
              <Check className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Dispositivo Mobile Conectado!</h3>
              <p className="text-sm text-slate-400 mt-1">
                Seu smartphone já está pareado com controle remoto nativo e sincronia em tempo real.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/30"
            >
              Concluir
            </button>
          </div>
        ) : secondsRemaining <= 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-sm text-amber-400 font-medium">O código de pareamento expirou por segurança.</p>
            <button
              onClick={initPairing}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Gerar Novo Código
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {/* Grid QR Code + PIN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#0B0E14] border border-[#1E2433] shadow-inner">
                {data && (
                  <div className="p-3 bg-white rounded-xl shadow-lg">
                    <QRCodeSVG
                      value={JSON.stringify(data.qrPayload)}
                      size={168}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                )}
                <span className="text-[11px] text-slate-400 font-medium mt-3 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                  Sessão Criptografada
                </span>
              </div>

              {/* Código PIN */}
              <div className="flex flex-col justify-center space-y-4">
                <div>
                  <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                    Código Numérico (PIN)
                  </span>
                  <div className="mt-2 flex items-center justify-between p-3.5 rounded-xl bg-[#0B0E14] border border-[#212736]">
                    <span className="font-mono text-2xl font-black text-indigo-400 tracking-widest">
                      {formattedPin}
                    </span>
                    <button
                      onClick={handleCopyPin}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors"
                      title="Copiar PIN"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    <span>LAN: <strong className="text-slate-300 font-mono">{data?.lanUrl}</strong></span>
                  </div>
                  {data?.tunnelUrl && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-sky-400" />
                      <span>Túnel: <strong className="text-slate-300 font-mono truncate max-w-[180px]">{data.tunnelUrl}</strong></span>
                    </div>
                  )}
                </div>

                <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Expira em: <strong className="text-amber-400 font-mono">{timeFormatted}</strong></span>
                  <button
                    onClick={initPairing}
                    className="flex items-center gap-1 text-indigo-400 hover:underline hover:text-indigo-300"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Atualizar
                  </button>
                </div>
              </div>
            </div>

            {/* Instruções */}
            <div className="p-3.5 rounded-xl bg-[#0E121B] border border-[#1C2230] text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Como parear:</p>
              <p>1. Abra o app Charlie no seu smartphone Android ou iOS.</p>
              <p>2. No topo da Home, toque no badge de conexão ou selecione Conectar.</p>
              <p>3. Aponte a câmera para o QR Code acima ou digite o PIN de 6 dígitos.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
