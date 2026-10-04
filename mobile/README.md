# Charlie Mobile

Cliente React Native do ecossistema Charlie, feito para rodar diretamente no Expo Go. Ele consome a API FastAPI existente e não substitui os clientes `desktop/` ou `web-chat/`.

## Executar

```powershell
cd mobile
npm install
Copy-Item .env.example .env
npx expo start
```

Para testar no celular físico, computador e telefone devem estar na mesma LAN. Troque `EXPO_PUBLIC_API_URL` por `http://SEU_IPV4:8005/api`, inicie o backend com:

```powershell
uv run uvicorn api.main:app --host 0.0.0.0 --port 8005
```

Em seguida, reinicie o bundler com `npx expo start --clear`. `localhost` e `127.0.0.1` apontam para o telefone dentro do Expo Go e, por isso, não alcançam o computador.

## Dependências Expo Go

As versões no `package.json` correspondem ao Expo SDK 57. Para alinhar versões depois de um upgrade de SDK:

```powershell
npx expo install expo-router expo-secure-store expo-haptics expo-status-bar react-native-safe-area-context react-native-screens @expo/vector-icons
npx expo install --check
```

## Telas

- **Chat**: WebSocket autenticado para tokens e eventos; REST como fallback. O serviço inclui parser SSE para redes que ofereçam `ReadableStream`.
- **Conversas**: threads e histórico persistidos no backend.
- **Agente**: cria objetivos e controla sessão ativa por polling do estado do runtime.
- **Ferramentas**: lista schemas e executa ferramentas autorizadas pelo backend.
- **Ajustes**: troca a API sem recompilar, mostra telemetria e encerra a sessão segura.
