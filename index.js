//var ttss_base = 'http://www.ttss.krakow.pl/internetservice/services';
var ttss_base = '/proxy.php';
var ttss_refresh = 20000; // 20 seconds

var page_title_pattern = 'TTSS Krak\u00F3w - $ - Real-time tram departures';
var page_title = document.getElementsByTagName('title')[0];

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

var nav = document.getElementsByTagName('nav')[0];

var parseStatusBoarding = '>>>';
function parseStatus(status) {
	switch(status.status) {
		case 'STOPPING':
			return parseStatusBoarding;
		case 'PREDICTED':
			if(status.actualRelativeTime <= 0)
				return parseStatusBoarding;
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

function parseVehicle(vehicleId) {
	if(!vehicleId) return;
	if(vehicleId.substr(0, 15) != '635218529567218') {
		console.log('Unknown vehicle, vehicleId=' + vehicleId);
		return;
	}
	
	var id = parseInt(vehicleId.substr(15)) - 736;
	var prefix;
	var type;
	var low; // low floor: 0 = no, 1 - semi, 2 - full
	
	if(101 <= id && id <= 173) {
		prefix = 'HW';
		type = 'E1';
		low = 0;
		
		if((108 <= id && id <= 113) || id == 127 || id == 131 || id == 132 || id == 134 || (137 <= id && id <= 139) || (148 <= id && id <= 150) || (153 <= id && id <= 166) || id == 161) {
			prefix = 'RW';
		}
	} else if(201 <= id && id <= 293) {
		prefix = 'RZ';
		type = '105Na';
		low = 0;
		
		if(246 <= id) {
			prefix = 'HZ';
		}
		if(id == 290) {
			type = '105Nb';
		}
	} else if(301 <= id && id <= 328) {
		prefix = 'RF';
		type = 'GT8S';
		low = 0;
		
		if(id == 313) {
			type = 'GT8C'
			low = 1;
		}
	} else if(401 <= id && id <= 440) {
		prefix = 'HL';
		type = 'EU8N';
		low = 1;
	} else if(451 <= id && id <= 462) {
		prefix = 'HK';
		type = 'N8S-NF';
		low = 0;
		
		if((451 <= id && id <= 453) || id == 462) {
			type = 'N8C-NF';
			low = 1;
		}
	} else if(601 <= id && id <= 650) {
		prefix = 'RP';
		type = 'NGT6 (3)';
		low = 2;
		
		if(id <= 613) {
			type = 'NGT6 (1)';
		} else if (id <= 626) {
			type = 'NGT6 (2)';
		}
	} else if(801 <= id && id <= 824) {
		prefix = 'RY';
		type = 'NGT8';
		low = 2;
	} else if(id == 899) {
		prefix = 'RY';
		type = '126N';
		low = 2;
	} else if(901 <= id && id <= 936) {
		prefix = 'RG';
		type = '2014N';
		low = 2;
		
		if(915 <= id) {
			prefix = 'HG';
		}
	} else if(id === 999) {
		prefix = 'HX';
		type = '405N-Kr';
		low = 1;
	} else {
		console.log('Unknown vehicle, vehicleId=' + vehicleId + ', id=' + id);
		return;
	}
	
	return {
		vehicleId: vehicleId,
		prefix: prefix,
		id: id,
		num: prefix + id,
		type: type,
		low: low
	};
}

function displayVehicle(vehicleInfo) {
	if(!vehicleInfo) return document.createTextNode('');
	
	var span = document.createElement('span');
	span.className = 'vehicleInfo';
	span.title = vehicleInfo.num + ' ' + vehicleInfo.type;
	if(vehicleInfo.low == 0) {
		setText(span, '\u2010\u00A0');
		span.title += ' (high floor)';
	} else if(vehicleInfo.low == 1) {
		setText(span, '*\u267F');
		span.title += ' (partially low floor)';
	} else if(vehicleInfo.low == 2) {
		setText(span, '\u267F');
		span.title += ' (low floor)';
	}
	return span;
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
	return addElementWithText(parent, 'td', text);
}

function addParaWithText(parent, text) {
	return addElementWithText(parent, 'p', text);
}

function setText(element, text) {
	deleteChildren(element);
	element.appendChild(document.createTextNode(text));
}

function fail(message, more) {
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

function fail_hide() {
	alert.style.display = 'none';
}

function loading_start() {
	nav.className += ' loading';
}

function loading_end() {
	nav.className = nav.className.replace(' loading', '');
}

function loadTimes(stopId = null, clearRoute = false) {
	if(!stopId) stopId = stop_id;
	if(!stopId) return;
	
	if(times_timer) clearTimeout(times_timer);
	if(times_xhr) times_xhr.abort();
	
	refresh_button.removeAttribute('disabled');
	
	loading_start();
	times_xhr = $.get(
		ttss_base + '/passageInfo/stopPassages/stop' 
			+ '?stop=' + encodeURIComponent(stopId)
			+ '&mode=departure'
	).done(function(data) {
		setText(times_stop_name, data.stopName);
		setText(page_title, page_title_pattern.replace('$', data.stopName));
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
			var dir_cell = addCellWithText(tr, data.old[i].direction);
			dir_cell.appendChild(displayVehicle(parseVehicle(data.old[i].vehicleId)));
			var status = parseStatus(data.old[i]);
			addCellWithText(tr, status);
			addCellWithText(tr, '');
			
			tr.className = 'active';
			times_table.appendChild(tr);
		}
		
		for(var i = 0, il = data.actual.length; i < il; i++) {
			var tr = document.createElement('tr');
			addCellWithText(tr, data.actual[i].patternText);
			var dir_cell = addCellWithText(tr, data.actual[i].direction);
			dir_cell.appendChild(displayVehicle(parseVehicle(data.actual[i].vehicleId)));
			var status = parseStatus(data.actual[i]);
			var status_cell = addCellWithText(tr, status);
			var delay = parseDelay(data.actual[i]);
			var delay_cell = addCellWithText(tr, delay);
			
			if(status == parseStatusBoarding) {
				tr.className = 'success';
				status_cell.className = 'status-boarding';
			} else if(parseInt(delay) > 9) {
				tr.className = 'danger';
				delay_cell.className = 'status-delayed';
			} else if(parseInt(delay) > 3) {
				tr.className = 'warning';
			}
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
		fail_hide();
		
		times_timer = setTimeout(function(){ loadTimes(); }, ttss_refresh);
	}).fail(fail_ajax).always(loading_end);
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
		timeout: 10000,
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
				if(data[i].id > 6000) continue;
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
		window.location.hash = '#!' + stop_id;
		loadTimes(stop_id, true);
	});
	
	refresh_button.addEventListener('click', function(e) {
		loadTimes(stop_id);
	});
	
	alert_close.addEventListener('click', function(e) {
		alert.style.display = 'none';
	});
	
	if(window.location.hash.match(/^#![0-9]+$/)) {
		stop_id = parseInt(window.location.hash.slice(2));
		loadTimes(stop_id);
	}
}

init();
