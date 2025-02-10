import { internal, geom, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { El } from './gui-el';
import { fromWebMercator, scaleToZoom } from './gui-dynamic-crs';
import { setLoggingForGUI } from './gui-proxy';
import { getDatasetCrsInfo } from './gui-display-utils';

function loadScript(url, cb) {
  var script = document.createElement('script');
  script.onload = cb;
  script.src = url;
  document.head.appendChild(script);
}

function loadStylesheet(url) {
  var el = document.createElement('link');
  el.rel = 'stylesheet';
  el.type = 'text/css';
  el.media = 'screen';
  el.href = url;
  document.head.appendChild(el);
}

export function Basemap(gui) {
  var menu = gui.container.findChild('.basemap-options');
  var fadeBtn = new SimpleButton(menu.findChild('.fade-btn'));
  var closeBtn = new SimpleButton(menu.findChild('.close2-btn'));
  var clearBtn = new SimpleButton(menu.findChild('.clear-btn'));
  var menuButtons = menu.findChild('.basemap-styles');
  var overlayButtons = gui.container.findChild('.basemap-overlay-buttons');
  var container = gui.container.findChild('.basemap-container');
  var basemapBtn = gui.container.findChild('.basemap-btn');
  var basemapNote = gui.container.findChild('.basemap-note');
  var basemapWarning = gui.container.findChild('.basemap-warning');
  var mapEl = gui.container.findChild('.basemap');
  var extentNote = El('div').addClass('basemap-prompt').appendTo(container).hide();
  var params = window.mapboxParams;
  var map;
  var activeStyle;
  var loading = false;
  var faded = false;

  if (params) {
    //  TODO: check page URL for compatibility with mapbox key
    init();
  } else {
    basemapBtn.hide();
  }

  function init() {
    gui.addMode('basemap', turnOn, turnOff, basemapBtn);

    closeBtn.on('click', function() {
      gui.clearMode();
      turnOff();
    });

    clearBtn.on('click', function() {
      if (activeStyle) {
        turnOffBasemap();
        updateButtons();
        closeMenu();
      }
    });

    fadeBtn.on('click', function() {
      if (faded) {
        mapEl.css('opacity', 1);
        faded = false;
        fadeBtn.text('Fade');
      } else if (activeStyle) {
        mapEl.css('opacity', 0.35);
        faded = true;
        fadeBtn.text('Unfade');
      }
    });

    gui.model.on('update', onUpdate);

    gui.on('map_click', function() {
      // close menu if user click on the map
      if (gui.getMode() == 'basemap') gui.clearMode();
    });

    params.styles.forEach(function(style) {
      El('div')
      .html(`<div class="basemap-style-btn"><img src="${style.icon}"></img></div><div class="basemap-style-label">${style.name}</div>`)
      .appendTo(menuButtons)
      .findChild('.basemap-style-btn').on('click', onClick);

      El('div').addClass('basemap-overlay-btn basemap-style-btn')
        .html(`<img src="${style.icon}"></img>`).on('click', onClick)
        .appendTo(overlayButtons);

      function onClick() {
        if (overlayButtons.hasClass('disabled')) return;
        if (style == activeStyle) {
          turnOffBasemap();
        } else {
          showBasemap(style);
        }
        updateButtons();
        closeMenu();
      }
    });
  }

  // close and turn off mode
  function closeMenu() {
    setTimeout(function() {
      gui.clearMode();
    }, 200);
  }

  function turnOffBasemap() {
    activeStyle = null;
    gui.map.setDisplayCRS(null);
    refresh();
  }

  function showBasemap(style) {
    activeStyle = style;
  
    if (map) {
      if (style.type === 'vector') {
        const rasterLayerId = 'satellite';
        if (map.getLayer(rasterLayerId)) {
          map.removeLayer(rasterLayerId);
        }
        if (map.getSource(rasterLayerId)) {
          map.removeSource(rasterLayerId);
        }
        map.remove();  
        map = null;
        initMap();    
      } else if (style.type === 'raster') {
        const rasterLayerId = 'satellite';
        if (map.getLayer(rasterLayerId)) {
          map.removeLayer(rasterLayerId);
        }
        if (map.getSource(rasterLayerId)) {
          map.removeSource(rasterLayerId);
        }
  
        map.addSource(rasterLayerId, {
          type: 'raster',
          tiles: [style.url],
          tileSize: style.tileSize || 256
        });
  
        map.addLayer({
          id: rasterLayerId,
          type: 'raster',
          source: rasterLayerId
        });
  
        refresh();
      }
    } else if (prepareMapView()) {
      initMap();
    }
  }

  function updateButtons() {
    menuButtons.findChildren('.basemap-style-btn').forEach(function(el, i) {
      el.classed('active', params.styles[i] == activeStyle);
    });
    overlayButtons.findChildren('.basemap-style-btn').forEach(function(el, i) {
      el.classed('active', params.styles[i] == activeStyle);
    });
  }

  function turnOn() {
    onUpdate();
    menu.show();
  }

  function onUpdate() {
    var activeLyr = gui.model.getActiveLayer(); // may be null
    var info = getDatasetCrsInfo(activeLyr?.dataset); // defaults to wgs84
    var dataCRS = info.crs || null;
    var displayCRS = gui.map.getDisplayCRS();
    var warning, note;


    if (!dataCRS || !displayCRS || !crsIsUsable(displayCRS) || !crsIsUsable(dataCRS)) {
      warning = 'This data is incompatible with the basemaps.';
      if (!internal.layerHasGeometry(activeLyr.layer)) {
        warning += ' Reason: layer is missing geographic data';
      } else if (!dataCRS) {
        warning += ' Reason: unknown projection.';
      }
      basemapWarning.html(warning).show();
      basemapNote.hide();
      overlayButtons.addClass('disabled');
      activeStyle = null;
      updateButtons();
    } else {
      note = `Your data ${activeStyle ? 'is' : 'will be'} displayed using the Mercator projection.`;
      basemapNote.text(note).show();
      overlayButtons.show();
      overlayButtons.removeClass('disabled');
    }
  }

  function turnOff() {
    basemapWarning.hide();
    basemapNote.hide();
    menu.hide();
  }

  function enabled() {
    return !!(mapEl && params);
  }

  function show() {
    gui.container.addClass('basemap-on');
    mapEl.node().style.display = 'block';
  }

  function hide() {
    gui.container.removeClass('basemap-on');
    mapEl.node().style.display = 'none';
  }

  function getLonLatBounds() {
    var ext = gui.map.getExtent();
    var bbox = ext.getBounds().toArray();
    var bbox2 = fromWebMercator(bbox[0], bbox[1])
        .concat(fromWebMercator(bbox[2], bbox[3]));
    return bbox2;
  }

  function initMap() {
    if (!enabled() || map || loading) return;
    loading = true;
  
    loadStylesheet(params.css);
    loadScript(params.js, function() {
      const defaultStyle = params.styles.find(style => style.id === 'streets'); // Set default style to 'streets'
      map = new window.mapboxgl.Map({
        accessToken: params.key,
        logoPosition: 'bottom-left',
        container: mapEl.node(),
        style: defaultStyle.url,
        bounds: getLonLatBounds(),
        doubleClickZoom: false,
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        interactive: false,
        keyboard: false,
        maxPitch: 0,
        renderWorldCopies: true
      });

      map.on('load', function() {
        loading = false;
  
        if (activeStyle.type === 'raster') {
          // For raster layers (openstreetmap, satellite)
          map.addSource(activeStyle.id, {
            type: 'raster',
            tiles: [activeStyle.url],
            tileSize: activeStyle.tileSize || 256
          });
  
          map.addLayer({
            id: activeStyle.id,
            type: 'raster',
            source: activeStyle.id
          });
  
        } else if (activeStyle.type === 'vector') {
          // For vector basemap (streets)
          map.setStyle(activeStyle.url);
        }
  
        refresh();
      });
    });
  }

  // @bbox: latlon bounding box of current map extent
  function checkBounds(bbox) {
    var ext = gui.map.getExtent();
    var mpp = ext.getBounds().width() / ext.width();
    var z = scaleToZoom(mpp);
    var msg;
    if (bbox[1] >= -85 && bbox[3] <= 85 && z <= 20) {
      extentNote.hide();
      return true;
    }
    if (z > 20) {
      msg = 'zoom out';
    } else if (bbox[1] > 0) {
      msg = 'pan south';
    } else if (bbox[3] < 0) {
      msg = 'pan north';
    } else {
      msg = msg = 'zoom in';
    }
    extentNote.html(msg + ' to see the basemap').show();
    return false;
  }

  function crsIsUsable(crs) {
    if (!crs) return false;
    if (!internal.isInvertibleCRS(crs)) return false;
    return true;
  }

  function prepareMapView() {
    var crs = gui.map.getDisplayCRS();
    if (!crs) return false;
    if (!internal.isWebMercator(crs)) {
      gui.map.setDisplayCRS(internal.parseCrsString('webmercator'));
    }
    return true;
  }

  function refresh() {
    var crs = gui.map.getDisplayCRS();
    var off = !crs || !enabled() || !map || loading || !activeStyle;
    fadeBtn.active(!off);
    clearBtn.active(!off);
    if (off) {
      hide();
      extentNote.hide();
      return;
    }

    prepareMapView();
    var bbox = getLonLatBounds();
    if (!checkBounds(bbox)) {
      // map does not display outside these bounds
      hide();
    } else {
      show();
      map.resize();
      map.fitBounds(bbox, {animate: false});
    }
  }

  return {refresh, show: onUpdate};
}
