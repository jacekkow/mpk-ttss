var ttss_refresh = 10000; // 10 seconds
var ttss_position_type = 'CORRECTED';

var trams_xhr = null;
var trams_timer = null;
var trams_last_update = 0;
var trams_source = null;
var trams_layer = null;

var buses_xhr = null;
var buses_timer = null;
var buses_last_update = 0;
var buses_source = null;
var buses_layer = null;

var vehicles_info = {};

var stops_xhr = null;
var stops_source = null;
var stops_layer = null;
var stop_points_source = null;
var stop_points_layer = null;

var feature_clicked = null;
var feature_selected = [];
var feature_xhr = null;
var feature_timer = null;

var route_source = null;
var route_layer = null;

var map = null;
var popup_element = document.getElementById('popup');
var popup_close_callback;
var fail_element = document.getElementById('fail');

var ignore_hashchange = false;

function fail(msg) {
	setText(fail_element, msg);
	fail_element.style.top = '0.5em';
}

function fail_popup(msg) {
	addElementWithText(popup_element, 'p', msg).className = 'error';
}

function fail_ajax_generic(data, fnc) {
	// abort() is not a failure
	if(data.readyState == 0 && data.statusText == 'abort') return;
	
	if(data.status == 0) {
		fnc(lang.error_request_failed_connectivity, data);
	} else if (data.statusText) {
		fnc(lang.error_request_failed_status.replace('$status', data.statusText), data);
	} else {
		fnc(lang.error_request_failed, data);
	}
}

function fail_ajax(data) {
	fail_ajax_generic(data, fail);
}

function fail_ajax_popup(data) {
	fail_ajax_generic(data, fail_popup);
}

function getGeometry(object) {
	return new ol.geom.Point(ol.proj.fromLonLat([object.longitude / 3600000.0, object.latitude / 3600000.0]));
}

function styleVehicle(vehicle, selected) {
	var color_type = 'black';
	if(vehicle.get('vehicle_type')) {
		switch(vehicle.get('vehicle_type').low) {
			case 0:
				color_type = 'orange';
			break;
			case 1:
			case 2:
				color_type = 'green';
			break;
		}
	}
	
	var fill = '#B70';
	if(vehicle.getId().startsWith('b')) {
		fill = '#05B';
	}
	if(selected) {
		fill = '#292';
	}
	
	var image = '<svg xmlns="http://www.w3.org/2000/svg" height="30" width="20"><polygon points="10,0 20,23 0,23" style="fill:'+fill+';stroke:'+color_type+';stroke-width:3" /></svg>';
	
	return new ol.style.Style({
		image: new ol.style.Icon({
			src: 'data:image/svg+xml;base64,' + btoa(image),
			rotation: Math.PI * parseFloat(vehicle.get('heading') ? vehicle.get('heading') : 0) / 180.0,
		}),
		text: new ol.style.Text({
			font: 'bold 10px sans-serif',
			text: vehicle.get('line'),
			fill: new ol.style.Fill({color: 'white'}),
		}),
	});
}

function styleStop(stop, selected) {
	var fill = '#FA0';
	var stroke = '#B70';
	var stroke_selected = '#F00';
	var stroke_width = 1;
	var radius = 3;
	
	if(stop.get('category') == 'bus') {
		fill = '#07F';
		stroke = '#05B';
	}
	
	if(selected == 2) {
		radius = 5;
	} else if(selected) {
		stroke = stroke_selected;
		stroke_width = 2;
		radius = 5;
	}
	
	return new ol.style.Style({
		image: new ol.style.Circle({
			fill: new ol.style.Fill({color: fill}),
			stroke: new ol.style.Stroke({color: stroke, width: stroke_width}),
			radius: radius,
		}),
	});
}

function styleFeature(feature, selected) {
	if(!feature) return;
	if(!feature.getId()) return;
	
	var style = null;
	
	switch(feature.getId().substr(0, 1)) {
		case 't':
		case 'b':
			style = styleVehicle(feature, selected);
		break;
		
		case 's':
		case 'p':
			style = styleStop(feature, selected);
		break;
	}
	
	feature.setStyle(style);
	if(selected) {
		feature_selected.push(feature);
	}
}

function unstyleSelectedFeatures() {
	for(var i = 0; i < feature_selected.length; i++) {
		styleFeature(feature_selected[i]);
	}
	feature_selected = [];
}

