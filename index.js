'use strict';

var ttss_refresh = 20000; // 20 seconds

var page_title = document.getElementsByTagName('title')[0];
var ignore_hashchange = false;

var language = 'pl';
var lang_select = document.getElementById('lang-select');

var stop_id = '';
var stop_name = document.getElementById('stop-name');
var stop_name_form = stop_name.form;
var stop_name_autocomplete = document.getElementById('stop-name-autocomplete');
var stop_name_autocomplete_xhr;
var stop_name_autocomplete_timer;

var times_xhr;
var times_timer;
var times_stop_type = document.getElementById('times-stop-type');
var times_stop_name = document.getElementById('times-stop-name');
var times_alerts = document.getElementById('times-alerts');
var times_table = document.getElementById('times-table');
//var times_lines = document.getElementById('times-lines');

var route_id;
var route_xhr;
var route_line = document.getElementById('route-line');
var route_table = document.getElementById('route-table');
var route_vehicle = document.getElementById('route-vehicle');
var route_vehicle_info;

var refresh_button = document.getElementById('refresh');
var refresh_text = document.getElementById('refresh-text');
var refresh_time;
var refresh_timer;

var alert = document.getElementById('alert');
var alert_text = document.getElementById('alert-text');
var alert_close = document.getElementById('alert-close');

var nav = document.getElementsByTagName('nav')[0];
var vehicle_data = document.getElementById('vehicle-data');
var vehicle_data_style = document.getElementById('vehicle-data-style');

function fail(message, more) {
	if(times_timer) clearTimeout(times_timer);
	
	setText(alert_text, message);
	alert.style.display = 'block';
	
	console.log(message + (more ? ' More details follow.' : ''));
	if(more) console.log(more);
}

function fail_ajax(data) {
	// abort() is not a failure
	if(data.readyState === 0) return;
	
	if(data.status === 0) {
		fail(lang.error_request_failed_connectivity, data);
	} else if (data.statusText) {
		fail(lang.error_request_failed_status.replace('$status', data.statusText), data);
	} else {
		fail(lang.error_request_failed, data);
	}
}

function fail_hide() {
	alert.style.display = 'none';
}

function loading_start() {
	nav.className += ' loading';
}

function loading_end() {
	nav.className = nav.className.replace(' loading', '');
}

function startTimer(date) {
	if(date) {
		setText(refresh_text, lang.last_refreshed.replace('$time', lang.time_now));
		refresh_time = date;
	}
	if(!refresh_time) return;
	if(refresh_timer) clearInterval(refresh_timer);
	
	var now = new Date();
	var ms = now.getTime() - refresh_time.getTime();
	
	var interval = 1000;
	if(ms >= 120000) interval = 60000;
	
	refresh_timer = setInterval(function() {
		var now = new Date();
		var ms = now.getTime() - refresh_time.getTime();
		
		if(ms >= 120000) {
			setText(refresh_text, lang.last_refreshed.replace(
				'$time',
				lang.time_minutes_ago_prefix + Math.floor(ms / 60000)
					+ lang.time_minutes_ago_suffix
			));
			startTimer();
		} else {
			setText(refresh_text, lang.last_refreshed.replace(
				'$time',
				lang.time_seconds_ago_prefix + Math.floor(ms / 1000)
					+ lang.time_seconds_ago_suffix
			));
		}
	}, interval);
}

function loadRoute(tripId, vehicleInfo) {
	if(!tripId) tripId = route_id;
	if(!tripId) return;
	
	if(vehicleInfo === undefined) vehicleInfo = route_vehicle_info;
	
	console.log('loadRoute(' + tripId + ')');
	
	var prefix = tripId.substr(0, 1);
	var trip = tripId.substr(1);
	
	route_id = tripId;
	route_vehicle_info = vehicleInfo;
	
	if(route_xhr) route_xhr.abort();
	route_xhr = $.get(
		ttss_urls[prefix] + '/services/tripInfo/tripPassages'
			+ '?tripId=' + encodeURIComponent(trip)
			+ '&mode=departure'
	).done(function(data) {
		if(!data.routeName || !data.directionText || data.old.length + data.actual.length == 0) {
			route_id = null;
			return;
		}
		
		setText(route_line, data.routeName + ' ' + data.directionText);
		
		deleteChildren(route_vehicle);
		if(vehicleInfo) {
			var span = displayVehicle(vehicleInfo);
			if(span) {
				setText(route_vehicle, span.title);
			}
			route_vehicle.insertBefore(span, route_vehicle.firstChild);
		}
		
		deleteChildren(route_table);
		
		var all_departures = data.old.concat(data.actual);
		var tr;
		for(var i = 0, il = all_departures.length; i < il; i++) {
			tr = document.createElement('tr');
			addCellWithText(tr, all_departures[i].actualTime || all_departures[i].plannedTime);
			addCellWithText(tr, all_departures[i].stop_seq_num + '. ' + all_departures[i].stop.name);
			
			if(i < data.old.length) {
				tr.className = 'active';
			} else if(all_departures[i].status === 'STOPPING') {
				tr.className = 'success';
			}
			tr.addEventListener('click', function(stopId){ return function(){ loadTimes(stopId); } }(prefix + all_departures[i].stop.shortName) );
			route_table.appendChild(tr);
		}
	}).fail(fail_ajax);
	return route_xhr;
}

