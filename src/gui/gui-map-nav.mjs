import { MouseWheel } from './gui-mouse';
import { Tween } from './gui-tween';
import { Bounds, internal, utils } from './gui-core';
import { initVariableClick } from './gui-mouse-utils';
import { HighlightBox } from './gui-highlight-box';
import { El } from './gui-el';

export function MapNav(gui, ext, mouse) {
  var wheel = new MouseWheel(mouse),
      zoomTween = new Tween(Tween.sineInOut),
      zoomBox = new HighlightBox(gui, {draggable: true, name: 'zoom-box'}), // .addClass('zooming'),
      shiftDrag = false,
      zoomScaleMultiplier = 1,
      panCount = 0,
      inBtn, outBtn,
      dragStartEvt,
      _fx, _fy; // zoom foci, [0,1]

  // Was used in old frame view... remove?
  this.setZoomFactor = function(k) {
    zoomScaleMultiplier = k || 1;
  };

  this.zoomToBbox = zoomToBbox;

  if (gui.options.homeControl) {
    gui.buttons.addButton("#home-icon").on('click', function() {
      if (disabled()) return;
      gui.dispatchEvent('map_reset');
    });
  }

  if (gui.options.zoomControl) {
    inBtn = gui.buttons.addButton("#zoom-in-icon");
    outBtn = gui.buttons.addButton("#zoom-out-icon");
    initVariableClick(inBtn.node(), zoomIn);
    initVariableClick(outBtn.node(), zoomOut);
    ext.on('change', function() {
      inBtn.classed('disabled', ext.scale() >= ext.maxScale());
    });
  }

  gui.on('map_reset', function() {
    ext.reset(true);
  });

  zoomTween.on('change', function(e) {
    ext.zoomToExtent(e.value, _fx, _fy);
  });

  mouse.on('click', function(e) {
    gui.dispatchEvent('map_click', e);
  });

  mouse.on('dblclick', function(e) {
    if (disabled()) return;
    zoomByPct(getZoomInPct(), e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    if (disabled()) return;
    // allow drawing rectangles if active layer is empty
    // var lyr = gui.model.getActiveLayer()?.layer;
    // if (lyr && !internal.layerHasGeometry(lyr)) return;
    shiftDrag = !!e.shiftKey;
    panCount = 0;
    if (shiftDrag) {
      if (useBoxZoom()) zoomBox.turnOn();
      dragStartEvt = e;
      gui.dispatchEvent('shift_drag_start');
    }
  });

  mouse.on('drag', function(e) {
    if (disabled()) return;
    if (shiftDrag) {
      gui.dispatchEvent('shift_drag', getBoxData(e, dragStartEvt));
      return;
    }
    if (++panCount == 1) {
      El('body').addClass('pan');
      setTimeout(function() {
        var body = El('body');
        if (body.hasClass('pan')) {
          body.addClass('panning');
        }
      }, 100);
    }
    ext.pan(e.dx, e.dy);
  });

  mouse.on('dragend', function(e) {
    var bbox;
    if (disabled()) return;
    if (shiftDrag) {
      shiftDrag = false;
      gui.dispatchEvent('shift_drag_end', getBoxData(e, dragStartEvt));
      zoomBox.turnOff();
    } else {
      El('body').removeClass('panning').removeClass('pan');
    }
  });

  zoomBox.on('dragend', function(e) {
    zoomToBbox(e.map_bbox);
  });

  wheel.on('mousewheel', function(e) {
    var tickFraction = 0.11; // 0.15; // fraction of zoom step per wheel event;
    var k = 1 + (tickFraction * e.multiplier * zoomScaleMultiplier),
        delta = e.direction > 0 ? k : 1 / k;
    if (disabled()) return;
    ext.zoomByPct(delta, e.x / ext.width(), e.y / ext.height());
  });

  function useBoxZoom() {
    var mode = gui.getMode();
    return !'selection_tool,box_tool,rectangle_tool,drawing_tool'.includes(mode);
  }

  function getBoxData(e1, e2) {
    return {
      a: [e1.x, e1.y],
      b: [e2.x, e2.y]
    };
  }

  function disabled() {
    return !!gui.options.disableNavigation;
  }

  function zoomIn(e) {
    if (disabled()) return;
    zoomByPct(getZoomInPct(e.time), 0.5, 0.5);
  }

  function zoomOut(e) {
    if (disabled()) return;
    zoomByPct(1/getZoomInPct(e.time), 0.5, 0.5);
  }

  function getZoomInPct(clickTime) {
    var minScale = 0.2,
        maxScale = 4,
        minTime = 100,
        maxTime = 800,
        time = utils.clamp(clickTime || 200, minTime, maxTime),
        k = (time - minTime) / (maxTime - minTime),
        scale = minScale + k * (maxScale - minScale);
    return 1 + scale * zoomScaleMultiplier;
  }

  // @box Bounds with pixels from t,l corner of map area.
  function zoomToBbox(bbox) {
    var bounds = new Bounds(bbox),
        pct = Math.max(bounds.width() / ext.width(), bounds.height() / ext.height()),
        fx = bounds.centerX() / ext.width() * (1 + pct) - pct / 2,
        fy = bounds.centerY() / ext.height() * (1 + pct) - pct / 2;
    zoomByPct(1 / pct, fx, fy);
  }

  // @pct Change in scale (2 = 2x zoom)
  // @fx, @fy zoom focus, [0, 1]
  function zoomByPct(pct, fx, fy) {
    var w = ext.getBounds().width();
    _fx = fx;
    _fy = fy;
    zoomTween.start(w, w / pct, 400);
  }
}
