// Special directions
var special_directions = {
	'Zajezdnia Nowa Huta' : 'NH',
	'Zajezdnia Podgórze' : 'P',
};

var script_version;
var script_version_xhr;

var vehicles_info;

// Check for website updates
function checkVersion() {
	if(script_version_xhr) script_version_xhr.abort();
	
	script_version_xhr = $.get(
		'version.php'
	).done(function(data) {
		if(!script_version) {
			script_version = data;
			return;
		}
		
		if(script_version != data) {
			fail(lang.error_new_version);
			location.reload(true);
		}
	});
}

function checkVersionInit() {
	checkVersion();
	setInterval(checkVersion, 3600000);
}

/* Parsing of received JSON parts */
function parseStatus(status) {
	switch(status.status) {
		case 'STOPPING':
		case 'PREDICTED':
			if(status.actualRelativeTime <= 0)
				return lang.boarding_sign;
			if(status.actualRelativeTime >= 60)
				return lang.time_minutes_prefix + Math.floor(status.actualRelativeTime / 60) + lang.time_minutes_suffix;
			return lang.time_seconds_prefix + status.actualRelativeTime + lang.time_seconds_suffix;
		case 'DEPARTED':
			return lang.time_minutes_ago_prefix + Math.floor(-status.actualRelativeTime / 60) + lang.time_minutes_ago_suffix;
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
	if(!status.actualTime) return lang.unknown_sign;
	if(!status.plannedTime) return lang.unknown_sign;
	
	var now = new Date();
	var actual = parseTime(now, status.actualTime);
	var planned = parseTime(now, status.plannedTime);
	
	return lang.time_minutes_prefix + ((actual.getTime() - planned.getTime()) / 1000 / 60) + lang.time_minutes_suffix;
}

// Webservice-related functions
function parseVehicle(vehicleId) {
	if(!vehicleId) return false;
	if(!vehicles_info || !vehicles_info[vehicleId]) {
		return false;
	} else {
		var vehicle = vehicles_info[vehicleId];
		return {
			vehicleId: vehicleId,
			prefix: vehicle['num'].substr(0, 2),
			id: vehicle['num'].substr(2, 3),
			num: vehicle['num'],
			type: vehicle['type'],
			low: vehicle['low']
		};
	}
}

function updateVehicleInfo() {
	return $.get(
		'https://mpk.jacekk.net/vehicles/'
	).done(function(data) {
		vehicles_info = data;
	});
}

function tramIdToVehicleId(tramId) {
	if(0 <= tramId && tramId <= 999) {
		var vehicleId = '0000' + (tramId + 736);
		vehicleId = vehicleId.substr(vehicleId.length - 4)
		return '635218529567218' + vehicleId;
	}
}

function displayVehicle(vehicleInfo) {
	if(!vehicleInfo) return document.createTextNode('');
	
	var span = document.createElement('span');
	span.className = 'vehicleInfo';
	
	var floor_type = '';
	if(vehicleInfo.low == '0') {
		setText(span, lang.high_floor_sign);
		floor_type = lang.high_floor;
	} else if(vehicleInfo.low == '1') {
		setText(span, lang.partially_low_floor_sign);
		floor_type = lang.partially_low_floor;
	} else if(vehicleInfo.low == '2') {
		setText(span, lang.low_floor_sign);
		floor_type = lang.low_floor;
	}
	
	span.title = lang.tram_type_pattern
		.replace('$num', vehicleInfo.num)
		.replace('$type', vehicleInfo.type)
		.replace('$floor', floor_type);
	
	return span;
}

// Element mangling
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