function loadTimes(stopId) {
	if(!stopId) stopId = stop_id;
	if(!stopId) return;
	
	if(times_timer) clearTimeout(times_timer);
	if(times_xhr) times_xhr.abort();
	
	console.log('loadTimes(' + stopId + ')');
	
	loading_start();
	
	var prefix = stopId.substr(0, 1);
	var stop = stopId.substr(1);
	var url = ttss_urls[prefix];
	
	stop_id = stopId;
	
	ignore_hashchange = true;
	window.location.hash = '#!' + language + stopId;
	refresh_button.removeAttribute('disabled');
	
	var alternative_stop = null;
	var candidate;
	for(var i = 0; i < stop_name_autocomplete.options.length; i++) {
		candidate = stop_name_autocomplete.options[i].value;
		if(candidate.substr(0, 1) != prefix && candidate.substr(1) == stop) {
			alternative_stop = candidate;
			break;
		}
	}
	
	times_xhr = $.get(
		url + '/services/passageInfo/stopPassages/stop'
			+ '?stop=' + encodeURIComponent(stop)
			+ '&mode=departure'
	).done(function(data) {
		setText(times_stop_type, lang.types['s' + prefix]);
		setText(times_stop_name, normalizeName(data.stopName));
		setText(page_title, lang.page_title_stop_name.replace('$stop', normalizeName(data.stopName)));
		deleteChildren(times_alerts);
		deleteChildren(times_table);
		//deleteChildren(times_lines);
		
		if(alternative_stop !== null) {
			var a = addParaWithText(times_alerts, '');
			a = addElementWithText(a, 'a', (prefix == 'b' ? lang.departures_for_trams : lang.departures_for_buses));
			a.href = '';
			a.onclick = function(e) {
				e.preventDefault();
				loadTimes(alternative_stop);
			};
			
		}
		
		var i, il;
		for(i = 0, il = data.generalAlerts.length; i < il; i++) {
			addParaWithText(times_alerts, data.generalAlerts[i].title);
		}
		
		var all_departures = data.old.concat(data.actual);
		var tr, dir_cell, vehicle, status, status_cell, delay, delay_cell;
		for(i = 0, il = all_departures.length; i < il; i++) {
			tr = document.createElement('tr');
			addCellWithText(tr, all_departures[i].patternText);
			dir_cell = addCellWithText(tr, all_departures[i].direction);
			vehicle = parseVehicle(prefix + all_departures[i].vehicleId);
			dir_cell.appendChild(displayVehicle(vehicle));
			addCellWithText(tr, (vehicle ? vehicle.num : '')).className = 'vehicleData';
			status = parseStatus(all_departures[i]);
			status_cell = addCellWithText(tr, status);
			delay = parseDelay(all_departures[i]);
			delay_cell = addCellWithText(tr, delay);
			
			if(i < data.old.length) {
				tr.className = 'active';
			} else if(all_departures[i].status === 'STOPPING') {
				tr.className = 'success';
				if (all_departures[i].actualRelativeTime <= 0) {
					status_cell.className = 'status-boarding';
				}
			} else if(parseInt(delay) > 9) {
				tr.className = 'danger';
				delay_cell.className = 'status-delayed';
			} else if(parseInt(delay) > 3) {
				tr.className = 'warning';
			}
			
			tr.addEventListener('click', function(tripId, vehicleInfo) {
				return function(){ loadRoute(tripId, vehicleInfo); }
			}(prefix + all_departures[i].tripId, vehicle));
			times_table.appendChild(tr);
		}
		
		/*
		for(var i = 0, il = data.routes.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.routes[i].name);
			addCellWithText(tr, data.routes[i].directions.join(' - '));
			addCellWithText(tr, data.routes[i].authority);
			times_lines.appendChild(tr);
		}
		*/
		
		startTimer(new Date());
		fail_hide();
		
		times_timer = setTimeout(function(){ loadTimes(); loadRoute(); }, ttss_refresh);
	}).fail(fail_ajax).always(loading_end);
	return times_xhr;
}

