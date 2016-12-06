//var ttss_base = 'http://www.ttss.krakow.pl/internetservice/services';
var ttss_base = '/proxy.php';
var ttss_refresh = 20000; // 20 seconds

var stop_id;
var stop_name = document.getElementById('stop-name');
var stop_name_form = stop_name.form;
var stop_name_autocomplete = document.getElementById('stop-name-autocomplete');
var stop_name_autocomplete_xhr;

var times_xhr;
var times_timer;
var times_stop_name = document.getElementById('times-stop-name');
var times_alerts = document.getElementById('times-alerts');
var times_table = document.getElementById('times-table');
var times_lines = document.getElementById('times-lines');

/*
var route_xhr;
var route_line = document.getElementById('route-line');
var route_table = document.getElementById('route-table');
*/

var refresh_button = document.getElementById('refresh');
var refresh_text = document.getElementById('refresh-text');
var refresh_time;
var refresh_timer;

var alert = document.getElementById('alert');
var alert_text = document.getElementById('alert-text');
var alert_close = document.getElementById('alert-close');

function parseStatus(status) {
	switch(status.status) {
		case 'STOPPING':
			return '<<<';
		case 'PREDICTED':
			if(status.actualRelativeTime <= 0)
				return '<<<';
			if(status.actualRelativeTime >= 60)
				return Math.floor(status.actualRelativeTime / 60) + ' min';
			return status.actualRelativeTime + ' s';
		case 'DEPARTED':
			return Math.floor(-status.actualRelativeTime / 60) + ' min ago';
		default:
			return status.mixedTime;
	}
}

function parseTime(date, time) {
	var result = new Date(date.getFullYear(), date.getMonth(), date.getDay());
	var time_split = time.split(':');
	result.setHours(time_split[0]);
	result.setMinutes(time_split[1]);
	
	if(result.getTime() - date.getTime() > 72000000) {
		result.setTime(result.getTime() - 86400000);
	}
	
	if(date.getTime() - result.getTime() > 72000000) {
		result.setTime(result.getTime() + 86400000);
	}
	
	return result;
}

function parseDelay(status) {
	if(!status.actualTime) return '?';
	if(!status.plannedTime) return '?';
	
	var now = new Date();
	var actual = parseTime(now, status.actualTime);
	var planned = parseTime(now, status.plannedTime);
	
	return ((actual.getTime() - planned.getTime()) / 1000 / 60) + ' min';
}

function deleteChildren(element) {
	while(element.lastChild) element.removeChild(element.lastChild);
}

function addElementWithText(parent, element, text) {
	var elem = document.createElement(element);
	elem.appendChild(document.createTextNode(text));
	parent.appendChild(elem);
	return elem;
}

function addCellWithText(parent, text) {
	addElementWithText(parent, 'td', text);
}

function addParaWithText(parent, text) {
	addElementWithText(parent, 'p', text);
}

function setText(element, text) {
	deleteChildren(element);
	element.appendChild(document.createTextNode(text));
}

function fail(message, more) {
	if(refresh_timer) clearInterval(refresh_timer);
	if(times_timer) clearTimeout(times_timer);
	
	setText(alert_text, message);
	alert.style.display = 'block';
	
	console.log(message + ' More details follow.');
	if(more) console.log(more);
}

function fail_ajax(data) {
	// abort() is not a failure
	if(data.readyState == 0 && data.statusText == 'abort') return;
	
	if(data.status == 0) {
		fail('Request failed - please check your network connectivity.', data);
	} else if (data.statusText) {
		fail('Internet request failed with error: ' + data.statusText + '.', data);
	} else {
		fail('Internet request failed.', data);
	}
}