function updateTrams() {
	if(trams_timer) clearTimeout(trams_timer);
	if(trams_xhr) trams_xhr.abort();
	trams_xhr = $.get(
		ttss_trams_base + '/geoserviceDispatcher/services/vehicleinfo/vehicles'
			+ '?positionType=' + ttss_position_type
			+ '&colorType=ROUTE_BASED'
			+ '&lastUpdate=' + encodeURIComponent(trams_last_update)
	).done(function(data) {
		trams_last_update = data.lastUpdate;
		
		for(var i = 0; i < data.vehicles.length; i++) {
			var vehicle = data.vehicles[i];
			
			var vehicle_feature = trams_source.getFeatureById('t' + vehicle.id);
			if(vehicle.isDeleted) {
				if(vehicle_feature) {
					trams_source.removeFeature(vehicle_feature);
					if(feature_clicked && feature_clicked.getId() === vehicle_feature.getId()) {
						featureClicked();
					}
				}
				continue;
			}
			
			var vehicle_name_space = vehicle.name.indexOf(' ');
			vehicle.line = vehicle.name.substr(0, vehicle_name_space);
			vehicle.direction = vehicle.name.substr(vehicle_name_space+1);
			if(special_directions[vehicle.direction]) {
				vehicle.line = special_directions[vehicle.direction];
			}
			
			vehicle.geometry = getGeometry(vehicle);
			vehicle.vehicle_type = parseVehicle('t' + vehicle.id);
			
			if(!vehicle_feature) {
				vehicle_feature = new ol.Feature(vehicle);
				vehicle_feature.setId('t' + vehicle.id);
				
				styleFeature(vehicle_feature);
				trams_source.addFeature(vehicle_feature);
			} else {
				vehicle_feature.setProperties(vehicle);
				vehicle_feature.getStyle().getImage().setRotation(Math.PI * parseFloat(vehicle.heading ? vehicle.heading : 0) / 180.0);
			}
		}
		
		trams_timer = setTimeout(function() {
			updateTrams();
		}, ttss_refresh);
	}).fail(fail_ajax);
	
	return trams_xhr;
}

function updateBuses() {
	if(buses_timer) clearTimeout(buses_timer);
	if(buses_xhr) buses_xhr.abort();
	
	buses_xhr = $.get(
		ttss_buses_base + '/geoserviceDispatcher/services/vehicleinfo/vehicles'
			+ '?positionType=RAW'
			+ '&colorType=ROUTE_BASED'
			+ '&lastUpdate=' + encodeURIComponent(buses_last_update)
	).done(function(data) {
		buses_last_update = data.lastUpdate;
		
		for(var i = 0; i < data.vehicles.length; i++) {
			var vehicle = data.vehicles[i];
			
			var vehicle_feature = buses_source.getFeatureById('b' + vehicle.id);
			if(vehicle.isDeleted || !vehicle.latitude || !vehicle.longitude) {
				if(vehicle_feature) {
					buses_source.removeFeature(vehicle_feature);
					if(feature_clicked && feature_clicked.getId() === vehicle_feature.getId()) {
						featureClicked();
					}
				}
				continue;
			}
			
			var vehicle_name_space = vehicle.name.indexOf(' ');
			vehicle.line = vehicle.name.substr(0, vehicle_name_space);
			vehicle.direction = vehicle.name.substr(vehicle_name_space+1);
			if(special_directions[vehicle.direction]) {
				vehicle.line = special_directions[vehicle.direction];
			}
			
			vehicle.geometry = getGeometry(vehicle);
			vehicle.vehicle_type = parseVehicle('b' + vehicle.id);
			
			if(!vehicle_feature) {
				vehicle_feature = new ol.Feature(vehicle);
				vehicle_feature.setId('b' + vehicle.id);
				
				styleFeature(vehicle_feature);
				buses_source.addFeature(vehicle_feature);
			} else {
				vehicle_feature.setProperties(vehicle);
				vehicle_feature.getStyle().getImage().setRotation(Math.PI * parseFloat(vehicle.heading) / 180.0);
			}
		}
		
		buses_timer = setTimeout(function() {
			updateBuses();
		}, ttss_refresh);
	}).fail(fail_ajax);
	
	return buses_xhr;
}

