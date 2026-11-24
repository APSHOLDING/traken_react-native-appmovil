// Variante de PRUEBAS: con TRAKEN_VARIANTE=pruebas (variable del entorno
// `preview` de EAS) la app se instala aparte de la de producción, con otro
// identificador y otro nombre, así un teléfono puede tener las dos. Esa
// variante habla con el sandbox (traken.mx/sandbox) y la de producción con
// traken.mx (src/config/environment.ts). Sin la variable (builds locales y
// producción) queda tal cual app.json.
const ID_PRUEBAS = 'mx.apsholding.traken.pruebas';

module.exports = ({ config }) => {
  if (process.env.TRAKEN_VARIANTE !== 'pruebas') return config;
  return {
    ...config,
    name: 'Traken Pruebas',
    android: { ...config.android, package: ID_PRUEBAS },
    ios: { ...config.ios, bundleIdentifier: ID_PRUEBAS },
  };
};
