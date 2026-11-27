// Configuracion de Metro (el empaquetador de Expo).
// Para ver la app en el navegador (npm run web), expo-sqlite carga un archivo .wasm y Metro
// necesita saber que es un recurso. No cambia nada en la app del celular.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