function updateStopSource(stops, prefix, source) {
	for(var i = 0; i < stops.length; i++) {
		var stop = stops[i];
		
		if(stop.category == 'other') continue;
		
		stop.geometry = getGeometry(stop);
		var stop_feature = new ol.Feature(stop);
		
		stop_feature.setId(prefix + stop.id);
		styleFeature(stop_feature);
		
		source.addFeature(stop_feature);
	}
}

function updateStops(base, suffix) {
	return $.get(
		base + '/geoserviceDispatcher/services/stopinfo/stops'
			+ '?left=-648000000'
			+ '&bottom=-324000000'
			+ '&right=648000000'
			+ '&top=324000000'
	).done(function(data) {
		updateStopSource(data.stops, 's' + suffix, stops_source);
	}).fail(fail_ajax);
}

function updateStopPoints(base, suffix) {
	return $.get(
		base + '/geoserviceDispatcher/services/stopinfo/stopPoints'
			+ '?left=-648000000'
			+ '&bottom=-324000000'
			+ '&right=648000000'
			+ '&top=324000000'
	).done(function(data) {
		updateStopSource(data.stopPoints, 'p' + suffix, stop_points_source);
	}).fail(fail_ajax);
}

function vehicleTable(tripId, table, featureId) {
	if(feature_xhr) feature_xhr.abort();
	if(feature_timer) clearTimeout(feature_timer);
	
	var url = ttss_trams_base;
	if(featureId.startsWith('b')) {
		url = ttss_buses_base;
	}
	
	var vehicleId = featureId.substr(1);
	
	feature_xhr = $.get(
		url + '/services/tripInfo/tripPassages'
			+ '?tripId=' + encodeURIComponent(tripId)
			+ '&mode=departure'
	).done(function(data) {
		if(!data.routeName || !data.directionText) {
			return;
		}
		
		deleteChildren(table);
		
		for(var i = 0, il = data.old.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.old[i].actualTime || data.old[i].plannedTime);
			addCellWithText(tr, data.old[i].stop_seq_num + '. ' + data.old[i].stop.name);
			
			tr.className = 'active';
			table.appendChild(tr);
		}
		
		unstyleSelectedFeatures();
		styleFeature(feature_clicked, true);
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].actualTime || data.actual[i].plannedTime);
			addCellWithText(tr, data.actual[i].stop_seq_num + '. ' + data.actual[i].stop.name);
			
			styleFeature(stops_source.getFeatureById('s' + data.actual[i].stop.id), 2);
			
			if(data.actual[i].status == 'STOPPING') {
				tr.className = 'success';
			}
			table.appendChild(tr);
		}
		
		feature_timer = setTimeout(function() { vehicleTable(tripId, table, featureId); }, ttss_refresh);
		
		if(!vehicleId) return;
	       
		feature_xhr = $.get(
			url + '/geoserviceDispatcher/services/pathinfo/vehicle'
				+ '?id=' + encodeURIComponent(vehicleId)
		).done(function(data) {
			if(!data || !data.paths || !data.paths[0] || !data.paths[0].wayPoints) return;
			
			var point = null;
			var points = [];
			for(var i = 0; i < data.paths[0].wayPoints.length; i++) {
				point = data.paths[0].wayPoints[i];
				points.push(ol.proj.fromLonLat([
					point.lon / 3600000.0,
					point.lat / 3600000.0,
				]));
			}
			
			route_source.addFeature(new ol.Feature({
				geometry: new ol.geom.LineString(points)
			}));
		});
	}).fail(fail_ajax_popup);
}

