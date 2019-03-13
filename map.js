"use strict";

var ttss_refresh = 10000; // 10 seconds
var ttss_position_type = 'CORRECTED';

var geolocation = null;
var geolocation_set = 0;
var geolocation_button = null;
var geolocation_feature = null;
var geolocation_accuracy = null;
var geolocation_source = null;
var geolocation_layer = null;

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
var stops_ignored = ['131'];
var stops_style = {
	'sb': new ol.style.Style({
		image: new ol.style.Circle({
			fill: new ol.style.Fill({color: '#07F'}),
			stroke: new ol.style.Stroke({color: '#05B', width: 2}),
			radius: 3,
		}),
	}),
	'st': new ol.style.Style({
		image: new ol.style.Circle({
			fill: new ol.style.Fill({color: '#FA0'}),
			stroke: new ol.style.Stroke({color: '#B70', width: 2}),
			radius: 3,
		}),
	}),
	'pb': new ol.style.Style({
		image: new ol.style.Circle({
			fill: new ol.style.Fill({color: '#07F'}),
			stroke: new ol.style.Stroke({color: '#05B', width: 1}),
			radius: 3,
		}),
	}),
	'pt': new ol.style.Style({
		image: new ol.style.Circle({
			fill: new ol.style.Fill({color: '#FA0'}),
			stroke: new ol.style.Stroke({color: '#B70', width: 1}),
			radius: 3,
		}),
	}),
};
var stops_type = ['st', 'sb', 'pt', 'pb'];
var stops_mapping = {};
var stops_source = {};
var stops_layer = {};

var stop_selected_source = null;
var stop_selected_layer = null;

var feature_clicked = null;
var feature_xhr = null;
var feature_timer = null;

var route_source = null;
var route_layer = null;

var map = null;

var panel = null;

var fail_element = document.getElementById('fail');
var fail_text = document.querySelector('#fail span');

var ignore_hashchange = false;


function Panel(element) {
	this._element = element;
	this._element.classList.add('panel');
	
	this._hide = addParaWithText(this._element, '▶');
	this._hide.title = lang.action_collapse;
	this._hide.className = 'hide';
	this._hide.addEventListener('click', this.toggleExpanded.bind(this));
	
	this._close = addParaWithText(this._element, '×');
	this._close.title = lang.action_close;
	this._close.className = 'close';
	this._close.addEventListener('click', this.close.bind(this));
	
	this._content = document.createElement('div');
	this._element.appendChild(this._content);
};
Panel.prototype = {
	_element: null,
	_hide: null,
	_close: null,
	_content: null,
	
	_closeCallback: null,
	_runCallback: function() {
		var callback = this.closeCallback;
		this.closeCallback = null;
		if(callback) callback();
	},
	
	expand: function() {
		this._element.classList.add('expanded');
		setText(this._hide, '▶');
		this._hide.title = lang.action_collapse;
	},
	collapse: function() {
		this._element.classList.remove('expanded');
		setText(this._hide, '◀');
		this._hide.title = lang.action_expand;
	},
	toggleExpanded: function() {
		if(this._element.classList.contains('expanded')) {
			this.collapse();
		} else {
			this.expand();
		}
	},
	fail: function(message) {
		addParaWithText(this._content, message).className = 'error';
	},
	show: function(contents, closeCallback) {
		this._runCallback();
		this.closeCallback = closeCallback;
		
		deleteChildren(this._content);
		
		this._content.appendChild(contents);
		this._element.classList.add('enabled');
		setTimeout(this.expand.bind(this), 1);
	},
	close: function() {
		this._runCallback();
		this._element.classList.remove('expanded');
		this._element.classList.remove('enabled');
	},
};

function fail(msg) {
	setText(fail_text, msg);
	fail_element.style.top = '0.5em';
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
	fail_ajax_generic(data, panel.fail.bind(panel));
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
	
	vehicle.setStyle(new ol.style.Style({
		image: new ol.style.Icon({
			src: 'data:image/svg+xml;base64,' + btoa(image),
			rotation: Math.PI * parseFloat(vehicle.get('heading') ? vehicle.get('heading') : 0) / 180.0,
		}),
		text: new ol.style.Text({
			font: 'bold 10px sans-serif',
			text: vehicle.get('line'),
			fill: new ol.style.Fill({color: 'white'}),
		}),
	}));
}

