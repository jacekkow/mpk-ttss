//var ttss_base = 'http://www.ttss.krakow.pl/internetservice';
var ttss_base = './proxy.php';
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

var smooth_timer;

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
	if(data.readyState == 0 && data.statusText == 'abort') return;
	
	if(data.status == 0) {
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

function loadTimes_parse(data) {
	setText(times_stop_name, data.stopName);
	setText(page_title, lang.page_title_stop_name.replace('$stop', data.stopName));
	deleteChildren(times_alerts);
	deleteChildren(times_table);
	//deleteChildren(times_lines);
	
	for(var i = 0, il = data.generalAlerts.length; i < il; i++) {
		addParaWithText(times_alerts, data.generalAlerts[i].title);
	}
	
	for(var i = 0, il = data.old.length; i < il; i++) {
		var tr = document.createElement('tr');
		addCellWithText(tr, data.old[i].patternText);
		var dir_cell = addCellWithText(tr, data.old[i].direction);
		var vehicle = parseVehicle(data.old[i].vehicleId);
		dir_cell.appendChild(displayVehicle(vehicle));
		addCellWithText(tr, (vehicle ? vehicle.num : '')).className = 'vehicleData';
		var status = parseStatus(data.old[i]);
		addCellWithText(tr, status);
		addCellWithText(tr, '');
		
		tr.className = 'active';
		tr.addEventListener('click', function(tripId, vehicleInfo) {
			return function(){ loadRoute(tripId, vehicleInfo); }
		}(data.old[i].tripId, vehicle));
		times_table.appendChild(tr);
	}
	
	for(var i = 0, il = data.actual.length; i < il; i++) {
		var tr = document.createElement('tr');
		addCellWithText(tr, data.actual[i].patternText);
		var dir_cell = addCellWithText(tr, data.actual[i].direction);
		var vehicle = parseVehicle(data.actual[i].vehicleId);
		dir_cell.appendChild(displayVehicle(vehicle));
		addCellWithText(tr, (vehicle ? vehicle.num : '')).className = 'vehicleData';
		var status = parseStatus(data.actual[i]);
		var status_cell = addCellWithText(tr, status);
		var delay = parseDelay(data.actual[i]);
		var delay_cell = addCellWithText(tr, delay);
		
		if(data.actual[i].status == 'STOPPING') {
			tr.className = 'success';
			if (data.actual[i].actualRelativeTime <= 0) {
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
		}(data.actual[i].tripId, vehicle));
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
}

function loadTimes(stopId) {
	if(!stopId) stopId = stop_id;
	if(!stopId) return;
	
	if(times_timer) clearTimeout(times_timer);
	if(times_xhr) times_xhr.abort();
	
	console.log('loadTimes(' + stopId + ')');
	stop_id = stopId;
	
	ignore_hashchange = true;
	window.location.hash = '#!' + language + stopId;
	refresh_button.removeAttribute('disabled');
	
	loading_start();
	times_xhr = $.get(
		ttss_base + '/services/passageInfo/stopPassages/stop'
			+ '?stop=' + encodeURIComponent(stopId)
			+ '&mode=departure'
	).done(function(data) {
		if(smooth_timer) clearInterval(smooth_timer);

		var should_activate_smooth_timer = false;
		for(var i = 0, il = data.actual.length; i < il; i++) {
			if(data.actual[i].actualRelativeTime < (60 + ttss_refresh/1000)) { // Now this is questionable, since smoothing could still be used to turn for example "5 min" to "4 min", though with times more than 60 seconds the prediction could be not enough precise, so we could skip this? It would also be unnecessary DOM updating every second without any visual change.
				should_activate_smooth_timer = true;
			}
		}

		if (should_activate_smooth_timer) smooth_timer = setInterval(function() {
			
			for(var i = 0, il = this.actual.length; i < il; i++) {
				// Assuming there are no delays and predicted time will not raise, taking seconds from all predicted times should be OK
				if(/*this.actual[i].actualRelativeTime <= (60 + ttss_refresh/1000) &&*/ ((data.actual[i].status == 'STOPPING' && this.actual[i].actualRelativeTime > 0) || this.actual[i].actualRelativeTime > 1)) {
					this.actual[i].actualRelativeTime -= 1;
				} else if (data.actual[i].status == 'PREDICTED' && this.actual[i].actualRelativeTime == 1) {
					loadTimes();
				}
			}

			for(var i = 0, il = this.old.length; i < il; i++) {
				this.old[i].actualRelativeTime -= 1;
			}

			loadTimes_parse(this);

		}.bind(data), 1000);

		loadTimes_parse(data);

		startTimer(new Date());
		fail_hide();
		
		times_timer = setTimeout(function(){ loadTimes(); loadRoute(); }, ttss_refresh);
	}).fail(fail_ajax).always(loading_end);
}

function loadRoute(tripId, vehicleInfo) {
	if(!tripId) tripId = route_id;
	if(!tripId) return;
	
	if(vehicleInfo === undefined) vehicleInfo = route_vehicle_info;
	
	console.log('loadRoute(' + tripId + ')');
	route_id = tripId;
	route_vehicle_info = vehicleInfo;
	
	if(route_xhr) route_xhr.abort();
	route_xhr = $.get(
		ttss_base + '/services/tripInfo/tripPassages'
			+ '?tripId=' + encodeURIComponent(tripId)
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
		
		for(var i = 0, il = data.old.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.old[i].actualTime || data.old[i].plannedTime);
			addCellWithText(tr, data.old[i].stop_seq_num + '. ' + data.old[i].stop.name);
			
			tr.className = 'active';
			tr.addEventListener('click', function(stopId){ return function(){ loadTimes(stopId); } }(data.old[i].stop.shortName) );
			route_table.appendChild(tr);
		}
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].actualTime || data.actual[i].plannedTime);
			addCellWithText(tr, data.actual[i].stop_seq_num + '. ' + data.actual[i].stop.name);
			
			if(data.actual[i].status == 'STOPPING') {
				tr.className = 'success';
			}
			tr.addEventListener('click', function(stopId){ return function(){ loadTimes(stopId); } }(data.actual[i].stop.shortName) );
			route_table.appendChild(tr);
		}
	}).fail(fail_ajax);
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