function stopTable(stopType, stopId, table, featureId) {
	if(feature_xhr) feature_xhr.abort();
	if(feature_timer) clearTimeout(feature_timer);
	
	var url = ttss_trams_base;
	if(featureId.substr(1,1) == 'b') {
		url = ttss_buses_base;
	}
	
	feature_xhr = $.get(
		url + '/services/passageInfo/stopPassages/' + stopType
			+ '?' + stopType + '=' + encodeURIComponent(stopId)
			+ '&mode=departure'
	).done(function(data) {
		deleteChildren(table);
		
		for(var i = 0, il = data.old.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.old[i].patternText);
			var dir_cell = addCellWithText(tr, data.old[i].direction);
			var vehicle = parseVehicle(data.old[i].vehicleId);
			dir_cell.appendChild(displayVehicle(vehicle));
			var status = parseStatus(data.old[i]);
			addCellWithText(tr, status);
			addCellWithText(tr, '');
			
			tr.className = 'active';
			table.appendChild(tr);
		}
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].patternText);
			var dir_cell = addCellWithText(tr, data.actual[i].direction);
			var vehicle = parseVehicle(data.actual[i].vehicleId);
			dir_cell.appendChild(displayVehicle(vehicle));
			var status = parseStatus(data.actual[i]);
			var status_cell = addCellWithText(tr, status);
			var delay = parseDelay(data.actual[i]);
			var delay_cell = addCellWithText(tr, delay);
			
			if(status == lang.boarding_sign) {
				tr.className = 'success';
				status_cell.className = 'status-boarding';
			} else if(parseInt(delay) > 9) {
				tr.className = 'danger';
				delay_cell.className = 'status-delayed';
			} else if(parseInt(delay) > 3) {
				tr.className = 'warning';
			}
			
			table.appendChild(tr);
		}
		
		feature_timer = setTimeout(function() { stopTable(stopType, stopId, table, featureId); }, ttss_refresh);
	}).fail(fail_ajax_popup);
}

function showPanel(contents, closeCallback) {
	var old_callback = popup_close_callback;
	popup_close_callback = null;
	if(old_callback) old_callback();
	popup_close_callback = closeCallback;
	
	deleteChildren(popup_element);
	
	var close = addParaWithText(popup_element, '×');
	close.className = 'close';
	close.addEventListener('click', function() { hidePanel(); });
	
	popup_element.appendChild(contents);
	
	$(popup_element).addClass('show');
}

function hidePanel() {
	var old_callback = popup_close_callback;
	popup_close_callback = null;
	if(old_callback) old_callback();
	
	$(popup_element).removeClass('show');
}

function featureClicked(feature) {
	if(feature && !feature.getId()) return;
	
	unstyleSelectedFeatures();
	route_source.clear();
	
	if(!feature) {
		hidePanel();
		return;
	}
	
	var coordinates = feature.getGeometry().getCoordinates();
	
	var div = document.createElement('div');
	
	var type;
	var name = feature.get('name');
	var additional;
	var table = document.createElement('table');
	var thead = document.createElement('thead');
	var tbody = document.createElement('tbody');
	table.appendChild(thead);
	table.appendChild(tbody);
	
	switch(feature.getId().substr(0, 1)) {
		case 't':
		case 'b':
			type = lang.type_tram;
			if(feature.getId().startsWith('b')) {
				type = lang.type_bus;
			}
			
			var span = displayVehicle(feature.get('vehicle_type'));
			
			additional = document.createElement('p');
			if(span.title) {
				setText(additional, span.title);
			} else {
				setText(additional, feature.getId());
			}
			additional.insertBefore(span, additional.firstChild);
			
			addElementWithText(thead, 'th', lang.header_time);
			addElementWithText(thead, 'th', lang.header_stop);
			
			vehicleTable(feature.get('tripId'), tbody, feature.getId());
		break;
		case 's':
			type = lang.type_stop_tram;
			if(feature.getId().startsWith('sb')) {
				type = lang.type_stop_bus;
			}
			
			addElementWithText(thead, 'th', lang.header_line);
			addElementWithText(thead, 'th', lang.header_direction);
			addElementWithText(thead, 'th', lang.header_time);
			addElementWithText(thead, 'th', lang.header_delay);
			
			stopTable('stop', feature.get('shortName'), tbody, feature.getId());
		break;
		case 'p':
			type = lang.type_stoppoint_tram;
			if(feature.getId().startsWith('pb')) {
				type = lang.type_stoppoint_bus;
			}
			
			additional = document.createElement('p');
			additional.className = 'small';
			addElementWithText(additional, 'a', lang.departures_for_stop).addEventListener(
				'click',
				function() {
					featureClicked(stops_source.forEachFeature(function(stop_feature) {
						if(stop_feature.get('shortName') == feature.get('shortName') && stop_feature.getId().substr(1,1) == feature.getId().substr(1,1)) {
							return stop_feature;
						}
					}));
				}
			);
			
			addElementWithText(thead, 'th', lang.header_line);
			addElementWithText(thead, 'th', lang.header_direction);
			addElementWithText(thead, 'th', lang.header_time);
			addElementWithText(thead, 'th', lang.header_delay);
			
			stopTable('stopPoint', feature.get('stopPoint'), tbody, feature.getId());
		break;
	}
	
	var loader = addElementWithText(tbody, 'td', lang.loading);
	loader.className = 'active';
	loader.colSpan = thead.childNodes.length;
	
	addParaWithText(div, type).className = 'type';
	addParaWithText(div, name).className = 'name';
	
	if(additional) {
		div.appendChild(additional);
	}
	
	div.appendChild(table);
	
	styleFeature(feature, true);
	
	setTimeout(function () {map.getView().animate({
		center: feature.getGeometry().getCoordinates(),
	}) }, 10);
	
	ignore_hashchange = true;
	window.location.hash = '#!' + feature.getId();
	
	showPanel(div, function() {
		if(!ignore_hashchange) {
			ignore_hashchange = true;
			window.location.hash = '';
			
			feature_clicked = null;
			unstyleSelectedFeatures();
			route_source.clear();
			
			if(feature_xhr) feature_xhr.abort();
			if(feature_timer) clearTimeout(feature_timer);
		}
	});
	
	feature_clicked = feature;
}

