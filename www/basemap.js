window.mapboxParams = {
  js: 'https://api.mapbox.com/mapbox-gl-js/v2.11.1/mapbox-gl.js',
  css: 'https://api.mapbox.com/mapbox-gl-js/v2.11.1/mapbox-gl.css',
  production_key: 'pk.eyJ1IjoiZ3JhbW1hdGEiLCJhIjoiY21jZ2RlbGk1MGhvNzJrcHV2dTYzZWE2byJ9.btkRnRrPW75c0AlQ5lH2cg',
  localhost_key: 'pk.eyJ1IjoiZ3JhbW1hdGEiLCJhIjoiY21jZ2Rna2hrMGo2ZjJqcHFxMHAycDlyMSJ9.q8FchhB-NAN_FGBHN0AJeg',
  styles: [
    {
      id: 'streets',
      name: 'Streets',
      icon: 'images/thumb-streets.jpg',
      type: 'vector',
      url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
    },
    {
      id: 'openstreetmap',
      name: 'OpenStreetMap',
      icon: 'images/thumb-openstreetmap.jpg',
      type: 'raster',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tileSize: 256
    },
    {
      id: 'satellite',
      name: 'Satellite',
      icon: 'images/thumb-satellite.jpg',
      type: 'raster',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      tileSize: 256
    },
  ]
};
