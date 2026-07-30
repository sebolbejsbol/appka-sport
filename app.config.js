// Dynamiczna konfiguracja Expo.
// Bazuje na app.json i wstrzykuje sekretny token pobierania natywnego SDK
// Mapbox (RNMapboxMapsDownloadToken) z zmiennej środowiskowej, dzięki czemu
// sekret NIE jest trzymany w repozytorium. Ustaw go jako sekret w EAS:
//   eas env:create --name RNMapboxMapsDownloadToken --type secret --visibility secret --value sk....
module.exports = ({ config }) => {
  const downloadToken = process.env.RNMapboxMapsDownloadToken;

  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== '@rnmapbox/maps') return plugin;

    const existing = Array.isArray(plugin) ? (plugin[1] ?? {}) : {};
    return [
      '@rnmapbox/maps',
      downloadToken ? { ...existing, RNMapboxMapsDownloadToken: downloadToken } : existing,
    ];
  });

  return { ...config, plugins };
};
