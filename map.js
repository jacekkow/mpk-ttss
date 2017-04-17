//var ttss_base = 'http://www.ttss.krakow.pl/internetservice';
var ttss_base = '/proxy.php';
var ttss_refresh = 10000; // 10 seconds

var vehicles_xhr = null;
var vehicles_timer = null;
var vehicles_last_update = 0;
var vehicles_source = null;
var vehicles_layer = null;

var stops_xhr = null;
var stops_source = null;
var stops_layer = null;
var stop_points_source = null;
var stop_points_layer = null;

var map = null;
var popup_feature_id = null;
var popup_element = document.getElementById('popup');
var popup = null;
var fail_element = document.getElementById('fail');

var ignore_hashchange = false;

function fail(msg) {
	console.log(msg);
	
	setText(fail_element, msg);
	fail_element.style.top = '0.5em';
}

function fail_ajax(data) {
	// abort() is not a failure
	if(data.readyState == 0 && data.statusText == 'abort') return;
	
	if(data.status == 0) {
		fail(lang.error_request_failed_connectivity, data);
	} else if (data.statusText) {
		fail(lang.error_request_failed_status.replace('$status', data.statusText), data);
	} else {
		fail(lang.error_request_failed, data);
	}
}

function popupHide() {
	popup.setPosition(undefined);
	popup_feature_id = null;
}

function popupShow(coordinates, id) {
	popup.setPosition(coordinates);
	if(id) {
		popup_feature_id = id;
	}
}

function getGeometry(object) {
	return new ol.geom.Point(ol.proj.fromLonLat([object.longitude / 3600000.0, object.latitude / 3600000.0]))
}

