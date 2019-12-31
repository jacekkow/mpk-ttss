'use strict';

var ttss_urls = {
	t: 'proxy_tram.php',
	// t: 'http://www.ttss.krakow.pl/internetservice',
	b: 'proxy_bus.php',
	// b: 'http://ttss.mpk.krakow.pl/internetservice',
};
var ttss_types = ['t', 'b'];

var special_directions = {
	'Zajezdnia Nowa Huta' : 'ZH',
	'Zajezdnia Podgórze' : 'ZP',
	'Zjazd do zajezdni' : 'Z',
	'Wyjazd na linię' : 'W',
	'Przejazd techniczny' : 'PT',
};


/********
 * AJAX *
 ********/

function Deferred(promise, request) {
	this.promise = promise;
	this.request = request;
}
Deferred.prototype = {
	promise: null,
	request: null,
	abort: function() {
		this.request.abort.bind(this.request);
		return new Deferred(this.promise, this.request);
	},
	done: function(func) {
		return new Deferred(this.promise.then(func.bind(this)), this.request);
	},
	fail: function(func) {
		return new Deferred(this.promise.catch(func.bind(this)), this.request);
	},
	always: function(func) {
		return new Deferred(this.promise.finally(func.bind(this)), this.request);
	},
};
Deferred.all = function(iterable) {
	return new Deferred(
		Promise.all(
			iterable.map(function(x) {
				return x.promise;
			})
		)
	);
};

var $ = {
	timeout: 10000,
	dataType: 'json',
	get: function(url, headers) {
		var self = this;
		var request = new XMLHttpRequest();
		var promise = new Promise(function(resolve, reject) {
			request.open('GET', url, true);
			if(headers) {
				Object.keys(headers).forEach(function (header) {
					request.setRequestHeader(header, headers[header]);
				});
			}
			request.timeout = self.timeout;
			request.onreadystatechange = function() {
				if(this.readyState == 4) {
					if(this.status == 304) {
						resolve();
					} else if(this.status == 200) {
						if(self.dataType === 'json') {
							resolve(JSON.parse(this.responseText));
						} else {
							resolve(this.responseText);
						}
					} else {
						reject(request);
					}
				}
			};
			request.send();
		});
		return new Deferred(promise, request);
	},
};


/***********
 * VERSION *
 ***********/

var script_version;
var script_version_xhr;

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

/**********
 * ARRAYS *
 **********/

function deepMerge(a1, a2) {
	if(typeof a1 !== 'object' || typeof a2 !== 'object') {
		return a2;
	}
	Object.keys(a2).forEach(function (key) {
		a1[key] = deepMerge(a1[key], a2[key]);
		if(a1[key] === null) {
			delete a1[key];
		}
	});
	return a1;
}


/*******
 * DOM *
 *******/

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


/*****************
 * VEHICLES INFO *
 *****************/

function VehiclesInfo() {
	this.data = {};
	this.watchers = [];
}
VehiclesInfo.prototype = {
	update: function () {
		return $.get(
			'https://mpk.jacekk.net/vehicles/'
		).done(function(data) {
			this.data = data;
			this.watchers.forEach(function(watcher) {
				watcher(this);
			});
		}.bind(this));
	},
	addWatcher: function(callback) {
		this.watchers.push(callback);
	},

	get: function(vehicleId) {
		if(!vehicleId) return false;
		if(typeof this.data[vehicleId] === "undefined") {
			return false;
		}
		return this.data[vehicleId];
	},
	getParsed: function (vehicleId) {
		var vehicle = this.get(vehicleId);
		if(!vehicle) return false;
		return {
			vehicleId: vehicleId,
			prefix: vehicle['num'].substr(0, 2),
			id: vehicle['num'].substr(2, 3),
			num: vehicle['num'],
			type: vehicle['type'],
			low: vehicle['low']
		};
	},
	depotIdToVehicleId: function(depotId, typeHelper) {
		var prop;
		depotId = depotId.toString();
		if(typeHelper) {
			for(prop in this.data) {
				if(prop.substr(0,1) === typeHelper && this.data[prop]['num'].substr(2) === depotId) {
					return prop;
				}
			}
		} else {
			for(prop in this.data) {
				if(this.data[prop]['num'] === depotId) {
					return prop;
				}
			}
		}
	},
};
var vehicles_info = new VehiclesInfo();


/***********
 * PARSING *
 ***********/

function normalizeName(string) {
	return string.replace('.', '. ').replace('  ', ' ');
}

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
	var result = new Date(date.getTime());
	var time_split = time.split(':');
	result.setHours(time_split[0], time_split[1], 0);
	
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

function displayVehicle(vehicleInfo) {
	if(!vehicleInfo) return document.createTextNode('');
	
	var span = document.createElement('span');
	span.className = 'vehicleInfo';
	
	var floor_type = '';
	if(vehicleInfo.low === 0) {
		setText(span, lang.high_floor_sign);
		floor_type = lang.high_floor;
	} else if(vehicleInfo.low === 1) {
		setText(span, lang.partially_low_floor_sign);
		floor_type = lang.partially_low_floor;
	} else if(vehicleInfo.low === 2) {
		setText(span, lang.low_floor_sign);
		floor_type = lang.low_floor;
	}
	
	span.title = lang.tram_type_pattern
		.replace('$num', vehicleInfo.num)
		.replace('$type', vehicleInfo.type)
		.replace('$floor', floor_type);
	
	return span;
}