function translate() {
	var elements = document.querySelectorAll('*[data-translate]');
	
	var text_name;
	for(var i = 0; i < elements.length; i++) {
		text_name = elements[i].dataset.translate;
		if(lang[text_name] == undefined) {
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
	
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = 'lang_' + lang + '.js';
	script.id = 'lang_script';
	script.onload = translate;
	
	document.body.removeChild(document.getElementById('lang_script'));
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
	
	if(window.location.hash.match(/^#![0-9]+$/)) {
		loadTimes(parseInt(window.location.hash.substr(2)));
	} else if(window.location.hash.match(/^#![a-z]{2}[0-9]*$/)) {
		var stop = parseInt(window.location.hash.substr(4));
		if(stop) stop_id = stop;
		
		if(!change_language(window.location.hash.substr(2, 2))) {
			loadTimes(parseInt(window.location.hash.substr(2)));
		}
	}
}

function stop_autocomplete() {
	if(stop_name_autocomplete_xhr) stop_name_autocomplete_xhr.abort();
	
	stop_name_autocomplete_xhr = $.get(
		'stops.php?query=' + encodeURIComponent(stop_name.value)
	).done(function(data) {
		deleteChildren(stop_name_autocomplete);
		for(var i = 0, il = data.length; i < il; i++) {
			if(data[i].type != 'stop') continue;
			if(data[i].id > 6000) continue;
			var opt = document.createElement('option');
			opt.value = data[i].id;
			setText(opt, data[i].name);
			stop_name_autocomplete.appendChild(opt);
		}
		
		if(!stop_id) setText(refresh_text, lang.select_stop_click_go);
	}).fail(fail_ajax);
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
	
	lang_select.addEventListener('input', function(e) {
		change_language(lang_select.value);
	});
	
	stop_name.addEventListener('input', function(e) {
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