function loadTimes(stopId = null, clearRoute = false) {
	if(!stopId) stopId = stop_id;
	if(!stopId) return;
	
	if(times_timer) clearTimeout(times_timer);
	if(times_xhr) times_xhr.abort();
	
	refresh_button.removeAttribute('disabled');
	
	times_xhr = $.get(
		ttss_base + '/passageInfo/stopPassages/stop' 
			+ '?stop=' + encodeURIComponent(stopId)
			+ '&mode=departure'
	).done(function(data) {
		setText(times_stop_name, data.stopName);
		deleteChildren(times_alerts);
		deleteChildren(times_table);
		deleteChildren(times_lines);
		/*
		if(clearRoute) {
			deleteChildren(route_line);
			deleteChildren(route_table);
		}
		*/
		
		for(var i = 0, il = data.generalAlerts.length; i < il; i++) {
			addParaWithText(times_alerts, data.generalAlerts[i]);
		}
		
		for(var i = 0, il = data.old.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.old[i].patternText);
			addCellWithText(tr, data.old[i].direction);
			var status = parseStatus(data.old[i]);
			addCellWithText(tr, status);
			addCellWithText(tr, '');
			
			tr.className = 'active';
			times_table.appendChild(tr);
		}
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].patternText);
			addCellWithText(tr, data.actual[i].direction);
			var status = parseStatus(data.actual[i]);
			addCellWithText(tr, status);
			var delay = parseDelay(data.actual[i]);
			addCellWithText(tr, delay);
			
			if(status == '<<<') tr.className = 'success';
			else if(parseInt(delay) > 9) tr.className = 'danger';
			else if(parseInt(delay) > 3) tr.className = 'warning';
			times_table.appendChild(tr);
		}
		
		for(var i = 0, il = data.routes.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.routes[i].name);
			addCellWithText(tr, data.routes[i].directions.join(' - '));
			addCellWithText(tr, data.routes[i].authority);
			
			/*
			tr.addEventListener('click', function(routeId, routeTr){ return function(e) {
				var trs = tr.parentNode;
				for(var i = 0; i < trs.childNodes.length; i++) {
					trs.childNodes[i].removeAttribute('class');
				}
				routeTr.className = 'warning';
				
				if(route_xhr) route_xhr.abort();
				route_xhr = $.get(
					ttss_base + '/routeInfo/routeStops'
						+ '?routeId=' + encodeURIComponent(routeId)
				).done(function(data) {
					setText(route_line, data.route.name + ': '
						+ data.route.directions.join(' - '));
					deleteChildren(route_table);
					
					routeTr.className = 'success';
					
					for(var i = 0, il = data.stops.length; i < il; i++) {
						var tr = document.createElement('tr');
						addCellWithText(tr, data.stops[i].name);
						route_table.appendChild(tr);
					}
				}).fail(fail_ajax);
			}}(data.routes[i].id, tr));
			*/
			
			times_lines.appendChild(tr);
			
			for(var j = 0, jl = data.routes[i].alerts.length; j < jl; j++) {
				addParaWithText(
					times_alerts,
					'Line ' +  data.routes[i].name + ': '
						+ data.routes[i].alerts[j]
				);
			}
		}
		
		startTimer(new Date());
		
		times_timer = setTimeout(function(){ loadTimes(); }, ttss_refresh);
	}).fail(fail_ajax);
}

function declinate(num, singular, plural) {
	if(num == 1) return num + ' ' + singular;
	return num + ' ' + plural;
}

function startTimer(date) {
	if(date) {
		setText(refresh_text, 'Last refreshed: just now')
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
			setText(refresh_text, 'Last refreshed: '
				+ declinate(Math.floor(ms / 60000), 'minute ago', 'minutes ago'));
			startTimer();
		} else {
			setText(refresh_text, 'Last refreshed: '
				+ declinate(Math.floor(ms / 1000), 'second ago', 'seconds ago'));
		}
	}, interval);
}

var decodeEntitiesTextArea = document.createElement('textarea');
function decodeEntities(text) {
	decodeEntitiesTextArea.innerHTML = text;
	return decodeEntitiesTextArea.value;
}

function init() {
	if(!window.jQuery) {
		fail('Required JavaScript jQuery library failed to load. You may try refreshing the page.');
		return;
	}
	
	$.ajaxSetup({
		dataType: 'json',
		timeout: 3000,
	});
	
	stop_name.addEventListener('input', function(e) {
		if(!stop_name.value) return;
		if(stop_name_autocomplete_xhr) stop_name_autocomplete_xhr.abort();
		
		stop_name_autocomplete_xhr = $.get(
			ttss_base + '/lookup/autocomplete/json'
				+ '?query=' + encodeURIComponent(stop_name.value)
		).done(function(data) {
			deleteChildren(stop_name_autocomplete);
			for(var i = 1, il = data.length; i < il; i++) {
				var opt = document.createElement('option');
				opt.value = data[i].id;
				setText(opt, decodeEntities(data[i].name));
				stop_name_autocomplete.appendChild(opt);
			}
			
			if(!stop_id) setText(refresh_text, 'Select the stop and click "Go"');
		}).fail(fail_ajax);
	});
	
	setText(refresh_text, 'Enter the stop name to begin');
	
	stop_name_form.addEventListener('submit', function(e) {
		e.preventDefault();
		if(!stop_name_autocomplete.value) return;
		stop_id = stop_name_autocomplete.value;
		loadTimes(stop_id, true);
	});
	
	refresh_button.addEventListener('click', function(e) {
		loadTimes(stop_id);
	});
	
	alert_close.addEventListener('click', function(e) {
		alert.style.display = 'none';
	});
}

init();
