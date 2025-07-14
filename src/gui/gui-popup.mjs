import { EventDispatcher } from './gui-events';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import { openAddFieldPopup } from './gui-add-field-popup';

// toNext, toPrev: trigger functions for switching between multiple records
export function Popup(gui, toNext, toPrev) {
  var self = new EventDispatcher();
  var parent = gui.container.findChild('.mshp-main-map');
  var el = El('div').addClass('popup').appendTo(parent).hide();
  var content = El('div').addClass('popup-content').appendTo(el);
  // multi-hit display and navigation
  var tab = El('div').addClass('popup-tab').appendTo(el).hide();
  var nav = El('div').addClass('popup-nav').appendTo(tab);
  var prevLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('◀');
  var navInfo = El('span').addClass('popup-nav-info').appendTo(nav);
  var nextLink = El('span').addClass('popup-nav-arrow colored-text').appendTo(nav).text('▶');
  var refresh;

  el.addClass('rollover'); // used as a sentinel for the hover function

  nextLink.on('click', toNext);
  prevLink.on('click', toPrev);
  gui.on('popup-needs-refresh', function() {
    if (refresh) refresh();
  });

  self.show = function(id, ids, lyr, pinned, edit) {
    var singleEdit = edit || pinned && !internal.layerHasAttributeData(lyr);
    var multiEdit = pinned && gui.interaction.getMode() == 'selection';
    var maxHeight = parent.node().clientHeight - 36;

    // stash a function for refreshing the current popup when data changes
    // while the popup is being displayed (e.g. while dragging a label)
    refresh = function() {
      render(id, ids, lyr, pinned, singleEdit || multiEdit);
    };
    refresh();
    if (multiEdit) {
      showRecords(ids.length);
    } else if (ids && ids.length > 1 && !multiEdit) {
      showNav(id, ids, pinned);
    } else {
      tab.hide();
    }
    el.show();
    if (content.node().clientHeight > maxHeight) {
      content.css('height:' + maxHeight + 'px');
    }
  };

  self.hide = function() {
    if (!isOpen()) return;
    refresh = null;
    // make sure any pending edits are made before re-rendering popup
    GUI.blurActiveElement(); // this should be more selective -- could cause a glitch if typing in console
    content.empty();
    content.node().removeAttribute('style'); // remove inline height
    el.hide();
  };

  return self;

  function isOpen() {
    return el.visible();
  }

  function showRecords(n) {
    navInfo.text(n);
    nextLink.css('display','none');
    prevLink.css('display','none');
    tab.show();
  }

  function showNav(id, ids, pinned) {
    var num = ids.indexOf(id) + 1;
    navInfo.text(' ' + num + ' / ' + ids.length + ' ');
    nextLink.css('display', pinned ? 'inline-block' : 'none');
    prevLink.css('display', pinned && ids.length > 2 ? 'inline-block' : 'none');
    tab.show();
  }

  function render(id, ids, lyr, pinned, editable) {
    var recIds = id >= 0 ? [id] : ids;
    var el = content;
    var table = lyr.data; // table can be null (e.g. if layer has no attribute data)
    var tableEl = table ? renderTable(recIds, table, editable) : null;
    el.empty(); // clean up if panel is already open
    if (tableEl) {
      tableEl.appendTo(el);
      tableEl.on('copy', function(e) {
        // remove leading or trailing tabs that sometimes get copied when
        // selecting from a table
        var pasted = window.getSelection().toString();
        var cleaned = pasted.replace(/^\t/, '').replace(/\t$/, '');
        if (pasted != cleaned && !window.clipboardData) { // ignore ie
          (e.clipboardData || e.originalEvent.clipboardData).setData("text", cleaned);
          e.preventDefault(); // don't copy original string with tabs
        }
      });
    } else {
      // Some individual features can have undefined values for some or all of
      // their data properties (properties are set to undefined when an input JSON file
      // has inconsistent fields, or after force-merging layers with inconsistent fields).
      el.html(utils.format('<div class="note">This %s is missing attribute data.</div>',
          table && table.getFields().length > 0 ? 'feature': 'layer'));
    }

    var footer = El('div').appendTo(el);
    if (editable) {
      // render "add field" button
      El('span').addClass('add-field-btn').appendTo(footer).on('click', async function(e) {
        // show "add field" dialog
        openAddFieldPopup(gui, recIds, lyr);
      }).text('+ add field');
    } else if (pinned) {
      // render "Click to edit" button
      El('span').addClass('edit-data-btn').appendTo(footer).on('click', async function(e) {
        self.show(id, ids, lyr, true, true);
      }).text('▸ click to edit');
    }
  }

  function renderTable(recIds, table, editable) {
    var tableEl = El('table').addClass('selectable');
    var rows = 0;
    var rec;
    if (recIds.length == 1) {
      rec = editable ?
        table.getReadOnlyRecordAt(recIds[0]) :
        table.getRecordAt(recIds[0]);
    } else {
      rec = getMultiRecord(recIds, table);
    }
    rec = rec || {};
    // Check if there's a cycleway field at all
    if ('cycleway' in rec) {
        var rowEl = renderRow('cycleway', rec['cycleway'], recIds, table, editable);
        if (rowEl) {
            rowEl.appendTo(tableEl);
            rows++;
        }
    }    
    return rows > 0 ? tableEl : null;
  }

  function getMultiRecord(recIds, table) {
    var fields = table.getFields();
    var rec = {};
    recIds.forEach(function(id) {
      var d = table.getRecordAt(id) || {};
      var k, v;
      for (var i=0; i<fields.length; i++) {
        k = fields[i];
        v = d[k];
        if (k in rec === false) {
          rec[k] = v;
        } else if (rec[k] !== v) {
          rec[k] = null;
        }
      }
    });
    return rec;
  }


  function renderRow(key, val, recIds, table, editable) {
    // Only render row if field name is 'cycleway'
    if (key !== 'cycleway') return null;
    var type = getFieldType(val, key, table);
    var str = formatInspectorValue(val, type);
    var rowHtml = `<td class="field-name">${key}</td><td><span class="value">${utils.htmlEscape(str)}</span> </td>`;
    var rowEl = El('tr').html(rowHtml);
    var cellEl = rowEl.findChild('.value');
    setFieldClass(cellEl, val, type);
    if (editable) {
      editItem(cellEl, key, val, recIds, table, type);
    }
    return rowEl;
  }

  function setFieldClass(el, val, type) {
    var isNum = type ? type == 'number' : utils.isNumber(val);
    var isNully = val === undefined || val === null || val !== val;
    var isEmpty = val === '';
    el.classed('num-field', isNum);
    el.classed('object-field', type == 'object');
    el.classed('null-value', isNully);
    el.classed('empty', isEmpty);
  }

  function editItem(el, key, val, recIds, table, type) {
    var input = new ClickText2(el),
        strval = formatInspectorValue(val, type),
        parser = internal.getInputParser(type);
    el.parent().addClass('editable-cell');
    el.addClass('colored-text dot-underline');
    input.on('change', function(e) {
      var val2 = parser(input.value()),
          strval2 = formatInspectorValue(val2, type);
      if (val2 === null && type != 'object') { // allow null objects
        // invalid value; revert to previous value
        input.value(strval);
      } else if (strval != strval2) {
        // field content has changed
        strval = strval2;
        gui.dispatchEvent('data_preupdate', {ids: recIds}); // for undo/redo
        // rec[key] = val2;
        updateRecords(recIds, key, val2, table);
        gui.dispatchEvent('data_postupdate', {ids: recIds});
        input.value(strval);
        setFieldClass(el, val2, type);
        self.dispatchEvent('data_updated', {field: key, value: val2, ids: recIds});
      }
    });
  }
}

function updateRecords(ids, f, v, table) {
  var records = table.getRecords();
  ids.forEach(function(id) {
    var d = records[id] || {};
    d[f] = v;
    records[id] = d;
  });
}

function formatInspectorValue(val, type) {
  var str;
  if (type == 'date') {
    str = utils.formatDateISO(val);
  } else if (type == 'object') {
    str = val ? JSON.stringify(val) : "";
  } else {
    str = String(val);
  }
  return str;
}


function getFieldType(val, key, table) {
  // if a field has a null value, look at entire column to identify type
  return internal.getValueType(val) || internal.getColumnType(key, table.getRecords()) ;
}