function translate() {
	var elements = document.querySelectorAll('*[data-translate]');
	
	var text_name;
	for(var i = 0; i < elements.length; i++) {
		text_name = elements[i].dataset.translate;
		if(typeof lang[text_name] === 'undefined') {
			console.log('Missing translation: ' + text_name);
			continue;
		}
		setText(elements[i], lang[text_name]);
	}
	
	stop_name.setAttribute('placeholder', lang.stop_name_placeholder);
	
	if(stop_name_autocomplete.value) {
		setText(refresh_text, lang.select_stop_click_go);
	} else {
		setText(refresh_text, lang.enter_stop_name_to_begin);
	}
	
	setText(page_title, lang.page_title);
	
	if(!stop_id) return;
	
	loadTimes();
	loadRoute();
}

function change_language(lang) {
	if(!lang || lang.length != 2) return false;
	if(lang == language) return false;
	lang_select.value = lang;
	if(!lang_select.value) {
		lang_select.value = language;
		return;
	}
	language = lang;
	
	var old_script = document.getElementById('lang_script');
	var old_version = old_script.src.match(/\?v[0-9]+/)[0];
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = 'lang_' + lang + '.js' + (old_version ? old_version : '');
	script.id = 'lang_script';
	script.onload = translate;
	
	document.body.removeChild(old_script);
	document.body.appendChild(script);
	
	ignore_hashchange = true;
	window.location.hash = '#!' + language + stop_id;
	
	return true;
}

function hash() {
	if(ignore_hashchange) {
		ignore_hashchange = false;
		return;
	}
	
	var stop;
	if(window.location.hash.match(/^#![0-9]+$/)) {
		loadTimes('t' + window.location.hash.substr(2));
	} else if(window.location.hash.match(/^#![bt][0-9]+$/)) {
		loadTimes(window.location.hash.substr(2));
	} else if(window.location.hash.match(/^#![a-z]{2}[0-9]*$/)) {
		stop = window.location.hash.substr(4);
		if(stop) stop_id = 't' + stop;
		
		if(!change_language(window.location.hash.substr(2, 2))) {
			loadTimes();
		}
	} else if(window.location.hash.match(/^#![a-z]{2}[bt][0-9]*$/)) {
		stop = window.location.hash.substr(4);
		if(stop) stop_id = stop;
		
		if(!change_language(window.location.hash.substr(2, 2))) {
			loadTimes();
		}
	}
}

function stop_autocomplete() {
	if(stop_name_autocomplete_xhr) stop_name_autocomplete_xhr.abort();
	
	stop_name_autocomplete_xhr = $.get(
		'stops/?query=' + encodeURIComponent(stop_name.value)
	).done(function(data) {
		deleteChildren(stop_name_autocomplete);
		for(var i = 0, il = data.length; i < il; i++) {
			var opt = document.createElement('option');
			opt.value = data[i].id;
			setText(opt, lang.select_stop_type[data[i].id.substr(0,1)].replace('$stop', data[i].name));
			stop_name_autocomplete.appendChild(opt);
		}
		
		if(!stop_id) setText(refresh_text, lang.select_stop_click_go);
	}).fail(fail_ajax);
	return stop_name_autocomplete_xhr;
}

function init() {
	lang_select.addEventListener('input', function() {
		change_language(lang_select.value);
	});
	
	stop_name.addEventListener('input', function() {
		if(!stop_name.value) return;
		if(stop_name_autocomplete_timer) clearTimeout(stop_name_autocomplete_timer);
		
		stop_name_autocomplete_timer = setTimeout(stop_autocomplete, 100);
	});
	
	setText(refresh_text, lang.enter_stop_name_to_begin);
	
	stop_name_form.addEventListener('submit', function(e) {
		e.preventDefault();
		if(!stop_name_autocomplete.value) return;
		loadTimes(stop_name_autocomplete.value);
	});
	
	refresh_button.addEventListener('click', function() {
		loadTimes();
		loadRoute();
	});
	
	alert_close.addEventListener('click', function() {
		alert.style.display = 'none';
	});
	
	vehicle_data.addEventListener('click', function(e) {
		e.preventDefault();
		vehicle_data.style.display = 'none';
		setText(vehicle_data_style, '.vehicleData { display: table-cell; }')
	});
	
	updateVehicleInfo()
	
	hash();
	
	window.addEventListener('hashchange', hash);
	
	checkVersionInit();
}

init();