function updateVehicles() {
	if(vehicles_timer) clearTimeout(vehicles_timer);
	if(vehicles_xhr) vehicles_xhr.abort();
	
	vehicles_xhr = $.get(
		ttss_base + '/geoserviceDispatcher/services/vehicleinfo/vehicles' 
			+ '?positionType=CORRECTED'
			+ '&colorType=ROUTE_BASED'
			+ '&lastUpdate=' + encodeURIComponent(vehicles_last_update)
	).done(function(data) {
		vehicles_last_update = data.lastUpdate;
		
		for(var i = 0; i < data.vehicles.length; i++) {
			var vehicle = data.vehicles[i];
			
			var vehicle_feature = vehicles_source.getFeatureById('v' + vehicle.id);
			if(vehicle.isDeleted) {
				if(vehicle_feature) {
					vehicles_source.removeFeature(vehicle_feature);
					if(popup_feature_id == vehicle_feature.getId()) {
						popupHide();
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
			vehicle.vehicle_type = parseVehicle(vehicle.id);
			
			if(!vehicle_feature) {
				vehicle_feature = new ol.Feature(vehicle);
				vehicle_feature.setId('v' + vehicle.id);
				
				var color_type = 'black';
				if(vehicle.vehicle_type) {
					switch(vehicle.vehicle_type.low) {
						case 0:
							color_type = 'orange';
							break;
						case 1:
							color_type = 'blue';
							break;
						case 2:
							color_type = 'green';
							break;
					}
				}
				
				vehicle_feature.setStyle(new ol.style.Style({
					image: new ol.style.RegularShape({
						fill: new ol.style.Fill({color: '#3399ff'}),
						stroke: new ol.style.Stroke({color: color_type, width: 2}),
						points: 3,
						radius: 12,
						rotation: Math.PI * parseFloat(vehicle.heading) / 180.0,
						rotateWithView: true,
						angle: 0
					}),
					text: new ol.style.Text({
						font: 'bold 10px sans-serif',
						text: vehicle.line,
						fill: new ol.style.Fill({color: 'white'}),
					}),
				}));
				vehicles_source.addFeature(vehicle_feature);
			} else {
				vehicle_feature.setProperties(vehicle);
				vehicle_feature.getStyle().getImage().setRotation(Math.PI * parseFloat(vehicle.heading) / 180.0);
				
				if(popup_feature_id == vehicle_feature.getId()) {
					popupShow(vehicle_feature.getGeometry().getCoordinates());
				}
			}
		}
		
		vehicles_timer = setTimeout(function() {
			updateVehicles();
		}, ttss_refresh);
	}).fail(fail_ajax);
	
	return vehicles_xhr;
}

function updateStopSource(stops, prefix, source) {
	source.clear();
	
	for(var i = 0; i < stops.length; i++) {
		var stop = stops[i];
		
		if(stop.category == 'other') continue;
		
		stop.geometry = getGeometry(stop);
		var stop_feature = new ol.Feature(stop);
		
		stop_feature.setId(prefix + stop.id);
		stop_feature.setStyle(new ol.style.Style({
			image: new ol.style.Circle({
				fill: new ol.style.Fill({color: 'orange'}),
				stroke: new ol.style.Stroke({color: 'red', width: 1}),
				radius: 3,
			}),
		}));
		
		source.addFeature(stop_feature);
	}
}

function updateStops() {
	return $.get(
		ttss_base + '/geoserviceDispatcher/services/stopinfo/stops'
			+ '?left=-648000000'
			+ '&bottom=-324000000'
			+ '&right=648000000'
			+ '&top=324000000'
	).done(function(data) {
		updateStopSource(data.stops, 's', stops_source);
	}).fail(fail_ajax);
}

function updateStopPoints() {
	return $.get(
		ttss_base + '/geoserviceDispatcher/services/stopinfo/stopPoints'
			+ '?left=-648000000'
			+ '&bottom=-324000000'
			+ '&right=648000000'
			+ '&top=324000000'
	).done(function(data) {
		updateStopSource(data.stopPoints, 'p', stop_points_source);
	}).fail(fail_ajax);
}

function featureClicked(feature) {
	if(!feature) {
		popupHide();
		
		ignore_hashchange = true;
		window.location.hash = '';
		
		return;
	}
	
	var coordinates = feature.getGeometry().getCoordinates();
	
	deleteChildren(popup_element);
	
	addParaWithText(popup_element, feature.get('name')).className = 'bold';
	switch(feature.getId().substr(0, 1)) {
		case 'v':
			var vehicle_type = parseVehicle(feature.get('id'));
			if(vehicle_type) {
				addParaWithText(popup_element, vehicle_type.num + ' ' + vehicle_type.type);
			}
		break;
	}
	
	ignore_hashchange = true;
	window.location.hash = '#!' + feature.getId();
	
	popupShow(coordinates, feature.getId());
}

function hash() {
	if(ignore_hashchange) {
		ignore_hashchange = false;
		return;
	}
	
	var tramId = null;
	
	var vehicleId = null;
	var stopId = null;
	var stopPointId = null;
	
	var feature = null;
	
	if(window.location.hash.match(/^#!t[0-9]{3}$/)) {
		tramId = parseInt(window.location.hash.substr(3));
	} else if(window.location.hash.match(/^#![A-Za-z]{2}[0-9]{3}$/)) {
		tramId = parseInt(window.location.hash.substr(4));
	} else if(window.location.hash.match(/^#!v[0-9]+$/)) {
		vehicleId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!s[0-9]+$/)) {
		stopId = window.location.hash.substr(3);
	} else if(window.location.hash.match(/^#!p[0-9]+$/)) {
		stopPointId = window.location.hash.substr(3);
	}
	
	if(tramId) {
		vehicleId = tramIdToVehicleId(tramId);
	}
	
	if(vehicleId) {
		feature = vehicles_source.getFeatureById('v' + vehicleId);
	} else if(stopId) {
		feature = stops_source.getFeatureById('s' + stopId);
	} else if(stopPointId) {
		feature = stop_points_source.getFeatureById('p' + stopPointId);
	}
	
	featureClicked(feature);
	if(feature) {
		map.getView().setCenter(feature.getGeometry().getCoordinates());
	}
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
	
	vehicles_source = new ol.source.Vector({
		features: [],
	});
	vehicles_layer = new ol.layer.Vector({
		source: vehicles_source,
	});
	
	popup = new ol.Overlay({
		element: popup_element,
		positioning: 'bottom-center',
		stopEvent: false,
		offset: [0, -12]
	});
	
	map = new ol.Map({
		target: 'map',
		layers: [
			new ol.layer.Tile({
				source: new ol.source.OSM()
			}),
			stops_layer,
			stop_points_layer,
			vehicles_layer,
		],
		overlays: [popup],
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
	});
	
	// Display popup on click
	map.on('singleclick', function(e) {
		var feature = map.forEachFeatureAtPixel(e.pixel, function(feature) { return feature; });
		featureClicked(feature);
	});

	// Change mouse cursor when over marker
	map.on('pointermove', function(e) {
		var hit = map.hasFeatureAtPixel(e.pixel);
		var target = map.getTargetElement();
		target.style.cursor = hit ? 'pointer' : '';
	});
	
	// Change layer visibility on zoom
	map.getView().on('change:resolution', function(e) {
		if(map.getView().getZoom() >= 16) {
			stops_layer.setVisible(false);
			stop_points_layer.setVisible(true);
		} else {
			stops_layer.setVisible(true);
			stop_points_layer.setVisible(false);
		}
	});
	
	$.when(
		updateVehicles(),
		updateStops(),
		updateStopPoints()
	).done(function() {
		hash();
	});
	
	window.addEventListener('hashchange', hash);
	
	setTimeout(function() {
		if(vehicles_xhr) vehicles_xhr.abort();
		if(vehicles_timer) clearTimeout(vehicles_timer);
		  
		fail(lang.error_refresh);
	}, 1800000);
}

init();