function hash() {
	if(ignore_hashchange) {
		ignore_hashchange = false;
		return;
	}
	
	var depotId = null;
	
	var tramId = null;
	var busId = null;
	var stopId = null;
	var stopPointId = null;
	
	var feature = null;
	
	if(window.location.hash.match(/^#!t[0-9]{3}$/)) {
		depotId = parseInt(window.location.hash.substr(3));
	} else if(window.location.hash.match(/^#![A-Za-z]{2}[0-9]{3}$/)) {
		depotId = parseInt(window.location.hash.substr(4));
	} else if(window.location.hash.match(/^#!v-?[0-9]+$/)) {
		tramId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!t-?[0-9]+$/)) {
		tramId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!b-?[0-9]+$/)) {
		busId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!s[0-9]+$/)) {
		stopId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!p-?[0-9]+$/)) {
		stopPointId = window.location.hash.substr(3);
	} else if(window.location.hash == '#!RAW') {
		ttss_position_type = 'RAW';
	}
	
	if(depotId) {
		tramId = tramIdToVehicleId(depotId);
	}
	
	if(tramId) {
		feature = trams_source.getFeatureById('t' + tramId);
	} else if(busId) {
		feature = buses_source.getFeatureById('b' + busId);
	} else if(stopId) {
		feature = stops_source.getFeatureById('s' + stopId);
	} else if(stopPointId) {
		feature = stop_points_source.getFeatureById('p' + stopPointId);
	}
	
	featureClicked(feature);
}

function getDistance(c1, c2) {
	if(c1.getGeometry) {
		c1 = c1.getGeometry().getCoordinates();
	}
	if(c2.getGeometry) {
		c2 = c2.getGeometry().getCoordinates();
	}
	
	var c1 = ol.proj.transform(c1, 'EPSG:3857', 'EPSG:4326');
	var c2 = ol.proj.transform(c2, 'EPSG:3857', 'EPSG:4326');
	return ol.sphere.getDistance(c1, c2);
}

function returnClosest(point, f1, f2) {
	if(!f1) return f2;
	if(!f2) return f1;
	
	return (getDistance(point, f1) < getDistance(point, f2)) ? f1 : f2;
}