function markStops(stops, type, routeStyle) {
	stop_selected_source.clear();
	
	var style = stops_layer['s'+type].getStyle().clone();
	
	if(routeStyle) {
		style.getImage().setRadius(5);
	} else {
		style.getImage().getStroke().setWidth(2);
		style.getImage().getStroke().setColor('#F00');
		style.getImage().setRadius(5);
	}
	
	stop_selected_layer.setStyle(style);
	
	var feature = null;
	var prefix = null;
	for(var i = 0; i < stops.length; i++) {
		feature = null;
		if(stops[i].getId) {
			feature = stops[i];
		} else {
			prefix = stops[i].substr(0,2);
			feature = stops_source[prefix].getFeatureById(stops[i]);
		}
		if(feature) {
			stop_selected_source.addFeature(feature);
		}
	}
	
	stop_selected_layer.setVisible(true);
}

function unstyleSelectedFeatures() {
	stop_selected_source.clear();
	route_source.clear();
	if(feature_clicked && (feature_clicked.getId().startsWith('t') || feature_clicked.getId().startsWith('b'))) {
		styleVehicle(feature_clicked);
	}
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
				
				styleVehicle(vehicle_feature);
				trams_source.addFeature(vehicle_feature);
			} else {
				vehicle_feature.setProperties(vehicle);
				vehicle_feature.getStyle().getImage().setRotation(Math.PI * parseFloat(vehicle.heading ? vehicle.heading : 0) / 180.0);
				vehicle_feature.getStyle().getText().setText(vehicle.line);
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
				
				styleVehicle(vehicle_feature);
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

function updateStopSource(stops, prefix) {
	var source = stops_source[prefix];
	var mapping = stops_mapping[prefix];
	for(var i = 0; i < stops.length; i++) {
		var stop = stops[i];
		
		if(stop.category == 'other') continue;
		if(stops_ignored.indexOf(stop.shortName) >= 0) continue;
		
		stop.geometry = getGeometry(stop);
		var stop_feature = new ol.Feature(stop);
		
		if(prefix.startsWith('p')) {
			mapping[stop.stopPoint] = stop_feature;
		} else {
			mapping[stop.shortName] = stop_feature;
		}
		
		stop_feature.setId(prefix + stop.id);
		
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
		updateStopSource(data.stops, 's' + suffix);
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
		updateStopSource(data.stopPoints, 'p' + suffix);
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
		
		var stopsToMark = [];
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].actualTime || data.actual[i].plannedTime);
			addCellWithText(tr, data.actual[i].stop_seq_num + '. ' + data.actual[i].stop.name);
			
			stopsToMark.push('s' + featureId.substr(0,1) + data.actual[i].stop.id);
			
			if(data.actual[i].status == 'STOPPING') {
				tr.className = 'success';
			}
			table.appendChild(tr);
		}
		
		markStops(stopsToMark, featureId.substr(0,1), true);
		
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
			route_layer.setVisible(true);
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

