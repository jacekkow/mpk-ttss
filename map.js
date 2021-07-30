'use strict';

var api_refresh = 10000; // 10 seconds
var api_url = 'https://api.ttss.pl';

var geolocation = null;
var geolocation_set = 0;
var geolocation_button = null;
var geolocation_feature = null;
var geolocation_accuracy = null;
var geolocation_source = null;
var geolocation_layer = null;

var vehicles = {};
var hash = null;

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

var feature_xhr = null;
var feature_timer = null;
var path_xhr = null;

var route_source = null;
var route_layer = null;

var map = null;

var panel = null;
var find = null;

var fail_element = document.getElementById('fail');
var fail_text = document.querySelector('#fail span');


function Panel(element) {
	this._element = element;
	this._element.classList.add('panel');
	
	this._hide = addElementWithText(this._element, 'a', '▶');
	this._hide.title = lang.action_collapse;
	this._hide.className = 'hide';
	this._hide.addEventListener('click', this.toggleExpanded.bind(this));
	
	this._close = addElementWithText(this._element, 'a', '×');
	this._close.title = lang.action_close;
	this._close.className = 'close';
	this._close.addEventListener('click', this.close.bind(this));
	
	this._content = document.createElement('div');
	this._element.appendChild(this._content);
}
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
	show: function(contents, closeCallback, hashValue) {
		hash.set(hashValue ? hashValue : '');
		
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


function Find() {
	this.div = document.createElement('div');
	
	this.form = document.createElement('form');
	this.div.appendChild(this.form);
	
	var para = addParaWithText(this.form, lang.enter_query);
	para.appendChild(document.createElement('br'));
	this.input = document.createElement('input');
	this.input.type = 'text';
	this.input.style.width = '80%';
	para.appendChild(this.input);
	para.appendChild(document.createElement('hr'));
	
	this.results = document.createElement('div');
	this.div.appendChild(this.results);
	
	this.input.addEventListener('keyup', this.findDelay.bind(this));
	this.form.addEventListener('submit', this.findDelay.bind(this));
}
Find.prototype = {
	query: '',
	timeout: null,
	
	div: null,
	form: null,
	input: null,
	results: null,
	
	find: function() {
		var query = this.input.value.toUpperCase();
		if(query === this.query) return;
		this.query = query;
		
		if(query === '') {
			deleteChildren(this.results);
			return;
		}
		
		var features = [];
		stops_type.forEach(function(stop_type) {
			if(stop_type.substr(0,1) === 'p') return;
			stops_source[stop_type].forEachFeature(function(feature) {
				if(feature.get('name').toUpperCase().indexOf(query) > -1) {
					features.push(feature);
				}
			});
		});
		
		ttss_types.forEach(function(ttss_type) {
			vehicles[ttss_type].source.forEachFeature(function(feature) {
				if(feature.get('type') && feature.get('type').num.indexOf(query) > -1) {
					features.push(feature);
				}
			});
		});
		
		deleteChildren(this.results);
		this.results.appendChild(listFeatures(features));
	},
	findDelay: function(e) {
		e.preventDefault();
		if(this.timeout) clearTimeout(this.timeout);
		this.timeout = setTimeout(this.find.bind(this), 100);
	},
	open: function(panel) {
		panel.show(this.div, this.close.bind(this), 'f');
		this.input.focus();
	},
	close: function() {
		if(this.timeout) clearTimeout(this.timeout);
	},
};

function Vehicles(prefix) {
	this.prefix = prefix;
	this.source = new ol.source.Vector({
		features: [],
	});
	this.layer = new ol.layer.Vector({
		source: this.source,
	});
}
Vehicles.prototype = {
	prefix: '',
	
	layer: null,
	source: null,
	
	lastUpdate: 0,
	xhr: null,
	es: null,
	
	selectedFeatureId: null,
	deselectCallback: null,
	
	style: function(feature, clicked) {
		var color_type = 'black';
		
		var vehicleType = feature.get('type');
		if(vehicleType) {
			switch(vehicleType.low) {
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
		if(this.prefix === 'b') {
			fill = '#05B';
		}
		if(clicked) {
			fill = '#922';
		}
		
		var image = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><polygon points="10,0 20,23 0,23" style="fill:'+fill+';stroke:'+color_type+';stroke-width:3"/></svg>';
		
		feature.setStyle(new ol.style.Style({
			image: new ol.style.Icon({
				src: 'data:image/svg+xml;base64,' + btoa(image),
				imgSize: [20,30],
				rotation: Math.PI * feature.get('angle') / 180.0,
			}),
			text: new ol.style.Text({
				font: 'bold 10px sans-serif',
				text: feature.get('line'),
				fill: new ol.style.Fill({color: 'white'}),
			}),
		}));
	},
	select: function(feature) {
		if(feature instanceof ol.Feature) {
			feature = feature.getId();
		}
		feature = this.source.getFeatureById(feature);
		if(!feature) {
			this.deselect();
			return;
		}
		this.style(feature, true);
		
		this.selectedFeatureId = feature.getId();
	},
	deselect: function() {
		if(!this.selectedFeatureId) return false;
		var feature = this.source.getFeatureById(this.selectedFeatureId);
		this.style(feature);
		this.selectedFeatureId = null;
	},

	typesUpdated: function() {
		this.source.forEachFeature(function (feature) {
			this.style(feature);
		}.bind(this));
	},

	_newFeature: function(id, data) {
		var feature = new ol.Feature(data);
		feature.set('_', 'v' + this.prefix);
		feature.setId(id);
		feature.setGeometry(getGeometryFeature(feature));
		this.style(feature);
		return feature;
	},
	_updateFeature: function(feature, vehicle) {
		Object.keys(vehicle).forEach(function (key) {
			feature.set(key, deepMerge(feature.get(key), vehicle[key]));
			if(key === 'lon' || key === 'lat') {
				feature.setGeometry(getGeometryFeature(feature));
			} else if(key === 'angle') {
				feature.getStyle().getImage().setRotation(Math.PI * parseFloat(vehicle.angle ? vehicle.angle : 0) / 180.0);
			} else if(key === 'line') {
				// TODO: Special directions
				feature.getStyle().getText().setText(vehicle.line);
			}
		});
	},
	_removeFeature: function(feature) {
		if(!feature) return;
		if(this.selectedFeatureId === feature.getId()) {
			this.deselect();
		}
		this.source.removeFeature(feature);
	},
	loadFullData: function(data) {
		var self = this;
		var features = [];
		for(var id in data) {
			var feature = this.source.getFeatureById(id);
			if(feature) {
				this._updateFeature(feature, data[id]);
			} else {
				features.push(this._newFeature(id, data[id]));
			}
		}
		this.source.addFeatures(features);
		this.source.forEachFeature(function(feature) {
			if(!data[feature.getId()]) {
				self._removeFeature(feature);
			}
		});
		
		if(this.selectedFeatureId) {
			this.select(this.selectedFeatureId);
		}
	},
	loadDiffData: function(data) {
		for(var id in data) {
			var feature = this.source.getFeatureById(id);
			var vehicle = data[id];
			
			if(vehicle === null) {
				this._removeFeature(feature);
			} else if(feature) {
				this._updateFeature(feature, vehicle);
			} else {
				this.source.addFeature(this._newFeature(id, data[id]));
			}
		}
	},
	
	fetch: function() {
		var self = this;
		var result = this.fetchXhr();
		
		// TODO: updates (EventSource)
		// TODO: error ahandling (reconnect)
		// TODO: error handling (indicator)
		
		return result;
	},
	fetchXhr: function() {
		var self = this;
		this.xhr = $.get(
			api_url + '/positions/?type=' + this.prefix + '&last=' + this.lastUpdate
		).done(function(data) {
			try {
				if(data['date'] < self.lastUpdate) {
					console.log('Data older than lastUpdate!');
				}
				if(data['type'] == 'full') {
					self.loadFullData(data['pos']);
				} else {
					self.loadDiffData(data['pos']);
				}
				self.lastUpdate = data['date'];
				setTimeout(self.fetchXhr.bind(self), api_refresh);
			} catch(e) {
				console.log(e);
				throw e;
			}
		}).fail(this.failXhr.bind(this));
		return this.xhr;
	},
	
	failXhr: function(result) {
		// abort() is not a failure
		if(result.readyState === 0) return;
		
		if(result.status === 0) {
			fail(lang.error_request_failed_connectivity, result);
		} else if(result.status === 304) {
			fail(lang.error_request_failed_no_data, result);
		} else if(result.statusText) {
			fail(lang.error_request_failed_status.replace('$status', result.statusText), result);
		} else {
			fail(lang.error_request_failed, result);
		}
	},
};

function fail(msg) {
	setText(fail_text, msg);
	fail_element.style.top = '0.5em';
}

function fail_ajax_generic(data, fnc) {
	// abort() is not a failure
	if(data.readyState === 0) return;
	
	if(data.status === 0) {
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

function getGeometryFeature(feature) {
	return getGeometryPair([feature.get('lon'), feature.get('lat')]);
}
function getGeometryPair(pair) {
	return new ol.geom.Point(ol.proj.fromLonLat(pair));
}
function getGeometry(object) {
	return getGeometryPair([object.longitude / 3600000.0, object.latitude / 3600000.0]);
}

function markStops(stops, featureSource, routeStyle) {
	stop_selected_source.clear();
	
	var style = stops_layer['s' + featureSource].getStyle().clone();
	
	if(routeStyle) {
		style.getImage().setRadius(5);
	} else {
		style.getImage().getStroke().setWidth(2);
		style.getImage().getStroke().setColor('#F00');
		style.getImage().setRadius(5);
	}
	
	stop_selected_layer.setStyle(style);
	
	var feature, prefix;
	for(var i = 0; i < stops.length; i++) {
		if(stops[i].getId) {
			feature = stops[i];
		} else {
			feature = stops_source['s' + featureSource].getFeatureById(stops[i]);
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
	ttss_types.forEach(function(type) {
		vehicles[type].deselect();
	});
}

function updateStopSource(stops, prefix) {
	var stop;
	for(var i = 0; i < stops.length; i++) {
		stop = stops[i];
		
		var feature = new ol.Feature(stop);
		feature.setId(stop.id);
		feature.setGeometry(getGeometryFeature(feature));
		
		if(feature.get('parent') === null) {
			feature.set('_', 's' + prefix);
			stops_source['s' + prefix].addFeature(feature);
		} else {
			feature.set('_', 'p' + prefix);
			stops_source['p' + prefix].addFeature(feature);
		}
	}
}

function updateStops(ttss_type) {
	return $.get(
		api_url + '/stops/?type=' + ttss_type
	).done(function(data) {
		updateStopSource(data, ttss_type);
	}).fail(fail_ajax);
}

function vehiclePath(feature) {
	if(path_xhr) path_xhr.abort();
	
	var featureId = feature.getId();
	var ttss_type = featureId.substr(0, 1);
	
	path_xhr = $.get(
		ttss_urls[ttss_type] + '/geoserviceDispatcher/services/pathinfo/vehicle'
			+ '?id=' + encodeURIComponent(featureId.substr(1))
	).done(function(data) {
		if(!data || !data.paths || !data.paths[0] || !data.paths[0].wayPoints) return;
		
		var point;
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
	return path_xhr;
}

function vehicleTable(feature, table, post, trip) {
	if(feature_xhr) feature_xhr.abort();
	if(feature_timer) clearTimeout(feature_timer);
	
	var featureDiscriminator = feature.get('_');
	var featureType = featureDiscriminator.substr(0, 1);
	var featureSource = featureDiscriminator.substr(1, 1);
	var featureStatus = feature.get('status');
	
	var isTripCurrent = !trip || feature.get('trip') == trip;
	
	feature_xhr = $.get(
		api_url + '/trip/?type=' + featureSource + '&id=' + (trip ? trip : feature.get('trip'))
	).done(function(results) {
		var data = results['data'];
		
		deleteChildren(table);
		
		var tr;
		var stopsToMark = [];
		for(var i = 0, il = data.length; i < il; i++) {
			tr = document.createElement('tr');
			addCellWithText(tr, data[i].time);
			addCellWithText(tr, (i+1) + '. ' + normalizeName(data[i].name));
			
			stopsToMark.push(data[i].stop);
			
			if(isTripCurrent) {
				if(data[i].seq < feature.get('seq')) {
					tr.className = 'active';
				} else if(data[i].seq == feature.get('seq') && featureStatus < 2) {
					tr.className = 'success';
				}
			}
			table.appendChild(tr);
		}
		
		if(data.length === 0) {
			tr = document.createElement('tr');
			table.appendChild(tr);
			tr = addCellWithText(tr, lang.no_data);
			tr.colSpan = '2';
			tr.className = 'active';
		}
		
		deleteChildren(post);
		
		if(results['prev']) {
			tr = addElementWithText(post, 'a', lang.trip_previous);
			tr.className = 'left';
			tr.onclick = function() {
				vehicleTable(feature, table, post, results['prev']);
			};
		} else {
			tr = document.createElement('span');
			post.appendChild(tr);
		}
		if(!isTripCurrent) {
			tr = addElementWithText(post, 'a', lang.trip_current);
			tr.className = 'center';
			tr.onclick = function() {
				vehicleTable(feature, table, post);
			};
		} else {
			tr = document.createElement('span');
			post.appendChild(tr);
		}
		if(results['next']) {
			tr = addElementWithText(post, 'a', lang.trip_next);
			tr.className = 'right';
			tr.onclick = function() {
				vehicleTable(feature, table, post, results['next']);
			};
		} else {
			tr = document.createElement('span');
			post.appendChild(tr);
		}
		
		markStops(stopsToMark, featureSource, true);
		
		feature_timer = setTimeout(function() { vehicleTable(feature, table, post, trip); }, api_refresh);
	}).fail(fail_ajax_popup);
	return feature_xhr;
}

function stopTable(feature, table) {
	if(feature_xhr) feature_xhr.abort();
	if(feature_timer) clearTimeout(feature_timer);
	
	var featureDiscriminator = feature.get('_');
	var featureType = featureDiscriminator.substr(0, 1);
	var featureSource = featureDiscriminator.substr(1, 1);
	
	feature_xhr = $.get(
		api_url + '/schedule/?type=' + featureSource + '&id=' + feature.getId()
	).done(function(data) {
		deleteChildren(table);
		
		var tr, dir_cell, vehicle, status, status_cell, delay, delay_cell;
		for(var i = 0, il = data.length; i < il; i++) {
			tr = document.createElement('tr');
			addCellWithText(tr, data[i].line);
			dir_cell = addCellWithText(tr, data[i].direction);
			//vehicle = vehicles_info.getParsed(all_departures[i].vehicleId);
			//dir_cell.appendChild(displayVehicle(vehicle));
			//status = parseStatus(all_departures[i]);
			status_cell = addCellWithText(tr, data[i].time);
			//delay = parseDelay(all_departures[i]);
			delay_cell = addCellWithText(tr, '');
			/*
			if(i < data.old.length) {
				tr.className = 'active';
			} else if(status === lang.boarding_sign) {
				tr.className = 'success';
				status_cell.className = 'status-boarding';
			} else if(parseInt(delay) > 9) {
				tr.className = 'danger';
				delay_cell.className = 'status-delayed';
			} else if(parseInt(delay) > 3) {
				tr.className = 'warning';
			}
			*/
			table.appendChild(tr);
		}
		
		feature_timer = setTimeout(function() { stopTable(feature, table); }, api_refresh);
	}).fail(fail_ajax_popup);
	return feature_xhr;
}

function featureClicked(feature) {
	if(!feature || !feature.getId() || !feature.get('_')) {
		feature = null;
	}
	
	unstyleSelectedFeatures();
	
	if(!feature) {
		panel.close();
		return;
	}
	
	var featureDiscriminator = feature.get('_');
	var featureType = featureDiscriminator.substr(0, 1);
	var featureSource = featureDiscriminator.substr(1, 1);
	
	var div = document.createElement('div');
	
	var name = normalizeName(feature.get('name') ? feature.get('name') : feature.get('line') + ' ' + feature.get('dir'));
	var additional;
	var table = document.createElement('table');
	var thead = document.createElement('thead');
	var tbody = document.createElement('tbody');
	table.appendChild(thead);
	table.appendChild(tbody);
	var post;
	
	var tabular_data = true;
	
	var typeName = lang.types[featureDiscriminator];
	if(typeof typeName === 'undefined') {
		typeName = '';
	}
	
	// Location
	if(featureType == 'l') {
		tabular_data = false;
		name = typeName;
		typeName = '';
	}
	// Vehicle
	else if(featureType == 'v') {
		var span = displayVehicle(feature.get('type'));
		
		additional = document.createElement('p');
		if(span.dataset.typeShort) {
			setText(additional, span.dataset.typeShort);
			additional.title = span.dataset.typeAdditional;
			span.removeAttribute('title');
		} else {
			setText(additional, feature.getId());
		}
		additional.insertBefore(span, additional.firstChild);
		
		addElementWithText(thead, 'th', lang.header_time);
		addElementWithText(thead, 'th', lang.header_stop);
		
		post = document.createElement('div');
		post.className = 'post-nav';
		
		vehicleTable(feature, tbody, post);
		//vehiclePath(feature);
	}
	// Stop or stop point
	else if(['s', 'p'].includes(featureType)) {
		if(featureType == 's') {
			var second_type = lang.departures_for_buses;
			var source = stops_source['sb'];
			
			if(featureSource == 'b') {
				second_type = lang.departures_for_trams;
				source = stops_source['st'];
			}
			
			stopTable(feature, tbody);
			
			var second = source.getFeatureById(feature.get('id'));
			if(second) {
				additional = document.createElement('p');
				additional.className = 'small';
				addElementWithText(additional, 'a', second_type).addEventListener(
					'click',
					function() {
						featureClicked(second);
					}
				);
			}
		} else {
			stopTable(feature, tbody);
			
			additional = document.createElement('p');
			additional.className = 'small';
			addElementWithText(additional, 'a', lang.departures_for_stop).addEventListener(
				'click',
				function() {
					featureClicked(stops_source['s' + featureSource].getFeatureById(feature.get('parent')));
				}
			);
		}
		
		addElementWithText(thead, 'th', lang.header_line);
		addElementWithText(thead, 'th', lang.header_direction);
		addElementWithText(thead, 'th', lang.header_time);
		addElementWithText(thead, 'th', lang.header_delay);
	} else {
		panel.close();
		return;
	}
	
	var loader = addElementWithText(tbody, 'td', lang.loading);
	loader.className = 'active';
	loader.colSpan = thead.childNodes.length;
	
	addParaWithText(div, typeName).className = 'type';
	
	var nameElement = addParaWithText(div, name + ' ');
	nameElement.className = 'name';
	
	var showOnMapElement = addElementWithText(nameElement, 'a', lang.show_on_map);
	var showOnMapFunction = function() {
		setTimeout(function () {map.getView().animate({
			center: feature.getGeometry().getCoordinates(),
		})}, 10);
	};
	showOnMapElement.addEventListener('click', showOnMapFunction);
	showOnMapElement.className = 'icon icon-pin';
	showOnMapElement.title = lang.show_on_map;
	
	if(additional) {
		div.appendChild(additional);
	}
	
	if(tabular_data) {
		div.appendChild(table);
	}
	
	if(post) {
		div.appendChild(post);
	}
	
	showOnMapFunction();
	
	panel.show(div, function() {
		unstyleSelectedFeatures();
		
		if(path_xhr) path_xhr.abort();
		if(feature_xhr) feature_xhr.abort();
		if(feature_timer) clearTimeout(feature_timer);
	}, tabular_data ? featureDiscriminator + feature.getId() : '');
	
	if(featureType == 'v') {
		vehicles[featureSource].select(feature);
	} else if(['s', 'p'].includes(featureType)) {
		markStops([feature], featureSource);
	}
}

function listFeatures(features) {
	var div = document.createElement('div');
	
	if(features.length === 0) {
		addParaWithText(div, lang.no_results);
		return div;
	}
	
	addParaWithText(div, lang.select_feature);
	
	var feature, p, a, featureDiscriminator, typeName;
	for(var i = 0; i < features.length; i++) {
		feature = features[i];
		
		p = document.createElement('p');
		a = document.createElement('a');
		p.appendChild(a);
		a.addEventListener('click', function(feature) { return function() {
			featureClicked(feature);
		}}(feature));
		
		featureDiscriminator = feature.get('_');
		typeName = lang.types[featureDiscriminator];
		if(typeof typeName === 'undefined') {
			typeName = '';
		}
		if(feature.get('type')) {
			typeName += ' ' + feature.get('type').num;
		}
		
		addElementWithText(a, 'span', typeName).className = 'small';
		a.appendChild(document.createTextNode(' '));
		addElementWithText(a, 'span', normalizeName(feature.get('name') ? feature.get('name') : feature.get('line') + ' ' + feature.get('dir')));
		
		div.appendChild(p);
	}
	
	return div;
}

function mapClicked(e) {
	var point = e.coordinate;
	var features = [];
	map.forEachFeatureAtPixel(e.pixel, function(feature, layer) {
		if(layer == stop_selected_layer) return;
		if(feature.getId()) features.push(feature);
	});
	
	var feature = features[0];
	
	if(features.length > 1) {
		panel.show(listFeatures(features));
		return;
	}
	
	if(!feature) {
		stops_type.forEach(function(type) {
			if(stops_layer[type].getVisible()) {
				feature = returnClosest(point, feature, stops_source[type].getClosestFeatureToCoordinate(point));
			}
		});
		ttss_types.forEach(function(type) {
			if(vehicles[type].layer.getVisible()) {
				feature = returnClosest(point, feature, vehicles[type].source.getClosestFeatureToCoordinate(point));
			}
		});
		
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

function Hash() {
}
Hash.prototype = {
	_ignoreChange: false,
	
	_set: function(id) {
		var value = '#!' + id;
		if(value !== window.location.hash) {
			window.location.hash = value;
			return true;
		}
		return false;
	},
	_updateOld: function() {
		if(window.location.hash.match(/^#!sb[0-9]{1,3}$/)) {
			this.go('sb' + window.location.hash.substr(4).padStart(4, '0'));
		} else if(window.location.hash.match(/^#![bt][0-9]{3}$/)) {
			this.go('v' + window.location.hash.substr(2));
		} else if(window.location.hash.match(/^#![RHrh][A-Za-z][0-9]{3}$/)) {
			this.go('vt'+ window.location.hash.substr(4));
		} else if(window.location.hash.match(/^#![BDPbdp][A-Za-z][0-9]{3}$/)) {
			this.go('vb'+ window.location.hash.substr(4));
		}
	},
	ready: function() {
		this._updateOld();
		this.changed();
		window.addEventListener('hashchange', this.changed.bind(this), false);
	},
	go: function(id) {
		this._ignoreChange = false;
		return this._set(id);
	},
	set: function(id) {
		this._ignoreChange = true;
		return this._set(id);
	},
	changed: function() {
		if(this._ignoreChange) {
			this._ignoreChange = false;
			return false;
		}
		
		var feature = null;
		var source = null;
		var vehicleId = null;
		var stopId = null;
		
		if(window.location.hash.match(/^#!v[tb][0-9]+$/)) {
			vehicleId = window.location.hash.substr(3);
		} else if(window.location.hash.match(/^#![sp][tb][0-9a-z_]+$/)) {
			stopId = window.location.hash.substr(2);
		} else if(window.location.hash.match(/^#!f$/)) {
			find.open(panel);
			return;
		}
		
		if(vehicleId) {
			feature = vehicles[vehicleId.substr(0,1)].source.getFeatureById(vehicleId.substr(1));
		} else if(stopId) {
			feature = stops_source[stopId.substr(0,2)].getFeatureById(stopId.substr(2));
		}
		
		featureClicked(feature);
		
		return true;
	},
};

function getDistance(c1, c2) {
	if(c1.getGeometry) {
		c1 = c1.getGeometry().getCoordinates();
	}
	if(c2.getGeometry) {
		c2 = c2.getGeometry().getCoordinates();
	}
	
	c1 = ol.proj.transform(c1, 'EPSG:3857', 'EPSG:4326');
	c2 = ol.proj.transform(c2, 'EPSG:3857', 'EPSG:4326');
	return ol.sphere.getDistance(c1, c2);
}

function returnClosest(point, f1, f2) {
	if(!f1) return f2;
	if(!f2) return f1;
	
	return (getDistance(point, f1) <= getDistance(point, f2)) ? f1 : f2;
}

function init() {
	panel = new Panel(document.getElementById('panel'));
	find = new Find();
	
	route_source = new ol.source.Vector({
		attributions: [lang.help_data_attribution],
		features: [],
	});
	route_layer = new ol.layer.Vector({
		source: route_source,
		style: new ol.style.Style({
			stroke: new ol.style.Stroke({ color: [255, 153, 0, .8], width: 5 })
		}),
	});
	
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
	
	ttss_types.forEach(function(type) {
		vehicles[type] = new Vehicles(type);
	});
	
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
	geolocation_button = document.querySelector('#track');
	if(!navigator.geolocation) {
		geolocation_button.remove();
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
		geolocation_button.remove();
	});
	geolocation_button.addEventListener('click', trackingToggle);
	
	document.getElementById('find').addEventListener('click', find.open.bind(find, panel));

	var pixelRatio = ol.has.DEVICE_PIXEL_RATIO > 1 ? 2 : 1;
	var layers = [
		new ol.layer.Tile({
			source: new ol.source.XYZ({
				attributions: [ol.source.OSM.ATTRIBUTION],
				url: 'https://tiles.ttss.pl/x' + pixelRatio + '/{z}/{x}/{y}.png',
				maxZoom: 19,
				tilePixelRatio: pixelRatio,
				opaque: false,
			}),
		}),
		route_layer,
		geolocation_layer,
	];
	stops_type.forEach(function(type) {
		layers.push(stops_layer[type]);
	});
	layers.push(stop_selected_layer);
	ttss_types.forEach(function(type) {
		layers.push(vehicles[type].layer);
	});
	map = new ol.Map({
		target: 'map',
		layers: layers,
		view: new ol.View({
			center: ol.proj.fromLonLat([19.94, 50.06]),
			zoom: 14,
			maxZoom: 19,
			constrainResolution: true,
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
				element: document.getElementById('menu'),
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
	var change_resolution = function() {
		stops_type.forEach(function(type) {
			if(type.startsWith('p')) {
				stops_layer[type].setVisible(map.getView().getZoom() >= 16);
				stops_layer[type].setVisible(map.getView().getZoom() >= 16);
			}
		});
	};
	map.getView().on('change:resolution', change_resolution);
	change_resolution();
	
	var future_requests = [];
	ttss_types.forEach(function(type) {
		future_requests.push(vehicles[type].fetch());
		future_requests.push(updateStops(type));
	});
	
	hash = new Hash();
	Deferred.all(future_requests).done(hash.ready.bind(hash));
}

init();