function init() {
	if(!window.jQuery) {
		fail(lang.jquery_not_loaded);
		return;
	}
	
	$.ajaxSetup({
		dataType: 'json',
		timeout: 10000,
	});
	
	stops_source = new ol.source.Vector({
		features: [],
	});
	stops_layer = new ol.layer.Vector({
		source: stops_source,
	});
	
	stop_points_source = new ol.source.Vector({
		features: [],
	});
	stop_points_layer = new ol.layer.Vector({
		source: stop_points_source,
		visible: false,
	});
	
	trams_source = new ol.source.Vector({
		features: [],
	});
	trams_layer = new ol.layer.Vector({
		source: trams_source,
	});
	
	buses_source = new ol.source.Vector({
		features: [],
	});
	buses_layer = new ol.layer.Vector({
		source: buses_source,
	});
	
	route_source = new ol.source.Vector({
		features: [],
	});
	route_layer = new ol.layer.Vector({
		source: route_source,
		style: new ol.style.Style({
			stroke: new ol.style.Stroke({ color: [255, 153, 0, .8], width: 5 })
		}),
	});
	
	map = new ol.Map({
		target: 'map',
		layers: [
			new ol.layer.Tile({
				source: new ol.source.OSM()
			}),
			route_layer,
			stops_layer,
			stop_points_layer,
			buses_layer,
			trams_layer,
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([19.94, 50.06]),
			zoom: 13
		}),
		controls: ol.control.defaults({
			attributionOptions: ({
				collapsible: false,
			})
		}).extend([
			new ol.control.Control({
				element: document.getElementById('title'),
			}),
			new ol.control.Control({
				element: fail_element,
			})
		]),
		loadTilesWhileAnimating: true,
	});
	
	// Display popup on click
	map.on('singleclick', function(e) {
		var point = e.coordinate;
		var features = [];
		map.forEachFeatureAtPixel(e.pixel, function(feature) { if(feature.getId()) features.push(feature); });
		
		if(features.length > 1) {
			var div = document.createElement('div');
			
			addParaWithText(div, lang.select_feature);
			
			for(var i = 0; i < features.length; i++) {
				var feature = features[i];
				
				var p = document.createElement('p');
				var a = document.createElement('a');
				p.appendChild(a);
				a.addEventListener('click', function(feature) { return function() {
					featureClicked(feature);
				}}(feature));
				
				var type = '';
				switch(feature.getId().substr(0, 1)) {
					case 't':
					case 'b':
						type = lang.type_tram;
						if(feature.getId().startsWith('b')) {
							type = lang.type_bus;
						}
						if(feature.get('vehicle_type').num) {
							type += ' ' + feature.get('vehicle_type').num;
						}
					break;
					case 's':
						type = lang.type_stop_tram;
						if(feature.getId().startsWith('sb')) {
							type = lang.type_stop_bus;
						}
					break;
					case 'p':
						type = lang.type_stoppoint_tram;
						if(feature.getId().startsWith('pb')) {
							type = lang.type_stoppoint_bus;
						}
					break;
				}
				
				addElementWithText(a, 'span', type).className = 'small';
				a.appendChild(document.createTextNode(' '));
				addElementWithText(a, 'span', feature.get('name'));
				
				div.appendChild(p);
			}
			
			showPanel(div);
			
			return;
		}
		
		var feature = features[0];
		if(!feature) {
			if(stops_layer.getVisible()) {
				feature = returnClosest(point, feature, stops_source.getClosestFeatureToCoordinate(point));
			}
			if(stop_points_layer.getVisible()) {
				feature = returnClosest(point, feature, stop_points_source.getClosestFeatureToCoordinate(point));
			}
			if(trams_layer.getVisible()) {
				feature = returnClosest(point, feature, trams_source.getClosestFeatureToCoordinate(point));
			}
			if(buses_layer.getVisible()) {
				feature = returnClosest(point, feature, buses_source.getClosestFeatureToCoordinate(point));
			}
			
			if(getDistance(point, feature) > 200) {
				feature = null;
			}
		}
		
		featureClicked(feature);
	});
	
	fail_element.addEventListener('click', function() {
		fail_element.style.top = '-10em';
	});
	
	// Change mouse cursor when over marker
	map.on('pointermove', function(e) {
		var hit = map.hasFeatureAtPixel(e.pixel);
		var target = map.getTargetElement();
		target.style.cursor = hit ? 'pointer' : '';
	});
	
	// Change layer visibility on zoom
	map.getView().on('change:resolution', function(e) {
		stop_points_layer.setVisible(map.getView().getZoom() >= 16);
	});
	
	$.when(
		updateVehicleInfo(),
		updateTrams(),
		updateBuses(),
		updateStops(ttss_trams_base, 't'),
		updateStops(ttss_buses_base, 'b'),
		updateStopPoints(ttss_trams_base, 't'),
		updateStopPoints(ttss_buses_base, 'b'),
	).done(function() {
		hash();
	});
	
	window.addEventListener('hashchange', hash);
	
	setTimeout(function() {
		if(trams_xhr) trams_xhr.abort();
		if(trams_timer) clearTimeout(trams_timer);
		if(buses_xhr) buses_xhr.abort();
		if(buses_timer) clearTimeout(buses_timer);
		  
		fail(lang.error_refresh);
	}, 1800000);
}

init();