function featureClicked(feature) {
	if(feature && !feature.getId()) return;
	
	unstyleSelectedFeatures();
	
	if(!feature) {
		panel.close();
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
	
	var tabular_data = true;
	
	switch(feature.getId().substr(0, 1)) {
		case 'l':
			tabular_data = false;
			type = '';
			name = lang.type_location;
		break;
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
			
			styleVehicle(feature, true);
		break;
		case 's':
			type = lang.type_stop_tram;
			var second_type = lang.departures_for_buses;
			var mapping = stops_mapping['sb'];
			if(feature.getId().startsWith('sb')) {
				type = lang.type_stop_bus;
				second_type = lang.departures_for_trams;
				mapping = stops_mapping['st'];
			}
			
			if(mapping[feature.get('shortName')]) {
				additional = document.createElement('p');
				additional.className = 'small';
				addElementWithText(additional, 'a', second_type).addEventListener(
					'click',
					function() {
						featureClicked(mapping[feature.get('shortName')]);
					}
				);
			}
			
			addElementWithText(thead, 'th', lang.header_line);
			addElementWithText(thead, 'th', lang.header_direction);
			addElementWithText(thead, 'th', lang.header_time);
			addElementWithText(thead, 'th', lang.header_delay);
			
			stopTable('stop', feature.get('shortName'), tbody, feature.getId());
			markStops([feature], feature.getId().substr(1,1));
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
					var mapping = stops_mapping['s' + feature.getId().substr(1,1)];
					featureClicked(mapping[feature.get('shortName')]);
				}
			);
			
			addElementWithText(thead, 'th', lang.header_line);
			addElementWithText(thead, 'th', lang.header_direction);
			addElementWithText(thead, 'th', lang.header_time);
			addElementWithText(thead, 'th', lang.header_delay);
			
			stopTable('stopPoint', feature.get('stopPoint'), tbody, feature.getId());
			markStops([feature], feature.getId().substr(1,1));
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
	
	if(tabular_data) {
		div.appendChild(table);
		ignore_hashchange = true;
		window.location.hash = '#!' + feature.getId();
	}
	
	setTimeout(function () {map.getView().animate({
		center: feature.getGeometry().getCoordinates(),
	}) }, 10);
	
	
	panel.show(div, function() {
		if(!ignore_hashchange) {
			ignore_hashchange = true;
			window.location.hash = '';
			
			unstyleSelectedFeatures();
			feature_clicked = null;
			
			if(feature_xhr) feature_xhr.abort();
			if(feature_timer) clearTimeout(feature_timer);
		}
	});
	
	feature_clicked = feature;
}

function mapClicked(e) {
	var point = e.coordinate;
	var features = [];
	map.forEachFeatureAtPixel(e.pixel, function(feature, layer) {
		if(layer == stop_selected_layer) return;
		if(feature.getId()) features.push(feature);
	});
	
	if(features.length > 1) {
		featureClicked();
		
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
				case 'l':
					type = '';
					name = lang.type_location;
				break;
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
		
		panel.show(div);
		
		return;
	}
	
	var feature = features[0];
	if(!feature) {
		stops_type.forEach(function(type) {
			if(stops_layer[type].getVisible()) {
				feature = returnClosest(point, feature, stops_source[type].getClosestFeatureToCoordinate(point));
			}
		});
		if(trams_layer.getVisible()) {
			feature = returnClosest(point, feature, trams_source.getClosestFeatureToCoordinate(point));
		}
		if(buses_layer.getVisible()) {
			feature = returnClosest(point, feature, buses_source.getClosestFeatureToCoordinate(point));
		}
		
		if(getDistance(point, feature) > map.getView().getResolution() * 20) {
			feature = null;
		}
	}
	
	featureClicked(feature);
}

function trackingStop() {
	geolocation_button.classList.remove('clicked');
	geolocation.setTracking(false);
	
	geolocation_source.clear();
}
function trackingStart() {
	geolocation_set = 0;
	geolocation_button.classList.add('clicked');
	geolocation_feature.setGeometry(new ol.geom.Point(map.getView().getCenter()));
	geolocation_accuracy.setGeometry(new ol.geom.Circle(map.getView().getCenter(), 100000));
	
	geolocation_source.addFeature(geolocation_feature);
	geolocation_source.addFeature(geolocation_accuracy);
	
	geolocation.setTracking(true);
}
function trackingToggle() {
	if(geolocation.getTracking()) {
		trackingStop();
	} else {
		trackingStart();
	}
}

