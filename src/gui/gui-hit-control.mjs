import { getPointerHitTest } from './gui-hit-test';
import { utils } from './gui-core';
import { EventDispatcher } from './gui-events';
import { GUI } from './gui-lib';
import { El } from './gui-el';
import { internal } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';

export function HitControl(gui, ext, mouse) {
  var self = new EventDispatcher();
  var storedData = noHitData(); // may include additional data from SVG symbol hit (e.g. hit node)
  var selectionIds = [];
  var transientIds = []; // e.g. hit ids while dragging a box
  var drawingId = -1; // kludge to allow hit detection and drawing (different feature ids)
  var active = false;
  var targetLayer;
  var hitTest;
  var pinnedOn; // used in multi-edit mode (selection) for toggling pinning behavior

  // event priority is higher than navigation, so stopping propagation disables
  // pan navigation
  var priority = 2;

  mouse.on('contextmenu', function(e) {
    e.originalEvent.preventDefault();
    if (El('body').hasClass('map-view')) {
      triggerPointerEvent('contextmenu', e);
    }
  });

  // init keyboard controls for pinned features
  gui.keyboard.on('keydown', function(evt) {
    var e = evt.originalEvent;

    if (gui.interaction.getMode() == 'off' || !targetLayer) return;

    // esc key clears selection (unless in an editing mode -- esc key also exits current mode)
    if (e.keyCode == 27 && !gui.getMode()) {
      self.clearSelection();
      return;
    }

    // ignore keypress if no feature is selected or user is editing text
    if (pinnedId() == -1 || GUI.textIsSelected()) return;

    if (e.keyCode == 37 || e.keyCode == 39) {
      // L/R arrow keys
      // advance pinned feature
      advanceSelectedFeature(e.keyCode == 37 ? -1 : 1);
      e.stopPropagation();

    } else if (e.keyCode == 8) {
      // DELETE key
      // delete pinned feature
      // to help protect against inadvertent deletion, don't delete
      // when console is open or a popup menu is open
      if (!gui.getMode() && !gui.consoleIsOpen()) {
        internal.deleteFeatureById(targetLayer, pinnedId());
        self.clearSelection();
        gui.model.updated({flags: 'filter'}); // signal map to update
      }
    }
  }, !!'capture'); // preempt the layer control's arrow key handler

  self.setLayer = function(mapLayer) {
    targetLayer = mapLayer;
    updateHitTest();
  };

  function updateHitTest(featureFilter) {
    hitTest = getPointerHitTest(targetLayer, ext, interactionMode(), featureFilter);
  }

  function interactionMode() {
    return gui.interaction.getMode();
  }

  function turnOn(mode) {
    active = true;
    updateHitTest();
  }

  function turnOff() {
    if (active) {
      updateSelectionState(null); // no hit data, no event
      active = false;
      hitTest = null;
      pinnedOn = false;
      drawingId = -1;
    }
  }

  function selectable() {
    return interactionMode() == 'selection';
  }

  function pinnable() {
    return clickable() && !selectable();
    // return clickable();
  }

  function draggable() {
    var mode = interactionMode();
    return mode == 'vertices' || mode == 'edit_points' ||
      mode == 'labels' || mode == 'edit_lines' || mode == 'edit_polygons';
  }

  function clickable() {
    var mode = interactionMode();
    // click used to pin popup and select features
    return mode == 'data' || mode == 'info' || mode == 'selection' ||
    mode == 'rectangles' || mode == 'edit_points';
  }

  self.getHitId = function() {
    return hitTest ? storedData.id : -1;
  };

  self.setHitId = function(id) {
    if (storedData.id == id) return;
    storedData.id = id;
    storedData.ids = id == -1 ? [] : [id];
    triggerChangeEvent();
  };

  // Get a reference to the active layer, so listeners to hit events can interact
  // with data and shapes
  self.getHitTarget = function() {
    return targetLayer;
  };

  self.addSelectionIds = function(ids) {
    turnOn('selection');
    selectionIds = utils.uniq(selectionIds.concat(ids));
    ids = utils.uniq(storedData.ids.concat(ids));
    updateSelectionState({ids: ids});
  };

  self.setPinning = function(val) {
    if (pinnedOn != val) {
      pinnedOn = val;
      triggerChangeEvent();
    }
  };

  self.setTransientIds = function(ids) {
    // turnOn('selection');
    transientIds = ids || [];
    if (active) {
      triggerChangeEvent();
    }
  };

  // manually set the selected feature id(s)
  // used when hit detection is turned off, e.g. 'drawing' mode
  self.setDrawingId = function(id) {
    if (id == drawingId) return;
    drawingId = id >= 0 ? id : -1;
    updateHitTest(function(shpId) {
      return shpId != id;
    });
    self.triggerChangeEvent();
  };

  self.triggerChangeEvent = triggerChangeEvent;

  self.getHitState = getHitState;

  self.clearDrawingId = function() {
    self.setDrawingId(-1);
  };

  self.setHoverVertex = function(p, type) {
    var p2 = storedData.hit_coordinates;
    if (!active || !p) return;
    if (p2 && p2[0] == p[0] && p2[1] == p[1]) return;
    storedData.hit_coordinates = p;
    storedData.hit_type = type || '';
    triggerChangeEvent();
  };

  self.clearHoverVertex = function() {
    if (!storedData.hit_coordinates) return;
    delete storedData.hit_coordinates;
    delete storedData.hit_type;
    triggerChangeEvent();
  };

  self.clearSelection = function() {
    updateSelectionState(null);
  };

  self.clearHover = function() {
    updateSelectionState(mergeHoverData({ids: []}));
  };

  self.getSelectionIds = function() {
    return selectionIds.concat();
  };

  self.getTargetDataTable = function() {
    var targ = self.getHitTarget();
    return targ?.data || null;
  };

  // get function for selecting next or prev feature within the current set of
  // selected features
  self.getSwitchTrigger = function(diff) {
    return function() {
      switchWithinSelection(diff);
    };
  };

  // diff: 1 or -1
  function advanceSelectedFeature(diff) {
    var n = internal.getFeatureCount(targetLayer);
    if (n < 2 || pinnedId() == -1) return;
    storedData.id = (pinnedId() + n + diff) % n;
    storedData.ids = [storedData.id];
    triggerChangeEvent();
  }

  // diff: 1 or -1
  function switchWithinSelection(diff) {
    var id = pinnedId();
    var i = storedData.ids.indexOf(id);
    var n = storedData.ids.length;
    if (i < 0 || n < 2) return;
    storedData.id = storedData.ids[(i + diff + n) % n];
    triggerChangeEvent();
  }

  // make sure popup is unpinned and turned off when switching editing modes
  // (some modes do not support pinning)
  gui.on('interaction_mode_change', function(e) {
    self.clearSelection();
    if (gui.interaction.modeUsesHitDetection(e.mode)) {
      turnOn(e.mode);
    } else {
      turnOff();
    }
  });

  gui.on('undo_redo_pre', function() {
    self.clearSelection();
  });

  gui.on('shift_drag_start', function() {
    self.clearHover();
  });

  mouse.on('dblclick', handlePointerEvent, null, priority);
  mouse.on('dragstart', handlePointerEvent, null, priority);
  mouse.on('drag', handlePointerEvent, null, priority);
  mouse.on('dragend', handlePointerEvent, null, priority);

  mouse.on('click', function(e) {
    var pinned = storedData.pinned;
    if (!hitTest || !active) return;
    if (!eventIsEnabled('click')) return;
    e.stopPropagation();

    // TODO: move pinning to inspection control?
    if (clickable()) {
      updateSelectionState(convertClickDataToSelectionData(hitTest(e)));
    }

    if (pinned && interactionMode() == 'edit_points') {
      // kludge: intercept the click event if popup is turning off, so
      // a new point doesn't get made
      return;
    }
    triggerPointerEvent('click', e);
  }, null, priority);

  // Hits are re-detected on 'hover' (if hit detection is active)
  mouse.on('hover', function(e) {
    if (gui.contextMenu.isOpen()) return;
    handlePointerEvent(e);
    if (storedData.pinned || !hitTest || !active) return;
    if (e.hover && isOverMap(e)) {
      // mouse is hovering directly over map area -- update hit detection
      updateSelectionState(mergeHoverData(hitTest(e)));
    } else if (targetIsRollover(e.originalEvent.target)) {
      // don't update hit detection if mouse is over the rollover (to prevent
      // on-off flickering)
    } else {
      updateSelectionState(mergeHoverData({ids:[]}));
    }
  }, null, priority);


  function targetIsRollover(target) {
    while (target.parentNode && target != target.parentNode) {
      if (target.className && String(target.className).indexOf('rollover') > -1) {
        return true;
      }
      target = target.parentNode;
    }
    return false;
  }

  function noHitData() {return {ids: [], id: -1, pinned: false};}

  // Translates feature hit data from a mouse click into feature selection data
  // hitData: hit data from a mouse click
  function convertClickDataToSelectionData(hitData) {
    // mergeCurrentState(hitData);
    // TOGGLE pinned state under some conditions
    var id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
    hitData.id = id;
    if (pinnable()) {
      if (!storedData.pinned && id > -1) {
        hitData.pinned = true; // add pin
      } else if (storedData.pinned && storedData.id == id) {
        delete hitData.pinned; // remove pin
        // hitData.id = -1; // keep highlighting (pointer is still hovering)
      } else if (storedData.pinned && id > -1) {
        hitData.pinned = true; // stay pinned, switch id
      }
    }
    if (selectable()) {
      if (id > -1) {
        selectionIds = toggleId(id, selectionIds);
      }
      hitData.ids = selectionIds;
    }
    return hitData;
  }

  function mergeSelectionModeHoverData(hitData) {
      if (hitData.ids.length === 0 || selectionIds.includes(hitData.ids[0])) {
        hitData.ids = selectionIds;
        hitData.pinned = storedData.pinned;
      } else {
        //
      }

      // kludge to inhibit hover effect while dragging a box
      if (gui.keydown) hitData.id = -1;
      return hitData;
  }

  function mergeHoverData(hitData) {
    if (storedData.pinned) {
      hitData.id = storedData.id;
      hitData.pinned = true;
    } else {
      hitData.id = hitData.ids.length > 0 ? hitData.ids[0] : -1;
    }
    if (selectable()) {
      hitData.ids = selectionIds;
      // kludge to inhibit hover effect while dragging a box
      if (gui.keydown) hitData.id = -1;
    }
    return hitData;
  }

  function pinnedId() {
    return storedData.pinned ? storedData.id : -1;
  }

  function toggleId(id, ids) {
    if (ids.indexOf(id) > -1) {
      return utils.difference(ids, [id]);
    }
    return [id].concat(ids);
  }

  // If hit ids have changed, update stored hit ids and fire 'hover' event
  // evt: (optional) mouse event
  function updateSelectionState(newData) {
    var nonEmpty = newData && (newData.ids.length || newData.id > -1);
    transientIds = [];
    if (!newData) {
      newData = noHitData();
      selectionIds = [];
    }

    if (!testHitChange(storedData, newData)) {
      return;
    }

    storedData = newData;
    gui.container.findChild('.map-layers').classed('symbol-hit', nonEmpty);
    if (active) {
      triggerChangeEvent();
    }
  }

  // check if an event is used in the current interaction mode
  function eventIsEnabled(type) {
    var mode = interactionMode();
    if (!active) return false;
    if (type == 'click' && gui.keyboard.ctrlIsPressed()) {
      return false; // don't fire if context menu might open
    }
    if (type == 'click' && gui.contextMenu.isOpen()) {
      return false;
    }
    if (type == 'click' &&
      (mode == 'edit_lines' || mode == 'edit_polygons')) {
      return true; // click events are triggered even if no shape is hit
    }
    if (type == 'click' && mode == 'edit_points') {
      return true;
    }
    if ((mode == 'edit_lines' || mode == 'edit_polygons') &&
        (type == 'hover' || type == 'dblclick')) {
      return true; // special case -- using hover for line drawing animation
    }

    // ignore pointer events when no features are being hit
    // (don't block pan and other navigation when events aren't being used for editing)
    var hitId = self.getHitId();
    if (hitId == -1) return false;

    if ((type == 'drag' || type == 'dragstart' || type == 'dragend') && !draggable()) {
      return false;
    }
    return true;
  }

  function isOverMap(e) {
    return e.x >= 0 && e.y >= 0 && e.x < ext.width() && e.y < ext.height();
  }

  function possiblyStopPropagation(e) {
    if (interactionMode() == 'edit_lines' || interactionMode() == 'edit_polygons') {
      // handled conditionally in the control
      return;
    }
    e.stopPropagation();
  }

  function handlePointerEvent(e) {
    if (eventIsEnabled(e.type)) {
      possiblyStopPropagation(e);
      triggerPointerEvent(e.type, e);
    }
  }

  function triggerChangeEvent() {
    self.dispatchEvent('change', getHitState());
  }

  // evt: event data (may be a pointer event object, an ordinary object or null)
  function triggerPointerEvent(type, evt) {
    var eventData = getHitState();
    if (evt) {
      // data coordinates
      eventData.projected_coordinates = gui.map.pixelCoordsToProjectedCoords(evt.x, evt.y);
      eventData.lonlat_coordinates = gui.map.pixelCoordsToLngLatCoords(evt.x, evt.y);
      eventData.originalEvent = evt;
      eventData.overMap = isOverMap(evt);
      utils.defaults(eventData, evt.data);
    }
    // utils.defaults(eventData, evt && evt.data || {}, storedData);
    self.dispatchEvent(type, eventData);
  }

  function getHitState() {
    var data = {
      mode: interactionMode()
    };
    // Merge stored hit data into the event data
    utils.defaults(data, storedData);
    if (transientIds.length) {
      // add transient ids to any other hit ids
      data.ids = utils.uniq(transientIds.concat(data.ids || []));
    }
    // when drawing, we want the overlay layer to show the path being currently
    // drawn.
    if (drawingId >= 0) {
      // data.ids = [drawingId];
      // data.id = drawingId;
      data.ids = utils.uniq(data.ids.concat([drawingId]));
    }
    if (pinnedOn) {
      data.pinned = true;
    }
    return data;
  }

  // Test if two hit data objects are equivalent
  function testHitChange(a, b) {
    // check change in 'container', e.g. so moving from anchor hit to label hit
    //   is detected
    if (sameIds(a.ids, b.ids) && a.container == b.container && a.pinned == b.pinned && a.id == b.id) {
      return false;
    }
    return true;
  }

  function sameIds(a, b) {
    if (a.length != b.length) return false;
    for (var i=0; i<a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  return self;
}