function hash() {
	if(ignore_hashchange) {
		ignore_hashchange = false;
		return;
	}
	
	var feature = null;
	var vehicleId = null;
	var stopId = null;
	
	if(window.location.hash.match(/^#!t[0-9]{3}$/)) {
		vehicleId = depotIdToVehicleId(window.location.hash.substr(3), 't');
	} else if(window.location.hash.match(/^#!b[0-9]{3}$/)) {
		vehicleId = depotIdToVehicleId(window.location.hash.substr(3), 'b');
	} else if(window.location.hash.match(/^#![A-Za-z]{2}[0-9]{3}$/)) {
		vehicleId = depotIdToVehicleId(window.location.hash.substr(2));
	} else if(window.location.hash.match(/^#!v-?[0-9]+$/)) {
		vehicleId = 't' + window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#![tb]-?[0-9]+$/)) {
		vehicleId = window.location.hash.substr(2);
	} else if(window.location.hash.match(/^#![sp]-?[0-9]+$/)) {
		stopId = window.location.hash.substr(2,1) + 't' + window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#![sp][tb]-?[0-9]+$/)) {
		stopId = window.location.hash.substr(2);
	} else if(window.location.hash == '#!RAW') {
		ttss_position_type = 'RAW';
	}
	
	if(vehicleId) {
		if(vehicleId.startsWith('b')) {
			feature = buses_source.getFeatureById(vehicleId);
		} else {
			feature = trams_source.getFeatureById(vehicleId);
		}
	} else if(stopId) {
		feature = stops_source[stopId.substr(0,2)].getFeatureById(stopId);
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
	
	return (getDistance(point, f1) <= getDistance(point, f2)) ? f1 : f2;
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
	
	panel = new Panel(document.getElementById('panel'));
	
	stops_type.forEach(function(type) {
		stops_source[type] = new ol.source.Vector({
			features: [],
		});
		stops_layer[type] = new ol.layer.Vector({
			source: stops_source[type],
			renderMode: 'image',
			style: stops_style[type],
		});
		stops_mapping[type] = {};
	});
	
	stop_selected_source = new ol.source.Vector({
		features: [],
	});
	stop_selected_layer = new ol.layer.Vector({
		source: stop_selected_source,
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
	
	ol.style.IconImageCache.shared.setSize(512);
	
	geolocation_feature = new ol.Feature({
		name: '',
		style: new ol.style.Style({
			image: new ol.style.Circle({
				fill: new ol.style.Fill({color: '#39C'}),
				stroke: new ol.style.Stroke({color: '#FFF', width: 2}),
				radius: 5,
			}),
		}),
	});
	geolocation_feature.setId('location_point');
	geolocation_accuracy = new ol.Feature();
	geolocation_source = new ol.source.Vector({
		features: [],
	});
	geolocation_layer = new ol.layer.Vector({
		source: geolocation_source,
	});
	geolocation_button = document.querySelector('#track button');
	if(!navigator.geolocation) {
		geolocation_button.classList.add('hidden');
	}
	
	geolocation = new ol.Geolocation({projection: 'EPSG:3857'});
	geolocation.on('change:position', function() {
		var coordinates = geolocation.getPosition();
		geolocation_feature.setGeometry(coordinates ? new ol.geom.Point(coordinates) : null);
		if(geolocation_set < 1) {
			geolocation_set = 1;
			map.getView().animate({
				center: coordinates,
			})
		}
	});
	geolocation.on('change:accuracyGeometry', function() {
		var accuracy = geolocation.getAccuracyGeometry();
		geolocation_accuracy.setGeometry(accuracy);
		if(geolocation_set < 2) {
			geolocation_set = 2;
			map.getView().fit(accuracy);
		}
	});
	geolocation.on('error', function(error) {
		fail(lang.error_location + ' ' + error.message);
		trackingStop();
		geolocation_button.classList.add('hidden');
	});
	geolocation_button.addEventListener('click', trackingToggle);
	
	map = new ol.Map({
		target: 'map',
		layers: [
			new ol.layer.Tile({
				source: new ol.source.OSM(),
			}),
			route_layer,
			geolocation_layer,
			stops_layer['st'],
			stops_layer['sb'],
			stops_layer['pt'],
			stops_layer['pb'],
			stop_selected_layer,
			buses_layer,
			trams_layer,
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([19.94, 50.06]),
			zoom: 14,
			maxZoom: 19,
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
			}),
			new ol.control.Control({
				element: document.getElementById('track'),
			}),
		]),
		loadTilesWhileAnimating: false,
	});
	
	// Display popup on click
	map.on('singleclick', mapClicked);
	
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
	var change_resolution = function(e) {
		stops_type.forEach(function(type) {
			if(type.startsWith('p')) {
				stops_layer[type].setVisible(map.getView().getZoom() >= 16);
				stops_layer[type].setVisible(map.getView().getZoom() >= 16);
			}
		});
	};
	map.getView().on('change:resolution', change_resolution);
	change_resolution();
	
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
